const API = "/api";

export async function fetchApi(path: string, options?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Workspaces
export const createWorkspace = (data: { name: string; domain?: string }) =>
  fetchApi("/workspaces/", { method: "POST", body: JSON.stringify(data) });

// Tools
export const getTools = (workspaceId: string) =>
  fetchApi(`/tools/?workspace_id=${workspaceId}`);

export const createTool = (workspaceId: string, data: any) =>
  fetchApi(`/tools/?workspace_id=${workspaceId}`, { method: "POST", body: JSON.stringify(data) });

export const updateTool = (toolId: string, data: any) =>
  fetchApi(`/tools/${toolId}`, { method: "PATCH", body: JSON.stringify(data) });

export const deleteTool = (toolId: string) =>
  fetchApi(`/tools/${toolId}`, { method: "DELETE" });

export const testTool = (toolId: string, input: any) =>
  fetchApi(`/tools/${toolId}/test`, { method: "POST", body: JSON.stringify(input) });

// Conversations
export const getConversations = (workspaceId: string, status?: string) =>
  fetchApi(`/conversations/?workspace_id=${workspaceId}${status ? `&status=${status}` : ""}`);

export const getConversation = (id: string) =>
  fetchApi(`/conversations/${id}`);

export const resolveConversation = (id: string) =>
  fetchApi(`/conversations/${id}/resolve`, { method: "POST" });

// Tool executions
export const getPendingExecutions = (workspaceId: string) =>
  fetchApi(`/conversations/executions/pending?workspace_id=${workspaceId}`);

export const approveExecution = (id: string, agentName?: string) =>
  fetchApi(`/conversations/executions/${id}/approve?agent_name=${agentName || "agent"}`, { method: "POST" });

export const rejectExecution = (id: string) =>
  fetchApi(`/conversations/executions/${id}/reject`, { method: "POST" });

// Chat
export const sendMessage = (workspaceId: string, content: string, conversationId?: string, customerEmail?: string, customerName?: string) =>
  fetchApi(`/chat/${workspaceId}${conversationId ? `?conversation_id=${conversationId}` : ""}`, {
    method: "POST",
    body: JSON.stringify({ content, customer_email: customerEmail, customer_name: customerName }),
  });

// Agent reply
export const sendAgentReply = (workspaceId: string, conversationId: string, content: string) =>
  fetchApi(`/chat/${workspaceId}/agent-reply`, {
    method: "POST",
    body: JSON.stringify({ conversation_id: conversationId, content }),
  });

// Analytics
export const getAnalytics = (workspaceId: string) =>
  fetchApi(`/analytics/?workspace_id=${workspaceId}`);

// Flows
export const getFlows = (workspaceId: string) =>
  fetchApi(`/flows/?workspace_id=${workspaceId}`);

export const createFlow = (workspaceId: string, data: any) =>
  fetchApi(`/flows/?workspace_id=${workspaceId}`, { method: "POST", body: JSON.stringify(data) });

export const getFlow = (flowId: string) =>
  fetchApi(`/flows/${flowId}`);

export const updateFlow = (flowId: string, data: any) =>
  fetchApi(`/flows/${flowId}`, { method: "PATCH", body: JSON.stringify(data) });

export const deleteFlow = (flowId: string) =>
  fetchApi(`/flows/${flowId}`, { method: "DELETE" });

export const validateFlow = (flowId: string) =>
  fetchApi(`/flows/${flowId}/validate`, { method: "POST" });

// Knowledge Base
export const getKnowledgeSources = (workspaceId: string) =>
  fetchApi(`/knowledge/sources?workspace_id=${workspaceId}`);

export const createKnowledgeSource = (workspaceId: string, data: { name: string; source_type: string; config?: Record<string, unknown> }) =>
  fetchApi(`/knowledge/sources?workspace_id=${workspaceId}`, { method: "POST", body: JSON.stringify(data) });

export const deleteKnowledgeSource = (sourceId: string) =>
  fetchApi(`/knowledge/sources/${sourceId}`, { method: "DELETE" });

export const syncKnowledgeSource = (sourceId: string) =>
  fetchApi(`/knowledge/sources/${sourceId}/sync`, { method: "POST" });

export const getKnowledgeDocuments = (sourceId: string) =>
  fetchApi(`/knowledge/sources/${sourceId}/documents`);

export const addKnowledgeDocument = (sourceId: string, data: { title: string; content: string }) =>
  fetchApi(`/knowledge/sources/${sourceId}/documents`, { method: "POST", body: JSON.stringify(data) });

export const uploadKnowledgeDocument = async (sourceId: string, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`/api/knowledge/sources/${sourceId}/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
};

export const deleteKnowledgeDocument = (documentId: string) =>
  fetchApi(`/knowledge/documents/${documentId}`, { method: "DELETE" });

export const searchKnowledge = (workspaceId: string, query: string) =>
  fetchApi(`/knowledge/search?workspace_id=${workspaceId}&q=${encodeURIComponent(query)}`);
