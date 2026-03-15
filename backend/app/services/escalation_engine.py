import logging
from datetime import datetime, timezone

import anthropic

from app.config import settings
from app.models.models import Conversation, Message, Skill

logger = logging.getLogger(__name__)

ANALYSIS_PROMPT = """Analyze this customer support conversation and return a JSON object with exactly two fields:

"sentiment": one of "angry", "negative", "neutral", "positive"
  - "angry" = customer is furious, threatening, using strong language, swearing, ALL CAPS, etc.
  - "negative" = customer is unhappy, disappointed, frustrated but not furious
  - "neutral" = no strong emotion
  - "positive" = customer is thankful, satisfied

"confidence": one of "low", "medium", "high"
  - "low" = the AI clearly couldn't help — said it doesn't know, can't do it, suggested contacting someone else, or gave a vague non-answer
  - "medium" = the AI hedged — used "I think", "possibly", "it seems", was unsure
  - "high" = the AI gave a direct, confident answer

Last 3 customer messages:
{customer_messages}

Last AI response:
{ai_response}

Return ONLY valid JSON, nothing else. Example: {{"sentiment": "negative", "confidence": "low"}}"""


class EscalationEngine:
    """Evaluates escalation triggers after every AI response using AI analysis."""

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        return self._client

    async def analyze(self, messages: list[Message], ai_response: str) -> dict:
        """Use a fast AI call to detect sentiment and confidence at once."""
        customer_msgs = [m for m in messages if m.role == "customer"]
        recent = customer_msgs[-3:] if len(customer_msgs) >= 3 else customer_msgs
        customer_text = "\n".join(f"- {m.content}" for m in recent)

        if not customer_text:
            return {"sentiment": "neutral", "confidence": "high"}

        prompt = ANALYSIS_PROMPT.format(
            customer_messages=customer_text,
            ai_response=ai_response or "(no response yet)",
        )

        try:
            response = await self.client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=60,
                messages=[{"role": "user", "content": prompt}],
            )
            import json
            text = response.content[0].text.strip()
            result = json.loads(text)
            sentiment = result.get("sentiment", "neutral")
            confidence = result.get("confidence", "high")
            # Validate values
            if sentiment not in ("angry", "negative", "neutral", "positive"):
                sentiment = "neutral"
            if confidence not in ("low", "medium", "high"):
                confidence = "high"
            return {"sentiment": sentiment, "confidence": confidence}
        except Exception as e:
            logger.warning(f"AI analysis failed, falling back to neutral/high: {e}")
            return {"sentiment": "neutral", "confidence": "high"}

    def check_complexity(self, message_count: int, tool_execution_count: int) -> bool:
        """Complex multi-step problem heuristic."""
        return message_count > 8 and tool_execution_count > 2

    async def evaluate(
        self,
        conversation: Conversation,
        messages: list[Message],
        ai_response: str,
        tool_execution_count: int,
        matched_skill: Skill | None = None,
        skill_should_escalate: bool = False,
    ) -> dict | None:
        """
        Evaluate all escalation triggers.
        Returns escalation context dict if escalation should happen, None otherwise.
        """
        triggers = []

        # AI-based sentiment and confidence analysis
        analysis = await self.analyze(messages, ai_response)
        sentiment = analysis["sentiment"]
        confidence = analysis["confidence"]

        # Trigger 1: Angry customer
        if sentiment == "angry":
            triggers.append("angry_customer")

        # Trigger 2: Low confidence
        if confidence == "low":
            triggers.append("low_confidence")

        # Trigger 3: Manual autonomy skill or skill escalation conditions
        if matched_skill:
            if matched_skill.autonomy_level == "manual":
                triggers.append("manual_skill")
            if skill_should_escalate:
                triggers.append("skill_escalation_condition")

        # Trigger 4: Complex multi-step problem
        message_count = len(messages)
        if self.check_complexity(message_count, tool_execution_count):
            triggers.append("complex_problem")

        if not triggers:
            return None

        # Build escalation context
        reason = self._build_reason(triggers, sentiment, confidence, matched_skill)
        suggested_action = self._suggest_action(triggers, sentiment, conversation.category, matched_skill)

        # Gather attempted tool actions from messages
        attempted_actions = []
        for msg in messages:
            if msg.role == "ai" and msg.tool_call:
                attempted_actions.append({
                    "tool": msg.tool_call.get("name"),
                    "input": msg.tool_call.get("input"),
                })

        customer_msgs = [m for m in messages if m.role == "customer"]

        context = {
            "reason": reason,
            "triggers": triggers,
            "sentiment": sentiment,
            "confidence": confidence,
            "topic": matched_skill.topic if matched_skill else None,
            "category": conversation.category,
            "customer_profile": {
                "name": conversation.customer_name,
                "email": conversation.customer_email,
                "message_count": len(customer_msgs),
            },
            "attempted_actions": attempted_actions,
            "conversation_summary": conversation.ai_summary or (customer_msgs[0].content if customer_msgs else ""),
            "suggested_next_action": suggested_action,
            "escalated_at": datetime.now(timezone.utc).isoformat(),
        }

        return context

    def _build_reason(
        self,
        triggers: list[str],
        sentiment: str,
        confidence: str,
        skill: Skill | None,
    ) -> str:
        parts = []
        if "ai_requested" in triggers:
            parts.append("AI determined human assistance is needed")
        if "angry_customer" in triggers:
            parts.append("Customer expressed strong frustration")
        if "low_confidence" in triggers:
            parts.append("AI was unable to confidently resolve the issue")
        if "manual_skill" in triggers:
            parts.append(f"Skill '{skill.name}' requires manual handling" if skill else "Manual skill triggered")
        if "skill_escalation_condition" in triggers:
            parts.append(f"Escalation condition met for skill '{skill.name}'" if skill else "Skill escalation condition met")
        if "complex_problem" in triggers:
            parts.append("Complex multi-step issue requiring human oversight")
        return ". ".join(parts) + "."

    def _suggest_action(
        self,
        triggers: list[str],
        sentiment: str,
        category: str | None,
        skill: Skill | None,
    ) -> str:
        if "ai_requested" in triggers:
            return "AI transferred the customer — respond promptly to show a real person is here"
        if "angry_customer" in triggers and category == "billing":
            return "Review billing issue and consider compensation"
        if "low_confidence" in triggers and category == "technical":
            return "Technical specialist review needed"
        if "manual_skill" in triggers and skill:
            return f"Manual review required per skill policy: {skill.name}"
        if "complex_problem" in triggers:
            return "Review multi-step interaction and assist customer"
        if "angry_customer" in triggers:
            return "Acknowledge customer frustration and resolve issue promptly"
        if "low_confidence" in triggers:
            return "Review conversation and provide expert assistance"
        return "Review conversation and assist customer"


escalation_engine = EscalationEngine()
