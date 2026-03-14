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

// Analytics
export const getAnalytics = (workspaceId: string) =>
  fetchApi(`/analytics/?workspace_id=${workspaceId}`);
