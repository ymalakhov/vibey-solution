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

// Skills
export const getSkills = (workspaceId: string) =>
  fetchApi(`/skills?workspace_id=${workspaceId}`);

export const createSkill = (workspaceId: string, data: any) =>
  fetchApi(`/skills?workspace_id=${workspaceId}`, { method: "POST", body: JSON.stringify(data) });

export const getSkill = (skillId: string) =>
  fetchApi(`/skills/${skillId}`);

export const updateSkill = (skillId: string, data: any) =>
  fetchApi(`/skills/${skillId}`, { method: "PATCH", body: JSON.stringify(data) });

export const deleteSkill = (skillId: string) =>
  fetchApi(`/skills/${skillId}`, { method: "DELETE" });

export const previewSkill = (skillId: string, data: { message: string; customer_email?: string; customer_name?: string }) =>
  fetchApi(`/skills/${skillId}/preview`, { method: "POST", body: JSON.stringify(data) });
