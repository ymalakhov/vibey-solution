from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case

from app.database import get_db
from app.models.models import Conversation, ToolExecution, Tool
from app.schemas.schemas import AnalyticsResponse

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("", response_model=AnalyticsResponse)
async def get_analytics(workspace_id: str, db: AsyncSession = Depends(get_db)):
    # Total conversations
    total = await db.execute(
        select(func.count(Conversation.id)).where(Conversation.workspace_id == workspace_id)
    )
    total_count = total.scalar() or 0

    # AI resolved (resolved without escalation)
    ai_resolved = await db.execute(
        select(func.count(Conversation.id)).where(
            Conversation.workspace_id == workspace_id,
            Conversation.status == "resolved",
            Conversation.assigned_agent == None,
        )
    )
    ai_resolved_count = ai_resolved.scalar() or 0

    # Escalated count
    escalated = await db.execute(
        select(func.count(Conversation.id)).where(
            Conversation.workspace_id == workspace_id,
            Conversation.status == "escalated",
        )
    )
    escalated_count = escalated.scalar() or 0

    # Avg resolution time
    avg_time = await db.execute(
        select(
            func.avg(
                func.julianday(Conversation.resolved_at) - func.julianday(Conversation.created_at)
            )
        ).where(
            Conversation.workspace_id == workspace_id,
            Conversation.resolved_at != None,
        )
    )
    avg_days = avg_time.scalar() or 0
    avg_minutes = avg_days * 24 * 60

    # Priority breakdown
    priority_result = await db.execute(
        select(Conversation.priority, func.count(Conversation.id))
        .where(
            Conversation.workspace_id == workspace_id,
            Conversation.status != "resolved",
        )
        .group_by(Conversation.priority)
    )
    priority_breakdown = {"urgent": 0, "high": 0, "medium": 0, "low": 0}
    for priority, count in priority_result.all():
        if priority in priority_breakdown:
            priority_breakdown[priority] = count

    # Status breakdown
    status_result = await db.execute(
        select(Conversation.status, func.count(Conversation.id))
        .where(Conversation.workspace_id == workspace_id)
        .group_by(Conversation.status)
    )
    status_breakdown = {"open": 0, "ai_handling": 0, "escalated": 0, "resolved": 0}
    for status, count in status_result.all():
        if status in status_breakdown:
            status_breakdown[status] = count

    # Sentiment breakdown
    sentiment_result = await db.execute(
        select(Conversation.sentiment, func.count(Conversation.id))
        .where(Conversation.workspace_id == workspace_id, Conversation.sentiment != None)
        .group_by(Conversation.sentiment)
    )
    sentiment_breakdown = {"positive": 0, "neutral": 0, "negative": 0, "angry": 0}
    for sentiment, count in sentiment_result.all():
        if sentiment in sentiment_breakdown:
            sentiment_breakdown[sentiment] = count

    # High priority open tickets (urgent + high, not resolved)
    hp_result = await db.execute(
        select(Conversation)
        .where(
            Conversation.workspace_id == workspace_id,
            Conversation.status != "resolved",
            Conversation.priority.in_(["urgent", "high"]),
        )
        .order_by(
            case({"urgent": 0, "high": 1}, value=Conversation.priority),
            Conversation.created_at.asc(),
        )
        .limit(10)
    )
    high_priority_tickets = [
        {
            "id": c.id,
            "customer_name": c.customer_name,
            "customer_email": c.customer_email,
            "status": c.status,
            "priority": c.priority,
            "category": c.category,
            "sentiment": c.sentiment,
            "ai_summary": c.ai_summary,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in hp_result.scalars().all()
    ]

    # Pending tool approvals
    pending_result = await db.execute(
        select(ToolExecution, Tool.name.label("tool_name"))
        .join(Tool, ToolExecution.tool_id == Tool.id)
        .join(Conversation, ToolExecution.conversation_id == Conversation.id)
        .where(
            Conversation.workspace_id == workspace_id,
            ToolExecution.status == "pending",
        )
        .order_by(ToolExecution.created_at.asc())
    )
    pending_approvals = [
        {
            "id": ex.id,
            "tool_name": tool_name,
            "conversation_id": ex.conversation_id,
            "input_data": ex.input_data,
            "created_at": ex.created_at.isoformat() if ex.created_at else None,
        }
        for ex, tool_name in pending_result.all()
    ]

    # Tool usage
    tool_usage_result = await db.execute(
        select(Tool.name, Tool.usage_count, Tool.success_count)
        .where(Tool.workspace_id == workspace_id)
        .order_by(Tool.usage_count.desc())
    )
    tool_usage = [
        {"name": name, "usage_count": usage, "success_count": success}
        for name, usage, success in tool_usage_result.all()
    ]

    # Category breakdown
    cat_result = await db.execute(
        select(Conversation.category, func.count(Conversation.id))
        .where(Conversation.workspace_id == workspace_id, Conversation.category != None)
        .group_by(Conversation.category)
    )
    category_breakdown = [
        {"category": cat, "count": count}
        for cat, count in cat_result.all()
    ]

    return AnalyticsResponse(
        total_conversations=total_count,
        ai_resolved=ai_resolved_count,
        ai_resolved_pct=round(ai_resolved_count / total_count * 100, 1) if total_count > 0 else 0,
        avg_resolution_time_min=round(avg_minutes, 1),
        escalation_rate=round(escalated_count / total_count * 100, 1) if total_count > 0 else 0,
        tool_usage=tool_usage,
        category_breakdown=category_breakdown,
        priority_breakdown=priority_breakdown,
        status_breakdown=status_breakdown,
        sentiment_breakdown=sentiment_breakdown,
        high_priority_tickets=high_priority_tickets,
        pending_approvals=pending_approvals,
    )
