"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UnifiedChat } from "@/components/unified-chat";
import { ChatSidebar, HomeLanding } from "@/components/chat";
import { HeaderClient } from "@/components/header-client";
import { handleSignOut } from "@/app/actions/auth";
import { useGenerationStore } from "@/stores/use-generation-store";
import { toast } from "sonner";

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

interface User {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface HomeClientProps {
  user: User | null;
}

export function HomeClient({ user }: HomeClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [threads, setThreads] = useState<Thread[]>([]);
  // 从 URL 参数读取 threadId
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>(
    searchParams.get("thread") || undefined
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  // 首页显示状态：无会话时显示首页
  const [showHomeLanding, setShowHomeLanding] = useState(
    !searchParams.get("thread")
  );
  // 预设消息：从首页传入的初始消息
  const [initialMessage, setInitialMessage] = useState<string | undefined>();
  const [initialImages, setInitialImages] = useState<
    { dataUrl: string; mime_type: string }[] | undefined
  >();

  // 当 selectedThreadId 改变时，更新 URL
  useEffect(() => {
    if (selectedThreadId) {
      router.replace(`/?thread=${selectedThreadId}`, { scroll: false });
      setShowHomeLanding(false);
    } else {
      router.replace("/", { scroll: false });
    }
  }, [selectedThreadId, router]);

  // 监听 URL 参数变化（例如浏览器前进后退）
  useEffect(() => {
    const threadParam = searchParams.get("thread");
    if (threadParam !== selectedThreadId) {
      setSelectedThreadId(threadParam || undefined);
    }
  }, [searchParams]);

  // 获取 thread 列表
  const fetchThreads = useCallback(async () => {
    try {
      const response = await fetch("/api/agent/history");
      const data = await response.json();
      if (data.threads) {
        setThreads(data.threads);
        // 验证当前选中的 thread 是否存在于列表中
        const urlThreadId = searchParams.get("thread");
        if (urlThreadId) {
          const existsInList = data.threads.some(
            (t: Thread) => t.id === urlThreadId
          );
          // 如果 URL 中的 thread 不存在，清除选择
          if (!existsInList) {
            setSelectedThreadId(undefined);
          }
        }
      }
    } catch (error) {
      console.error("获取会话列表失败:", error);
      toast.error("获取会话列表失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  }, [searchParams]);

  // 创建新会话 - 直接跳转到首页
  const createNewThread = () => {
    setSelectedThreadId(undefined);
    setShowHomeLanding(true);
    setInitialMessage(undefined);
  };

  // 点击首页按钮
  const handleHomeClick = () => {
    setSelectedThreadId(undefined);
    setShowHomeLanding(true);
    setInitialMessage(undefined);
  };

  // 从首页提交消息
  const handleHomeSubmit = async (
    message: string,
    images?: { dataUrl: string; mime_type: string }[]
  ) => {
    console.log(
      "[HomeClient] handleHomeSubmit 被调用:",
      message,
      "图片数量:",
      images?.length
    );
    // 创建新会话并传入预设消息
    try {
      const response = await fetch("/api/agent/history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "新会话" }),
      });
      const data = await response.json();
      console.log("[HomeClient] 会话创建响应:", data);
      if (data.thread) {
        setThreads((prev) => [data.thread, ...prev]);
        setSelectedThreadId(data.thread.id);
        setShowHomeLanding(false);
        setInitialMessage(message);
        setInitialImages(images);
        console.log(
          "[HomeClient] 状态更新 - threadId:",
          data.thread.id,
          "message:",
          message,
          "images:",
          images?.length
        );
      } else {
        throw new Error("创建会话响应异常");
      }
    } catch (error) {
      console.error("创建新会话失败:", error);
      toast.error("创建新会话失败，请稍后重试");
    }
  };

  // 删除会话
  const deleteThread = async (threadId: string) => {
    setDeletingThreadId(threadId);
    try {
      const response = await fetch(`/api/agent/history/${threadId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // 从列表中移除已删除的thread
        setThreads((prev) => prev.filter((thread) => thread.id !== threadId));

        // 如果删除的是当前选中的thread，清除选择
        if (selectedThreadId === threadId) {
          setSelectedThreadId(undefined);
          setShowHomeLanding(true);
        }
        // 显示成功消息
        toast.success("会话删除成功");
      } else {
        throw new Error("删除失败");
      }
    } catch (error) {
      console.error("删除会话失败:", error);
      toast.error("删除会话失败，请稍后重试");
    } finally {
      setDeletingThreadId(null);
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
        toast.success("重命名成功");
      } else {
        throw new Error("重命名失败");
      }
    } catch (error) {
      console.error("重命名会话失败:", error);
      toast.error("重命名失败，请稍后重试");
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
        toast.success(favorite ? "已收藏" : "已取消收藏");
      } else {
        throw new Error("操作失败");
      }
    } catch (error) {
      console.error("收藏操作失败:", error);
      toast.error("操作失败，请稍后重试");
    }
  };

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const title = showHomeLanding
    ? "Antd Component Generator"
    : selectedThreadId
    ? threads.find((t) => t.id === selectedThreadId)?.title || "会话"
    : "Antd Component Generator";

  const onSignOut = async () => {
    // 清除 Zustand 状态
    useGenerationStore.getState().reset();
    await handleSignOut();
  };

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
          showingHome={showHomeLanding}
          onThreadSelect={(id) => {
            setSelectedThreadId(id);
            setShowHomeLanding(false);
            setInitialMessage(undefined);
          }}
          onNewThread={createNewThread}
          onHomeClick={handleHomeClick}
          onDeleteThread={deleteThread}
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
        <HeaderClient
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          title={title}
          user={user}
          handleSignOut={onSignOut}
        />

        {/* Unified Chat 区域 */}
        <div className="flex-1 overflow-hidden">
          {showHomeLanding ? (
            <HomeLanding onSubmit={handleHomeSubmit} />
          ) : selectedThreadId ? (
            <UnifiedChat
              key={selectedThreadId}
              threadId={selectedThreadId}
              onThreadUpdate={fetchThreads}
              initialMessage={initialMessage}
              initialImages={initialImages}
            />
          ) : (
            <HomeLanding onSubmit={handleHomeSubmit} />
          )}
        </div>
      </div>
    </div>
  );
}
