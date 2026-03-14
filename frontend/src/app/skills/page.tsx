"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSkills, createSkill, deleteSkill, updateSkill } from "@/lib/api";
import { Plus, Trash2, Sparkles, ToggleLeft, ToggleRight, Wrench, Zap } from "lucide-react";

const WORKSPACE_ID = "demo";

interface SkillItem {
  id: string;
  name: string;
  description: string | null;
  topic: string;
  autonomy_level: string;
  is_published: boolean;
  tool_count: number;
  created_at: string;
  updated_at: string;
}

const autonomyLabels: Record<string, { label: string; color: string }> = {
  full: { label: "Full Auto", color: "bg-green-50 text-green-700" },
  semi: { label: "Semi-Auto", color: "bg-yellow-50 text-yellow-700" },
  manual: { label: "Manual", color: "bg-gray-100 text-gray-600" },
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const router = useRouter();

  useEffect(() => {
    loadSkills();
  }, []);

  async function loadSkills() {
    try {
      setSkills(await getSkills(WORKSPACE_ID));
    } catch {}
  }

  async function handleCreate() {
    try {
      const skill = await createSkill(WORKSPACE_ID, {
        name: "New Skill",
        topic: "",
        prompt_template: "",
      });
      router.push(`/skills/${skill.id}`);
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this skill?")) return;
    await deleteSkill(id);
    await loadSkills();
  }

  async function handleTogglePublish(skill: SkillItem) {
    await updateSkill(skill.id, { is_published: !skill.is_published });
    await loadSkills();
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Skills</h1>
          <p className="text-sm text-gray-500 mt-1">
            Natural language prompt templates with allowed tools and escalation rules
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
        >
          <Plus className="w-4 h-4" /> Create Skill
        </button>
      </div>

      <div className="space-y-3">
        {skills.map((skill) => (
          <div
            key={skill.id}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-200 transition-colors cursor-pointer"
            onClick={() => router.push(`/skills/${skill.id}`)}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-semibold">{skill.name}</h3>
                  {skill.description && (
                    <p className="text-sm text-gray-500">{skill.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleTogglePublish(skill)}
                  className="p-1"
                  title={skill.is_published ? "Published" : "Draft"}
                >
                  {skill.is_published ? (
                    <ToggleRight className="w-6 h-6 text-green-600" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-gray-400" />
                  )}
                </button>
                <button
                  onClick={() => handleDelete(skill.id)}
                  className="p-1 text-red-400 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              {skill.topic && (
                <span className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded">
                  <Zap className="w-3 h-3" /> {skill.topic}
                </span>
              )}
              <span className={`text-xs px-2 py-1 rounded ${autonomyLabels[skill.autonomy_level]?.color || "bg-gray-100 text-gray-600"}`}>
                {autonomyLabels[skill.autonomy_level]?.label || skill.autonomy_level}
              </span>
              {skill.tool_count > 0 && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Wrench className="w-3 h-3" /> {skill.tool_count} tool{skill.tool_count !== 1 ? "s" : ""}
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded ${skill.is_published ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {skill.is_published ? "Published" : "Draft"}
              </span>
            </div>
          </div>
        ))}

        {skills.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No skills yet. Create one to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
