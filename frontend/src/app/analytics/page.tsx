"use client";

import { useEffect, useState } from "react";
import { getAnalytics } from "@/lib/api";
import { BarChart3, Bot, Clock, Star } from "lucide-react";

const WORKSPACE_ID = "demo";

interface Analytics {
  total_conversations: number;
  ai_resolved: number;
  ai_resolved_pct: number;
  avg_resolution_time_min: number;
  csat_avg: number;
  tool_usage: { name: string; usage_count: number; success_count: number }[];
  category_breakdown: { category: string; count: number }[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    getAnalytics(WORKSPACE_ID).then(setData).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Analytics</h1>
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  const maxUsage = Math.max(...data.tool_usage.map((t) => t.usage_count), 1);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            <span className="text-sm text-gray-500">Total Conversations</span>
          </div>
          <p className="text-2xl font-bold">{data.total_conversations}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-5 h-5 text-green-600" />
            <span className="text-sm text-gray-500">AI Resolved</span>
          </div>
          <p className="text-2xl font-bold">{data.ai_resolved} ({data.ai_resolved_pct}%)</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-gray-500">Avg Resolution</span>
          </div>
          <p className="text-2xl font-bold">{data.avg_resolution_time_min} min</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-5 h-5 text-amber-500" />
            <span className="text-sm text-gray-500">CSAT Average</span>
          </div>
          <p className="text-2xl font-bold">{data.csat_avg} / 5</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Tool usage */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">Tool Usage</h3>
          {data.tool_usage.length === 0 ? (
            <p className="text-sm text-gray-400">No data yet</p>
          ) : (
            <div className="space-y-3">
              {data.tool_usage.map((tool) => (
                <div key={tool.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{tool.name}</span>
                    <span className="text-gray-500">{tool.usage_count} calls</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${(tool.usage_count / maxUsage) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Category breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">Categories</h3>
          {data.category_breakdown.length === 0 ? (
            <p className="text-sm text-gray-400">No data yet</p>
          ) : (
            <div className="space-y-3">
              {data.category_breakdown.map((cat) => {
                const total = data.category_breakdown.reduce((s, c) => s + c.count, 0);
                const pct = Math.round((cat.count / total) * 100);
                return (
                  <div key={cat.category} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{cat.category}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-10 text-right">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
