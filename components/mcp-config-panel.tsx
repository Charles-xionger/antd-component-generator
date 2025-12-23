"use client";

import { useState } from "react";

export interface MCPConfig {
  id: string;
  name: string;
  url: string;
  description: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MCPConfigPanelProps {
  configs: MCPConfig[];
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (id: string | null) => void;
  onRefresh: () => void;
}

interface MCPFormData {
  name: string;
  url: string;
  description: string;
}

export function MCPConfigPanel({
  configs,
  selectedId,
  isLoading,
  onSelect,
  onRefresh,
}: MCPConfigPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<MCPFormData>({
    name: "",
    url: "",
    description: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const resetForm = () => {
    setFormData({ name: "", url: "", description: "" });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleAdd = async () => {
    if (!formData.name.trim() || !formData.url.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/mcp/configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          url: formData.url.trim(),
          description: formData.description.trim() || null,
          enabled: true,
        }),
      });
      if (res.ok) {
        resetForm();
        onRefresh();
      }
    } catch (err) {
      console.error("Failed to add MCP config:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = async (id: string) => {
    if (!formData.name.trim() || !formData.url.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/mcp/configs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          url: formData.url.trim(),
          description: formData.description.trim() || null,
        }),
      });
      if (res.ok) {
        resetForm();
        onRefresh();
      }
    } catch (err) {
      console.error("Failed to update MCP config:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个 MCP 配置吗？")) return;
    try {
      await fetch(`/api/mcp/configs/${id}`, { method: "DELETE" });
      if (selectedId === id) {
        onSelect(null);
      }
      onRefresh();
    } catch (err) {
      console.error("Failed to delete MCP config:", err);
    }
  };

  const startEdit = (config: MCPConfig) => {
    setEditingId(config.id);
    setFormData({
      name: config.name,
      url: config.url,
      description: config.description || "",
    });
    setIsAdding(false);
  };

  const startAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setFormData({ name: "", url: "", description: "" });
  };

  const selectedConfig = configs.find((c) => c.id === selectedId);

  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800">
      {/* 头部 - 选择器 */}
      <div className="flex items-center gap-2 p-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            MCP Server
          </label>
          {isLoading ? (
            <div className="h-8 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          ) : (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <span
                className={
                  selectedConfig
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-500"
                }
              >
                {selectedConfig ? selectedConfig.name : "(不使用 MCP)"}
              </span>
              <svg
                className={`h-4 w-4 text-zinc-400 transition-transform ${
                  isExpanded ? "rotate-180" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}
        </div>
        {/* 管理按钮 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-5 rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="管理配置"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </div>

      {/* 展开的配置管理面板 */}
      {isExpanded && (
        <div className="border-t border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
          {/* 配置列表 */}
          <div className="mb-3 space-y-2">
            {/* 不使用 MCP 选项 */}
            <div
              onClick={() => {
                onSelect(null);
                setIsExpanded(false);
              }}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                !selectedId
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              <div
                className={`h-2 w-2 rounded-full ${
                  !selectedId ? "bg-blue-500" : "bg-zinc-300 dark:bg-zinc-600"
                }`}
              />
              <span>(不使用 MCP)</span>
            </div>

            {/* 配置项列表 */}
            {configs.map((config) => (
              <div key={config.id}>
                {editingId === config.id ? (
                  /* 编辑表单 */
                  <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800">
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="名称"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900"
                      />
                      <input
                        type="text"
                        placeholder="URL (如: http://localhost:3001/sse)"
                        value={formData.url}
                        onChange={(e) =>
                          setFormData({ ...formData, url: e.target.value })
                        }
                        className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900"
                      />
                      <input
                        type="text"
                        placeholder="描述 (可选)"
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            description: e.target.value,
                          })
                        }
                        className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={resetForm}
                          className="rounded px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                        >
                          取消
                        </button>
                        <button
                          onClick={() => handleEdit(config.id)}
                          disabled={
                            isSaving ||
                            !formData.name.trim() ||
                            !formData.url.trim()
                          }
                          className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
                        >
                          {isSaving ? "保存中..." : "保存"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 配置项 */
                  <div
                    className={`group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                      selectedId === config.id
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <div
                      className="flex flex-1 items-center gap-2"
                      onClick={() => {
                        onSelect(config.id);
                        setIsExpanded(false);
                      }}
                    >
                      <div
                        className={`h-2 w-2 rounded-full ${
                          selectedId === config.id
                            ? "bg-blue-500"
                            : "bg-zinc-300 dark:bg-zinc-600"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {config.name}
                        </div>
                        <div className="truncate text-xs text-zinc-400">
                          {config.url}
                        </div>
                      </div>
                    </div>
                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(config);
                        }}
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                        title="编辑"
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(config.id);
                        }}
                        className="rounded p-1 text-zinc-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                        title="删除"
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 添加新配置 */}
          {isAdding ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-800">
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="名称 (如: My MCP Server)"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900"
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="URL (如: http://localhost:3001/sse)"
                  value={formData.url}
                  onChange={(e) =>
                    setFormData({ ...formData, url: e.target.value })
                  }
                  className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900"
                />
                <input
                  type="text"
                  placeholder="描述 (可选)"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={resetForm}
                    className="rounded px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={
                      isSaving || !formData.name.trim() || !formData.url.trim()
                    }
                    className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
                  >
                    {isSaving ? "添加中..." : "添加"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={startAdd}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 py-2 text-xs text-zinc-500 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-zinc-600 dark:hover:border-blue-500 dark:hover:bg-blue-900/20 dark:hover:text-blue-400"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              添加 MCP 配置
            </button>
          )}
        </div>
      )}
    </div>
  );
}
