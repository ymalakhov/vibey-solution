"""Knowledge Base service — chunking, FTS5 indexing, and search."""

import logging
import re
from datetime import datetime

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import (
    KnowledgeSource,
    KnowledgeDocument,
    KnowledgeChunk,
    gen_id,
)

logger = logging.getLogger(__name__)

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200


class KnowledgeBaseService:
    # ---- CRUD: Sources ----

    async def create_source(
        self, db: AsyncSession, workspace_id: str, name: str, source_type: str, config: dict
    ) -> KnowledgeSource:
        source = KnowledgeSource(
            workspace_id=workspace_id,
            name=name,
            source_type=source_type,
            config=config,
        )
        db.add(source)
        await db.commit()
        await db.refresh(source)
        return source

    async def list_sources(self, db: AsyncSession, workspace_id: str) -> list[KnowledgeSource]:
        result = await db.execute(
            select(KnowledgeSource)
            .where(KnowledgeSource.workspace_id == workspace_id)
            .order_by(KnowledgeSource.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_source(self, db: AsyncSession, source_id: str) -> KnowledgeSource | None:
        return await db.get(KnowledgeSource, source_id)

    async def delete_source(self, db: AsyncSession, source_id: str):
        source = await db.get(KnowledgeSource, source_id)
        if not source:
            return
        # Clean FTS entries for all chunks in this source
        result = await db.execute(
            select(KnowledgeChunk.id)
            .join(KnowledgeDocument)
            .where(KnowledgeDocument.source_id == source_id)
        )
        chunk_ids = [r[0] for r in result.all()]
        for cid in chunk_ids:
            await db.execute(
                text("DELETE FROM knowledge_chunks_fts WHERE chunk_id = :cid"),
                {"cid": cid},
            )
        await db.delete(source)
        await db.commit()

    # ---- CRUD: Documents ----

    async def add_document(
        self,
        db: AsyncSession,
        source_id: str,
        title: str,
        content: str,
        metadata: dict | None = None,
        external_id: str | None = None,
    ) -> KnowledgeDocument:
        doc = KnowledgeDocument(
            source_id=source_id,
            title=title,
            content=content,
            external_id=external_id,
            metadata_=metadata or {},
        )
        db.add(doc)
        await db.flush()

        # Chunk and index
        chunks = self._chunk_markdown(content, title)
        for idx, (chunk_content, heading_path) in enumerate(chunks):
            token_count = len(chunk_content.split())
            chunk = KnowledgeChunk(
                document_id=doc.id,
                content=chunk_content,
                heading_path=heading_path,
                chunk_index=idx,
                token_count=token_count,
            )
            db.add(chunk)
            await db.flush()
            # Index in FTS5
            await db.execute(
                text(
                    "INSERT INTO knowledge_chunks_fts(chunk_id, content, heading_path, document_title) "
                    "VALUES (:cid, :content, :heading, :title)"
                ),
                {
                    "cid": chunk.id,
                    "content": chunk_content,
                    "heading": heading_path or "",
                    "title": title,
                },
            )

        # Update source document count
        source = await db.get(KnowledgeSource, source_id)
        if source:
            source.document_count = (source.document_count or 0) + 1

        await db.commit()
        await db.refresh(doc)
        return doc

    async def list_documents(self, db: AsyncSession, source_id: str) -> list[KnowledgeDocument]:
        result = await db.execute(
            select(KnowledgeDocument)
            .where(KnowledgeDocument.source_id == source_id)
            .order_by(KnowledgeDocument.created_at.desc())
        )
        return list(result.scalars().all())

    async def delete_document(self, db: AsyncSession, document_id: str):
        doc = await db.get(KnowledgeDocument, document_id)
        if not doc:
            return
        # Clean FTS
        result = await db.execute(
            select(KnowledgeChunk.id).where(KnowledgeChunk.document_id == document_id)
        )
        for (cid,) in result.all():
            await db.execute(
                text("DELETE FROM knowledge_chunks_fts WHERE chunk_id = :cid"),
                {"cid": cid},
            )
        source = await db.get(KnowledgeSource, doc.source_id)
        if source and source.document_count > 0:
            source.document_count -= 1
        await db.delete(doc)
        await db.commit()

    # ---- Search ----

    async def search(
        self,
        db: AsyncSession,
        workspace_id: str,
        query: str,
        limit: int = 5,
        max_tokens: int = 3000,
    ) -> list[dict]:
        """Search KB using FTS5. Returns top chunks within token budget."""
        # Build FTS query: extract words > 2 chars, join with OR
        words = re.findall(r"\b\w{3,}\b", query.lower())
        if not words:
            return []
        fts_query = " OR ".join(words)

        sql = text("""
            SELECT
                f.chunk_id,
                f.content,
                f.heading_path,
                f.document_title,
                ks.name as source_name,
                bm25(knowledge_chunks_fts) as score
            FROM knowledge_chunks_fts f
            JOIN knowledge_chunks kc ON kc.id = f.chunk_id
            JOIN knowledge_documents kd ON kd.id = kc.document_id
            JOIN knowledge_sources ks ON ks.id = kd.source_id
            WHERE ks.workspace_id = :workspace_id
              AND ks.is_active = 1
              AND knowledge_chunks_fts MATCH :query
            ORDER BY bm25(knowledge_chunks_fts)
            LIMIT :limit
        """)

        try:
            result = await db.execute(
                sql,
                {"workspace_id": workspace_id, "query": fts_query, "limit": limit * 2},
            )
            rows = result.all()
        except Exception as e:
            logger.warning(f"KB search failed: {e}")
            return []

        # Cap by token budget
        results = []
        total_tokens = 0
        for row in rows:
            tokens = len(row.content.split())
            if total_tokens + tokens > max_tokens:
                if results:
                    break
            results.append({
                "chunk_id": row.chunk_id,
                "content": row.content,
                "heading_path": row.heading_path,
                "document_title": row.document_title,
                "source_name": row.source_name,
                "score": row.score,
            })
            total_tokens += tokens
            if len(results) >= limit:
                break

        return results

    # ---- Chunking ----

    def _chunk_markdown(self, content: str, title: str) -> list[tuple[str, str]]:
        """Split markdown into chunks. Returns list of (content, heading_path)."""
        sections = self._split_by_headings(content)
        chunks = []
        for heading_path, section_text in sections:
            path = f"{title} > {heading_path}" if heading_path else title
            if len(section_text) <= CHUNK_SIZE:
                if section_text.strip():
                    chunks.append((section_text.strip(), path))
            else:
                for part in self._split_by_size(section_text):
                    if part.strip():
                        chunks.append((part.strip(), path))
        if not chunks and content.strip():
            chunks.append((content.strip()[:CHUNK_SIZE], title))
        return chunks

    def _split_by_headings(self, content: str) -> list[tuple[str, str]]:
        """Split on H1/H2/H3 headings, returning (heading_path, text) pairs."""
        lines = content.split("\n")
        sections: list[tuple[str, str]] = []
        current_headings: list[str] = []
        current_text: list[str] = []

        for line in lines:
            heading_match = re.match(r"^(#{1,3})\s+(.+)$", line)
            if heading_match:
                # Save previous section
                if current_text:
                    path = " > ".join(current_headings) if current_headings else ""
                    sections.append((path, "\n".join(current_text)))
                    current_text = []
                level = len(heading_match.group(1))
                heading_text = heading_match.group(2).strip()
                # Maintain heading hierarchy
                current_headings = current_headings[: level - 1]
                current_headings.append(heading_text)
                current_text.append(line)
            else:
                current_text.append(line)

        # Last section
        if current_text:
            path = " > ".join(current_headings) if current_headings else ""
            sections.append((path, "\n".join(current_text)))

        return sections

    def _split_by_size(self, text: str) -> list[str]:
        """Split long text into fixed-size chunks with overlap."""
        chunks = []
        start = 0
        while start < len(text):
            end = start + CHUNK_SIZE
            if end < len(text):
                # Try to break at a sentence or line boundary
                break_at = text.rfind("\n", start, end)
                if break_at == -1 or break_at <= start:
                    break_at = text.rfind(". ", start, end)
                if break_at > start:
                    end = break_at + 1
            chunk = text[start:end]
            chunks.append(chunk)
            start = end - CHUNK_OVERLAP if end < len(text) else end
        return chunks


kb_service = KnowledgeBaseService()
