from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.models import Flow, Tool
from app.schemas.schemas import (
    FlowCreate, FlowUpdate, FlowResponse, FlowListResponse, FlowValidationResult,
)

router = APIRouter(prefix="/flows", tags=["flows"])


@router.get("", response_model=list[FlowListResponse])
async def list_flows(workspace_id: str = Query(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Flow).where(Flow.workspace_id == workspace_id).order_by(Flow.priority.desc(), Flow.created_at.desc())
    )
    flows = result.scalars().all()
    return [
        FlowListResponse(
            id=f.id,
            workspace_id=f.workspace_id,
            name=f.name,
            description=f.description,
            trigger_intents=f.trigger_intents,
            is_active=f.is_active,
            priority=f.priority,
            node_count=len(f.nodes) if f.nodes else 0,
            created_at=f.created_at,
            updated_at=f.updated_at,
        )
        for f in flows
    ]


@router.post("", response_model=FlowResponse, status_code=201)
async def create_flow(body: FlowCreate, workspace_id: str = Query(...), db: AsyncSession = Depends(get_db)):
    flow = Flow(workspace_id=workspace_id, **body.model_dump())
    db.add(flow)
    await db.commit()
    await db.refresh(flow)
    return flow


@router.get("/{flow_id}", response_model=FlowResponse)
async def get_flow(flow_id: str, db: AsyncSession = Depends(get_db)):
    flow = await db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(404, "Flow not found")
    return flow


@router.patch("/{flow_id}", response_model=FlowResponse)
async def update_flow(flow_id: str, body: FlowUpdate, db: AsyncSession = Depends(get_db)):
    flow = await db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(404, "Flow not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(flow, field, value)
    await db.commit()
    await db.refresh(flow)
    return flow


@router.delete("/{flow_id}", status_code=204)
async def delete_flow(flow_id: str, db: AsyncSession = Depends(get_db)):
    flow = await db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(404, "Flow not found")
    await db.delete(flow)
    await db.commit()


@router.post("/{flow_id}/validate", response_model=FlowValidationResult)
async def validate_flow(flow_id: str, db: AsyncSession = Depends(get_db)):
    flow = await db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(404, "Flow not found")

    errors: list[str] = []
    warnings: list[str] = []
    nodes = flow.nodes or []
    edges = flow.edges or []
    node_ids = {n["id"] for n in nodes}

    # Must have at least one trigger
    triggers = [n for n in nodes if n.get("type") == "trigger"]
    if not triggers:
        errors.append("Flow must have at least one trigger node")
    if len(triggers) > 1:
        warnings.append("Flow has multiple trigger nodes — only the first is used as entry point")

    # Check edges reference valid nodes
    for edge in edges:
        if edge.get("source") not in node_ids:
            errors.append(f"Edge references unknown source node: {edge.get('source')}")
        if edge.get("target") not in node_ids:
            errors.append(f"Edge references unknown target node: {edge.get('target')}")

    # Check all non-trigger nodes are reachable
    targets = {e.get("target") for e in edges}
    for n in nodes:
        if n.get("type") != "trigger" and n["id"] not in targets:
            warnings.append(f"Node '{n.get('data', {}).get('label', n['id'])}' is not reachable from any other node")

    # Check tool nodes reference valid tools
    tool_nodes = [n for n in nodes if n.get("type") == "tool"]
    if tool_nodes:
        result = await db.execute(select(Tool).where(Tool.workspace_id == flow.workspace_id))
        valid_tool_ids = {t.id for t in result.scalars().all()}
        for tn in tool_nodes:
            tool_id = tn.get("data", {}).get("tool_id")
            if tool_id and tool_id not in valid_tool_ids:
                errors.append(f"Tool node '{tn['id']}' references unknown tool: {tool_id}")

    # Check condition nodes have two outgoing edges
    for n in nodes:
        if n.get("type") == "condition":
            outgoing = [e for e in edges if e.get("source") == n["id"]]
            if len(outgoing) < 2:
                warnings.append(f"Condition node '{n['id']}' should have at least 2 outgoing edges (yes/no)")

    # Check variable availability in question nodes
    variable_names = set()
    for n in nodes:
        if n.get("type") == "question":
            var = n.get("data", {}).get("variable_name")
            if var:
                if var in variable_names:
                    warnings.append(f"Duplicate variable name: '{var}'")
                variable_names.add(var)

    return FlowValidationResult(valid=len(errors) == 0, errors=errors, warnings=warnings)
