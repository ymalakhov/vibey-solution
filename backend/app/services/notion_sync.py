"""Notion sync service — fetches pages via Notion API and converts to markdown."""

import logging
from datetime import datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import KnowledgeSource, KnowledgeDocument
from app.services.knowledge_base import kb_service

logger = logging.getLogger(__name__)

NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"


class NotionSyncService:
    async def sync_source(self, db: AsyncSession, source: KnowledgeSource) -> int:
        """Sync all configured pages from Notion. Returns count of synced docs."""
        config = source.config or {}
        api_key = config.get("api_key", "")
        page_ids = config.get("page_ids", [])
        if not api_key or not page_ids:
            raise ValueError("Notion source requires api_key and page_ids in config")

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        }

        synced = 0
        async with httpx.AsyncClient(timeout=30) as client:
            for page_id in page_ids:
                try:
                    # Fetch page metadata
                    resp = await client.get(f"{NOTION_API}/pages/{page_id}", headers=headers)
                    resp.raise_for_status()
                    page = resp.json()
                    title = self._extract_title(page)

                    # Fetch blocks
                    resp = await client.get(
                        f"{NOTION_API}/blocks/{page_id}/children?page_size=100",
                        headers=headers,
                    )
                    resp.raise_for_status()
                    blocks = resp.json().get("results", [])
                    markdown = self._blocks_to_markdown(blocks)

                    if not markdown.strip():
                        continue

                    # Delete existing document with this external_id and re-add
                    result = await db.execute(
                        select(KnowledgeDocument).where(
                            KnowledgeDocument.source_id == source.id,
                            KnowledgeDocument.external_id == page_id,
                        )
                    )
                    existing = result.scalar_one_or_none()
                    if existing:
                        await kb_service.delete_document(db, existing.id)

                    await kb_service.add_document(
                        db, source.id, title, markdown, external_id=page_id
                    )
                    synced += 1

                except Exception as e:
                    logger.error(f"Failed to sync Notion page {page_id}: {e}")

        source.last_synced_at = datetime.utcnow()
        await db.commit()
        return synced

    def _extract_title(self, page: dict) -> str:
        props = page.get("properties", {})
        for prop in props.values():
            if prop.get("type") == "title":
                title_parts = prop.get("title", [])
                return "".join(t.get("plain_text", "") for t in title_parts) or "Untitled"
        return "Untitled"

    def _blocks_to_markdown(self, blocks: list[dict]) -> str:
        lines = []
        for block in blocks:
            btype = block.get("type", "")
            data = block.get(btype, {})

            if btype == "paragraph":
                lines.append(self._rich_text_to_md(data.get("rich_text", [])))
                lines.append("")
            elif btype == "heading_1":
                lines.append(f"# {self._rich_text_to_md(data.get('rich_text', []))}")
                lines.append("")
            elif btype == "heading_2":
                lines.append(f"## {self._rich_text_to_md(data.get('rich_text', []))}")
                lines.append("")
            elif btype == "heading_3":
                lines.append(f"### {self._rich_text_to_md(data.get('rich_text', []))}")
                lines.append("")
            elif btype == "bulleted_list_item":
                lines.append(f"- {self._rich_text_to_md(data.get('rich_text', []))}")
            elif btype == "numbered_list_item":
                lines.append(f"1. {self._rich_text_to_md(data.get('rich_text', []))}")
            elif btype == "code":
                lang = data.get("language", "")
                code = self._rich_text_to_md(data.get("rich_text", []))
                lines.append(f"```{lang}")
                lines.append(code)
                lines.append("```")
                lines.append("")
            elif btype == "divider":
                lines.append("---")
                lines.append("")

        return "\n".join(lines)

    def _rich_text_to_md(self, rich_text: list[dict]) -> str:
        parts = []
        for rt in rich_text:
            text = rt.get("plain_text", "")
            annotations = rt.get("annotations", {})
            if annotations.get("bold"):
                text = f"**{text}**"
            if annotations.get("italic"):
                text = f"*{text}*"
            if annotations.get("code"):
                text = f"`{text}`"
            parts.append(text)
        return "".join(parts)


notion_sync = NotionSyncService()
