"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSkill, updateSkill, getTools, previewSkill } from "@/lib/api";
import {
  ArrowLeft, Save, Sparkles, Eye, X, Send, Loader2,
  Plus, Trash2, AlertTriangle,
} from "lucide-react";

const WORKSPACE_ID = "demo";

interface ToolItem {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
}

interface EscalationCondition {
  condition: string;
  keywords: string[];
}

interface SkillData {
  id: string;
  name: string;
  description: string | null;
  topic: string;
  prompt_template: string;
  allowed_tool_ids: string[];
  escalation_conditions: EscalationCondition[];
  autonomy_level: string;
  is_published: boolean;
}

interface PreviewMessage {
  role: "user" | "assistant";
  content: string;
}

export default function SkillEditorPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const router = useRouter();
  const [skill, setSkill] = useState<SkillData | null>(null);
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Preview
  const [showPreview, setShowPreview] = useState(false);
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>([]);
  const [previewInput, setPreviewInput] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    loadSkill();
    loadTools();
  }, [skillId]);

  async function loadSkill() {
    try {
      const data = await getSkill(skillId);
      setSkill(data);
    } catch {
      router.push("/skills");
    }
  }

  async function loadTools() {
    try {
      setTools(await getTools(WORKSPACE_ID));
    } catch {}
  }

  function update(patch: Partial<SkillData>) {
    if (!skill) return;
    setSkill({ ...skill, ...patch });
    setDirty(true);
  }

  async function handleSave() {
    if (!skill) return;
    setSaving(true);
    try {
      await updateSkill(skill.id, {
        name: skill.name,
        description: skill.description,
        topic: skill.topic,
        prompt_template: skill.prompt_template,
        allowed_tool_ids: skill.allowed_tool_ids,
        escalation_conditions: skill.escalation_conditions,
        autonomy_level: skill.autonomy_level,
        is_published: skill.is_published,
      });
      setDirty(false);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleTool(toolId: string) {
    if (!skill) return;
    const ids = skill.allowed_tool_ids.includes(toolId)
      ? skill.allowed_tool_ids.filter((id) => id !== toolId)
      : [...skill.allowed_tool_ids, toolId];
    update({ allowed_tool_ids: ids });
  }

  function addEscalation() {
    if (!skill) return;
    update({
      escalation_conditions: [
        ...skill.escalation_conditions,
        { condition: "", keywords: [] },
      ],
    });
  }

  function updateEscalation(index: number, patch: Partial<EscalationCondition>) {
    if (!skill) return;
    const conditions = [...skill.escalation_conditions];
    conditions[index] = { ...conditions[index], ...patch };
    update({ escalation_conditions: conditions });
  }

  function removeEscalation(index: number) {
    if (!skill) return;
    update({
      escalation_conditions: skill.escalation_conditions.filter((_, i) => i !== index),
    });
  }

  async function handlePreviewSend() {
    if (!previewInput.trim() || previewLoading) return;
    const msg = previewInput.trim();
    setPreviewInput("");
    setPreviewMessages((prev) => [...prev, { role: "user", content: msg }]);
    setPreviewLoading(true);
    try {
      const res = await previewSkill(skillId, { message: msg });
      setPreviewMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.response },
      ]);
    } catch (e: any) {
      setPreviewMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${e.message}` },
      ]);
    } finally {
      setPreviewLoading(false);
    }
  }

  if (!skill) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/skills")}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Sparkles className="w-5 h-5 text-indigo-600" />
          <span className="font-semibold text-lg">{skill.name}</span>
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              skill.is_published
                ? "bg-green-50 text-green-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {skill.is_published ? "Published" : "Draft"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowPreview(!showPreview);
              setPreviewMessages([]);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border ${
              showPreview
                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Eye className="w-4 h-4" /> Preview
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Editor */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Basic Info */}
          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="font-semibold text-gray-900">Basic Information</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                value={skill.name}
                onChange={(e) => update({ name: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                value={skill.description || ""}
                onChange={(e) => update({ description: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Brief description of what this skill does"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Topic
                <span className="text-gray-400 font-normal ml-1">(keywords for intent matching)</span>
              </label>
              <input
                value={skill.topic}
                onChange={(e) => update({ topic: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="e.g. billing payment invoice charge"
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Autonomy Level</label>
                <select
                  value={skill.autonomy_level}
                  onChange={(e) => update({ autonomy_level: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="full">Full Auto — execute without confirmation</option>
                  <option value="semi">Semi-Auto — confirm irreversible actions</option>
                  <option value="manual">Manual — always ask for confirmation</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skill.is_published}
                    onChange={(e) => update({ is_published: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Published</span>
                </label>
              </div>
            </div>
          </section>

          {/* Prompt Template */}
          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div>
              <h2 className="font-semibold text-gray-900">Prompt Template</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Natural language instructions for the AI. Use {"{{variable}}"} for dynamic values
                (e.g. {"{{customer_email}}"}, {"{{customer_name}}"}).
              </p>
            </div>
            <textarea
              value={skill.prompt_template}
              onChange={(e) => update({ prompt_template: e.target.value })}
              rows={14}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y"
              placeholder={`You are handling a customer inquiry about...\n\n1. First, greet the customer and...\n2. Then, ask them about...\n3. Use the tool to...\n4. Confirm the result with the customer.`}
            />
          </section>

          {/* Allowed Tools */}
          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div>
              <h2 className="font-semibold text-gray-900">Allowed Tools</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Select which tools this skill can use. If none selected, all workspace tools are available.
              </p>
            </div>
            <div className="space-y-2">
              {tools.map((tool) => (
                <label
                  key={tool.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    skill.allowed_tool_ids.includes(tool.id)
                      ? "border-indigo-200 bg-indigo-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={skill.allowed_tool_ids.includes(tool.id)}
                    onChange={() => toggleTool(tool.id)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-sm font-medium">{tool.name}</span>
                    <p className="text-xs text-gray-500">{tool.description}</p>
                  </div>
                </label>
              ))}
              {tools.length === 0 && (
                <p className="text-sm text-gray-400">No tools available in this workspace.</p>
              )}
            </div>
          </section>

          {/* Escalation Conditions */}
          <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Escalation Conditions</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Define when this skill should escalate to a human agent.
                </p>
              </div>
              <button
                onClick={addEscalation}
                className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
            <div className="space-y-3">
              {skill.escalation_conditions.map((cond, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Condition</label>
                      <input
                        value={cond.condition}
                        onChange={(e) => updateEscalation(i, { condition: e.target.value })}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                        placeholder="e.g. Customer disputes a charge over $500"
                      />
                    </div>
                    <button
                      onClick={() => removeEscalation(i)}
                      className="p-1 text-red-400 hover:text-red-600 mt-5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Trigger Keywords
                      <span className="text-gray-400 font-normal ml-1">(comma-separated)</span>
                    </label>
                    <input
                      value={(cond.keywords || []).join(", ")}
                      onChange={(e) =>
                        updateEscalation(i, {
                          keywords: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                      placeholder="e.g. dispute, fraud, unauthorized"
                    />
                  </div>
                </div>
              ))}
              {skill.escalation_conditions.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <AlertTriangle className="w-4 h-4" />
                  No escalation conditions — skill will never auto-escalate.
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Preview Panel */}
        {showPreview && (
          <div className="w-96 border-l border-gray-200 bg-gray-50 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
              <span className="text-sm font-semibold">Preview Mode</span>
              <button
                onClick={() => {
                  setShowPreview(false);
                  setPreviewMessages([]);
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {previewMessages.length === 0 && (
                <div className="text-center text-gray-400 text-sm py-8">
                  Send a test message to preview how this skill responds.
                </div>
              )}
              {previewMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-indigo-600 text-white"
                        : "bg-white border border-gray-200 text-gray-800"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {previewLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-gray-200 bg-white">
              <div className="flex gap-2">
                <input
                  value={previewInput}
                  onChange={(e) => setPreviewInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePreviewSend()}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Type a test message..."
                />
                <button
                  onClick={handlePreviewSend}
                  disabled={previewLoading || !previewInput.trim()}
                  className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
