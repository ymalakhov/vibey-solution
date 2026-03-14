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
from app.routers.chat import notify_conversation
from app.services.connection_manager import manager

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationResponse])
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


@router.get("/{conversation_id}/escalation-context")
async def get_escalation_context(conversation_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(404, "Conversation not found")
    if conv.status != "escalated":
        raise HTTPException(400, "Conversation is not escalated")

    context = conv.escalation_context or {}

    # Enrich with live tool execution data
    te_result = await db.execute(
        select(ToolExecution).where(ToolExecution.conversation_id == conversation_id)
    )
    executions = te_result.scalars().all()
    if executions:
        tool_result = await db.execute(select(Tool))
        tool_map = {t.id: t.name for t in tool_result.scalars().all()}
        context["tool_executions"] = [
            {
                "id": ex.id,
                "tool_name": tool_map.get(ex.tool_id, ex.tool_id),
                "status": ex.status,
                "input_data": ex.input_data,
                "output_data": ex.output_data,
                "created_at": ex.created_at.isoformat() if ex.created_at else None,
            }
            for ex in executions
        ]

    return context


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
        await notify_conversation(execution.conversation_id, {
            "type": "tool_update",
            "execution_id": execution.id,
            "status": "executed",
            "response": ai_response["text"],
        })
        # Notify admins about the AI follow-up
        ai_msgs = [m for m in conversation.messages if m.role == "ai"]
        if ai_msgs:
            last_ai = ai_msgs[-1]
            await manager.notify_admins_new_message(
                conversation.workspace_id,
                execution.conversation_id,
                {
                    "id": last_ai.id,
                    "role": last_ai.role,
                    "content": last_ai.content,
                    "tool_call": last_ai.tool_call,
                    "tool_result": last_ai.tool_result,
                    "created_at": last_ai.created_at.isoformat() if last_ai.created_at else None,
                },
            )
        return {"ok": True, "result": result, "ai_response": ai_response["text"]}

    await notify_conversation(execution.conversation_id, {
        "type": "tool_update",
        "execution_id": execution.id,
        "status": "executed",
    })
    return {"ok": True, "result": result}


@router.post("/executions/{execution_id}/reject")
async def reject_execution(execution_id: str, db: AsyncSession = Depends(get_db)):
    execution = await db.get(ToolExecution, execution_id)
    if not execution:
        raise HTTPException(404, "Execution not found")
    execution.status = "rejected"
    await db.commit()
    await notify_conversation(execution.conversation_id, {
        "type": "tool_update",
        "execution_id": execution.id,
        "status": "rejected",
    })
    # Notify admins about the rejection
    conv = await db.get(Conversation, execution.conversation_id)
    if conv:
        await manager.notify_admins_new_message(
            conv.workspace_id,
            execution.conversation_id,
            {
                "id": execution.id,
                "role": "system",
                "content": f"Tool execution rejected",
                "tool_call": None,
                "tool_result": None,
                "created_at": None,
            },
        )
    return {"ok": True}
