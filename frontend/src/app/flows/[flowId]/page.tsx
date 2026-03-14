"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getFlow, updateFlow, validateFlow, getTools } from "@/lib/api";
import { Node, Edge } from "@xyflow/react";
import { FlowCanvas } from "@/components/flow-builder/FlowCanvas";
import { NodePalette } from "@/components/flow-builder/panels/NodePalette";
import { NodeConfigPanel } from "@/components/flow-builder/panels/NodeConfigPanel";
import { FlowSettingsPanel } from "@/components/flow-builder/panels/FlowSettingsPanel";
import {
  ArrowLeft,
  Save,
  CheckCircle,
  AlertTriangle,
  Settings,
  X,
} from "lucide-react";

const WORKSPACE_ID = "demo";

interface FlowData {
  id: string;
  name: string;
  description: string;
  trigger_intents: string[];
  is_active: boolean;
  priority: number;
  nodes: Node[];
  edges: Edge[];
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export default function FlowBuilderPage() {
  const { flowId } = useParams<{ flowId: string }>();
  const router = useRouter();
  const [flow, setFlow] = useState<FlowData | null>(null);
  const [tools, setTools] = useState<{ id: string; name: string }[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const updateNodeDataRef = useRef<(nodeId: string, data: any) => void>(() => {});

  useEffect(() => {
    loadFlow();
    loadTools();
  }, [flowId]);

  async function loadFlow() {
    try {
      const data = await getFlow(flowId);
      setFlow(data);
      nodesRef.current = data.nodes || [];
      edgesRef.current = data.edges || [];
    } catch {
      router.push("/flows");
    }
  }

  async function loadTools() {
    try {
      const t = await getTools(WORKSPACE_ID);
      setTools(t.map((tool: any) => ({ id: tool.id, name: tool.name })));
    } catch {}
  }

  async function handleSave() {
    if (!flow) return;
    setSaving(true);
    try {
      await updateFlow(flow.id, {
        name: flow.name,
        description: flow.description,
        trigger_intents: flow.trigger_intents,
        is_active: flow.is_active,
        priority: flow.priority,
        nodes: nodesRef.current,
        edges: edgesRef.current,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      alert("Save failed: " + e.message);
    }
    setSaving(false);
  }

  async function handleValidate() {
    try {
      // Save first to validate latest state
      await handleSave();
      const result = await validateFlow(flowId);
      setValidation(result);
    } catch (e: any) {
      alert(e.message);
    }
  }

  const handleNodesChange = useCallback((nodes: Node[]) => {
    nodesRef.current = nodes;
  }, []);

  const handleEdgesChange = useCallback((edges: Edge[]) => {
    edgesRef.current = edges;
  }, []);

  const handleNodeSelect = useCallback((node: Node | null) => {
    setSelectedNode(node);
    setShowSettings(false);
  }, []);

  const handleNodeDataUpdate = useCallback(
    (nodeId: string, data: any) => {
      // Update through the canvas's internal update function
      const canvasUpdate = (FlowCanvas as any)._updateNodeData;
      if (canvasUpdate) {
        canvasUpdate(nodeId, data);
      }
      // Also update selectedNode locally for the config panel
      setSelectedNode((prev) => (prev?.id === nodeId ? { ...prev, data } : prev));
    },
    []
  );

  const handleFlowSettingsUpdate = useCallback(
    (updates: Partial<FlowData>) => {
      setFlow((prev) => (prev ? { ...prev, ...updates } : prev));
    },
    []
  );

  if (!flow) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/flows")}
            className="p-1.5 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-semibold">{flow.name}</h1>
          {flow.is_active ? (
            <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">
              Active
            </span>
          ) : (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
              Inactive
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowSettings(!showSettings);
              setSelectedNode(null);
            }}
            className={`p-2 rounded-lg transition-colors ${
              showSettings ? "bg-indigo-100 text-indigo-700" : "hover:bg-gray-100"
            }`}
            title="Flow Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={handleValidate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <CheckCircle className="w-4 h-4" /> Validate
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      {/* Validation banner */}
      {validation && (
        <div
          className={`px-4 py-2 flex items-start gap-2 text-sm ${
            validation.valid
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          <div className="flex-1">
            {validation.valid ? (
              <p className="flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Flow is valid
              </p>
            ) : (
              <>
                {validation.errors.map((e, i) => (
                  <p key={i} className="flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {e}
                  </p>
                ))}
              </>
            )}
            {validation.warnings.map((w, i) => (
              <p key={i} className="text-amber-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {w}
              </p>
            ))}
          </div>
          <button onClick={() => setValidation(null)} className="p-1">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Three-column layout */}
      <div className="flex flex-1 overflow-hidden">
        <NodePalette />
        <FlowCanvas
          initialNodes={flow.nodes}
          initialEdges={flow.edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onNodeSelect={handleNodeSelect}
          onNodeDataUpdate={handleNodeDataUpdate}
        />
        {showSettings ? (
          <div className="w-72 bg-white border-l border-gray-200 p-4 overflow-y-auto">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Flow Settings
            </h3>
            <FlowSettingsPanel
              settings={{
                name: flow.name,
                description: flow.description || "",
                trigger_intents: flow.trigger_intents,
                is_active: flow.is_active,
                priority: flow.priority,
              }}
              onUpdate={handleFlowSettingsUpdate}
            />
          </div>
        ) : (
          <NodeConfigPanel
            node={selectedNode}
            tools={tools}
            onUpdate={handleNodeDataUpdate}
          />
        )}
      </div>
    </div>
  );
}
