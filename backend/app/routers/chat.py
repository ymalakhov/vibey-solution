import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db, async_session
from app.models.models import Conversation, Tool, Message
from app.schemas.schemas import ChatMessage
from app.services.ai_agent import ai_agent

router = APIRouter(tags=["chat"])


# REST endpoint for simple chat (widget uses this)
@router.post("/chat/{workspace_id}")
async def chat(workspace_id: str, msg: ChatMessage, conversation_id: str | None = None, db: AsyncSession = Depends(get_db)):
    # Get or create conversation
    if conversation_id:
        result = await db.execute(
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .where(Conversation.id == conversation_id)
        )
        conversation = result.scalar_one_or_none()
        if not conversation:
            raise HTTPException(404, "Conversation not found")
    else:
        conversation = Conversation(
            workspace_id=workspace_id,
            customer_email=msg.customer_email,
            customer_name=msg.customer_name,
            status="open",
        )
        db.add(conversation)
        await db.flush()
        # Re-fetch with messages relationship
        result = await db.execute(
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .where(Conversation.id == conversation.id)
        )
        conversation = result.scalar_one()

    # Get workspace tools
    tools_result = await db.execute(
        select(Tool).where(Tool.workspace_id == workspace_id, Tool.is_active == True)
    )
    tools = tools_result.scalars().all()

    # Process with AI
    response = await ai_agent.process_message(db, conversation, msg.content, tools)

    return {
        "conversation_id": conversation.id,
        "response": response["text"],
        "tool_call": response.get("tool_call"),
        "pending_approval": response.get("pending_approval"),
    }


# WebSocket for real-time chat
@router.websocket("/ws/chat/{workspace_id}")
async def websocket_chat(websocket: WebSocket, workspace_id: str):
    await websocket.accept()
    conversation_id = None

    try:
        while True:
            data = await websocket.receive_text()
            msg_data = json.loads(data)

            async with async_session() as db:
                # Get or create conversation
                if conversation_id:
                    result = await db.execute(
                        select(Conversation)
                        .options(selectinload(Conversation.messages))
                        .where(Conversation.id == conversation_id)
                    )
                    conversation = result.scalar_one()
                else:
                    conversation = Conversation(
                        workspace_id=workspace_id,
                        customer_email=msg_data.get("customer_email"),
                        customer_name=msg_data.get("customer_name"),
                        status="open",
                    )
                    db.add(conversation)
                    await db.flush()
                    result = await db.execute(
                        select(Conversation)
                        .options(selectinload(Conversation.messages))
                        .where(Conversation.id == conversation.id)
                    )
                    conversation = result.scalar_one()
                    conversation_id = conversation.id

                # Get tools
                tools_result = await db.execute(
                    select(Tool).where(Tool.workspace_id == workspace_id, Tool.is_active == True)
                )
                tools = tools_result.scalars().all()

                # Process
                response = await ai_agent.process_message(
                    db, conversation, msg_data["content"], tools
                )

                await websocket.send_text(json.dumps({
                    "conversation_id": conversation_id,
                    "response": response["text"],
                    "tool_call": response.get("tool_call"),
                    "pending_approval": response.get("pending_approval"),
                }))

    except WebSocketDisconnect:
        pass
