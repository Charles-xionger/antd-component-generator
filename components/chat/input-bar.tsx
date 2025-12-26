// components/chat/input-bar.tsx
"use client";

import { KeyboardEvent, useState, useRef, useEffect } from "react";
import {
  Send,
  Loader2,
  Code2,
  Settings,
  ChevronDown,
  Plus,
  Trash2,
  Edit,
} from "lucide-react";
import type { MCPConfig } from "@/components/mcp";

interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  isCanvasMode?: boolean;
  placeholder?: string;
  mcpConfigs: MCPConfig[];
  selectedMcpId: string | null;
  isMcpLoading: boolean;
  onMcpSelect: (id: string | null) => void;
  onMcpRefresh: () => void;
}

interface MCPFormData {
  name: string;
  url: string;
  description: string;
}

export function InputBar({
  value,
  onChange,
  onSubmit,
  isLoading,
  isCanvasMode = false,
  placeholder,
  mcpConfigs,
  selectedMcpId,
  isMcpLoading,
  onMcpSelect,
  onMcpRefresh,
}: InputBarProps) {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<MCPFormData>({
    name: "",
    url: "",
    description: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsConfigOpen(false);
        setIsAdding(false);
        setEditingId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading && value.trim()) {
      e.preventDefault();
      onSubmit();
    }
  };

  const resetForm = () => {
    setFormData({ name: "", url: "", description: "" });
    setIsAdding(false);
    setEditingId(null);
  };

  const handleAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setFormData({ name: "", url: "", description: "" });
  };

  const handleEdit = (config: MCPConfig) => {
    setEditingId(config.id);
    setIsAdding(false);
    setFormData({
      name: config.name,
      url: config.url,
      description: config.description || "",
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      const method = editingId ? "PUT" : "POST";
      const url = editingId
        ? `/api/mcp/configs/${editingId}`
        : "/api/mcp/configs";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        resetForm();
        onMcpRefresh();
      }
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/mcp/configs/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        if (selectedMcpId === id) {
          onMcpSelect(null);
        }
        onMcpRefresh();
      }
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const selectedConfig = mcpConfigs.find((c) => c.id === selectedMcpId);
  const defaultPlaceholder = isCanvasMode
    ? "继续编辑或提出新需求..."
    : "输入消息...";

  return (
    <div className="border-t border-gray-200 p-4 dark:border-gray-700">
      <div className="flex items-center gap-2">
        {/* Canvas 模式前缀标签 */}
        {isCanvasMode && (
          <div className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 shrink-0">
            <Code2 className="h-4 w-4" />
            <span>Canvas</span>
          </div>
        )}

        {/* MCP 配置按钮 */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 shrink-0"
          >
            <Settings className="h-4 w-4" />
            <span>{selectedConfig ? selectedConfig.name : "选择 MCP"}</span>
            <ChevronDown className="h-4 w-4" />
          </button>

          {/* MCP 配置下拉菜单 */}
          {isConfigOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-80 rounded-lg border bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800 z-50">
              <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    MCP 配置
                  </h3>
                  <button
                    onClick={handleAdd}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    <Plus className="h-3 w-3" />
                    添加
                  </button>
                </div>

                {/* 配置列表 */}
                {isMcpLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    <button
                      onClick={() => onMcpSelect(null)}
                      className={`w-full text-left px-2 py-1.5 text-xs rounded ${
                        !selectedMcpId
                          ? "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                          : "hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      无 MCP
                    </button>

                    {mcpConfigs.map((config) => (
                      <div
                        key={config.id}
                        className={`flex items-center justify-between px-2 py-1.5 rounded ${
                          config.id === selectedMcpId
                            ? "bg-blue-50 dark:bg-blue-900/30"
                            : "hover:bg-gray-50 dark:hover:bg-gray-700"
                        }`}
                      >
                        <button
                          onClick={() => {
                            onMcpSelect(config.id);
                            setIsConfigOpen(false);
                          }}
                          className="flex-1 text-left"
                        >
                          <div className="text-xs font-medium text-gray-900 dark:text-gray-100">
                            {config.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {config.url}
                          </div>
                        </button>
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            onClick={() => handleEdit(config)}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          >
                            <Edit className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(config.id)}
                            className="p-1 text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 添加/编辑表单 */}
                {(isAdding || editingId) && (
                  <div className="mt-3 pt-3 border-t dark:border-gray-600 space-y-2">
                    <input
                      type="text"
                      placeholder="配置名称"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full px-2 py-1 text-xs border rounded dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    />
                    <input
                      type="text"
                      placeholder="MCP URL"
                      value={formData.url}
                      onChange={(e) =>
                        setFormData({ ...formData, url: e.target.value })
                      }
                      className="w-full px-2 py-1 text-xs border rounded dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    />
                    <input
                      type="text"
                      placeholder="描述（可选）"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      className="w-full px-2 py-1 text-xs border rounded dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSave}
                        disabled={
                          !formData.name.trim() ||
                          !formData.url.trim() ||
                          isSaving
                        }
                        className="flex-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                      >
                        {isSaving ? "保存中..." : editingId ? "更新" : "添加"}
                      </button>
                      <button
                        onClick={resetForm}
                        className="px-2 py-1 text-xs border rounded dark:border-gray-600 text-gray-600 dark:text-gray-400"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 输入框 */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || defaultPlaceholder}
          disabled={isLoading}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400"
        />

        {/* 发送按钮 */}
        <button
          onClick={onSubmit}
          disabled={!value.trim() || isLoading}
          className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">发送中...</span>
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">发送</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
