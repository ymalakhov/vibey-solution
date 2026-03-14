import { Handle, Position } from "@xyflow/react";
import { GitBranch } from "lucide-react";

export function ConditionNode({ data, selected }: { data: any; selected: boolean }) {
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 min-w-[180px] bg-purple-50 ${
        selected ? "border-purple-600 shadow-lg" : "border-purple-300"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-3 !h-3" />
      <div className="flex items-center gap-2 mb-1">
        <GitBranch className="w-4 h-4 text-purple-600" />
        <span className="text-sm font-semibold text-purple-800">{data.label || "Condition"}</span>
      </div>
      {data.variable && (
        <p className="text-xs text-purple-600">
          {data.variable} {data.operator} {data.value}
        </p>
      )}
      <div className="flex justify-between mt-2">
        <div className="relative">
          <Handle
            type="source"
            position={Position.Bottom}
            id="yes"
            className="!bg-green-500 !w-3 !h-3 !left-2"
          />
          <span className="text-[10px] text-green-600 ml-1">Yes</span>
        </div>
        <div className="relative">
          <Handle
            type="source"
            position={Position.Bottom}
            id="no"
            className="!bg-red-500 !w-3 !h-3 !left-auto !right-2"
          />
          <span className="text-[10px] text-red-600 mr-1">No</span>
        </div>
      </div>
    </div>
  );
}
