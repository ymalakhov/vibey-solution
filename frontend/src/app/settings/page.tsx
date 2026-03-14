"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

const WORKSPACE_ID = "demo";

export default function SettingsPage() {
  const [config, setConfig] = useState({
    brand_color: "#6366F1",
    position: "bottom-right",
    theme: "light",
    greeting: "Привіт! Чим можу допомогти?",
    language: "uk",
    collect_email: true,
    auto_open_delay: 30,
  });
  const [copied, setCopied] = useState(false);

  const widgetCode = `<script\n  src="${typeof window !== "undefined" ? window.location.origin : ""}/widget.js"\n  data-workspace="${WORKSPACE_ID}"\n  data-theme="${config.theme}"\n  data-position="${config.position}"\n  data-color="${config.brand_color}"\n></script>`;

  function copyCode() {
    navigator.clipboard.writeText(widgetCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Widget settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="font-semibold mb-4">Widget Appearance</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Brand Color</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={config.brand_color}
                onChange={(e) => setConfig({ ...config, brand_color: e.target.value })}
                className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
              />
              <input
                value={config.brand_color}
                onChange={(e) => setConfig({ ...config, brand_color: e.target.value })}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Position</label>
            <select
              value={config.position}
              onChange={(e) => setConfig({ ...config, position: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="bottom-right">Bottom Right</option>
              <option value="bottom-left">Bottom Left</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Theme</label>
            <select
              value={config.theme}
              onChange={(e) => setConfig({ ...config, theme: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Language</label>
            <select
              value={config.language}
              onChange={(e) => setConfig({ ...config, language: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="uk">Ukrainian</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">Greeting Message</label>
          <input
            value={config.greeting}
            onChange={(e) => setConfig({ ...config, greeting: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-4 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.collect_email}
              onChange={(e) => setConfig({ ...config, collect_email: e.target.checked })}
            />
            Collect email before chat
          </label>
        </div>
      </div>

      {/* Embed code */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold mb-4">Install Widget</h3>
        <p className="text-sm text-gray-500 mb-3">
          Add this code before the closing &lt;/body&gt; tag on your website:
        </p>
        <div className="relative">
          <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-sm overflow-x-auto">
            {widgetCode}
          </pre>
          <button
            onClick={copyCode}
            className="absolute top-2 right-2 p-2 bg-gray-700 rounded-lg hover:bg-gray-600 text-gray-300"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
