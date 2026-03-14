#!/usr/bin/env zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Ensure pyenv is initialized if available
if command -v pyenv &> /dev/null; then
    eval "$(pyenv init -)"
fi

echo "========================================="
echo "  ShopVibe Demo — Starting all services"
echo "========================================="

# Cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down..."
    kill $MAIN_PID $DEMO_PID $FRONTEND_PID 2>/dev/null || true
    wait $MAIN_PID $DEMO_PID $FRONTEND_PID 2>/dev/null || true
    echo "Done."
}
trap cleanup EXIT INT TERM

# 1. Start main backend (port 8000)
echo "[1/4] Starting main backend on :8000..."
cd "$ROOT_DIR/backend"
python3 -m uvicorn app.main:app --port 8000 --reload &
MAIN_PID=$!

# 2. Start demo backend (port 9000)
echo "[2/4] Starting demo backend on :9000..."
cd "$SCRIPT_DIR/backend"
python3 -m uvicorn app:app --port 9000 --reload &
DEMO_PID=$!

# 3. Wait for main backend to be ready, then seed
echo "[3/4] Waiting for main backend..."
for i in $(seq 1 30); do
    if curl -s http://localhost:8000/api/workspaces/demo > /dev/null 2>&1; then
        break
    fi
    sleep 1
done
echo "       Seeding demo data..."
cd "$ROOT_DIR/backend"
python3 -m seed

# 4. Optionally start admin frontend (port 3000)
if command -v npm &> /dev/null && [ -d "$ROOT_DIR/frontend/node_modules" ]; then
    echo "[4/4] Starting admin frontend on :3000..."
    cd "$ROOT_DIR/frontend"
    npm run dev &
    FRONTEND_PID=$!
else
    echo "[4/4] Skipping admin frontend (run 'cd frontend && npm install && npm run dev' separately)"
    FRONTEND_PID=""
fi

echo ""
echo "========================================="
echo "  All services running!"
echo ""
echo "  ShopVibe store:    http://localhost:9000"
echo "  Main backend:      http://localhost:8000"
echo "  Admin dashboard:   http://localhost:3000"
echo ""
echo "  Press Ctrl+C to stop all services"
echo "========================================="

wait
