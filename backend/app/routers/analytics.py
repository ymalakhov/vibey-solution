from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.models import Conversation, ToolExecution, Tool
from app.schemas.schemas import AnalyticsResponse

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/", response_model=AnalyticsResponse)
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

    # CSAT average
    csat = await db.execute(
        select(func.avg(Conversation.csat_score)).where(
            Conversation.workspace_id == workspace_id,
            Conversation.csat_score != None,
        )
    )
    csat_avg = round(csat.scalar() or 0, 1)

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
        csat_avg=csat_avg,
        tool_usage=tool_usage,
        category_breakdown=category_breakdown,
    )
