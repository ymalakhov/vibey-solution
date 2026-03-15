import base64
import logging
from pathlib import Path

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.models.models import Tool, Conversation, Message, ToolExecution, Flow, ConversationFlowState, Skill
from app.services.flow_engine import flow_engine
from app.services.skill_engine import skill_engine
from app.services.escalation_engine import escalation_engine
from app.services.connection_manager import manager
from app.services.tool_executor import execute_tool

logger = logging.getLogger(__name__)

UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"

SYSTEM_PROMPT = """You are an AI customer support assistant. You help customers resolve their issues quickly and efficiently.

Your capabilities:
- You can understand customer intent and classify their issue
- You can use tools to perform real actions (refunds, plan changes, password resets, etc.)
- You always explain what you're doing in a friendly, professional tone
- If you cannot resolve an issue, you MUST use the escalate_to_human tool to transfer the customer

Guidelines:
- Be concise and helpful
- Always confirm before executing irreversible actions
- If the customer is frustrated, acknowledge their feelings first
- Respond in the same language the customer uses
- NEVER pretend to transfer to a human — you MUST call the escalate_to_human tool to actually do it
- NEVER invent or fabricate tool results. If a tool hasn't returned data, say you're checking and wait
- If the customer explicitly asks for a real person / human agent / live support, use escalate_to_human immediately
- If flow instructions are provided below, follow them as your guide but use good judgment. Always prioritize understanding the customer's actual intent. If the customer requests a human agent during any flow, escalate immediately.
- If the customer's message is a general question, greeting, or does not clearly map to a specific action — just answer naturally and ask clarifying questions to better understand what they need. Do NOT use tools unless the customer's intent is clear.
"""

