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
    flows: Mapped[list["Flow"]] = relationship(back_populates="workspace")
    knowledge_sources: Mapped[list["KnowledgeSource"]] = relationship(back_populates="workspace")
    skills: Mapped[list["Skill"]] = relationship(back_populates="workspace")


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
    sentiment: Mapped[str | None] = mapped_column(String(20), nullable=True)  # positive/neutral/negative/angry
    escalation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    escalation_context: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    csat_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    assigned_agent: Mapped[str | None] = mapped_column(String(100), nullable=True)
    active_flow_id: Mapped[str | None] = mapped_column(ForeignKey("flows.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    workspace: Mapped["Workspace"] = relationship(back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship(back_populates="conversation", order_by="Message.created_at")
    flow_state: Mapped["ConversationFlowState | None"] = relationship(back_populates="conversation", uselist=False)


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


class Flow(Base):
    __tablename__ = "flows"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=gen_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    trigger_intents: Mapped[list] = mapped_column(JSON, default=list)
    nodes: Mapped[list] = mapped_column(JSON, default=list)
    edges: Mapped[list] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    workspace: Mapped["Workspace"] = relationship(back_populates="flows")


class ConversationFlowState(Base):
    __tablename__ = "conversation_flow_states"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=gen_id)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"), unique=True)
    flow_id: Mapped[str] = mapped_column(ForeignKey("flows.id"))
    current_node_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    completed_nodes: Mapped[list] = mapped_column(JSON, default=list)
    collected_data: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active, completed, escalated
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    conversation: Mapped["Conversation"] = relationship(back_populates="flow_state")
    flow: Mapped["Flow"] = relationship()


class KnowledgeSource(Base):
    __tablename__ = "knowledge_sources"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=gen_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"))
    name: Mapped[str] = mapped_column(String(200))
    source_type: Mapped[str] = mapped_column(String(20))  # notion, confluence, file
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    document_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    workspace: Mapped["Workspace"] = relationship(back_populates="knowledge_sources")
    documents: Mapped[list["KnowledgeDocument"]] = relationship(back_populates="source", cascade="all, delete-orphan")


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=gen_id)
    source_id: Mapped[str] = mapped_column(ForeignKey("knowledge_sources.id"))
    title: Mapped[str] = mapped_column(String(500))
    content: Mapped[str] = mapped_column(Text)
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    source: Mapped["KnowledgeSource"] = relationship(back_populates="documents")
    chunks: Mapped[list["KnowledgeChunk"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=gen_id)
    document_id: Mapped[str] = mapped_column(ForeignKey("knowledge_documents.id"))
    content: Mapped[str] = mapped_column(Text)
    heading_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    chunk_index: Mapped[int] = mapped_column(Integer, default=0)
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    document: Mapped["KnowledgeDocument"] = relationship(back_populates="chunks")


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=gen_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    topic: Mapped[str] = mapped_column(String(200))  # problem topic this skill handles
    prompt_template: Mapped[str] = mapped_column(Text, default="")
    allowed_tool_ids: Mapped[list] = mapped_column(JSON, default=list)
    escalation_conditions: Mapped[list] = mapped_column(JSON, default=list)  # [{condition, action}]
    autonomy_level: Mapped[str] = mapped_column(String(20), default="semi")  # full, semi, manual
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    workspace: Mapped["Workspace"] = relationship(back_populates="skills")


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
