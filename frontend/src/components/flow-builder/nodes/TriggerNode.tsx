import { Handle, Position } from "@xyflow/react";
import { Zap } from "lucide-react";

export function TriggerNode({ data, selected }: { data: any; selected: boolean }) {
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 min-w-[180px] bg-green-50 ${
        selected ? "border-green-600 shadow-lg" : "border-green-300"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Zap className="w-4 h-4 text-green-600" />
        <span className="text-sm font-semibold text-green-800">{data.label || "Trigger"}</span>
      </div>
      {data.description && (
        <p className="text-xs text-green-600">{data.description}</p>
      )}
      {data.intents?.length > 0 && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {data.intents.map((intent: string) => (
            <span key={intent} className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
              {intent}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-green-500 !w-3 !h-3" />
    </div>
  );
}
