"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Markdown from "react-markdown";
import {
  getConversations,
  getConversation,
  approveExecution,
  rejectExecution,
  resolveConversation,
  sendAgentReply,
  getEscalationContext,
  getPendingExecutions,
} from "@/lib/api";
import {
  CheckCircle,
  XCircle,
  RotateCcw,
  User,
  Bot,
  Wrench,
  Send,
  UserCircle,
  AlertTriangle,
  ShieldAlert,
  Zap,
} from "lucide-react";

const WORKSPACE_ID = "demo";
const WS_URL = `ws://localhost:8000/api/ws/admin/${WORKSPACE_ID}`;
const MAX_RECONNECT_RETRIES = 5;
const PING_INTERVAL_MS = 30000;

interface Message {
  id: string;
  role: string;
  content: string;
  tool_call: any;
  tool_result: any;
  created_at: string;
}

interface Conversation {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  status: string;
  priority: string;
  category: string | null;
  ai_summary: string | null;
  created_at: string;
  messages?: Message[];
}

const priorityColor: Record<string, string> = {
  urgent: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-yellow-500",
  low: "border-l-green-500",
};

export default function ChatsPage() {
  return (
    <Suspense>
      <ChatsContent />
    </Suspense>
  );
}

function ChatsContent() {
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined,
  );
  const [escalationContext, setEscalationContext] = useState<any>(null);
  const [pendingExecutions, setPendingExecutions] = useState<any[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const statusFilterRef = useRef<string | undefined>(undefined);
  const selectedIdRef = useRef<string | null>(null);
  const selectedRef = useRef<Conversation | null>(null);
  const initialIdHandled = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRetries = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null;
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    statusFilterRef.current = statusFilter;
  }, [statusFilter]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected?.messages?.length]);

  // --- WebSocket connection ---
  const connectWs = useCallback(() => {
    if (reconnectRetries.current >= MAX_RECONNECT_RETRIES) return;

    const socket = new WebSocket(WS_URL);
    wsRef.current = socket;

    socket.onopen = () => {
      setWsConnected(true);
      reconnectRetries.current = 0;
      // Start ping keepalive
      pingTimer.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ping" }));
        }
      }, PING_INTERVAL_MS);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "pong") return;

        if (data.type === "new_message") {
          const { conversation_id, message } = data;
          // If this conversation is currently selected, append the message
          if (selectedIdRef.current === conversation_id && message) {
            setSelected((prev) => {
              if (!prev || prev.id !== conversation_id) return prev;
              const existing = prev.messages || [];
              // Avoid duplicates
              if (existing.some((m) => m.id === message.id)) return prev;
              return { ...prev, messages: [...existing, message] };
            });
          }
          // Refresh conversation list to update previews
          loadConversations();
        }

        if (data.type === "escalation") {
          // Refresh conversation list to show updated status
          loadConversations();
          // If viewing the escalated conversation, update context
          if (selectedIdRef.current === data.conversation_id && data.context) {
            setEscalationContext(data.context);
          }
        }
      } catch {}
    };

    socket.onerror = () => {};

    socket.onclose = () => {
      setWsConnected(false);
      if (pingTimer.current) {
        clearInterval(pingTimer.current);
        pingTimer.current = null;
      }
      // Reconnect with exponential backoff
      if (reconnectRetries.current < MAX_RECONNECT_RETRIES) {
        reconnectRetries.current++;
        const delay = Math.min(
          1000 * Math.pow(2, reconnectRetries.current),
          16000,
        );
        reconnectTimer.current = setTimeout(connectWs, delay);
      }
    };
  }, []);

  useEffect(() => {
    connectWs();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (pingTimer.current) {
        clearInterval(pingTimer.current);
      }
    };
  }, [connectWs]);

  // Poll conversation list every 5s as fallback
  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadConversations() {
    try {
      const data = await getConversations(
        WORKSPACE_ID,
        statusFilterRef.current,
      );
      setConversations(data);
    } catch {}
  }

  // Reload when filter changes
  useEffect(() => {
    loadConversations();
  }, [statusFilter]);

  // Auto-select conversation from ?id= query param
  useEffect(() => {
    if (initialIdHandled.current) return;
    const id = searchParams.get("id");
    if (id && conversations.length > 0) {
      initialIdHandled.current = true;
      const conv = conversations.find((c) => c.id === id);
      if (conv) {
        selectConversation(conv);
      } else {
        // Conversation might exist but not in current filter — fetch directly
        selectConversation({ id } as Conversation);
      }
    }
  }, [conversations, searchParams]);

  async function selectConversation(conv: Conversation) {
    setLoading(true);
    setEscalationContext(null);
    setPendingExecutions([]);
    try {
      const detail = await getConversation(conv.id);
      setSelected(detail);
      // Fetch pending executions for this conversation
      try {
        const allPending = await getPendingExecutions(WORKSPACE_ID);
        setPendingExecutions(
          allPending.filter((e: any) => e.conversation_id === conv.id),
        );
      } catch {}
      // Fetch escalation context for escalated conversations
      if (detail.status === "escalated") {
        try {
          const ctx = await getEscalationContext(conv.id);
          setEscalationContext(ctx);
        } catch {}
      }
    } catch {}
    setLoading(false);
  }

  async function handleApprove(executionId: string) {
    setApprovingId(executionId);
    try {
      await approveExecution(executionId);
      setPendingExecutions((prev) => prev.filter((e) => e.id !== executionId));
      if (selected) await selectConversation(selected);
      await loadConversations();
    } catch {}
    setApprovingId(null);
  }

  async function handleReject(executionId: string) {
    setApprovingId(executionId);
    try {
      await rejectExecution(executionId);
      setPendingExecutions((prev) => prev.filter((e) => e.id !== executionId));
      if (selected) await selectConversation(selected);
    } catch {}
    setApprovingId(null);
  }

  async function handleResolve() {
    if (!selected) return;
    try {
      await resolveConversation(selected.id);
      await loadConversations();
      setSelected({ ...selected, status: "resolved" });
    } catch {}
  }

  async function handleSendReply() {
    if (!selected || !replyText.trim() || sending) return;
    const content = replyText.trim();
    setSending(true);

    // Optimistic UI: immediately append agent message
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      role: "agent",
      content,
      tool_call: null,
      tool_result: null,
      created_at: new Date().toISOString(),
    };
    setSelected((prev) =>
      prev
        ? { ...prev, messages: [...(prev.messages || []), optimisticMsg] }
        : prev,
    );
    setReplyText("");

    try {
      const result = await sendAgentReply(WORKSPACE_ID, selected.id, content);
      // Replace optimistic message with real one so WS dedup works
      setSelected((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: (prev.messages || []).map((m) =>
            m.id === optimisticMsg.id ? result.message : m,
          ),
        };
      });
    } catch {
      // Remove optimistic message on failure
      setSelected((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: (prev.messages || []).filter(
            (m) => m.id !== optimisticMsg.id,
          ),
        };
      });
      setReplyText(content);
    }
    setSending(false);
  }

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div className="w-80 border-r border-gray-200 bg-white overflow-y-auto">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold">Conversations</h2>
          <span
            className={`w-2.5 h-2.5 rounded-full ${wsConnected ? "bg-green-400" : "bg-gray-300"}`}
            title={wsConnected ? "Live" : "Disconnected"}
          />
        </div>
        {/* Status filter tabs */}
        <div className="flex border-b border-gray-200 text-xs">
          {(
            [
              { label: "All", value: undefined },
              { label: "Escalated", value: "escalated" },
              { label: "AI Handling", value: "ai_handling" },
              { label: "Resolved", value: "resolved" },
            ] as { label: string; value: string | undefined }[]
          ).map((tab) => (
            <button
              key={tab.label}
              onClick={() => setStatusFilter(tab.value)}
              className={`flex-1 py-2 text-center transition-colors ${
                statusFilter === tab.value
                  ? "text-indigo-600 border-b-2 border-indigo-600 font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {conversations.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">
            No conversations
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => selectConversation(conv)}
              className={`w-full text-left p-4 border-b border-gray-100 border-l-4 hover:bg-gray-50 transition-colors ${
                priorityColor[conv.priority] || "border-l-gray-200"
              } ${selected?.id === conv.id ? "bg-indigo-50" : ""}`}
            >
              <div className="flex justify-between items-start">
                <p className="text-sm font-medium truncate">
                  {conv.customer_name || conv.customer_email || `#${conv.id}`}
                </p>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    conv.status === "resolved"
                      ? "bg-green-100 text-green-700"
                      : conv.status === "escalated"
                        ? "bg-red-100 text-red-700"
                        : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {conv.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {conv.category || "general"}
              </p>
              {conv.status === "escalated" && (
                <p className="text-[10px] text-red-500 mt-0.5 font-medium">
                  Needs human attention
                </p>
              )}
              <p className="text-[10px] text-gray-400 mt-1">
                {new Date(conv.created_at).toLocaleString()}
              </p>
            </button>
          ))
        )}
      </div>

      {/* Chat detail + escalation panel wrapper */}
      <div className="flex-1 flex flex-row">
        {/* Chat detail */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              Select a conversation
            </div>
          ) : loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              Loading...
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">
                    {selected.customer_name ||
                      selected.customer_email ||
                      `#${selected.id}`}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {selected.category} &middot; {selected.priority} priority
                  </p>
                  {selected.ai_summary && (
                    <p className="text-xs text-orange-600 mt-1">
                      {selected.ai_summary}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {selected.status !== "resolved" && (
                    <button
                      onClick={handleResolve}
                      className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {selected.messages?.map((msg) => (
                  <div key={msg.id}>
                    {msg.role === "customer" && (
                      <div className="flex gap-2 justify-end">
                        <div className="max-w-md bg-indigo-600 text-white rounded-2xl rounded-br-md px-4 py-2.5">
                          <p className="text-sm">{msg.content}</p>
                        </div>
                        <User className="w-6 h-6 text-gray-400 mt-1 shrink-0" />
                      </div>
                    )}
                    {msg.role === "ai" && (
                      <div className="flex gap-2">
                        <Bot className="w-6 h-6 text-indigo-600 mt-1 shrink-0" />
                        <div className="max-w-md">
                          <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-2.5 prose prose-sm max-w-none">
                            <Markdown>{msg.content}</Markdown>
                          </div>
                          {msg.tool_call &&
                            (() => {
                              const msgIndex = selected.messages!.indexOf(msg);
                              const hasResult = selected
                                .messages!.slice(msgIndex + 1)
                                .some(
                                  (m) => m.role === "system" && m.tool_result,
                                );
                              const pendingExec = !hasResult
                                ? pendingExecutions.find(
                                    (e) => e.conversation_id === selected.id,
                                  )
                                : null;
                              return (
                                <div
                                  className={`mt-2 border rounded-xl p-3 ${pendingExec ? "bg-amber-50 border-amber-300" : "bg-amber-50 border-amber-200"}`}
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <Wrench className="w-4 h-4 text-amber-600" />
                                    <span className="text-xs font-medium text-amber-800">
                                      Tool: {msg.tool_call.name}
                                    </span>
                                    {pendingExec && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-200 text-yellow-800 font-medium">
                                        Pending Approval
                                      </span>
                                    )}
                                  </div>
                                  <pre className="text-xs text-amber-700 mt-1">
                                    {JSON.stringify(
                                      msg.tool_call.input,
                                      null,
                                      2,
                                    )}
                                  </pre>
                                  {pendingExec && (
                                    <div className="flex gap-2 mt-3 pt-2 border-t border-amber-200">
                                      <button
                                        onClick={() =>
                                          handleApprove(pendingExec.id)
                                        }
                                        disabled={
                                          approvingId === pendingExec.id
                                        }
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                                      >
                                        <CheckCircle className="w-3.5 h-3.5" />
                                        Approve
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleReject(pendingExec.id)
                                        }
                                        disabled={
                                          approvingId === pendingExec.id
                                        }
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                                      >
                                        <XCircle className="w-3.5 h-3.5" />
                                        Reject
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                        </div>
                      </div>
                    )}
                    {msg.role === "agent" && (
                      <div className="flex gap-2">
                        <UserCircle className="w-6 h-6 text-teal-600 mt-1 shrink-0" />
                        <div className="max-w-md">
                          <div className="bg-teal-50 border border-teal-200 rounded-2xl rounded-bl-md px-4 py-2.5">
                            <p className="text-sm whitespace-pre-wrap">
                              {msg.content}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    {msg.role === "system" && msg.tool_result && (
                      <div className="flex justify-center">
                        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                          Tool executed successfully
                        </div>
                      </div>
                    )}
                    {msg.role === "system" && !msg.tool_result && (
                      <div className="flex items-center gap-3 py-1">
                        <div className="flex-1 border-t border-red-200" />
                        <span className="text-[11px] text-red-400 font-medium whitespace-nowrap">
                          Escalated to human agent
                        </span>
                        <div className="flex-1 border-t border-red-200" />
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Agent reply input */}
              {selected.status !== "resolved" && (
                <div className="p-4 border-t border-gray-200 bg-white">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                      placeholder="Type a reply as agent..."
                      className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-teal-500"
                      disabled={sending}
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || sending}
                      className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm"
                    >
                      <Send className="w-4 h-4" />
                      Send
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Escalation context panel */}
        {selected?.status === "escalated" && escalationContext && (
          <div className="w-72 border-l border-gray-200 bg-red-50/30 overflow-y-auto">
            <div className="p-4 border-b border-red-200 bg-red-50">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-600" />
                <h3 className="font-semibold text-red-800 text-sm">
                  Escalation Details
                </h3>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Reason */}
              <div>
                <p className="text-[10px] uppercase font-semibold text-gray-500 mb-1">
                  Reason
                </p>
                <p className="text-sm text-gray-800">
                  {escalationContext.reason}
                </p>
              </div>

              {/* Trigger badges */}
              <div>
                <p className="text-[10px] uppercase font-semibold text-gray-500 mb-1">
                  Triggers
                </p>
                <div className="flex flex-wrap gap-1">
                  {escalationContext.triggers?.map((trigger: string) => (
                    <span
                      key={trigger}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700"
                    >
                      {trigger === "angry_customer" && (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      {trigger === "low_confidence" && (
                        <Zap className="w-3 h-3" />
                      )}
                      {trigger.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>

              {/* Sentiment & Confidence */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-500 mb-1">
                    Sentiment
                  </p>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      escalationContext.sentiment === "angry"
                        ? "bg-red-100 text-red-700"
                        : escalationContext.sentiment === "negative"
                          ? "bg-orange-100 text-orange-700"
                          : escalationContext.sentiment === "positive"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {escalationContext.sentiment}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-500 mb-1">
                    Confidence
                  </p>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      escalationContext.confidence === "low"
                        ? "bg-red-100 text-red-700"
                        : escalationContext.confidence === "medium"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-green-100 text-green-700"
                    }`}
                  >
                    {escalationContext.confidence}
                  </span>
                </div>
              </div>

              {/* Customer profile */}
              {escalationContext.customer_profile && (
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-500 mb-1">
                    Customer
                  </p>
                  <div className="text-xs text-gray-700 space-y-0.5">
                    {escalationContext.customer_profile.name && (
                      <p>{escalationContext.customer_profile.name}</p>
                    )}
                    {escalationContext.customer_profile.email && (
                      <p className="text-gray-500">
                        {escalationContext.customer_profile.email}
                      </p>
                    )}
                    <p>
                      {escalationContext.customer_profile.message_count}{" "}
                      messages
                    </p>
                  </div>
                </div>
              )}

              {/* Attempted actions */}
              {escalationContext.attempted_actions?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-500 mb-1">
                    Attempted Actions
                  </p>
                  <div className="space-y-1">
                    {escalationContext.attempted_actions.map(
                      (action: any, i: number) => (
                        <div
                          key={i}
                          className="text-xs bg-white rounded px-2 py-1.5 border border-gray-200"
                        >
                          <span className="font-medium text-gray-800">
                            {action.tool}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

              {/* Tool executions (live data from API) */}
              {escalationContext.tool_executions?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-500 mb-1">
                    Tool Executions
                  </p>
                  <div className="space-y-1">
                    {escalationContext.tool_executions.map((ex: any) => (
                      <div
                        key={ex.id}
                        className="text-xs bg-white rounded px-2 py-1.5 border border-gray-200"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-gray-800">
                            {ex.tool_name}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              ex.status === "executed"
                                ? "bg-green-100 text-green-700"
                                : ex.status === "pending"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : ex.status === "rejected"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {ex.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Handoff notes from system messages */}
              {selected?.messages?.some(
                (m: Message) => m.role === "system" && !m.tool_result,
              ) && (
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-500 mb-1">
                    Handoff Notes
                  </p>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 space-y-1">
                    {selected.messages
                      .filter(
                        (m: Message) => m.role === "system" && !m.tool_result,
                      )
                      .map((m: Message) => (
                        <p
                          key={m.id}
                          className="text-xs text-orange-800 whitespace-pre-wrap"
                        >
                          {m.content}
                        </p>
                      ))}
                  </div>
                </div>
              )}

              {/* Suggested action */}
              <div>
                <p className="text-[10px] uppercase font-semibold text-gray-500 mb-1">
                  Suggested Action
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-blue-800">
                    {escalationContext.suggested_next_action}
                  </p>
                </div>
              </div>

              {/* Escalated at */}
              {escalationContext.escalated_at && (
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-500 mb-1">
                    Escalated At
                  </p>
                  <p className="text-xs text-gray-600">
                    {new Date(escalationContext.escalated_at).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
