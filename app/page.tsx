"use client";

import { useState, useEffect, useCallback } from "react";
import { UnifiedChat } from "@/components/unified-chat";
import { ChatSidebar } from "@/components/chat";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface Thread {
  id: string;
  title: string;
  favorite?: boolean;
  createdAt: string;
  updatedAt: string;
  artifact?: {
    _count: {
      versions: number;
    };
  };
}

export default function Home() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>(
    () => {
      // 从 localStorage 恢复选中的会话
      if (typeof window !== "undefined") {
        return localStorage.getItem("selectedThreadId") || undefined;
      }
      return undefined;
    }
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<string | null>(null);
  const { showToast } = useToast();

  // 保存选中的会话到 localStorage
  useEffect(() => {
    if (selectedThreadId) {
      localStorage.setItem("selectedThreadId", selectedThreadId);
    } else {
      localStorage.removeItem("selectedThreadId");
    }
  }, [selectedThreadId]);

  // 获取 thread 列表
  const fetchThreads = useCallback(async () => {
    try {
      const response = await fetch("/api/agent/history");
      const data = await response.json();
      if (data.threads) {
        setThreads(data.threads);
        // 如果没有选中的 thread，或者选中的 thread 不存在于列表中，选择最新的一个
        setSelectedThreadId((currentId) => {
          const existsInList = data.threads.some(
            (t: Thread) => t.id === currentId
          );
          if ((!currentId || !existsInList) && data.threads.length > 0) {
            return data.threads[0].id;
          }
          return currentId;
        });
      }
    } catch (error) {
      console.error("获取会话列表失败:", error);
      showToast("获取会话列表失败，请稍后重试", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  // 创建新会话
  const createNewThread = async () => {
    try {
      const response = await fetch("/api/agent/history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "新会话" }),
      });
      const data = await response.json();
      if (data.thread) {
        setThreads((prev) => [data.thread, ...prev]);
        setSelectedThreadId(data.thread.id);
        showToast("新会话创建成功", "success");
      } else {
        throw new Error("创建会话响应异常");
      }
    } catch (error) {
      console.error("创建新会话失败:", error);
      showToast("创建新会话失败，请稍后重试", "error");
    }
  };

  // 打开删除确认弹窗
  const openDeleteDialog = (threadId: string) => {
    setThreadToDelete(threadId);
    setDeleteDialogOpen(true);
  };

  // 删除会话
  const deleteThread = async () => {
    if (!threadToDelete) return;

    setDeletingThreadId(threadToDelete);
    setDeleteDialogOpen(false);
    try {
      const response = await fetch(`/api/agent/history/${threadToDelete}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // 从列表中移除已删除的thread
        setThreads((prev) =>
          prev.filter((thread) => thread.id !== threadToDelete)
        );

        // 如果删除的是当前选中的thread，清除选择
        if (selectedThreadId === threadToDelete) {
          setSelectedThreadId(undefined);
        }
        // 显示成功消息
        showToast("会话删除成功", "success");
      } else {
        throw new Error("删除失败");
      }
    } catch (error) {
      console.error("删除会话失败:", error);
      showToast("删除会话失败，请稍后重试", "error");
    } finally {
      setDeletingThreadId(null);
      setThreadToDelete(null);
    }
  };

  // 重命名会话
  const renameThread = async (threadId: string, newTitle: string) => {
    try {
      const response = await fetch(`/api/agent/history/${threadId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: newTitle }),
      });

      if (response.ok) {
        // 更新列表中的thread
        setThreads((prev) =>
          prev.map((thread) =>
            thread.id === threadId ? { ...thread, title: newTitle } : thread
          )
        );
        showToast("重命名成功", "success");
      } else {
        throw new Error("重命名失败");
      }
    } catch (error) {
      console.error("重命名会话失败:", error);
      showToast("重命名失败，请稍后重试", "error");
    }
  };

  // 切换收藏状态
  const toggleFavorite = async (threadId: string, favorite: boolean) => {
    try {
      const response = await fetch(`/api/agent/history/${threadId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ favorite }),
      });

      if (response.ok) {
        // 更新列表中的thread
        setThreads((prev) =>
          prev.map((thread) =>
            thread.id === threadId ? { ...thread, favorite } : thread
          )
        );
        showToast(favorite ? "已收藏" : "已取消收藏", "success");
      } else {
        throw new Error("操作失败");
      }
    } catch (error) {
      console.error("收藏操作失败:", error);
      showToast("操作失败，请稍后重试", "error");
    }
  };

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  return (
    <div className="h-screen flex bg-gray-50 overflow-hidden">
      {/* 左侧边栏 */}
      <div
        className={`transition-all duration-300 ${
          sidebarOpen ? "w-80" : "w-0"
        } overflow-hidden flex flex-col absolute md:static z-20 h-full md:h-auto`}
      >
        <ChatSidebar
          threads={threads}
          selectedThreadId={selectedThreadId}
          isLoading={isLoading}
          onThreadSelect={setSelectedThreadId}
          onNewThread={createNewThread}
          onDeleteThread={openDeleteDialog}
          onRenameThread={renameThread}
          onToggleFavorite={toggleFavorite}
          deletingThreadId={deletingThreadId}
        />
      </div>

      {/* 移动端遮罩层 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-10 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 主聊天区域 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 顶部工具栏 */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors md:hidden lg:block"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={
                    sidebarOpen
                      ? "M11 19l-7-7 7-7M2 12h12"
                      : "M4 6h16M4 12h16M4 18h16"
                  }
                />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-gray-900">
              {selectedThreadId
                ? threads.find((t) => t.id === selectedThreadId)?.title ||
                  "会话"
                : "Next LangGraph Demo"}
            </h1>
          </div>

          {/* 移动端菜单按钮 */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors md:hidden"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>

        {/* Unified Chat 区域 */}
        <div className="flex-1 overflow-hidden">
          {selectedThreadId ? (
            <UnifiedChat
              key={selectedThreadId}
              threadId={selectedThreadId}
              onThreadUpdate={fetchThreads}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="text-2xl mb-4">🎯</div>
                <div className="text-lg mb-2">欢迎使用 AI 助手</div>
                <div className="text-sm">
                  选择一个会话开始聊天，或创建新的会话
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 删除确认弹窗 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除会话</DialogTitle>
            <DialogDescription>
              确定要删除这个会话吗？删除后将无法恢复，包括所有聊天记录和生成的代码。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deletingThreadId !== null}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={deleteThread}
              disabled={deletingThreadId !== null}
            >
              {deletingThreadId ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  删除中...
                </>
              ) : (
                "确认删除"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
