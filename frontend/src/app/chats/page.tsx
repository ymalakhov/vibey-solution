"use client";

import { useEffect, useState } from "react";
import { getConversations, getConversation, approveExecution, rejectExecution, resolveConversation } from "@/lib/api";
import { CheckCircle, XCircle, RotateCcw, User, Bot, Wrench } from "lucide-react";

const WORKSPACE_ID = "demo";

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

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div className="w-80 border-r border-gray-200 bg-white overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold">Conversations</h2>
        </div>
        {conversations.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No conversations</div>
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
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  conv.status === "resolved" ? "bg-green-100 text-green-700" :
                  conv.status === "escalated" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                }`}>
                  {conv.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{conv.category || "general"}</p>
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
          <div className="flex-1 flex items-center justify-center text-gray-400">Loading...</div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between">
              <div>
                <h3 className="font-semibold">
                  {selected.customer_name || selected.customer_email || `#${selected.id}`}
                </h3>
                <p className="text-xs text-gray-500">
                  {selected.category} &middot; {selected.priority} priority
                </p>
                {selected.ai_summary && (
                  <p className="text-xs text-orange-600 mt-1">{selected.ai_summary}</p>
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
                        <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-2.5">
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
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
                  {msg.role === "system" && msg.tool_result && (
                    <div className="flex justify-center">
                      <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                        Tool executed successfully
                      </div>
                    </div>
                  )}
                  {msg.role === "system" && !msg.tool_result && (
                    <div className="flex justify-center">
                      <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 max-w-lg w-full">
                        <p className="text-xs font-semibold text-orange-800 mb-1">Handoff Notes</p>
                        <p className="text-sm text-orange-700 whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
