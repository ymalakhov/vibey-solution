"use client";

import { useEffect, useState, useRef } from "react";
import {
  getKnowledgeSources,
  createKnowledgeSource,
  deleteKnowledgeSource,
  syncKnowledgeSource,
  getKnowledgeDocuments,
  addKnowledgeDocument,
  uploadKnowledgeDocument,
  deleteKnowledgeDocument,
  searchKnowledge,
} from "@/lib/api";
import {
  Plus,
  Trash2,
  RefreshCw,
  BookOpen,
  FileText,
  Upload,
  Search,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";

const WORKSPACE_ID = "demo";

interface KnowledgeSource {
  id: string;
  workspace_id: string;
  name: string;
  source_type: string;
  config: Record<string, unknown>;
  is_active: boolean;
  last_synced_at: string | null;
  document_count: number;
  created_at: string;
}

interface KnowledgeDocument {
  id: string;
  source_id: string;
  title: string;
  content: string;
  external_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface SearchResult {
  chunk_id: string;
  content: string;
  heading_path: string | null;
  document_title: string;
  source_name: string;
  score: number;
}

type SourceTab = "notion" | "confluence" | "file";

export default function KnowledgePage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [sourceTab, setSourceTab] = useState<SourceTab>("file");
  const [formName, setFormName] = useState("");
  // Notion config
  const [notionApiKey, setNotionApiKey] = useState("");
  const [notionPageIds, setNotionPageIds] = useState("");
  // Confluence config
  const [confBaseUrl, setConfBaseUrl] = useState("");
  const [confEmail, setConfEmail] = useState("");
  const [confApiToken, setConfApiToken] = useState("");
  const [confSpaceKey, setConfSpaceKey] = useState("");
  // Expanded sources
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, KnowledgeDocument[]>>({});
  // Add document
  const [addDocSource, setAddDocSource] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  // Syncing
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadSourceId, setUploadSourceId] = useState<string | null>(null);

  useEffect(() => {
    loadSources();
  }, []);

  async function loadSources() {
    try {
      setSources(await getKnowledgeSources(WORKSPACE_ID));
    } catch {}
  }

  async function handleCreate() {
    let config: Record<string, unknown> = {};
    if (sourceTab === "notion") {
      config = {
        api_key: notionApiKey,
        page_ids: notionPageIds.split(",").map((s) => s.trim()).filter(Boolean),
      };
    } else if (sourceTab === "confluence") {
      config = {
        base_url: confBaseUrl,
        email: confEmail,
        api_token: confApiToken,
        space_key: confSpaceKey,
      };
    }
    try {
      await createKnowledgeSource(WORKSPACE_ID, {
        name: formName,
        source_type: sourceTab,
        config,
      });
      setShowCreate(false);
      resetForm();
      await loadSources();
    } catch (e: any) {
      alert(e.message);
    }
  }

  function resetForm() {
    setFormName("");
    setNotionApiKey("");
    setNotionPageIds("");
    setConfBaseUrl("");
    setConfEmail("");
    setConfApiToken("");
    setConfSpaceKey("");
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this source and all its documents?")) return;
    await deleteKnowledgeSource(id);
    await loadSources();
  }

  async function handleSync(id: string) {
    setSyncingId(id);
    try {
      await syncKnowledgeSource(id);
      await loadSources();
    } catch (e: any) {
      alert(`Sync failed: ${e.message}`);
    } finally {
      setSyncingId(null);
    }
  }

  async function toggleExpand(sourceId: string) {
    if (expandedSource === sourceId) {
      setExpandedSource(null);
      return;
    }
    setExpandedSource(sourceId);
    try {
      const d = await getKnowledgeDocuments(sourceId);
      setDocs((prev) => ({ ...prev, [sourceId]: d }));
    } catch {}
  }

  async function handleAddDoc(sourceId: string) {
    try {
      await addKnowledgeDocument(sourceId, { title: docTitle, content: docContent });
      setAddDocSource(null);
      setDocTitle("");
      setDocContent("");
      const d = await getKnowledgeDocuments(sourceId);
      setDocs((prev) => ({ ...prev, [sourceId]: d }));
      await loadSources();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleUpload(sourceId: string, file: File) {
    try {
      await uploadKnowledgeDocument(sourceId, file);
      const d = await getKnowledgeDocuments(sourceId);
      setDocs((prev) => ({ ...prev, [sourceId]: d }));
      await loadSources();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleDeleteDoc(docId: string, sourceId: string) {
    if (!confirm("Delete this document?")) return;
    await deleteKnowledgeDocument(docId);
    const d = await getKnowledgeDocuments(sourceId);
    setDocs((prev) => ({ ...prev, [sourceId]: d }));
    await loadSources();
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      setSearchResults(await searchKnowledge(WORKSPACE_ID, searchQuery));
    } catch {}
    setSearching(false);
  }

  const typeBadge = (type: string) => {
    const colors: Record<string, string> = {
      notion: "bg-gray-900 text-white",
      confluence: "bg-blue-600 text-white",
      file: "bg-green-600 text-white",
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded font-medium ${colors[type] || "bg-gray-200"}`}>
        {type}
      </span>
    );
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Knowledge Base</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
        >
          <Plus className="w-4 h-4" /> Add Source
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="font-semibold mb-4">New Knowledge Source</h3>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Product Documentation"
            />
          </div>
          {/* Type tabs */}
          <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
            {(["file", "notion", "confluence"] as SourceTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setSourceTab(tab)}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  sourceTab === tab
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab === "file" ? "File Upload" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          {/* Config based on type */}
          {sourceTab === "notion" && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">API Key</label>
                <input
                  value={notionApiKey}
                  onChange={(e) => setNotionApiKey(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="ntn_..."
                  type="password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Page IDs (comma-separated)</label>
                <input
                  value={notionPageIds}
                  onChange={(e) => setNotionPageIds(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="abc123, def456"
                />
              </div>
            </div>
          )}
          {sourceTab === "confluence" && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Base URL</label>
                <input
                  value={confBaseUrl}
                  onChange={(e) => setConfBaseUrl(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="https://yoursite.atlassian.net/wiki"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    value={confEmail}
                    onChange={(e) => setConfEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">API Token</label>
                  <input
                    value={confApiToken}
                    onChange={(e) => setConfApiToken(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    type="password"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Space Key</label>
                <input
                  value={confSpaceKey}
                  onChange={(e) => setConfSpaceKey(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="DOCS"
                />
              </div>
            </div>
          )}
          {sourceTab === "file" && (
            <p className="text-sm text-gray-500">
              Create the source first, then add documents via markdown text or .md file upload.
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleCreate}
              disabled={!formName}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              Create Source
            </button>
            <button
              onClick={() => { setShowCreate(false); resetForm(); }}
              className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Source list */}
      <div className="space-y-3">
        {sources.map((source) => (
          <div key={source.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between">
              <div
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => toggleExpand(source.id)}
              >
                {expandedSource === source.id ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-semibold">{source.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {typeBadge(source.source_type)}
                    <span className="text-xs text-gray-500">
                      {source.document_count} doc{source.document_count !== 1 ? "s" : ""}
                    </span>
                    {source.last_synced_at && (
                      <span className="text-xs text-gray-400">
                        Synced: {new Date(source.last_synced_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {source.source_type !== "file" && (
                  <button
                    onClick={() => handleSync(source.id)}
                    disabled={syncingId === source.id}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${syncingId === source.id ? "animate-spin" : ""}`} />
                    Sync Now
                  </button>
                )}
                <button
                  onClick={() => handleDelete(source.id)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            </div>

            {/* Expanded: documents */}
            {expandedSource === source.id && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">Documents</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAddDocSource(addDocSource === source.id ? null : source.id)}
                      className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100"
                    >
                      <Plus className="w-3 h-3 inline mr-1" /> Add Markdown
                    </button>
                    <button
                      onClick={() => { setUploadSourceId(source.id); fileInputRef.current?.click(); }}
                      className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100"
                    >
                      <Upload className="w-3 h-3 inline mr-1" /> Upload .md
                    </button>
                  </div>
                </div>

                {/* Add doc form */}
                {addDocSource === source.id && (
                  <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                    <input
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm mb-2"
                      placeholder="Document title"
                    />
                    <textarea
                      value={docContent}
                      onChange={(e) => setDocContent(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono h-32"
                      placeholder="# Markdown content..."
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleAddDoc(source.id)}
                        disabled={!docTitle || !docContent}
                        className="px-3 py-1 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Add Document
                      </button>
                      <button
                        onClick={() => { setAddDocSource(null); setDocTitle(""); setDocContent(""); }}
                        className="px-3 py-1 bg-gray-200 text-xs rounded-lg hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Document list */}
                <div className="space-y-2">
                  {(docs[source.id] || []).map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">{doc.title}</span>
                        <span className="text-xs text-gray-400">
                          {doc.content.length} chars
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteDoc(doc.id, source.id)}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {docs[source.id]?.length === 0 && (
                    <p className="text-sm text-gray-400 py-2">No documents yet</p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {sources.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No knowledge sources yet. Add one to get started.</p>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadSourceId) {
            handleUpload(uploadSourceId, file);
          }
          e.target.value = "";
        }}
      />

      {/* Search test panel */}
      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Search className="w-5 h-5 text-indigo-600" />
          Test Knowledge Search
        </h3>
        <div className="flex gap-2 mb-4">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Search knowledge base..."
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="space-y-3">
            {searchResults.map((r) => (
              <div key={r.chunk_id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-indigo-700">
                    {r.document_title}
                  </span>
                  {r.heading_path && (
                    <span className="text-xs text-gray-400">{r.heading_path}</span>
                  )}
                  <span className="text-xs text-gray-300 ml-auto">
                    Score: {r.score.toFixed(2)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">
                  {r.content}
                </p>
                <span className="text-xs text-gray-400 mt-1 block">
                  Source: {r.source_name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
