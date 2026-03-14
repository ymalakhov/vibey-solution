import { Handle, Position } from "@xyflow/react";
import { Shield } from "lucide-react";

export function GuardrailNode({ data, selected }: { data: any; selected: boolean }) {
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 min-w-[180px] bg-amber-50 ${
        selected ? "border-amber-600 shadow-lg" : "border-amber-300"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-1">
        <Shield className="w-4 h-4 text-amber-600" />
        <span className="text-sm font-semibold text-amber-800">{data.label || "Guardrail"}</span>
      </div>
      {data.condition && (
        <p className="text-xs text-amber-600 line-clamp-2">{data.condition}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-amber-500 !w-3 !h-3" />
    </div>
  );
}
