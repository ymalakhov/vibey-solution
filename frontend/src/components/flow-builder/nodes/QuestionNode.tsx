import { Handle, Position } from "@xyflow/react";
import { MessageCircle } from "lucide-react";

export function QuestionNode({ data, selected }: { data: any; selected: boolean }) {
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 min-w-[180px] bg-blue-50 ${
        selected ? "border-blue-600 shadow-lg" : "border-blue-300"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-1">
        <MessageCircle className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-semibold text-blue-800">{data.label || "Question"}</span>
      </div>
      {data.question_text && (
        <p className="text-xs text-blue-600 line-clamp-2">{data.question_text}</p>
      )}
      {data.variable_name && (
        <p className="text-[10px] text-blue-400 mt-1 font-mono">${"{" + data.variable_name + "}"}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-3 !h-3" />
    </div>
  );
}
