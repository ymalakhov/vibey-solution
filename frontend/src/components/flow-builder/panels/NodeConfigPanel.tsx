"use client";

import { Node } from "@xyflow/react";

interface Props {
  node: Node | null;
  tools: { id: string; name: string }[];
  onUpdate: (nodeId: string, data: any) => void;
}

export function NodeConfigPanel({ node, tools, onUpdate }: Props) {
  if (!node) {
    return (
      <div className="w-72 bg-white border-l border-gray-200 p-4 flex items-center justify-center">
        <p className="text-sm text-gray-400">Select a node to configure</p>
      </div>
    );
  }

  const data = node.data as Record<string, any>;

  function update(field: string, value: any) {
    onUpdate(node!.id, { ...data, [field]: value });
  }

  return (
    <div className="w-72 bg-white border-l border-gray-200 p-4 overflow-y-auto">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Configure: {node.type}
      </h3>

      {/* Common fields */}
      <Field label="Label">
        <input
          value={(data.label as string) || ""}
          onChange={(e) => update("label", e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
        />
      </Field>

      {/* Trigger */}
      {node.type === "trigger" && (
        <>
          <Field label="Description">
            <input
              value={(data.description as string) || ""}
              onChange={(e) => update("description", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
          </Field>
          <Field label="Intents (comma-separated)">
            <input
              value={((data.intents as string[]) || []).join(", ")}
              onChange={(e) =>
                update(
                  "intents",
                  e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean)
                )
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              placeholder="refund, money back"
            />
          </Field>
        </>
      )}

      {/* Question */}
      {node.type === "question" && (
        <>
          <Field label="Question Text">
            <textarea
              value={(data.question_text as string) || ""}
              onChange={(e) => update("question_text", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm h-20"
            />
          </Field>
          <Field label="Variable Name">
            <input
              value={(data.variable_name as string) || ""}
              onChange={(e) => update("variable_name", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono"
              placeholder="order_id"
            />
          </Field>
          <Field label="Validation">
            <input
              value={(data.validation as string) || ""}
              onChange={(e) => update("validation", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              placeholder="e.g. non-empty, email"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm mt-2">
            <input
              type="checkbox"
              checked={data.required !== false}
              onChange={(e) => update("required", e.target.checked)}
            />
            Required
          </label>
        </>
      )}

      {/* Tool */}
      {node.type === "tool" && (
        <>
          <Field label="Tool">
            <select
              value={(data.tool_id as string) || ""}
              onChange={(e) => update("tool_id", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">Select tool...</option>
              {tools.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Input Mapping (JSON)">
            <textarea
              value={JSON.stringify(data.input_mapping || {}, null, 2)}
              onChange={(e) => {
                try {
                  update("input_mapping", JSON.parse(e.target.value));
                } catch {}
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono h-20"
            />
          </Field>
        </>
      )}

      {/* Guardrail */}
      {node.type === "guardrail" && (
        <>
          <Field label="Check Type">
            <input
              value={(data.check_type as string) || ""}
              onChange={(e) => update("check_type", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              placeholder="e.g. amount_limit"
            />
          </Field>
          <Field label="Condition">
            <textarea
              value={(data.condition as string) || ""}
              onChange={(e) => update("condition", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm h-16"
            />
          </Field>
          <Field label="Fail Message">
            <textarea
              value={(data.fail_message as string) || ""}
              onChange={(e) => update("fail_message", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm h-16"
            />
          </Field>
          <Field label="On Fail Action">
            <select
              value={(data.on_fail_action as string) || "block"}
              onChange={(e) => update("on_fail_action", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="block">Block</option>
              <option value="escalate">Escalate</option>
              <option value="warn">Warn</option>
            </select>
          </Field>
        </>
      )}

      {/* Condition */}
      {node.type === "condition" && (
        <>
          <Field label="Variable">
            <input
              value={(data.variable as string) || ""}
              onChange={(e) => update("variable", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-mono"
              placeholder="order_id"
            />
          </Field>
          <Field label="Operator">
            <select
              value={(data.operator as string) || "equals"}
              onChange={(e) => update("operator", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="equals">equals</option>
              <option value="not_equals">not equals</option>
              <option value="contains">contains</option>
              <option value="greater_than">greater than</option>
              <option value="less_than">less than</option>
            </select>
          </Field>
          <Field label="Value">
            <input
              value={(data.value as string) || ""}
              onChange={(e) => update("value", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
          </Field>
        </>
      )}

      {/* Response */}
      {node.type === "response" && (
        <>
          <Field label="Message Template">
            <textarea
              value={(data.message_template as string) || ""}
              onChange={(e) => update("message_template", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm h-20"
              placeholder="Your refund for order {{order_id}} has been processed."
            />
          </Field>
          <Field label="AI Instructions">
            <textarea
              value={(data.ai_instructions as string) || ""}
              onChange={(e) => update("ai_instructions", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm h-16"
            />
          </Field>
        </>
      )}

      {/* Escalation */}
      {node.type === "escalation" && (
        <>
          <Field label="Reason">
            <textarea
              value={(data.reason as string) || ""}
              onChange={(e) => update("reason", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm h-16"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm mt-2">
            <input
              type="checkbox"
              checked={!!data.generate_summary}
              onChange={(e) => update("generate_summary", e.target.checked)}
            />
            Generate summary
          </label>
          <Field label="Priority Override">
            <select
              value={(data.priority_override as string) || ""}
              onChange={(e) => update("priority_override", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            >
              <option value="">No override</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
          <Field label="Handoff Notes Template">
            <textarea
              value={(data.handoff_notes_template as string) || ""}
              onChange={(e) => update("handoff_notes_template", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm h-16"
              placeholder="Customer needs help with {{order_id}}"
            />
          </Field>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
