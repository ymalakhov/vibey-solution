"use client";

import { useEffect, useState } from "react";
import { getAnalytics, getConversations } from "@/lib/api";
import {
  MessageSquare,
  Clock,
  Bot,
  AlertTriangle,
  ArrowUpRight,
  ShieldAlert,
  Flame,
  TrendingUp,
  Wrench,
} from "lucide-react";

const WORKSPACE_ID = "demo";

interface Analytics {
  total_conversations: number;
  ai_resolved: number;
  ai_resolved_pct: number;
  avg_resolution_time_min: number;
  escalation_rate: number;
  tool_usage: { name: string; usage_count: number; success_count: number }[];
  category_breakdown: { category: string; count: number }[];
  priority_breakdown: { urgent: number; high: number; medium: number; low: number };
  status_breakdown: { open: number; ai_handling: number; escalated: number; resolved: number };
  sentiment_breakdown: { positive: number; neutral: number; negative: number; angry: number };
  high_priority_tickets: {
    id: string;
    customer_name: string | null;
    customer_email: string | null;
    status: string;
    priority: string;
    category: string | null;
    sentiment: string | null;
    ai_summary: string | null;
    created_at: string;
  }[];
  pending_approvals: {
    id: string;
    tool_name: string;
    conversation_id: string;
    input_data: Record<string, unknown>;
    created_at: string;
  }[];
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

const priorityConfig: Record<string, { bg: string; text: string; dot: string }> = {
  urgent: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  high: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  medium: { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-400" },
  low: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-400" },
};

const statusColor: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  ai_handling: "bg-indigo-100 text-indigo-700",
  escalated: "bg-red-100 text-red-700",
  resolved: "bg-green-100 text-green-700",
};

const sentimentConfig: Record<string, { color: string; label: string }> = {
  positive: { color: "bg-green-400", label: "Positive" },
  neutral: { color: "bg-gray-300", label: "Neutral" },
  negative: { color: "bg-orange-400", label: "Negative" },
  angry: { color: "bg-red-500", label: "Angry" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function DashboardPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    getAnalytics(WORKSPACE_ID).then(setData).catch(() => {});
    getConversations(WORKSPACE_ID).then(setConversations).catch(() => {});
  }, []);

  const openCount = data
    ? data.status_breakdown.open + data.status_breakdown.ai_handling + data.status_breakdown.escalated
    : 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="text-sm text-gray-400">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </span>
      </div>

