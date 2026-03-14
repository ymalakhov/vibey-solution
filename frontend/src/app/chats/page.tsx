"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  getConversations,
  getConversation,
  approveExecution,
  rejectExecution,
  resolveConversation,
  sendAgentReply,
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
} from "lucide-react";

const WORKSPACE_ID = "demo";
const WS_URL = `ws://5fb8-178-158-206-108.ngrok-free.app/api/ws/admin/${WORKSPACE_ID}`;
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const selectedIdRef = useRef<string | null>(null);
  const selectedRef = useRef<Conversation | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRetries = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null;
    selectedRef.current = selected;
  }, [selected]);

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
      const data = await getConversations(WORKSPACE_ID);
      setConversations(data);
    } catch {}
  }

  async function selectConversation(conv: Conversation) {
    setLoading(true);
    try {
      const detail = await getConversation(conv.id);
      setSelected(detail);
    } catch {}
    setLoading(false);
  }

  async function handleApprove(executionId: string) {
    try {
      await approveExecution(executionId);
      if (selected) await selectConversation(selected);
      await loadConversations();
    } catch {}
  }

  async function handleReject(executionId: string) {
    try {
      await rejectExecution(executionId);
      if (selected) await selectConversation(selected);
    } catch {}
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
              <p className="text-[10px] text-gray-400 mt-1">
                {new Date(conv.created_at).toLocaleString()}
              </p>
            </button>
          ))
        )}
      </div>

      {/* Chat detail */}
      <div className="flex-1 flex flex-col">
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
                        <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-2.5">
                          <p className="text-sm whitespace-pre-wrap">
                            {msg.content}
                          </p>
                        </div>
                        {msg.tool_call && (
                          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Wrench className="w-4 h-4 text-amber-600" />
                              <span className="text-xs font-medium text-amber-800">
                                Tool: {msg.tool_call.name}
                              </span>
                            </div>
                            <pre className="text-xs text-amber-700 mt-1">
                              {JSON.stringify(msg.tool_call.input, null, 2)}
                            </pre>
                          </div>
                        )}
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
    </div>
  );
}
