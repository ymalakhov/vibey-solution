"""Knowledge Base router — CRUD, sync, and search endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import KnowledgeSource
from app.schemas.schemas import (
    KnowledgeSourceCreate,
    KnowledgeSourceResponse,
    KnowledgeDocumentCreate,
    KnowledgeDocumentResponse,
    KnowledgeSearchResult,
)
from app.services.knowledge_base import kb_service

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.get("/sources", response_model=list[KnowledgeSourceResponse])
async def list_sources(workspace_id: str = Query(...), db: AsyncSession = Depends(get_db)):
    return await kb_service.list_sources(db, workspace_id)


@router.post("/sources", response_model=KnowledgeSourceResponse, status_code=201)
async def create_source(
    body: KnowledgeSourceCreate,
    workspace_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    if body.source_type not in ("notion", "confluence", "file"):
        raise HTTPException(400, "source_type must be notion, confluence, or file")
    return await kb_service.create_source(db, workspace_id, body.name, body.source_type, body.config)


@router.get("/sources/{source_id}", response_model=KnowledgeSourceResponse)
async def get_source(source_id: str, db: AsyncSession = Depends(get_db)):
    source = await kb_service.get_source(db, source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    return source


@router.delete("/sources/{source_id}", status_code=204)
async def delete_source(source_id: str, db: AsyncSession = Depends(get_db)):
    source = await kb_service.get_source(db, source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    await kb_service.delete_source(db, source_id)


@router.post("/sources/{source_id}/sync")
async def sync_source(source_id: str, db: AsyncSession = Depends(get_db)):
    source = await kb_service.get_source(db, source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    if source.source_type == "notion":
        from app.services.notion_sync import notion_sync
        count = await notion_sync.sync_source(db, source)
        return {"synced": count}
    elif source.source_type == "confluence":
        from app.services.confluence_sync import confluence_sync
        count = await confluence_sync.sync_source(db, source)
        return {"synced": count}
    else:
        raise HTTPException(400, "File sources do not support sync — upload documents directly")


@router.get("/sources/{source_id}/documents")
async def list_documents(source_id: str, db: AsyncSession = Depends(get_db)):
    source = await kb_service.get_source(db, source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    docs = await kb_service.list_documents(db, source_id)
    return [KnowledgeDocumentResponse.from_model(d) for d in docs]


@router.post("/sources/{source_id}/documents")
async def add_document(
    source_id: str,
    body: KnowledgeDocumentCreate,
    db: AsyncSession = Depends(get_db),
):
    source = await kb_service.get_source(db, source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    doc = await kb_service.add_document(db, source_id, body.title, body.content, body.metadata)
    return KnowledgeDocumentResponse.from_model(doc)


@router.post("/sources/{source_id}/upload")
async def upload_document(
    source_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    source = await kb_service.get_source(db, source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    if not file.filename or not file.filename.endswith(".md"):
        raise HTTPException(400, "Only .md files are supported")
    content = (await file.read()).decode("utf-8")
    title = file.filename.rsplit(".", 1)[0]
    doc = await kb_service.add_document(db, source_id, title, content)
    return KnowledgeDocumentResponse.from_model(doc)


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(document_id: str, db: AsyncSession = Depends(get_db)):
    await kb_service.delete_document(db, document_id)


@router.get("/search", response_model=list[KnowledgeSearchResult])
async def search_knowledge(
    workspace_id: str = Query(...),
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    results = await kb_service.search(db, workspace_id, q)
    return results
