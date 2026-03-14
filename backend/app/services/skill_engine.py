import logging

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.models.models import Skill, Tool

logger = logging.getLogger(__name__)

SKILL_MATCH_PROMPT = """You are an intent classifier. Given a customer message and a list of available skills, determine which skill (if any) best matches the customer's issue.

Available skills:
{skills_description}

Customer message: "{message}"

Rules:
- Match based on MEANING, not exact words.
- Work with ANY language — the customer may write in English, Ukrainian, or any other language.
- If no skill matches, respond with: NONE
- If a skill matches, respond with ONLY the skill ID, nothing else.
- If multiple skills could match, pick the most specific one.

Respond with the skill ID or NONE:"""


class SkillEngine:
    """Matches customer messages to skills and compiles skill prompts."""

    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def match_skill(self, db: AsyncSession, workspace_id: str, message: str) -> Skill | None:
        """Use AI to match customer message to the best published skill."""
        result = await db.execute(
            select(Skill)
            .where(Skill.workspace_id == workspace_id, Skill.is_published == True)
        )
        skills = result.scalars().all()

        if not skills:
            return None

        skills_description = "\n".join(
            f"- ID: {s.id} | Name: {s.name} | Topic: {s.topic} | Description: {s.description or 'N/A'}"
            for s in skills
        )

        prompt = SKILL_MATCH_PROMPT.format(
            skills_description=skills_description,
            message=message,
        )

        try:
            response = await self.client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=50,
                messages=[{"role": "user", "content": prompt}],
            )
            answer = response.content[0].text.strip()
            logger.info(f"[SKILL] Intent classifier response: '{answer}' for message: '{message}'")

            if answer == "NONE":
                return None

            skill_map = {s.id: s for s in skills}
            matched = skill_map.get(answer)
            if matched:
                return matched

            # Fallback: classifier returned name
            for s in skills:
                if s.name.lower() in answer.lower() or s.id in answer:
                    return s

        except Exception as e:
            logger.error(f"[SKILL] Classification failed: {e}, falling back to keyword match")
            return self._keyword_match(skills, message)

        return None

    def _keyword_match(self, skills: list[Skill], message: str) -> Skill | None:
        """Fallback keyword-based matching on topic."""
        msg_lower = message.lower()
        for skill in skills:
            topic_words = skill.topic.lower().split()
            if all(w in msg_lower for w in topic_words):
                return skill
        return None

    def compile_skill_prompt(self, skill: Skill, context: dict | None = None) -> str:
        """Build system prompt from skill template with context variable substitution."""
        lines = [
            "You are a customer support assistant using a specialized skill.",
            f"Skill: \"{skill.name}\"",
            f"Topic: {skill.topic}",
            "",
        ]

        # Autonomy level instructions
        if skill.autonomy_level == "full":
            lines.append("AUTONOMY: You have full autonomy. Execute actions without asking for confirmation.")
        elif skill.autonomy_level == "semi":
            lines.append("AUTONOMY: Semi-autonomous. Confirm with customer before executing irreversible actions.")
        else:  # manual
            lines.append("AUTONOMY: Manual mode. Always ask for customer confirmation before any action.")

        # Escalation conditions
        if skill.escalation_conditions:
            lines.append("\nESCALATION CONDITIONS (escalate to human if ANY apply):")
            for i, cond in enumerate(skill.escalation_conditions, 1):
                condition_text = cond.get("condition", "")
                if condition_text:
                    lines.append(f"  {i}. {condition_text}")

        # Main prompt template with variable substitution
        template = skill.prompt_template or ""
        if context:
            for var, val in context.items():
                template = template.replace("{{" + var + "}}", str(val))

        if template:
            lines.append(f"\nINSTRUCTIONS:\n{template}")

        lines.append("\nRules:")
        lines.append("- Be friendly and concise. Respond in the same language the customer uses.")
        lines.append("- Follow the instructions above exactly.")
        lines.append("- Do NOT tell the customer you are following a script or skill template.")

        return "\n".join(lines)

    def get_allowed_tools(self, skill: Skill, all_tools: list[Tool]) -> list[Tool]:
        """Filter tools to those allowed by the skill."""
        if not skill.allowed_tool_ids:
            return all_tools
        return [t for t in all_tools if t.id in skill.allowed_tool_ids]

    def should_escalate(self, skill: Skill, ai_response: str, context: dict) -> bool:
        """Check if escalation conditions are met based on AI response keywords."""
        for cond in (skill.escalation_conditions or []):
            action = cond.get("action", "escalate")
            keywords = cond.get("keywords", [])
            if keywords and any(kw.lower() in ai_response.lower() for kw in keywords):
                return True
        return False


skill_engine = SkillEngine()
