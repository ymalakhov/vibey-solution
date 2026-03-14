import base64
import logging
from pathlib import Path

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.models.models import Tool, Conversation, Message, ToolExecution, Flow, ConversationFlowState
from app.services.flow_engine import flow_engine

logger = logging.getLogger(__name__)

UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"

SYSTEM_PROMPT = """You are an AI customer support assistant. You help customers resolve their issues quickly and efficiently.

Your capabilities:
- You can understand customer intent and classify their issue
- You can use tools to perform real actions (refunds, plan changes, password resets, etc.)
- You always explain what you're doing in a friendly, professional tone
- If you cannot resolve an issue, you escalate to a human agent with full context

Guidelines:
- Be concise and helpful
- Always confirm before executing irreversible actions
- If the customer is frustrated, acknowledge their feelings first
- Respond in the same language the customer uses
- IMPORTANT: If flow instructions are provided below, you MUST follow them exactly. Do only what the current step says. Do NOT decide on your own to escalate, skip steps, or ask questions not specified in the flow.
"""


class AIAgent:
    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def _build_system_prompt(
        self, db, workspace_id: str, user_message: str, base_prompt: str
    ) -> str:
        """Append KB context to the system prompt if relevant chunks are found."""
        try:
            from app.services.knowledge_base import kb_service

            results = await kb_service.search(db, workspace_id, user_message, limit=5, max_tokens=3000)
            if not results:
                return base_prompt

            kb_section = "\n\n## Knowledge Base Context\nUse the following documentation to answer the customer's question:\n\n"
            for r in results:
                heading = f"[{r['document_title']}"
                if r.get("heading_path"):
                    heading += f" > {r['heading_path']}"
                heading += "]"
                kb_section += f"{heading}\n{r['content']}\n\n"

            return base_prompt + kb_section
        except Exception as e:
            logger.warning(f"KB context injection failed: {e}")
            return base_prompt

    def _db_tools_to_claude_format(self, tools: list[Tool]) -> list[dict]:
        """Convert DB tool definitions to Claude API tool format."""
        claude_tools = []
        for tool in tools:
            if not tool.is_active:
                continue
            properties = {}
            required = []
            for param in tool.parameters:
                properties[param["name"]] = {
                    "type": param.get("type", "string"),
                    "description": param.get("description", ""),
                }
                if param.get("required", False):
                    required.append(param["name"])

            claude_tools.append({
                "name": tool.name,
                "description": tool.description,
                "input_schema": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                },
            })
        return claude_tools

    def _build_content_with_attachments(self, text: str, attachments: list[dict] | None) -> str | list[dict]:
        """Build content blocks with image attachments for Claude API."""
        if not attachments:
            return text
        content = []
        for att in attachments:
            ct = att.get("content_type", "")
            if ct.startswith("image/"):
                # Read file and base64 encode
                url_path = att.get("url", "")
                # url is like /api/uploads/files/{workspace_id}/{saved_name}
                parts = url_path.rstrip("/").split("/")
                if len(parts) >= 2:
                    file_path = UPLOADS_DIR / parts[-2] / parts[-1]
                    if file_path.exists():
                        b64 = base64.standard_b64encode(file_path.read_bytes()).decode()
                        media_type = ct
                        content.append({
                            "type": "image",
                            "source": {"type": "base64", "media_type": media_type, "data": b64},
                        })
                        continue
            # Non-image or failed to read: add as text reference
            content.append({"type": "text", "text": f"[Attached file: {att.get('filename', 'file')}]"})
        content.append({"type": "text", "text": text})
        return content

    def _build_messages(self, messages: list[Message]) -> list[dict]:
        """Convert DB messages to Claude API message format."""
        claude_messages = []
        for i, msg in enumerate(messages):
            if msg.role == "customer":
                content = self._build_content_with_attachments(msg.content, msg.attachments)
                claude_messages.append({"role": "user", "content": content})
            elif msg.role == "ai":
                if msg.tool_call:
                    # Check if next message has a matching tool_result
                    has_result = False
                    for next_msg in messages[i + 1:]:
                        if next_msg.role == "system" and next_msg.tool_result:
                            has_result = True
                            break
                        if next_msg.role in ("customer", "ai"):
                            break

                    if has_result:
                        # Include tool_use since result follows
                        content = []
                        if msg.content:
                            content.append({"type": "text", "text": msg.content})
                        content.append({
                            "type": "tool_use",
                            "id": msg.tool_call.get("id", "tool_0"),
                            "name": msg.tool_call["name"],
                            "input": msg.tool_call["input"],
                        })
                        claude_messages.append({"role": "assistant", "content": content})
                    else:
                        # No result yet — only include text part, skip tool_use
                        text = msg.content or f"[Requested action: {msg.tool_call['name']}]"
                        claude_messages.append({"role": "assistant", "content": text})
                else:
                    claude_messages.append({"role": "assistant", "content": msg.content})
            elif msg.role == "system" and msg.tool_result is not None:
                claude_messages.append({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": msg.tool_result.get("tool_use_id", "tool_0"),
                        "content": str(msg.tool_result.get("result", "")),
                    }],
                })
        return claude_messages

    async def process_message(
        self,
        db: AsyncSession,
        conversation: Conversation,
        user_message: str,
        tools: list[Tool],
        attachments: list[dict] | None = None,
    ) -> dict:
        """Process a customer message and return AI response with possible tool calls."""

        # Save customer message
        customer_msg = Message(
            conversation_id=conversation.id,
            role="customer",
            content=user_message,
            attachments=attachments,
        )
        db.add(customer_msg)
        await db.flush()

        # --- Flow engine integration ---
        system_prompt = SYSTEM_PROMPT
        active_tools = tools

        # Load existing flow state
        flow_state = None
        flow = None
        just_matched = False

        result = await db.execute(
            select(ConversationFlowState).where(
                ConversationFlowState.conversation_id == conversation.id
            )
        )
        flow_state = result.scalar_one_or_none()
        if flow_state and flow_state.status == "active":
            flow = await db.get(Flow, flow_state.flow_id)

        # Try to match a flow if none active
        if not flow or not flow_state or flow_state.status != "active":
            matched = await flow_engine.match_flow(db, conversation.workspace_id, user_message)
            if matched:
                flow = matched
                flow_state = await flow_engine.start_flow(db, conversation, matched)
                just_matched = True
                logger.info(f"Flow matched: '{flow.name}', starting at node: {flow_state.current_node_id}")

        # If flow is active, replace the system prompt entirely
        if flow and flow_state and flow_state.status == "active":
            # Only advance on customer answer if this is a continuing flow, not the trigger message
            if not just_matched:
                flow_engine.advance_after_customer_message(flow_state, flow, user_message)
                logger.info(f"Flow advanced to node: {flow_state.current_node_id}, data: {flow_state.collected_data}")
            flow_prompt = flow_engine.compile_system_prompt(flow, flow_state)
            if flow_prompt:
                system_prompt = flow_prompt
                logger.info(f"[FLOW] Replaced system prompt for node: {flow_state.current_node_id}")
            active_tools = flow_engine.get_available_tools(flow, flow_state, tools)
        else:
            logger.info("No active flow for this conversation")

        # Inject KB context into system prompt
        system_prompt = await self._build_system_prompt(
            db, conversation.workspace_id, user_message, system_prompt
        )

        # Build message history
        messages = self._build_messages(conversation.messages + [customer_msg])
        claude_tools = self._db_tools_to_claude_format(active_tools)

        # Call Claude
        kwargs = {
            "model": settings.AI_MODEL,
            "max_tokens": 1024,
            "system": system_prompt,
            "messages": messages,
        }
        if claude_tools:
            kwargs["tools"] = claude_tools

        response = await self.client.messages.create(**kwargs)

        # Parse response
        ai_text = ""
        tool_call = None

        for block in response.content:
            if block.type == "text":
                ai_text += block.text
            elif block.type == "tool_use":
                tool_call = {
                    "id": block.id,
                    "name": block.name,
                    "input": block.input,
                }

        # Save AI message
        ai_msg = Message(
            conversation_id=conversation.id,
            role="ai",
            content=ai_text,
            tool_call=tool_call,
        )
        db.add(ai_msg)

        # If tool call, create execution record
        pending_approval = None
        if tool_call:
            # Find tool in DB
            tool = next((t for t in tools if t.name == tool_call["name"]), None)
            if tool:
                execution = ToolExecution(
                    tool_id=tool.id,
                    conversation_id=conversation.id,
                    input_data=tool_call["input"],
                    status="pending" if tool.requires_approval else "approved",
                )
                db.add(execution)
                await db.flush()

                if tool.requires_approval:
                    pending_approval = {
                        "execution_id": execution.id,
                        "tool_name": tool.name,
                        "tool_description": tool.description,
                        "input": tool_call["input"],
                    }

        # Update conversation
        conversation.status = "ai_handling"
        if not conversation.category and ai_text:
            conversation.category = self._detect_category(user_message)

        # Advance flow after AI responds
        if flow and flow_state and flow_state.status == "active":
            await flow_engine.advance_flow(db, flow_state, flow, ai_text)
            # If flow escalated, generate handoff for the human agent
            if flow_state.status == "escalated":
                conversation.status = "escalated"
                escalation_node = flow_engine.get_escalation_node(flow, flow_state)
                handoff = flow_engine.build_handoff(flow, flow_state, escalation_node)
                conversation.ai_summary = handoff["summary"]
                if handoff.get("priority"):
                    conversation.priority = handoff["priority"]
                # Save handoff notes as a system message visible to agents
                handoff_msg = Message(
                    conversation_id=conversation.id,
                    role="system",
                    content=handoff["notes"],
                )
                db.add(handoff_msg)
                logger.info(f"[FLOW] Escalated: {handoff['summary']}")

        await db.commit()

        return {
            "text": ai_text,
            "tool_call": tool_call,
            "pending_approval": pending_approval,
            "stop_reason": response.stop_reason,
        }

    async def continue_after_tool(
        self,
        db: AsyncSession,
        conversation: Conversation,
        tool_use_id: str,
        tool_result: dict,
        tools: list[Tool],
    ) -> dict:
        """Continue conversation after tool execution with the result."""

        # Save tool result as system message
        system_msg = Message(
            conversation_id=conversation.id,
            role="system",
            content=f"Tool result: {tool_result}",
            tool_result={"tool_use_id": tool_use_id, "result": tool_result},
        )
        db.add(system_msg)
        await db.flush()

        # Rebuild messages and call Claude again
        all_messages = conversation.messages + [system_msg]
        messages = self._build_messages(all_messages)
        claude_tools = self._db_tools_to_claude_format(tools)

        # Find last customer message for KB search context
        last_customer_msg = ""
        for msg in reversed(all_messages):
            if msg.role == "customer":
                last_customer_msg = msg.content
                break
        system_prompt = await self._build_system_prompt(
            db, conversation.workspace_id, last_customer_msg, SYSTEM_PROMPT
        )

        kwargs = {
            "model": settings.AI_MODEL,
            "max_tokens": 1024,
            "system": system_prompt,
            "messages": messages,
        }
        if claude_tools:
            kwargs["tools"] = claude_tools

        response = await self.client.messages.create(**kwargs)

        ai_text = ""
        for block in response.content:
            if block.type == "text":
                ai_text += block.text

        ai_msg = Message(
            conversation_id=conversation.id,
            role="ai",
            content=ai_text,
        )
        db.add(ai_msg)
        await db.commit()

        return {"text": ai_text}

    def _detect_category(self, message: str) -> str:
        msg = message.lower()
        if any(w in msg for w in ["оплат", "списа", "refund", "повернен", "billing", "гроші", "кошти"]):
            return "billing"
        if any(w in msg for w in ["пароль", "увійти", "логін", "password", "login", "акаунт", "account"]):
            return "account"
        if any(w in msg for w in ["план", "тариф", "підписк", "plan", "subscription", "upgrade"]):
            return "billing"
        if any(w in msg for w in ["помилк", "error", "баг", "bug", "не працює", "crash"]):
            return "technical"
        return "general"


ai_agent = AIAgent()