# Built-in escalation tool definition (always injected, not stored in DB)
ESCALATE_TOOL = {
    "name": "escalate_to_human",
    "description": "Transfer the conversation to a human support agent. Use this when: the customer explicitly asks for a human, you cannot resolve the issue, the problem is too complex, or the customer is very frustrated.",
    "input_schema": {
        "type": "object",
        "properties": {
            "reason": {
                "type": "string",
                "description": "Brief reason for escalation (e.g. 'Customer requested human agent', 'Cannot process refund automatically')",
            },
            "summary": {
                "type": "string",
                "description": "Summary of the conversation and what was attempted so far",
            },
        },
        "required": ["reason", "summary"],
    },
}


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
        """Convert DB tool definitions to Claude API tool format.
        Always includes the built-in escalate_to_human tool."""
        claude_tools = [ESCALATE_TOOL]
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
        matched_skill = None

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
        use_flow_prompt = False
        flow_escalation_override = False
        if flow and flow_state and flow_state.status == "active":
            # Only advance on customer answer if this is a continuing flow, not the trigger message
            if not just_matched:
                advance_result = flow_engine.advance_after_customer_message(flow_state, flow, user_message)
                logger.info(f"Flow advance result: {advance_result}, node: {flow_state.current_node_id}, data: {flow_state.collected_data}")

                if advance_result == "escalation_request":
                    # Customer wants a human — break out of flow, let AI escalate
                    system_prompt = SYSTEM_PROMPT + (
                        "\n\nIMPORTANT: The customer has explicitly asked to speak with a human agent. "
                        "Use the escalate_to_human tool NOW. Briefly summarize what has been discussed so far."
                    )
                    active_tools = tools
                    flow_escalation_override = True
                    logger.info("[FLOW] Customer requested escalation — breaking out of flow")
                else:
                    use_flow_prompt = True
            else:
                use_flow_prompt = True

        if use_flow_prompt and flow and flow_state and flow_state.status == "active":
            flow_prompt = await flow_engine.compile_system_prompt_async(db, flow, flow_state)
            if flow_prompt:
                system_prompt = flow_prompt
                logger.info(f"[FLOW] Replaced system prompt for node: {flow_state.current_node_id}")
            active_tools = flow_engine.get_available_tools(flow, flow_state, tools)
        elif not flow_escalation_override:
            # --- Skill engine integration ---
            # Try to match a skill if no flow is active
            matched_skill = await skill_engine.match_skill(db, conversation.workspace_id, user_message)
            if matched_skill:
                logger.info(f"Skill matched: '{matched_skill.name}'")
                context = {}
                if conversation.customer_email:
                    context["customer_email"] = conversation.customer_email
                if conversation.customer_name:
                    context["customer_name"] = conversation.customer_name
                system_prompt = skill_engine.compile_skill_prompt(matched_skill, context)
                active_tools = skill_engine.get_allowed_tools(matched_skill, tools)
            else:
                logger.info("No active flow or skill for this conversation")

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

        # Handle tool calls
        pending_approval = None
        if tool_call:
            if tool_call["name"] == "escalate_to_human":
                # Built-in escalation tool — actually escalate the conversation
                esc_input = tool_call.get("input", {})
                reason = esc_input.get("reason", "AI requested escalation")
                summary = esc_input.get("summary", "")

                conversation.status = "escalated"
                conversation.escalation_reason = reason
                conversation.ai_summary = summary or reason
                conversation.priority = "high"

                # Build escalation context
                all_msgs = conversation.messages + [customer_msg, ai_msg]
                customer_msgs = [m for m in all_msgs if m.role == "customer"]
                analysis = await escalation_engine.analyze(all_msgs, ai_text)
                conversation.sentiment = analysis["sentiment"]
                conversation.escalation_context = {
                    "reason": reason,
                    "triggers": ["ai_requested"],
                    "sentiment": analysis["sentiment"],
                    "confidence": analysis["confidence"],
                    "category": conversation.category,
                    "customer_profile": {
                        "name": conversation.customer_name,
                        "email": conversation.customer_email,
                        "message_count": len(customer_msgs),
                    },
                    "attempted_actions": [
                        {"tool": m.tool_call.get("name"), "input": m.tool_call.get("input")}
                        for m in conversation.messages if m.role == "ai" and m.tool_call
                    ],
                    "suggested_next_action": f"Review: {reason}",
                    "escalated_at": __import__("datetime").datetime.now(
                        __import__("datetime").timezone.utc
                    ).isoformat(),
                }

                handoff_msg = Message(
                    conversation_id=conversation.id,
                    role="system",
                    content=f"Escalated to human agent — {reason}",
                )
                db.add(handoff_msg)

                await manager.notify_admins_escalation(
                    conversation.workspace_id, conversation.id, conversation.escalation_context
                )
                logger.info(f"[ESCALATION] AI requested escalation: {reason}")
            else:
                # Regular tool — find in DB and create execution record
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
                else:
                    # Auto-execute and continue conversation
                    result = await execute_tool(db, execution)

                    # Save tool result as system message
                    system_msg = Message(
                        conversation_id=conversation.id,
                        role="system",
                        content=f"Tool result: {result}",
                        tool_result={"tool_use_id": tool_call["id"], "result": result},
                    )
                    db.add(system_msg)
                    await db.flush()

                    # Rebuild messages with tool result and call Claude again
                    all_messages = conversation.messages + [customer_msg, ai_msg, system_msg]
                    messages = self._build_messages(all_messages)

                    followup_kwargs = {
                        "model": settings.AI_MODEL,
                        "max_tokens": 1024,
                        "system": system_prompt,
                        "messages": messages,
                    }
                    if claude_tools:
                        followup_kwargs["tools"] = claude_tools

                    followup_response = await self.client.messages.create(**followup_kwargs)

                    followup_text = ""
                    for block in followup_response.content:
                        if block.type == "text":
                            followup_text += block.text

                    followup_msg = Message(
                        conversation_id=conversation.id,
                        role="ai",
                        content=followup_text,
                    )
                    db.add(followup_msg)

                    # Use follow-up text for escalation checks and return
                    ai_text = followup_text
                    tool_call = None  # Tool already executed, don't send card to widget

        # Update conversation
        if conversation.status != "escalated":
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

        # --- Smart escalation check ---
        all_msgs = conversation.messages + [customer_msg, ai_msg]

        if conversation.status != "escalated":
            # Count tool executions for this conversation
            te_result = await db.execute(
                select(ToolExecution).where(ToolExecution.conversation_id == conversation.id)
            )
            tool_exec_count = len(te_result.scalars().all())

            # Check skill escalation conditions
            skill_should_escalate = False
            if matched_skill and ai_text:
                skill_should_escalate = skill_engine.should_escalate(
                    matched_skill, ai_text, {"category": conversation.category}
                )

            esc_context = await escalation_engine.evaluate(
                conversation=conversation,
                messages=all_msgs,
                ai_response=ai_text,
                tool_execution_count=tool_exec_count,
                matched_skill=matched_skill,
                skill_should_escalate=skill_should_escalate,
            )
            if esc_context:
                conversation.status = "escalated"
                conversation.sentiment = esc_context["sentiment"]
                conversation.escalation_reason = esc_context["reason"]
                conversation.escalation_context = esc_context
                if "angry_customer" in esc_context["triggers"]:
                    conversation.priority = "urgent"
                if not conversation.ai_summary:
                    conversation.ai_summary = esc_context["reason"]
                handoff_msg = Message(
                    conversation_id=conversation.id,
                    role="system",
                    content=f"Escalated to human agent — {esc_context['reason']}",
                )
                db.add(handoff_msg)
                logger.info(f"[ESCALATION] Triggered: {esc_context['triggers']} for conversation {conversation.id}")
                await manager.notify_admins_escalation(
                    conversation.workspace_id, conversation.id, esc_context
                )

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

        # --- Smart escalation check after tool continuation ---
        all_msgs_after = conversation.messages + [system_msg, ai_msg]

        if conversation.status != "escalated":
            te_result = await db.execute(
                select(ToolExecution).where(ToolExecution.conversation_id == conversation.id)
            )
            tool_exec_count = len(te_result.scalars().all())

            esc_context = await escalation_engine.evaluate(
                conversation=conversation,
                messages=all_msgs_after,
                ai_response=ai_text,
                tool_execution_count=tool_exec_count,
            )
            if esc_context:
                conversation.status = "escalated"
                conversation.sentiment = esc_context["sentiment"]
                conversation.escalation_reason = esc_context["reason"]
                conversation.escalation_context = esc_context
                if "angry_customer" in esc_context["triggers"]:
                    conversation.priority = "urgent"
                if not conversation.ai_summary:
                    conversation.ai_summary = esc_context["reason"]
                handoff_msg = Message(
                    conversation_id=conversation.id,
                    role="system",
                    content=f"Escalated to human agent — {esc_context['reason']}",
                )
                db.add(handoff_msg)
                logger.info(f"[ESCALATION] Triggered after tool: {esc_context['triggers']} for conversation {conversation.id}")
                await manager.notify_admins_escalation(
                    conversation.workspace_id, conversation.id, esc_context
                )

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
