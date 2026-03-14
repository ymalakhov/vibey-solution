import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(prefix="/uploads", tags=["uploads"])

UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"
ALLOWED_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"}
MAX_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/{workspace_id}")
async def upload_file(workspace_id: str, file: UploadFile):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"File type {file.content_type} not allowed")

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(400, "File too large (max 10MB)")

    file_id = uuid.uuid4().hex[:12]
    workspace_dir = UPLOADS_DIR / workspace_id
    workspace_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename).suffix if file.filename else ""
    saved_name = f"{file_id}{ext}"
    (workspace_dir / saved_name).write_bytes(data)

    return {
        "file_id": file_id,
        "filename": file.filename,
        "saved_name": saved_name,
        "url": f"/api/uploads/files/{workspace_id}/{saved_name}",
        "content_type": file.content_type,
        "size": len(data),
    }


@router.get("/files/{workspace_id}/{filename}")
async def get_file(workspace_id: str, filename: str):
    file_path = UPLOADS_DIR / workspace_id / filename
    if not file_path.exists():
        raise HTTPException(404, "File not found")
    return FileResponse(file_path)
