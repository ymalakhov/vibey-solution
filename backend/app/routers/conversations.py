from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.models import Conversation, Message, Tool, ToolExecution
from app.schemas.schemas import ConversationResponse, ConversationDetail, ToolExecutionResponse
from app.services.ai_agent import ai_agent
from app.services.tool_executor import execute_tool

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("/", response_model=list[ConversationResponse])
async def list_conversations(workspace_id: str, status: str | None = None, db: AsyncSession = Depends(get_db)):
    query = select(Conversation).where(Conversation.workspace_id == workspace_id)
    if status:
        query = query.where(Conversation.status == status)
    query = query.order_by(Conversation.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(conversation_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(404, "Conversation not found")
    return conv


@router.post("/{conversation_id}/resolve")
async def resolve_conversation(conversation_id: str, db: AsyncSession = Depends(get_db)):
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    conv.status = "resolved"
    conv.resolved_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}


@router.post("/{conversation_id}/csat")
async def set_csat(conversation_id: str, score: int, db: AsyncSession = Depends(get_db)):
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    if not 1 <= score <= 5:
        raise HTTPException(400, "Score must be 1-5")
    conv.csat_score = score
    await db.commit()
    return {"ok": True}


# --- Tool execution approval ---

@router.get("/executions/pending", response_model=list[ToolExecutionResponse])
async def list_pending_executions(workspace_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ToolExecution)
        .join(Conversation)
        .where(Conversation.workspace_id == workspace_id, ToolExecution.status == "pending")
        .order_by(ToolExecution.created_at.desc())
    )
    return result.scalars().all()


@router.post("/executions/{execution_id}/approve")
async def approve_execution(execution_id: str, agent_name: str = "agent", db: AsyncSession = Depends(get_db)):
    execution = await db.get(ToolExecution, execution_id)
    if not execution:
        raise HTTPException(404, "Execution not found")
    if execution.status != "pending":
        raise HTTPException(400, f"Execution is already {execution.status}")

    execution.approved_by = agent_name
    execution.status = "approved"

    # Execute the tool
    result = await execute_tool(db, execution)

    # Continue AI conversation with tool result
    conv = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == execution.conversation_id)
    )
    conversation = conv.scalar_one()

    tools_result = await db.execute(
        select(Tool).where(Tool.workspace_id == conversation.workspace_id, Tool.is_active == True)
    )
    tools = tools_result.scalars().all()

    # Find the tool_use_id from the last AI message
    tool_use_id = None
    for msg in reversed(conversation.messages):
        if msg.tool_call and msg.tool_call.get("id"):
            tool_use_id = msg.tool_call["id"]
            break

    if tool_use_id:
        ai_response = await ai_agent.continue_after_tool(
            db, conversation, tool_use_id, result, tools
        )
        return {"ok": True, "result": result, "ai_response": ai_response["text"]}

    return {"ok": True, "result": result}


@router.post("/executions/{execution_id}/reject")
async def reject_execution(execution_id: str, db: AsyncSession = Depends(get_db)):
    execution = await db.get(ToolExecution, execution_id)
    if not execution:
        raise HTTPException(404, "Execution not found")
    execution.status = "rejected"
    await db.commit()
    return {"ok": True}
