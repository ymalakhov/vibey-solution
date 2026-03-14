import anthropic
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.models.models import Tool, Conversation, Message, ToolExecution

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
"""


class AIAgent:
    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

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

    def _build_messages(self, messages: list[Message]) -> list[dict]:
        """Convert DB messages to Claude API message format."""
        claude_messages = []
        for i, msg in enumerate(messages):
            if msg.role == "customer":
                claude_messages.append({"role": "user", "content": msg.content})
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
    ) -> dict:
        """Process a customer message and return AI response with possible tool calls."""

        # Save customer message
        customer_msg = Message(
            conversation_id=conversation.id,
            role="customer",
            content=user_message,
        )
        db.add(customer_msg)
        await db.flush()

        # Build message history
        messages = self._build_messages(conversation.messages + [customer_msg])
        claude_tools = self._db_tools_to_claude_format(tools)

        # Call Claude
        kwargs = {
            "model": settings.AI_MODEL,
            "max_tokens": 1024,
            "system": SYSTEM_PROMPT,
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

        kwargs = {
            "model": settings.AI_MODEL,
            "max_tokens": 1024,
            "system": SYSTEM_PROMPT,
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
