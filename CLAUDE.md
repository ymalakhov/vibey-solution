# CLAUDE.md

## Quick Start

```bash
# Run both services (backend :8000 + frontend :3000)
./run.sh

# Or run individually:
cd backend && python3 -m uvicorn app.main:app --port 8000 --reload
cd frontend && npm run dev

# Seed demo data (creates "demo" workspace with sample tools)
cd backend && python3 -m seed
```

## Environment Setup

Copy `backend/.env.example` to `backend/.env` and set:
- `ANTHROPIC_API_KEY` — required for AI features
- `DATABASE_URL` — defaults to `sqlite+aiosqlite:///./support.db`
- `AI_MODEL` — defaults to `claude-sonnet-4-6`
- `SECRET_KEY` — change in production

## Architecture

Two-service app: FastAPI backend + Next.js frontend.

**API proxy**: Next.js rewrites `/api/*` to `http://localhost:8000/api/*` (see `frontend/next.config.ts`). The frontend never calls the backend directly — all API calls go through `/api/...` relative paths.

**AI flow**: Customer message → `AIAgent.process_message()` → Claude API (with tools from DB) → if tool_use in response, creates `ToolExecution` record → tools with `requires_approval=True` pause for human approval → after approval, `continue_after_tool()` sends result back to Claude.

**DB**: SQLite via SQLAlchemy async. Tables auto-created on startup via `init_db()`. No migrations needed for dev.

## Tech Stack

- **Backend**: FastAPI 0.115, SQLAlchemy 2.0 (async), Anthropic SDK 0.39, Python 3.11+
- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS 4, TypeScript 5.6
- **DB**: SQLite + aiosqlite (dev), asyncpg available for Postgres

## Code Layout

```
backend/
  app/
    main.py              # FastAPI app, router registration, CORS, lifespan
    config.py            # Pydantic Settings (reads .env)
    database.py          # SQLAlchemy async engine, session, Base, init_db()
    models/models.py     # Workspace, Tool, Conversation, Message, ToolExecution
    routers/             # chat, conversations, tools, analytics, workspace
    schemas/             # Pydantic request/response models
    services/
      ai_agent.py        # AIAgent class — Claude integration, tool call handling
  seed.py                # Demo data seeder

frontend/
  src/app/
    page.tsx             # Dashboard home
    chats/               # Conversation list + detail views
    tools/               # Tool management
    analytics/           # Analytics dashboard
    settings/            # Workspace settings
    layout.tsx           # Root layout
    globals.css          # Tailwind imports

widget/                  # Embeddable chat widget (served as static files)
```

## Key Patterns

- **DB IDs**: 12-char hex UUIDs (`uuid.uuid4().hex[:12]`)
- **Message roles**: `customer`, `ai`, `agent`, `system` (system holds tool results)
- **Tool execution statuses**: `pending` → `approved` → `executed` (or `rejected`/`failed`)
- **Conversation statuses**: `open` → `ai_handling` → `escalated` / `resolved`
- **Backend routers** all mounted under `/api` prefix in `main.py`
- **Category detection**: keyword-based in `AIAgent._detect_category()` (supports EN/UK)
