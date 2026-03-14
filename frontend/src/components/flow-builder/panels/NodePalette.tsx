"use client";

import { DragEvent } from "react";
import {
  Zap,
  MessageCircle,
  Wrench,
  Shield,
  GitBranch,
  MessageSquare,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

const nodeTypes = [
  { type: "trigger", label: "Trigger", icon: Zap, color: "green", description: "Entry point" },
  { type: "question", label: "Question", icon: MessageCircle, color: "blue", description: "Ask for info" },
  { type: "tool", label: "Tool", icon: Wrench, color: "indigo", description: "Call a tool" },
  { type: "guardrail", label: "Guardrail", icon: Shield, color: "amber", description: "Safety check" },
  { type: "condition", label: "Condition", icon: GitBranch, color: "purple", description: "Branch logic" },
  { type: "response", label: "Response", icon: MessageSquare, color: "gray", description: "Send message" },
  { type: "escalation", label: "Escalation", icon: AlertTriangle, color: "red", description: "Human handoff" },
  { type: "skill", label: "Skill", icon: Sparkles, color: "violet", description: "Use a skill" },
];

const colorMap: Record<string, string> = {
  green: "bg-green-50 border-green-200 text-green-700 hover:border-green-400",
  blue: "bg-blue-50 border-blue-200 text-blue-700 hover:border-blue-400",
  indigo: "bg-indigo-50 border-indigo-200 text-indigo-700 hover:border-indigo-400",
  amber: "bg-amber-50 border-amber-200 text-amber-700 hover:border-amber-400",
  purple: "bg-purple-50 border-purple-200 text-purple-700 hover:border-purple-400",
  gray: "bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-400",
  red: "bg-red-50 border-red-200 text-red-700 hover:border-red-400",
  violet: "bg-violet-50 border-violet-200 text-violet-700 hover:border-violet-400",
};

export function NodePalette() {
  function onDragStart(e: DragEvent, nodeType: string) {
    e.dataTransfer.setData("application/reactflow", nodeType);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <div className="w-52 bg-white border-r border-gray-200 p-4 overflow-y-auto">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Node Types
      </h3>
      <div className="space-y-2">
        {nodeTypes.map(({ type, label, icon: Icon, color, description }) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-colors ${colorMap[color]}`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium leading-tight">{label}</p>
              <p className="text-[10px] opacity-70">{description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
