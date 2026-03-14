from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.models import Skill, Tool
from app.schemas.schemas import (
    SkillCreate, SkillUpdate, SkillResponse, SkillListResponse,
    SkillPreviewRequest, SkillPreviewResponse,
)

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=list[SkillListResponse])
async def list_skills(workspace_id: str = Query(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Skill)
        .where(Skill.workspace_id == workspace_id)
        .order_by(Skill.created_at.desc())
    )
    skills = result.scalars().all()
    return [
        SkillListResponse(
            id=s.id,
            workspace_id=s.workspace_id,
            name=s.name,
            description=s.description,
            topic=s.topic,
            autonomy_level=s.autonomy_level,
            is_published=s.is_published,
            tool_count=len(s.allowed_tool_ids or []),
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in skills
    ]


@router.post("", response_model=SkillResponse, status_code=201)
async def create_skill(
    data: SkillCreate,
    workspace_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    skill = Skill(workspace_id=workspace_id, **data.model_dump())
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill


@router.get("/{skill_id}", response_model=SkillResponse)
async def get_skill(skill_id: str, db: AsyncSession = Depends(get_db)):
    skill = await db.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")
    return skill


@router.patch("/{skill_id}", response_model=SkillResponse)
async def update_skill(skill_id: str, data: SkillUpdate, db: AsyncSession = Depends(get_db)):
    skill = await db.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(skill, key, value)
    await db.commit()
    await db.refresh(skill)
    return skill


@router.delete("/{skill_id}", status_code=204)
async def delete_skill(skill_id: str, db: AsyncSession = Depends(get_db)):
    skill = await db.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")
    await db.delete(skill)
    await db.commit()


@router.post("/{skill_id}/preview", response_model=SkillPreviewResponse)
async def preview_skill(
    skill_id: str,
    body: SkillPreviewRequest,
    db: AsyncSession = Depends(get_db),
):
    """Test a skill with a sample message without creating a conversation."""
    skill = await db.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")

    # Load allowed tools
    tool_names = []
    if skill.allowed_tool_ids:
        result = await db.execute(
            select(Tool).where(Tool.id.in_(skill.allowed_tool_ids))
        )
        tool_names = [t.name for t in result.scalars().all()]

    # Build preview system prompt
    from app.services.skill_engine import skill_engine
    system_prompt = skill_engine.compile_skill_prompt(skill, {
        "customer_email": body.customer_email or "test@example.com",
        "customer_name": body.customer_name or "Test User",
    })

    import anthropic
    from app.config import settings
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model=settings.AI_MODEL,
        max_tokens=512,
        system=system_prompt,
        messages=[{"role": "user", "content": body.message}],
    )

    text = "".join(b.text for b in response.content if b.type == "text")
    return SkillPreviewResponse(response=text, matched_tools=tool_names)