      {/* High Priority Tickets + Pending Approvals */}
      {data && (data.high_priority_tickets.length > 0 || data.pending_approvals.length > 0) && (
        <div className="space-y-3">
          {/* Pending Approvals */}
          {data.pending_approvals.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
                <h2 className="font-semibold text-amber-900">
                  {data.pending_approvals.length} Pending Approval{data.pending_approvals.length > 1 ? "s" : ""}
                </h2>
                <a href="/chats" className="ml-auto text-sm text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1">
                  Review all <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {data.pending_approvals.slice(0, 3).map((pa) => (
                  <a
                    key={pa.id}
                    href={`/chats?id=${pa.conversation_id}`}
                    className="flex items-center gap-3 bg-white/70 rounded-lg px-3 py-2 hover:bg-white transition-colors"
                  >
                    <Wrench className="w-4 h-4 text-amber-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-amber-900 truncate">{pa.tool_name}</p>
                      <p className="text-xs text-amber-600">{timeAgo(pa.created_at)}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* High Priority Tickets */}
          {data.high_priority_tickets.length > 0 && (
            <div className="bg-red-50/60 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Flame className="w-5 h-5 text-red-600" />
                <h2 className="font-semibold text-red-900">
                  {data.high_priority_tickets.length} High Priority Ticket{data.high_priority_tickets.length > 1 ? "s" : ""}
                </h2>
                <a href="/chats" className="ml-auto text-sm text-red-700 hover:text-red-900 font-medium flex items-center gap-1">
                  View all <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="space-y-2">
                {data.high_priority_tickets.slice(0, 5).map((ticket) => (
                  <a
                    key={ticket.id}
                    href={`/chats?id=${ticket.id}`}
                    className="flex items-center gap-3 bg-white/70 rounded-lg px-4 py-3 hover:bg-white transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${ticket.priority === "urgent" ? "bg-red-500 animate-pulse" : "bg-orange-500"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {ticket.customer_name || ticket.customer_email || `#${ticket.id}`}
                        </p>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          ticket.priority === "urgent" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                        }`}>
                          {ticket.priority}
                        </span>
                      </div>
                      {ticket.ai_summary && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{ticket.ai_summary}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[ticket.status] || statusColor.open}`}>
                        {ticket.status.replace("_", " ")}
                      </span>
                      <p className="text-[11px] text-gray-400 mt-1">{timeAgo(ticket.created_at)}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<MessageSquare className="w-5 h-5 text-indigo-600" />}
          label="Open Tickets"
          value={openCount}
          sub={data ? (
            <div className="flex gap-1.5 mt-2">
              {(["urgent", "high", "medium", "low"] as const).map((p) => {
                const count = data.priority_breakdown[p];
                if (!count) return null;
                const cfg = priorityConfig[p];
                return (
                  <span key={p} className={`text-[11px] px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text} font-medium`}>
                    {count} {p}
                  </span>
                );
              })}
            </div>
          ) : undefined}
        />
        <MetricCard
          icon={<Clock className="w-5 h-5 text-blue-600" />}
          label="Avg Resolution"
          value={data ? `${data.avg_resolution_time_min}m` : "—"}
        />
        <MetricCard
          icon={<Bot className="w-5 h-5 text-green-600" />}
          label="AI Resolution Rate"
          value={data ? `${data.ai_resolved_pct}%` : "—"}
          sub={data ? <p className="text-xs text-gray-400 mt-1">{data.ai_resolved} of {data.total_conversations} total</p> : undefined}
        />
        <MetricCard
          icon={<AlertTriangle className="w-5 h-5 text-orange-500" />}
          label="Escalation Rate"
          value={data ? `${data.escalation_rate}%` : "—"}
          sub={data ? <p className="text-xs text-gray-400 mt-1">{data.status_breakdown.escalated} escalated</p> : undefined}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Status Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            Conversation Status
          </h3>
          {data ? (
            <div className="space-y-3">
              <StatusBar label="Open" count={data.status_breakdown.open} total={data.total_conversations} color="bg-blue-500" />
              <StatusBar label="AI Handling" count={data.status_breakdown.ai_handling} total={data.total_conversations} color="bg-indigo-500" />
              <StatusBar label="Escalated" count={data.status_breakdown.escalated} total={data.total_conversations} color="bg-red-500" />
              <StatusBar label="Resolved" count={data.status_breakdown.resolved} total={data.total_conversations} color="bg-green-500" />
            </div>
          ) : (
            <p className="text-sm text-gray-400">Loading...</p>
          )}
        </div>

        {/* Category Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-sm mb-4">Categories</h3>
          {data && data.category_breakdown.length > 0 ? (
            <div className="space-y-3">
              {data.category_breakdown.map((cat) => {
                const total = data.category_breakdown.reduce((s, c) => s + c.count, 0);
                const pct = Math.round((cat.count / total) * 100);
                return (
                  <div key={cat.category}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="capitalize">{cat.category}</span>
                      <span className="text-gray-400 text-xs">{cat.count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">{data ? "No data yet" : "Loading..."}</p>
          )}
        </div>

        {/* Sentiment Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-sm mb-4">Customer Sentiment</h3>
          {data ? (() => {
            const total = Object.values(data.sentiment_breakdown).reduce((a, b) => a + b, 0);
            if (total === 0) return <p className="text-sm text-gray-400">No data yet</p>;
            return (
              <div className="space-y-4">
                {/* Visual bar */}
                <div className="flex h-3 rounded-full overflow-hidden">
                  {(["positive", "neutral", "negative", "angry"] as const).map((s) => {
                    const pct = (data.sentiment_breakdown[s] / total) * 100;
                    if (pct === 0) return null;
                    return (
                      <div
                        key={s}
                        className={`${sentimentConfig[s].color} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="grid grid-cols-2 gap-2">
                  {(["positive", "neutral", "negative", "angry"] as const).map((s) => {
                    const count = data.sentiment_breakdown[s];
                    const pct = Math.round((count / total) * 100);
                    const cfg = sentimentConfig[s];
                    return (
                      <div key={s} className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${cfg.color}`} />
                        <span className="text-sm">{cfg.label}</span>
                        <span className="text-xs text-gray-400 ml-auto">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })() : (
            <p className="text-sm text-gray-400">Loading...</p>
          )}
        </div>
      </div>

      {/* Tool Usage + Recent Conversations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tool Usage */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-sm mb-4">Tool Usage</h3>
          {data && data.tool_usage.length > 0 ? (() => {
            const maxUsage = Math.max(...data.tool_usage.map((t) => t.usage_count), 1);
            return (
              <div className="space-y-3">
                {data.tool_usage.map((tool) => {
                  const successRate = tool.usage_count > 0
                    ? Math.round((tool.success_count / tool.usage_count) * 100)
                    : 0;
                  return (
                    <div key={tool.name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{tool.name}</span>
                        <span className="text-gray-400 text-xs">{tool.usage_count} calls · {successRate}% ok</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${(tool.usage_count / maxUsage) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })() : (
            <p className="text-sm text-gray-400">{data ? "No data yet" : "Loading..."}</p>
          )}
        </div>

        {/* Recent Conversations */}
        <div className="bg-white rounded-xl border border-gray-200 lg:col-span-2">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-sm">Recent Conversations</h3>
            <a href="/chats" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
              View all <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
          <div className="divide-y divide-gray-50">
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                No conversations yet. Send a message via the chat widget to get started.
              </div>
            ) : (
              conversations.slice(0, 8).map((conv) => {
                const cfg = priorityConfig[conv.priority] || priorityConfig.medium;
                return (
                  <a
                    key={conv.id}
                    href={`/chats?id=${conv.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {conv.customer_name || conv.customer_email || `#${conv.id}`}
                      </p>
                      <p className="text-xs text-gray-400">{conv.category || "general"}</p>
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusColor[conv.status] || statusColor.open}`}>
                      {conv.status.replace("_", " ")}
                    </span>
                    <span className="text-xs text-gray-400 w-14 text-right">{timeAgo(conv.created_at)}</span>
                  </a>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub}
    </div>
  );
}

function StatusBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="text-gray-400 text-xs">{count} ({pct}%)</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
