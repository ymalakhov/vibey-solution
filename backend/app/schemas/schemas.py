from pydantic import BaseModel
from datetime import datetime


# --- Tool schemas ---

class ToolParameter(BaseModel):
    name: str
    type: str = "string"
    description: str = ""
    required: bool = False


class ToolCreate(BaseModel):
    name: str
    description: str
    endpoint: str
    method: str = "POST"
    headers: dict = {}
    parameters: list[ToolParameter] = []
    requires_approval: bool = True


class ToolUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    endpoint: str | None = None
    method: str | None = None
    headers: dict | None = None
    parameters: list[ToolParameter] | None = None
    requires_approval: bool | None = None
    is_active: bool | None = None


class ToolResponse(BaseModel):
    id: str
    name: str
    description: str
    endpoint: str
    method: str
    headers: dict
    parameters: list
    requires_approval: bool
    is_active: bool
    usage_count: int
    success_count: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- Conversation schemas ---

class ConversationResponse(BaseModel):
    id: str
    customer_email: str | None
    customer_name: str | None
    status: str
    priority: str
    category: str | None
    ai_summary: str | None
    csat_score: int | None
    assigned_agent: str | None
    created_at: datetime
    resolved_at: datetime | None

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    tool_call: dict | None
    tool_result: dict | None
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationDetail(ConversationResponse):
    messages: list[MessageResponse] = []


# --- Chat schemas ---

class ChatMessage(BaseModel):
    content: str
    customer_email: str | None = None
    customer_name: str | None = None


# --- Tool execution ---

class ToolExecutionResponse(BaseModel):
    id: str
    tool_id: str
    conversation_id: str
    input_data: dict
    output_data: dict | None
    status: str
    approved_by: str | None
    created_at: datetime
    executed_at: datetime | None

    class Config:
        from_attributes = True


# --- Widget ---

class WidgetConfig(BaseModel):
    brand_color: str = "#6366F1"
    position: str = "bottom-right"
    theme: str = "light"
    greeting: str = "Привіт! Чим можу допомогти?"
    language: str = "uk"
    quick_actions: list[str] = []
    collect_email: bool = True
    auto_open_delay: int | None = None


# --- Analytics ---

class AnalyticsResponse(BaseModel):
    total_conversations: int
    ai_resolved: int
    ai_resolved_pct: float
    avg_resolution_time_min: float
    csat_avg: float
    tool_usage: list[dict]
    category_breakdown: list[dict]


# --- Flow schemas ---

class FlowCreate(BaseModel):
    name: str
    description: str | None = None
    trigger_intents: list[str] = []
    nodes: list[dict] = []
    edges: list[dict] = []
    is_active: bool = True
    priority: int = 0


class FlowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    trigger_intents: list[str] | None = None
    nodes: list[dict] | None = None
    edges: list[dict] | None = None
    is_active: bool | None = None
    priority: int | None = None


class FlowResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    description: str | None
    trigger_intents: list[str]
    nodes: list[dict]
    edges: list[dict]
    is_active: bool
    priority: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FlowListResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    description: str | None
    trigger_intents: list[str]
    is_active: bool
    priority: int
    node_count: int = 0
    created_at: datetime
    updated_at: datetime


class FlowValidationResult(BaseModel):
    valid: bool
    errors: list[str] = []
    warnings: list[str] = []


# --- Workspace ---

class WorkspaceCreate(BaseModel):
    name: str
    domain: str | None = None
