import uuid
from datetime import datetime

from sqlalchemy import String, Text, Boolean, Integer, Float, ForeignKey, JSON, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def gen_id() -> str:
    return uuid.uuid4().hex[:12]


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=gen_id)
    name: Mapped[str] = mapped_column(String(100))
    domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    widget_config: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    tools: Mapped[list["Tool"]] = relationship(back_populates="workspace")
    conversations: Mapped[list["Conversation"]] = relationship(back_populates="workspace")


class Tool(Base):
    __tablename__ = "tools"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=gen_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"))
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text)
    endpoint: Mapped[str] = mapped_column(String(500))
    method: Mapped[str] = mapped_column(String(10), default="POST")
    headers: Mapped[dict] = mapped_column(JSON, default=dict)
    parameters: Mapped[list] = mapped_column(JSON, default=list)
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    success_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    workspace: Mapped["Workspace"] = relationship(back_populates="tools")


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=gen_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"))
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open, ai_handling, escalated, resolved
    priority: Mapped[str] = mapped_column(String(10), default="medium")  # low, medium, high, urgent
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    csat_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    assigned_agent: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    workspace: Mapped["Workspace"] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(back_populates="conversation", order_by="Message.created_at")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=gen_id)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"))
    role: Mapped[str] = mapped_column(String(20))  # customer, ai, agent, system
    content: Mapped[str] = mapped_column(Text)
    tool_call: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    tool_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    attachments: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")


class ToolExecution(Base):
    __tablename__ = "tool_executions"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=gen_id)
    tool_id: Mapped[str] = mapped_column(ForeignKey("tools.id"))
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"))
    input_data: Mapped[dict] = mapped_column(JSON)
    output_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, approved, executed, rejected, failed
    approved_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
