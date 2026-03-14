from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.models import Tool
from app.schemas.schemas import ToolCreate, ToolUpdate, ToolResponse

router = APIRouter(prefix="/tools", tags=["tools"])


@router.get("/", response_model=list[ToolResponse])
async def list_tools(workspace_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Tool).where(Tool.workspace_id == workspace_id).order_by(Tool.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=ToolResponse)
async def create_tool(workspace_id: str, data: ToolCreate, db: AsyncSession = Depends(get_db)):
    # Check unique name
    existing = await db.execute(
        select(Tool).where(Tool.workspace_id == workspace_id, Tool.name == data.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"Tool '{data.name}' already exists")

    tool = Tool(
        workspace_id=workspace_id,
        name=data.name,
        description=data.description,
        endpoint=data.endpoint,
        method=data.method,
        headers=data.headers,
        parameters=[p.model_dump() for p in data.parameters],
        requires_approval=data.requires_approval,
    )
    db.add(tool)
    await db.commit()
    await db.refresh(tool)
    return tool


@router.get("/{tool_id}", response_model=ToolResponse)
async def get_tool(tool_id: str, db: AsyncSession = Depends(get_db)):
    tool = await db.get(Tool, tool_id)
    if not tool:
        raise HTTPException(404, "Tool not found")
    return tool


@router.patch("/{tool_id}", response_model=ToolResponse)
async def update_tool(tool_id: str, data: ToolUpdate, db: AsyncSession = Depends(get_db)):
    tool = await db.get(Tool, tool_id)
    if not tool:
        raise HTTPException(404, "Tool not found")

    update_data = data.model_dump(exclude_unset=True)
    if "parameters" in update_data and update_data["parameters"] is not None:
        update_data["parameters"] = [p.model_dump() if hasattr(p, "model_dump") else p for p in update_data["parameters"]]

    for key, value in update_data.items():
        setattr(tool, key, value)

    await db.commit()
    await db.refresh(tool)
    return tool


@router.delete("/{tool_id}")
async def delete_tool(tool_id: str, db: AsyncSession = Depends(get_db)):
    tool = await db.get(Tool, tool_id)
    if not tool:
        raise HTTPException(404, "Tool not found")
    await db.delete(tool)
    await db.commit()
    return {"ok": True}


@router.post("/{tool_id}/test")
async def test_tool(tool_id: str, test_input: dict, db: AsyncSession = Depends(get_db)):
    """Test a tool with sample input without saving execution."""
    import httpx

    tool = await db.get(Tool, tool_id)
    if not tool:
        raise HTTPException(404, "Tool not found")

    try:
        headers = {"Content-Type": "application/json"}
        if tool.headers:
            headers.update(tool.headers)

        async with httpx.AsyncClient(timeout=10.0) as client:
            if tool.method.upper() == "GET":
                resp = await client.get(tool.endpoint, params=test_input, headers=headers)
            else:
                resp = await client.request(tool.method.upper(), tool.endpoint, json=test_input, headers=headers)

        return {
            "success": resp.is_success,
            "status_code": resp.status_code,
            "response": resp.json() if "json" in resp.headers.get("content-type", "") else resp.text,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
