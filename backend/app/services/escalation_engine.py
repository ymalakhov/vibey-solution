import logging
import re
from datetime import datetime, timezone

from app.models.models import Conversation, Message, Skill, ToolExecution

logger = logging.getLogger(__name__)

# --- Trigger 1: Angry Customer keywords ---
ANGRY_KEYWORDS_EN = [
    "unacceptable", "terrible", "worst", "furious", "ridiculous", "scam",
    "sue", "lawyer", "complaint", "disgusting", "outrageous", "fraud",
]
ANGRY_KEYWORDS_UA = [
    "жахливо", "обурений", "скарга", "шахрайство", "неприйнятно",
    "огидно", "обурення", "жахливий",
]
NEGATIVE_KEYWORDS_EN = [
    "disappointed", "unhappy", "frustrated", "annoying", "awful", "horrible",
    "useless", "pathetic",
]
NEGATIVE_KEYWORDS_UA = [
    "розчарований", "незадоволений", "дратує", "жахливий",
]

# --- Trigger 2: Low Confidence hedging phrases ---
LOW_CONFIDENCE_EN = [
    "i'm not sure", "i don't know", "i'm unable to", "you may need to contact",
    "i cannot", "beyond my capabilities", "i'd recommend speaking to",
    "i'm not able to", "i don't have access", "unfortunately, i can't",
    "i can't help with", "you should contact",
]
LOW_CONFIDENCE_UA = [
    "я не впевнений", "не можу допомогти", "зверніться до",
    "я не знаю", "не маю доступу",
]
MEDIUM_CONFIDENCE_EN = [
    "i think", "i believe", "it seems", "possibly", "perhaps", "might be",
]


class EscalationEngine:
    """Evaluates escalation triggers after every AI response."""

    def detect_sentiment(self, messages: list[Message]) -> str:
        """Analyze sentiment from last 3 customer messages."""
        customer_msgs = [m for m in messages if m.role == "customer"]
        recent = customer_msgs[-3:] if len(customer_msgs) >= 3 else customer_msgs
        combined = " ".join(m.content for m in recent).lower()

        # Check angry signals
        angry_count = 0
        for kw in ANGRY_KEYWORDS_EN + ANGRY_KEYWORDS_UA:
            if kw in combined:
                angry_count += 1

        # Check caps words (3+ consecutive ALL CAPS words)
        caps_pattern = r'\b[A-ZА-ЯІЇЄҐ]{2,}(?:\s+[A-ZА-ЯІЇЄҐ]{2,}){2,}\b'
        if re.search(caps_pattern, " ".join(m.content for m in recent)):
            angry_count += 2

        # Check multiple exclamation marks
        if combined.count("!") >= 3:
            angry_count += 1

        if angry_count >= 2:
            return "angry"

        # Check negative
        negative_count = angry_count  # angry keywords also count as negative
        for kw in NEGATIVE_KEYWORDS_EN + NEGATIVE_KEYWORDS_UA:
            if kw in combined:
                negative_count += 1
        if negative_count >= 2:
            return "negative"

        # Positive signals
        positive_keywords = ["thank", "great", "awesome", "perfect", "дякую", "чудово", "супер"]
        if any(kw in combined for kw in positive_keywords):
            return "positive"

        return "neutral"

    def detect_confidence(self, ai_response: str) -> str:
        """Analyze AI response for hedging language."""
        text_lower = ai_response.lower()

        for phrase in LOW_CONFIDENCE_EN + LOW_CONFIDENCE_UA:
            if phrase in text_lower:
                return "low"

        for phrase in MEDIUM_CONFIDENCE_EN:
            if phrase in text_lower:
                return "medium"

        return "high"

    def check_complexity(self, message_count: int, tool_execution_count: int) -> bool:
        """Trigger 4: Complex multi-step problem heuristic."""
        return message_count > 8 and tool_execution_count > 2

    def evaluate(
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
        sentiment = self.detect_sentiment(messages)
        confidence = self.detect_confidence(ai_response)

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
