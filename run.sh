#!/bin/bash

echo "=== AI Support Copilot MVP ==="
echo ""

# Check for .env
if [ ! -f backend/.env ]; then
  echo "Creating backend/.env from example..."
  cp backend/.env.example backend/.env
  echo "⚠️  Set your ANTHROPIC_API_KEY in backend/.env"
  echo ""
fi

# Start backend
echo "Starting backend (port 8000)..."
cd backend
python3 -m uvicorn app.main:app --port 8000 --reload &
BACKEND_PID=$!
cd ..

# Start frontend
echo "Starting frontend (port 3000)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Services started!"
echo ""
echo "  Dashboard:  http://localhost:3000"
echo "  API Docs:   http://localhost:8000/docs"
echo "  Widget Demo: open widget/demo.html in browser"
echo ""
echo "Press Ctrl+C to stop all services"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
