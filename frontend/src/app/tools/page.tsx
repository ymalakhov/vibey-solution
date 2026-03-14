"use client";

import { useEffect, useState } from "react";
import { getTools, createTool, deleteTool, testTool } from "@/lib/api";
import { Plus, Trash2, Play, Wrench, Shield, Zap } from "lucide-react";

const WORKSPACE_ID = "demo";

interface ToolParam {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

interface Tool {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  parameters: ToolParam[];
  requires_approval: boolean;
  is_active: boolean;
  usage_count: number;
  success_count: number;
}

const emptyForm = {
  name: "",
  description: "",
  endpoint: "",
  method: "POST",
  headers: {} as Record<string, string>,
  parameters: [] as ToolParam[],
  requires_approval: true,
};

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [testInput, setTestInput] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<any>(null);
  const [testingToolId, setTestingToolId] = useState<string | null>(null);

  useEffect(() => {
    loadTools();
  }, []);

  async function loadTools() {
    try {
      setTools(await getTools(WORKSPACE_ID));
    } catch {}
  }

  async function handleCreate() {
    try {
      await createTool(WORKSPACE_ID, form);
      setForm({ ...emptyForm });
      setShowCreate(false);
      await loadTools();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this tool?")) return;
    await deleteTool(id);
    await loadTools();
  }

  async function handleTest(toolId: string) {
    setTestResult(null);
    try {
      const result = await testTool(toolId, testInput);
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ success: false, error: e.message });
    }
  }

  function addParam() {
    setForm({
      ...form,
      parameters: [...form.parameters, { name: "", type: "string", description: "", required: false }],
    });
  }

  function updateParam(idx: number, field: string, value: any) {
    const params = [...form.parameters];
    (params[idx] as any)[field] = value;
    setForm({ ...form, parameters: params });
  }

  function removeParam(idx: number) {
    setForm({ ...form, parameters: form.parameters.filter((_, i) => i !== idx) });
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Tools</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
        >
          <Plus className="w-4 h-4" /> Create Tool
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="font-semibold mb-4">New Tool</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="refund_payment"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Method</label>
              <select
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
                <option>PATCH</option>
                <option>DELETE</option>
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Description *</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Process a refund for the customer"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Endpoint URL *</label>
            <input
              value={form.endpoint}
              onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="https://api.example.com/refund"
            />
          </div>

          {/* Parameters */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Parameters</label>
              <button onClick={addParam} className="text-xs text-indigo-600 hover:underline">
                + Add Parameter
              </button>
            </div>
            {form.parameters.map((param, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input
                  value={param.name}
                  onChange={(e) => updateParam(idx, "name", e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  placeholder="param name"
                />
                <select
                  value={param.type}
                  onChange={(e) => updateParam(idx, "type", e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="string">string</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                </select>
                <input
                  value={param.description}
                  onChange={(e) => updateParam(idx, "description", e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                  placeholder="description"
                />
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={param.required}
                    onChange={(e) => updateParam(idx, "required", e.target.checked)}
                  />
                  Req
                </label>
                <button onClick={() => removeParam(idx)} className="text-red-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 mb-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.requires_approval}
                onChange={(e) => setForm({ ...form, requires_approval: e.target.checked })}
              />
              Requires agent approval
            </label>
          </div>

          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
              Save Tool
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tool list */}
      <div className="space-y-3">
        {tools.map((tool) => (
          <div key={tool.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Wrench className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-semibold">{tool.name}</h3>
                  <p className="text-sm text-gray-500">{tool.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {tool.requires_approval ? (
                  <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                    <Shield className="w-3 h-3" /> Approval
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
                    <Zap className="w-3 h-3" /> Auto
                  </span>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
              <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                {tool.method} {tool.endpoint}
              </span>
              <span>Used: {tool.usage_count}x</span>
              <span>Success: {tool.usage_count > 0 ? Math.round(tool.success_count / tool.usage_count * 100) : 0}%</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => {
                  setTestingToolId(testingToolId === tool.id ? null : tool.id);
                  setTestResult(null);
                  setTestInput({});
                }}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                <Play className="w-3 h-3" /> Test
              </button>
              <button
                onClick={() => handleDelete(tool.id)}
                className="flex items-center gap-1 text-xs px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            </div>

            {/* Test panel */}
            {testingToolId === tool.id && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <p className="text-xs font-medium mb-2">Test Input (JSON):</p>
                <textarea
                  value={JSON.stringify(testInput, null, 2)}
                  onChange={(e) => {
                    try { setTestInput(JSON.parse(e.target.value)); } catch {}
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono h-20"
                />
                <button
                  onClick={() => handleTest(tool.id)}
                  className="mt-2 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700"
                >
                  Run Test
                </button>
                {testResult && (
                  <pre className={`mt-2 p-3 rounded-lg text-xs overflow-auto ${
                    testResult.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                  }`}>
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
