import logging

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.models.models import Flow, Conversation, ConversationFlowState, Tool, Skill

logger = logging.getLogger(__name__)

INTENT_MATCH_PROMPT = """You are an intent classifier. Given a customer message and a list of available support flows, determine which flow (if any) matches the customer's intent.

Available flows:
{flows_description}

Customer message: "{message}"

Rules:
- Match based on MEANING, not exact words. "get rid of my profile" = "delete account".
- Work with ANY language — the customer may write in English, Ukrainian, or any other language.
- If no flow matches, respond with: NONE
- If a flow matches, respond with ONLY the flow ID, nothing else.
- If multiple flows could match, pick the most specific one.

Respond with the flow ID or NONE:"""


class FlowEngine:
    """Matches conversations to flows and compiles flow state into system prompts."""

    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def match_flow(self, db: AsyncSession, workspace_id: str, message: str) -> Flow | None:
        """Use AI to match customer message to the best flow by semantic intent."""
        result = await db.execute(
            select(Flow)
            .where(Flow.workspace_id == workspace_id, Flow.is_active == True)
            .order_by(Flow.priority.desc())
        )
        flows = result.scalars().all()

        if not flows:
            return None

        # Build flow descriptions for the classifier
        flows_description = "\n".join(
            f"- ID: {f.id} | Name: {f.name} | Triggers on: {', '.join(f.trigger_intents or [])} | Description: {f.description or 'N/A'}"
            for f in flows
        )

        prompt = INTENT_MATCH_PROMPT.format(
            flows_description=flows_description,
            message=message,
        )

        try:
            response = await self.client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=50,
                messages=[{"role": "user", "content": prompt}],
            )
            answer = response.content[0].text.strip()
            logger.info(f"[FLOW] Intent classifier response: '{answer}' for message: '{message}'")

            if answer == "NONE":
                return None

            # Find the matched flow by ID
            flow_map = {f.id: f for f in flows}
            matched = flow_map.get(answer)
            if matched:
                return matched

            # Fallback: classifier might have returned the name instead of ID
            for f in flows:
                if f.name.lower() in answer.lower() or f.id in answer:
                    return f

        except Exception as e:
            logger.error(f"[FLOW] Intent classification failed: {e}, falling back to keyword match")
            # Fallback to keyword matching
            return self._keyword_match(flows, message)

        return None

    def _keyword_match(self, flows: list[Flow], message: str) -> Flow | None:
        """Fallback keyword-based matching."""
        msg_words = set(message.lower().split())
        for flow in flows:
            for intent in (flow.trigger_intents or []):
                if all(w in msg_words for w in intent.lower().split()):
                    return flow
        return None

    async def start_flow(
        self, db: AsyncSession, conversation: Conversation, flow: Flow
    ) -> ConversationFlowState:
        """Initialize flow state for a conversation."""
        # Find the trigger node to start from
        trigger = next((n for n in (flow.nodes or []) if n.get("type") == "trigger"), None)
        start_node_id = trigger["id"] if trigger else None

        # Find the first node after trigger
        next_node_id = None
        if start_node_id:
            for edge in (flow.edges or []):
                if edge.get("source") == start_node_id:
                    next_node_id = edge.get("target")
                    break

        # Pre-populate with known conversation context
        initial_data = {}
        if conversation.customer_email:
            initial_data["customer_email"] = conversation.customer_email
        if conversation.customer_name:
            initial_data["customer_name"] = conversation.customer_name

        state = ConversationFlowState(
            conversation_id=conversation.id,
            flow_id=flow.id,
            current_node_id=next_node_id or start_node_id,
            completed_nodes=[start_node_id] if start_node_id else [],
            collected_data=initial_data,
            status="active",
        )
        db.add(state)
        conversation.active_flow_id = flow.id
        await db.flush()
        return state

    async def compile_system_prompt_async(
        self, db: AsyncSession, flow: Flow, state: ConversationFlowState
    ) -> str:
        """Build system prompt, loading skill data from DB if needed."""
        nodes = {n["id"]: n for n in (flow.nodes or [])}
        current = nodes.get(state.current_node_id)
        if current and current.get("type") == "skill":
            skill_id = current.get("data", {}).get("skill_id")
            if skill_id:
                skill = await db.get(Skill, skill_id)
                if skill:
                    from app.services.skill_engine import skill_engine
                    return skill_engine.compile_skill_prompt(skill, state.collected_data)
        return self.compile_system_prompt(flow, state)

    def compile_system_prompt(self, flow: Flow, state: ConversationFlowState) -> str:
        """Build an enhanced system prompt describing the current flow step."""
        nodes = {n["id"]: n for n in (flow.nodes or [])}
        current = nodes.get(state.current_node_id)

        if not current:
            return ""

        lines = [
            "You are a customer support assistant executing a structured support flow.",
            "You are currently inside the flow: \"" + flow.name + "\".",
            "",
            "RULES:",
            "1. Follow the current step described below as your primary guide.",
            "2. Interpret customer responses intelligently — understand their INTENT, not just literal words.",
            "3. If the customer explicitly asks for a human agent or operator, use the escalate_to_human tool IMMEDIATELY — this overrides the flow.",
            "4. If the customer cannot provide requested information, acknowledge this and help them (suggest where to find it, offer alternatives, or escalate if truly stuck).",
            "5. Do NOT tell the customer you are following a flow or script.",
            "6. Be friendly and concise. Respond in the same language the customer uses.",
            "7. When calling tools, use only valid, meaningful data as parameter values. NEVER pass raw conversational text like 'I don\\'t have it' or 'I want an operator' as a parameter value.",
        ]

        if state.collected_data:
            lines.append(f"\nContext — information collected so far: {state.collected_data}")

        # Describe current node
        node_type = current.get("type")
        data = current.get("data", {})

        if node_type == "question":
            question = data.get("question_text", "")
            var_name = data.get("variable_name", "")
            required = data.get("required", True)
            validation = data.get("validation", "")
            lines.append(f"\nCURRENT STEP — ASK A QUESTION:")
            lines.append(f'Ask the customer (rephrase naturally): "{question}"')
            lines.append(f"The answer will be stored as: {var_name}")
            if validation:
                lines.append(f"Validate the answer: {validation}")
            if required:
                lines.append("This information is important. If the customer cannot provide it, try to help them find it or suggest alternatives. Escalate to a human agent only if there is no way to proceed.")

        elif node_type == "tool":
            tool_id = data.get("tool_id", "")
            input_mapping = data.get("input_mapping", {})
            lines.append(f"\nCURRENT STEP — USE TOOL:")
            lines.append("You MUST call the appropriate tool now using the collected information.")
            if input_mapping:
                resolved = {}
                for k, v in input_mapping.items():
                    if isinstance(v, str) and "{{" in v:
                        for var, val in (state.collected_data or {}).items():
                            v = v.replace("{{" + var + "}}", str(val))
                    resolved[k] = v
                lines.append(f"Use these input values: {resolved}")

        elif node_type == "guardrail":
            check_type = data.get("check_type", "")
            condition = data.get("condition", "")
            fail_message = data.get("fail_message", "")
            lines.append(f"\nCURRENT STEP — SAFETY CHECK:")
            lines.append(f"Before proceeding, verify: {check_type} — {condition}")
            if fail_message:
                lines.append(f"If check FAILS, you MUST tell the customer: \"{fail_message}\"")

        elif node_type == "condition":
            variable = data.get("variable", "")
            operator = data.get("operator", "")
            value = data.get("value", "")
            actual_value = state.collected_data.get(variable, "unknown")
            lines.append(f"\nCURRENT STEP — EVALUATE CONDITION:")
            lines.append(f"Check: is {variable} (current value: {actual_value}) {operator} {value}?")
            lines.append("Respond according to the result.")

        elif node_type == "response":
            template = data.get("message_template", "")
            instructions = data.get("ai_instructions", "")
            lines.append(f"\nCURRENT STEP — RESPOND TO CUSTOMER:")
            if template:
                # Resolve variables in template
                resolved = template
                for var, val in (state.collected_data or {}).items():
                    resolved = resolved.replace("{{" + var + "}}", str(val))
                lines.append(f"Send this message (rephrase naturally): \"{resolved}\"")
            if instructions:
                lines.append(f"Additional instructions: {instructions}")

        elif node_type == "skill":
            skill_name = data.get("skill_name", "")
            lines.append(f"\nCURRENT STEP — DELEGATE TO SKILL:")
            lines.append(f"Use the skill \"{skill_name}\" to handle the customer's request.")
            lines.append("Follow the skill's prompt template and instructions. Be conversational and helpful.")

        elif node_type == "escalation":
            reason = data.get("reason", "")
            lines.append(f"\nCURRENT STEP — ESCALATE TO HUMAN:")
            lines.append("You MUST tell the customer that you are transferring them to a human agent.")
            if reason:
                lines.append(f"Reason: {reason}")
            if data.get("generate_summary"):
                lines.append("Provide a brief summary of the conversation to the customer.")

        lines.append("\nFocus on the current step, but always use good judgment about customer intent.")
        return "\n".join(lines)

    def get_available_tools(self, flow: Flow, state: ConversationFlowState, all_tools: list[Tool]) -> list[Tool]:
        """Filter tools to those relevant to the current and nearby flow nodes."""
        nodes = flow.nodes or []
        edges = flow.edges or []

        # Collect tool_ids from current node and adjacent nodes
        relevant_tool_ids: set[str] = set()
        current_id = state.current_node_id

        # Current node and next nodes
        check_ids = {current_id}
        for edge in edges:
            if edge.get("source") == current_id:
                check_ids.add(edge.get("target"))

        for node in nodes:
            if node["id"] in check_ids and node.get("type") == "tool":
                tool_id = node.get("data", {}).get("tool_id")
                if tool_id:
                    relevant_tool_ids.add(tool_id)

        # If no specific tools found in flow, return all tools
        if not relevant_tool_ids:
            return all_tools

        return [t for t in all_tools if t.id in relevant_tool_ids]

    def get_escalation_node(self, flow: Flow, state: ConversationFlowState) -> dict | None:
        """Find the escalation node that was reached."""
        nodes = {n["id"]: n for n in (flow.nodes or [])}
        # Check current node first, then completed nodes (escalation is the last completed)
        current = nodes.get(state.current_node_id)
        if current and current.get("type") == "escalation":
            return current
        for node_id in reversed(state.completed_nodes or []):
            node = nodes.get(node_id)
            if node and node.get("type") == "escalation":
                return node
        return None

    def build_handoff(self, flow: Flow, state: ConversationFlowState, escalation_node: dict | None) -> dict:
        """Build handoff notes and summary for the human agent."""
        data = (escalation_node or {}).get("data", {})
        collected = state.collected_data or {}

        # Build summary
        reason = data.get("reason", "Escalated by flow")
        summary = f"[{flow.name}] {reason}"

        # Build handoff notes from template or auto-generate
        template = data.get("handoff_notes_template", "")
        if template:
            notes = template
            for var, val in collected.items():
                notes = notes.replace("{{" + var + "}}", str(val))
        else:
            notes = f"Flow: {flow.name}\nReason: {reason}"

        # Add collected data section
        if collected:
            notes += "\n\n--- Collected Information ---"
            for key, value in collected.items():
                notes += f"\n{key}: {value}"

        # Priority override
        priority = data.get("priority_override", "")

        return {
            "summary": summary,
            "notes": notes,
            "priority": priority or None,
        }

    async def advance_flow(
        self, db: AsyncSession, state: ConversationFlowState, flow: Flow, ai_response: str
    ) -> None:
        """After AI responds, advance to the next node if appropriate.
        Keeps advancing through non-interactive nodes (condition, escalation)."""
        self._advance_one_step(state, flow)
        # Keep processing if we landed on a non-interactive node
        self._process_non_interactive(state, flow)

    def _advance_one_step(self, state: ConversationFlowState, flow: Flow) -> None:
        """Advance one step based on current node type."""
        nodes = {n["id"]: n for n in (flow.nodes or [])}
        current = nodes.get(state.current_node_id)

        if not current:
            return

        node_type = current.get("type")

        if node_type in ("response", "tool", "guardrail", "skill"):
            self._move_to_next(state, flow)
        elif node_type == "question":
            # Wait for customer answer
            pass
        elif node_type == "condition":
            self._evaluate_and_branch(state, flow, current)
        elif node_type == "escalation":
            state.status = "escalated"
            completed = list(state.completed_nodes or [])
            completed.append(current["id"])
            state.completed_nodes = completed

    def _evaluate_and_branch(self, state: ConversationFlowState, flow: Flow, current: dict) -> None:
        """Evaluate condition and take the appropriate branch."""
        data = current.get("data", {})
        variable = data.get("variable", "")
        operator = data.get("operator", "")
        value = data.get("value", "")

        actual = state.collected_data.get(variable, "")
        result = self._evaluate_condition(actual, operator, value)

        edges = flow.edges or []
        for edge in edges:
            if edge.get("source") == state.current_node_id:
                handle = edge.get("sourceHandle", "")
                if (result and handle == "yes") or (not result and handle == "no"):
                    completed = list(state.completed_nodes or [])
                    completed.append(current["id"])
                    state.completed_nodes = completed
                    state.current_node_id = edge.get("target")
                    return

        # Fallback: take first outgoing edge
        self._move_to_next(state, flow)

    def _process_non_interactive(self, state: ConversationFlowState, flow: Flow) -> None:
        """After advancing, keep processing nodes that don't need a message turn
        (condition → escalation, condition → response, etc.)."""
        nodes = {n["id"]: n for n in (flow.nodes or [])}
        # Limit iterations to prevent infinite loops
        for _ in range(10):
            if state.status != "active":
                break
            current = nodes.get(state.current_node_id)
            if not current:
                break
            node_type = current.get("type")
            if node_type == "escalation":
                state.status = "escalated"
                completed = list(state.completed_nodes or [])
                completed.append(current["id"])
                state.completed_nodes = completed
                break
            elif node_type == "condition":
                self._evaluate_and_branch(state, flow, current)
                # continue loop to process what's after the condition
            else:
                # question, response, tool, guardrail — needs a message turn
                break

    def advance_after_customer_message(
        self, state: ConversationFlowState, flow: Flow, customer_message: str
    ) -> str:
        """Advance flow after customer provides an answer to a question node.

        Returns a classification of the customer's response:
        - "answered"            – valid answer stored, flow advanced
        - "no_answer"           – customer indicated they can't provide the info
        - "escalation_request"  – customer wants a human agent
        - "skipped"             – not on a question node, nothing to do
        """
        nodes = {n["id"]: n for n in (flow.nodes or [])}
        current = nodes.get(state.current_node_id)

        if not current or current.get("type") != "question":
            return "skipped"

        msg_lower = customer_message.lower().strip()

        # Detect escalation requests (multilingual)
        escalation_keywords = [
            "оператор", "людин", "живий", "реальн", "менеджер",
            "з'єднайте", "переключ", "переведіть",
            "human", "real person", "live agent", "operator", "manager",
            "speak to someone", "talk to someone", "transfer me",
        ]
        if any(kw in msg_lower for kw in escalation_keywords):
            return "escalation_request"

        # Detect non-answers
        no_answer_keywords = [
            "не маю", "не знаю", "немає", "не пам'ятаю", "не можу знайти",
            "don't have", "dont have", "no idea", "don't know", "dont know",
            "not sure", "can't find", "cant find", "don't remember",
            "не помню", "нету", "не имею", "нет у меня",
        ]
        if any(kw in msg_lower for kw in no_answer_keywords):
            return "no_answer"

        # Valid answer — store and advance
        data = current.get("data", {})
        var_name = data.get("variable_name")
        if var_name:
            collected = dict(state.collected_data or {})
            collected[var_name] = customer_message
            state.collected_data = collected

        self._move_to_next(state, flow)
        return "answered"

    def _move_to_next(self, state: ConversationFlowState, flow: Flow) -> None:
        """Move to the next node in the flow."""
        edges = flow.edges or []
        for edge in edges:
            if edge.get("source") == state.current_node_id:
                completed = list(state.completed_nodes or [])
                completed.append(state.current_node_id)
                state.completed_nodes = completed
                state.current_node_id = edge.get("target")
                return

        # No next node — flow is complete
        completed = list(state.completed_nodes or [])
        completed.append(state.current_node_id)
        state.completed_nodes = completed
        state.status = "completed"

    def _evaluate_condition(self, actual: str, operator: str, value: str) -> bool:
        """Evaluate a simple condition."""
        actual_str = str(actual).lower().strip()
        value_str = str(value).lower().strip()

        if operator == "equals":
            return actual_str == value_str
        elif operator == "not_equals":
            return actual_str != value_str
        elif operator == "contains":
            return value_str in actual_str
        elif operator == "greater_than":
            try:
                return float(actual_str) > float(value_str)
            except ValueError:
                return False
        elif operator == "less_than":
            try:
                return float(actual_str) < float(value_str)
            except ValueError:
                return False
        return False


flow_engine = FlowEngine()
