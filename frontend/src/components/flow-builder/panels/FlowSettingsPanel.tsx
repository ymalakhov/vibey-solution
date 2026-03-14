"use client";

interface FlowSettings {
  name: string;
  description: string;
  trigger_intents: string[];
  is_active: boolean;
  priority: number;
}

interface Props {
  settings: FlowSettings;
  onUpdate: (settings: Partial<FlowSettings>) => void;
}

export function FlowSettingsPanel({ settings, onUpdate }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Flow Name</label>
        <input
          value={settings.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
        <textarea
          value={settings.description || ""}
          onChange={(e) => onUpdate({ description: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm h-16"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Trigger Intents (comma-separated)
        </label>
        <input
          value={settings.trigger_intents.join(", ")}
          onChange={(e) =>
            onUpdate({
              trigger_intents: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          placeholder="refund, money back"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
        <input
          type="number"
          value={settings.priority}
          onChange={(e) => onUpdate({ priority: parseInt(e.target.value) || 0 })}
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.is_active}
          onChange={(e) => onUpdate({ is_active: e.target.checked })}
        />
        Active
      </label>
    </div>
  );
}
