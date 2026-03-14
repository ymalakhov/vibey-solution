from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.models import Workspace
from app.schemas.schemas import WorkspaceCreate, WidgetConfig

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.post("")
async def create_workspace(data: WorkspaceCreate, db: AsyncSession = Depends(get_db)):
    workspace = Workspace(name=data.name, domain=data.domain)
    db.add(workspace)
    await db.commit()
    await db.refresh(workspace)
    return {"id": workspace.id, "name": workspace.name}


@router.get("/{workspace_id}")
async def get_workspace(workspace_id: str, db: AsyncSession = Depends(get_db)):
    ws = await db.get(Workspace, workspace_id)
    if not ws:
        raise HTTPException(404, "Workspace not found")
    return {"id": ws.id, "name": ws.name, "domain": ws.domain, "widget_config": ws.widget_config}


@router.patch("/{workspace_id}/widget")
async def update_widget_config(workspace_id: str, config: WidgetConfig, db: AsyncSession = Depends(get_db)):
    ws = await db.get(Workspace, workspace_id)
    if not ws:
        raise HTTPException(404, "Workspace not found")
    ws.widget_config = config.model_dump()
    await db.commit()
    return {"ok": True, "widget_config": ws.widget_config}
