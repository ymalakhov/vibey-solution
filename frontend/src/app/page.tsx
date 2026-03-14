"use client";

import { useEffect, useState } from "react";
import { getConversations, getAnalytics, getPendingExecutions } from "@/lib/api";
import { MessageSquare, Clock, Bot, Star, AlertCircle } from "lucide-react";

const WORKSPACE_ID = "demo";

interface Stats {
  total_conversations: number;
  ai_resolved: number;
  ai_resolved_pct: number;
  avg_resolution_time_min: number;
  csat_avg: number;
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
}

const priorityColor: Record<string, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-green-100 text-green-700",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    getAnalytics(WORKSPACE_ID).then(setStats).catch(() => {});
    getConversations(WORKSPACE_ID).then(setConversations).catch(() => {});
    getPendingExecutions(WORKSPACE_ID).then((r) => setPendingCount(r.length)).catch(() => {});
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<MessageSquare className="w-5 h-5 text-indigo-600" />}
          label="Open Tickets"
          value={conversations.filter((c) => c.status !== "resolved").length}
        />
        <StatCard
          icon={<Clock className="w-5 h-5 text-blue-600" />}
          label="Avg Response"
          value={stats ? `${stats.avg_resolution_time_min}min` : "—"}
        />
        <StatCard
          icon={<Bot className="w-5 h-5 text-green-600" />}
          label="AI Resolved"
          value={stats ? `${stats.ai_resolved_pct}%` : "—"}
        />
        <StatCard
          icon={<Star className="w-5 h-5 text-amber-500" />}
          label="CSAT Score"
          value={stats ? `${stats.csat_avg}/5` : "—"}
        />
      </div>

      {/* Pending approvals */}
      {pendingCount > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600" />
          <span className="text-sm font-medium text-amber-800">
            {pendingCount} tool execution(s) waiting for approval
          </span>
          <a href="/chats" className="ml-auto text-sm text-amber-700 underline">
            Review
          </a>
        </div>
      )}

      {/* Recent conversations */}
      <h2 className="text-lg font-semibold mb-3">Recent Conversations</h2>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {conversations.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            No conversations yet. Send a message via the chat widget to get started.
          </div>
        ) : (
          conversations.slice(0, 10).map((conv) => (
            <a
              key={conv.id}
              href={`/chats?id=${conv.id}`}
              className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityColor[conv.priority] || priorityColor.medium}`}>
                  {conv.priority}
                </span>
                <div>
                  <p className="text-sm font-medium">{conv.customer_name || conv.customer_email || `#${conv.id}`}</p>
                  <p className="text-xs text-gray-500">{conv.category || "general"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  conv.status === "resolved" ? "bg-green-100 text-green-700" :
                  conv.status === "escalated" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                }`}>
                  {conv.status}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(conv.created_at).toLocaleTimeString()}
                </span>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-sm text-gray-500">{label}</span></div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
