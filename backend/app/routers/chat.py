import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db, async_session
from app.models.models import Conversation, Tool, Message
from app.schemas.schemas import ChatMessage, AgentReply
from app.services.ai_agent import ai_agent
from app.services.connection_manager import manager

router = APIRouter(tags=["chat"])


# Backward-compatible re-export so conversations.py import still works
async def notify_conversation(conversation_id: str, data: dict):
    await manager.notify_conversation(conversation_id, data)


def _message_to_dict(msg: Message) -> dict:
    return {
        "id": msg.id,
        "role": msg.role,
        "content": msg.content,
        "tool_call": msg.tool_call,
        "tool_result": msg.tool_result,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }


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
    response = await ai_agent.process_message(
        db, conversation, msg.content, tools, attachments=msg.attachments
    )

    return {
        "conversation_id": conversation.id,
        "response": response["text"],
        "tool_call": response.get("tool_call"),
        "pending_approval": response.get("pending_approval"),
    }


# WebSocket for real-time chat (widget)
@router.websocket("/ws/chat/{workspace_id}")
async def websocket_chat(websocket: WebSocket, workspace_id: str):
    await websocket.accept()
    conversation_id = None

    try:
        while True:
            data = await websocket.receive_text()
            msg_data = json.loads(data)

            # Handle restore frame (reconnection with existing conversation)
            if msg_data.get("type") == "restore":
                client_conv_id = msg_data.get("conversation_id")
                if client_conv_id:
                    conversation_id = client_conv_id
                    manager.connect_widget(conversation_id, websocket)
                    # Send missed messages on reconnect
                    async with async_session() as db:
                        result = await db.execute(
                            select(Conversation)
                            .options(selectinload(Conversation.messages))
                            .where(Conversation.id == conversation_id)
                        )
                        conv = result.scalar_one_or_none()
                        if conv:
                            messages = [_message_to_dict(m) for m in conv.messages]
                            await websocket.send_text(json.dumps({
                                "type": "restored",
                                "conversation_id": conversation_id,
                                "messages": messages,
                            }))
                            continue
                await websocket.send_text(json.dumps({
                    "type": "restored",
                    "conversation_id": conversation_id,
                }))
                continue

            # Accept conversation_id from client (reconnection support)
            client_conv_id = msg_data.get("conversation_id")
            if client_conv_id and not conversation_id:
                conversation_id = client_conv_id

            try:
                async with async_session() as db:
                    # Get or create conversation
                    if conversation_id:
                        result = await db.execute(
                            select(Conversation)
                            .options(selectinload(Conversation.messages))
                            .where(Conversation.id == conversation_id)
                        )
                        conversation = result.scalar_one_or_none()
                        if not conversation:
                            await websocket.send_text(json.dumps({"error": "Conversation not found"}))
                            conversation_id = None
                            continue
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

                    # Register WS connection for this conversation
                    manager.connect_widget(conversation_id, websocket)

                    # Get tools
                    tools_result = await db.execute(
                        select(Tool).where(Tool.workspace_id == workspace_id, Tool.is_active == True)
                    )
                    tools = tools_result.scalars().all()

                    # Process
                    attachments = msg_data.get("attachments")
                    response = await ai_agent.process_message(
                        db, conversation, msg_data["content"], tools, attachments=attachments
                    )

                    # Send response to widget
                    await websocket.send_text(json.dumps({
                        "conversation_id": conversation_id,
                        "response": response["text"],
                        "tool_call": response.get("tool_call"),
                        "pending_approval": response.get("pending_approval"),
                    }))

                    # Refresh to pick up messages added by process_message()
                    await db.refresh(conversation, ["messages"])

                    # Notify admins about customer message
                    # Find the customer message (second to last) and AI message (last)
                    customer_msgs = [m for m in conversation.messages if m.role == "customer"]
                    ai_msgs = [m for m in conversation.messages if m.role == "ai"]
                    if customer_msgs:
                        await manager.notify_admins_new_message(
                            workspace_id, conversation_id, _message_to_dict(customer_msgs[-1])
                        )
                    if ai_msgs:
                        await manager.notify_admins_new_message(
                            workspace_id, conversation_id, _message_to_dict(ai_msgs[-1])
                        )

            except Exception as e:
                await websocket.send_text(json.dumps({"error": str(e)}))

    except WebSocketDisconnect:
        if conversation_id:
            manager.disconnect_widget(conversation_id)


# WebSocket for admin panel (receive-only notification channel)
@router.websocket("/ws/admin/{workspace_id}")
async def websocket_admin(websocket: WebSocket, workspace_id: str):
    await websocket.accept()
    manager.connect_admin(workspace_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle ping/pong keepalive
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except (json.JSONDecodeError, Exception):
                pass
    except WebSocketDisconnect:
        manager.disconnect_admin(workspace_id, websocket)


# REST endpoint for admin agent replies
@router.post("/chat/{workspace_id}/agent-reply")
async def agent_reply(workspace_id: str, body: AgentReply, db: AsyncSession = Depends(get_db)):
    # Validate conversation exists in workspace
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == body.conversation_id,
            Conversation.workspace_id == workspace_id,
        )
    )
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(404, "Conversation not found in this workspace")

    # Save agent message to DB
    msg = Message(
        conversation_id=body.conversation_id,
        role="agent",
        content=body.content,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    msg_dict = _message_to_dict(msg)

    # Send to widget
    await manager.send_to_widget(body.conversation_id, {
        "type": "agent_message",
        "response": body.content,
    })

    return {"ok": True, "message": msg_dict}
