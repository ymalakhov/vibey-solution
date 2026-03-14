import { Handle, Position } from "@xyflow/react";
import { Wrench } from "lucide-react";

export function ToolNode({ data, selected }: { data: any; selected: boolean }) {
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 min-w-[180px] bg-indigo-50 ${
        selected ? "border-indigo-600 shadow-lg" : "border-indigo-300"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-indigo-500 !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-1">
        <Wrench className="w-4 h-4 text-indigo-600" />
        <span className="text-sm font-semibold text-indigo-800">{data.label || "Tool"}</span>
      </div>
      {data.tool_id && (
        <p className="text-[10px] text-indigo-400 font-mono">tool: {data.tool_id}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-indigo-500 !w-3 !h-3" />
    </div>
  );
}
