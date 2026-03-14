"""Confluence sync service — fetches pages via REST API and converts HTML to markdown."""

import logging
import re
from datetime import datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import KnowledgeSource, KnowledgeDocument
from app.services.knowledge_base import kb_service

logger = logging.getLogger(__name__)


class ConfluenceSyncService:
    async def sync_source(self, db: AsyncSession, source: KnowledgeSource) -> int:
        """Sync pages from a Confluence space. Returns count of synced docs."""
        config = source.config or {}
        base_url = config.get("base_url", "").rstrip("/")
        email = config.get("email", "")
        api_token = config.get("api_token", "")
        space_key = config.get("space_key", "")

        if not all([base_url, email, api_token, space_key]):
            raise ValueError("Confluence source requires base_url, email, api_token, space_key")

        auth = (email, api_token)
        synced = 0
        start = 0
        page_limit = 25

        async with httpx.AsyncClient(timeout=30) as client:
            while True:
                url = (
                    f"{base_url}/rest/api/content"
                    f"?spaceKey={space_key}&expand=body.storage"
                    f"&limit={page_limit}&start={start}"
                )
                try:
                    resp = await client.get(url, auth=auth)
                    resp.raise_for_status()
                    data = resp.json()
                except Exception as e:
                    logger.error(f"Failed to fetch Confluence pages: {e}")
                    break

                results = data.get("results", [])
                if not results:
                    break

                for page in results:
                    try:
                        page_id = str(page.get("id", ""))
                        title = page.get("title", "Untitled")
                        html = page.get("body", {}).get("storage", {}).get("value", "")
                        markdown = self._html_to_markdown(html)

                        if not markdown.strip():
                            continue

                        # Delete existing and re-add
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
                        logger.error(f"Failed to sync Confluence page {page.get('id')}: {e}")

                # Pagination
                size = data.get("size", 0)
                if size < page_limit:
                    break
                start += page_limit

        source.last_synced_at = datetime.utcnow()
        await db.commit()
        return synced

    def _html_to_markdown(self, html: str) -> str:
        """Convert Confluence HTML storage format to markdown using regex."""
        if not html:
            return ""

        text = html

        # Headings
        for level in range(1, 7):
            prefix = "#" * level
            text = re.sub(
                rf"<h{level}[^>]*>(.*?)</h{level}>",
                rf"\n{prefix} \1\n",
                text,
                flags=re.DOTALL,
            )

        # Bold / italic / code
        text = re.sub(r"<strong>(.*?)</strong>", r"**\1**", text, flags=re.DOTALL)
        text = re.sub(r"<b>(.*?)</b>", r"**\1**", text, flags=re.DOTALL)
        text = re.sub(r"<em>(.*?)</em>", r"*\1*", text, flags=re.DOTALL)
        text = re.sub(r"<i>(.*?)</i>", r"*\1*", text, flags=re.DOTALL)
        text = re.sub(r"<code>(.*?)</code>", r"`\1`", text, flags=re.DOTALL)

        # Code blocks
        text = re.sub(
            r"<ac:structured-macro[^>]*ac:name=\"code\"[^>]*>.*?<ac:plain-text-body><!\[CDATA\[(.*?)\]\]></ac:plain-text-body>.*?</ac:structured-macro>",
            r"\n```\n\1\n```\n",
            text,
            flags=re.DOTALL,
        )

        # Lists
        text = re.sub(r"<li[^>]*>(.*?)</li>", r"\n- \1", text, flags=re.DOTALL)
        text = re.sub(r"</?[ou]l[^>]*>", "", text)

        # Links
        text = re.sub(r'<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>', r"[\2](\1)", text, flags=re.DOTALL)

        # Paragraphs and line breaks
        text = re.sub(r"<p[^>]*>(.*?)</p>", r"\1\n\n", text, flags=re.DOTALL)
        text = re.sub(r"<br\s*/?>", "\n", text)

        # Strip remaining tags
        text = re.sub(r"<[^>]+>", "", text)

        # Clean up whitespace
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()


confluence_sync = ConfluenceSyncService()
