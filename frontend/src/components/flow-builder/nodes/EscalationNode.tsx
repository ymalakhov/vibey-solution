import { Handle, Position } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";

export function EscalationNode({ data, selected }: { data: any; selected: boolean }) {
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 min-w-[180px] bg-red-50 ${
        selected ? "border-red-600 shadow-lg" : "border-red-300"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-red-500 !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="w-4 h-4 text-red-600" />
        <span className="text-sm font-semibold text-red-800">{data.label || "Escalation"}</span>
      </div>
      {data.reason && (
        <p className="text-xs text-red-600 line-clamp-2">{data.reason}</p>
      )}
      {data.generate_summary && (
        <p className="text-[10px] text-red-400 mt-1">Auto-generates summary</p>
      )}
    </div>
  );
}
