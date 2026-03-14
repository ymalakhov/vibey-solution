"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { LayoutDashboard, MessageSquare, Wrench, BarChart3, Settings, Bot, GitBranch, BookOpen, Sparkles } from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chats", label: "Chats", icon: MessageSquare },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/flows", label: "Flows", icon: GitBranch },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/skills", label: "Skills", icon: Sparkles },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-5 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Bot className="w-7 h-7 text-indigo-600" />
          <span className="text-lg font-bold text-indigo-600">SupportAI</span>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              pathname === href || pathname.startsWith(href + "/")
                ? "bg-indigo-50 text-indigo-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            )}
          >
            <Icon className="w-5 h-5" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-bold">
            A
          </div>
          <div>
            <p className="text-sm font-medium">Agent</p>
            <p className="text-xs text-gray-500">Online</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
