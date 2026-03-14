"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getFlows, createFlow, deleteFlow } from "@/lib/api";
import { Plus, Trash2, GitBranch, Zap, ToggleLeft, ToggleRight } from "lucide-react";
import { updateFlow } from "@/lib/api";

const WORKSPACE_ID = "demo";

interface FlowItem {
  id: string;
  name: string;
  description: string | null;
  trigger_intents: string[];
  is_active: boolean;
  priority: number;
  node_count: number;
  created_at: string;
  updated_at: string;
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<FlowItem[]>([]);
  const router = useRouter();

  useEffect(() => {
    loadFlows();
  }, []);

  async function loadFlows() {
    try {
      setFlows(await getFlows(WORKSPACE_ID));
    } catch {}
  }

  async function handleCreate() {
    try {
      const flow = await createFlow(WORKSPACE_ID, {
        name: "New Flow",
        description: "",
        trigger_intents: [],
        nodes: [
          {
            id: "trigger-1",
            type: "trigger",
            position: { x: 250, y: 50 },
            data: { label: "Start", intents: [], description: "" },
          },
        ],
        edges: [],
      });
      router.push(`/flows/${flow.id}`);
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this flow?")) return;
    await deleteFlow(id);
    await loadFlows();
  }

  async function handleToggleActive(flow: FlowItem) {
    await updateFlow(flow.id, { is_active: !flow.is_active });
    await loadFlows();
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Flows</h1>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
        >
          <Plus className="w-4 h-4" /> Create Flow
        </button>
      </div>

      <div className="space-y-3">
        {flows.map((flow) => (
          <div
            key={flow.id}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-200 transition-colors cursor-pointer"
            onClick={() => router.push(`/flows/${flow.id}`)}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <GitBranch className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-semibold">{flow.name}</h3>
                  {flow.description && (
                    <p className="text-sm text-gray-500">{flow.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleToggleActive(flow)}
                  className="p-1"
                  title={flow.is_active ? "Active" : "Inactive"}
                >
                  {flow.is_active ? (
                    <ToggleRight className="w-6 h-6 text-green-600" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-gray-400" />
                  )}
                </button>
                <button
                  onClick={() => handleDelete(flow.id)}
                  className="p-1 text-red-400 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              {flow.trigger_intents.map((intent) => (
                <span
                  key={intent}
                  className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded"
                >
                  <Zap className="w-3 h-3" /> {intent}
                </span>
              ))}
              <span className="text-xs text-gray-400">
                {flow.node_count} node{flow.node_count !== 1 ? "s" : ""}
              </span>
              <span className="text-xs text-gray-400">
                Priority: {flow.priority}
              </span>
            </div>
          </div>
        ))}

        {flows.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No flows yet. Create one to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
