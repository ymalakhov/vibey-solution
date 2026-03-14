import { Handle, Position } from "@xyflow/react";
import { MessageSquare } from "lucide-react";

export function ResponseNode({ data, selected }: { data: any; selected: boolean }) {
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 min-w-[180px] bg-gray-50 ${
        selected ? "border-gray-600 shadow-lg" : "border-gray-300"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-500 !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare className="w-4 h-4 text-gray-600" />
        <span className="text-sm font-semibold text-gray-800">{data.label || "Response"}</span>
      </div>
      {data.message_template && (
        <p className="text-xs text-gray-500 line-clamp-2">{data.message_template}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-500 !w-3 !h-3" />
    </div>
  );
}
