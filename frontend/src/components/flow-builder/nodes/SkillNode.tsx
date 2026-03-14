import { Handle, Position } from "@xyflow/react";
import { Sparkles } from "lucide-react";

export function SkillNode({ data, selected }: { data: any; selected: boolean }) {
  return (
    <div
      className={`bg-violet-50 border-2 rounded-xl px-4 py-3 min-w-[180px] ${
        selected ? "border-violet-500 shadow-lg" : "border-violet-200"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-violet-500" />
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-violet-600" />
        <span className="text-sm font-semibold text-violet-900">
          {data.label || "Skill"}
        </span>
      </div>
      {data.skill_name && (
        <p className="text-xs text-violet-600 truncate">{data.skill_name}</p>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-violet-500" />
    </div>
  );
}
