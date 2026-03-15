from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Add columns that create_all won't add to existing tables
    alter_statements = [
        ("conversations", "sentiment", "VARCHAR(20)"),
        ("conversations", "escalation_reason", "TEXT"),
        ("conversations", "escalation_context", "JSON"),
        ("tools", "auth_type", "VARCHAR(20) DEFAULT 'none'"),
        ("tools", "auth_config", "JSON DEFAULT '{}'"),
    ]
    async with engine.begin() as conn:
        for table, column, col_type in alter_statements:
            try:
                await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            except Exception:
                pass  # Column already exists
    # Create FTS5 virtual table in a separate connection
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5("
                "chunk_id, content, heading_path, document_title, "
                "tokenize='porter unicode61'"
                ")"
            )
        )
