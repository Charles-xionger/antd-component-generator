"use client";

import { useChat, Message } from "@/hooks/use-chat";
import { useState, useEffect, useCallback } from "react";
import { MCPConfigPanel, MCPConfig } from "@/components/mcp-config-panel";

interface Thread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export default function Home() {
  const {
    messages,
    input,
    isLoading,
    setInput,
    handleSubmit,
    resetChat,
    switchThread,
    setMcpConfigId,
  } = useChat();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [mcpConfigs, setMcpConfigs] = useState<MCPConfig[]>([]);
  const [selectedMcpId, setSelectedMcpId] = useState<string | null>(null);
  const [isLoadingMcp, setIsLoadingMcp] = useState(false);

  // 获取会话列表
  const fetchThreads = useCallback(async () => {
    setIsLoadingThreads(true);
    try {
      const res = await fetch("/api/agent/history");
      const data = await res.json();
      setThreads(data.threads || []);
    } catch (error) {
      console.error("Failed to fetch threads:", error);
    } finally {
      setIsLoadingThreads(false);
    }
  }, []);

  // 初始加载会话列表
  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // 加载 MCP 配置
  const fetchMcpConfigs = useCallback(async () => {
    setIsLoadingMcp(true);
    try {
      const res = await fetch("/api/mcp/configs");
      const data = await res.json();
      setMcpConfigs(data.configs || []);
    } catch (err) {
      console.error("Failed to fetch MCP configs:", err);
    } finally {
      setIsLoadingMcp(false);
    }
  }, []);

  useEffect(() => {
    fetchMcpConfigs();
  }, [fetchMcpConfigs]);

  // 切换会话
  const handleSwitchThread = async (thread: Thread) => {
    setActiveThreadId(thread.id);
    try {
      const res = await fetch(`/api/agent/history/${thread.id}`);
      const data = await res.json();

      // 将消息转换为 Message 格式
      const formattedMessages: Message[] = (data.messages || [])
        .filter(
          (msg: { type: string }) => msg.type === "human" || msg.type === "ai"
        )
        .map((msg: { type: string; content: string }) => ({
          role: msg.type === "human" ? "user" : "assistant",
          content:
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content),
        }));

      switchThread(thread.id, formattedMessages);
    } catch (error) {
      console.error("Failed to load thread messages:", error);
    }
  };

  // 创建新会话
  const handleNewChat = async () => {
    resetChat();
    setActiveThreadId(null);

    // 创建新的 thread 记录
    try {
      const res = await fetch("/api/agent/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "新会话" }),
      });
      const data = await res.json();
      if (data.thread) {
        setThreads((prev) => [data.thread, ...prev]);
        setActiveThreadId(data.thread.id);
        switchThread(data.thread.id, []);
      }
    } catch (error) {
      console.error("Failed to create thread:", error);
    }
  };

  // 删除会话
  const handleDeleteThread = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    try {
      await fetch(`/api/agent/history/${threadId}`, { method: "DELETE" });
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadId === threadId) {
        resetChat();
        setActiveThreadId(null);
      }
    } catch (error) {
      console.error("Failed to delete thread:", error);
    }
  };

  return (
    <div className="flex h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* 侧边栏 */}
      <aside
        className={`${
          isSidebarOpen ? "w-64" : "w-0"
        } flex flex-col border-r border-zinc-200 bg-white transition-all duration-300 dark:border-zinc-800 dark:bg-zinc-950`}
      >
        {isSidebarOpen && (
          <>
            {/* 新建会话按钮 */}
            <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
              <button
                onClick={handleNewChat}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                新建会话
              </button>
            </div>

            {/* MCP 配置选择 */}
            <MCPConfigPanel
              configs={mcpConfigs}
              selectedId={selectedMcpId}
              isLoading={isLoadingMcp}
              onSelect={(id) => {
                setSelectedMcpId(id);
                setMcpConfigId(id);
              }}
              onRefresh={fetchMcpConfigs}
            />

            {/* 会话列表 */}
            <div className="flex-1 overflow-y-auto p-2">
              {isLoadingThreads ? (
                <p className="py-4 text-center text-sm text-zinc-500">
                  加载中...
                </p>
              ) : threads.length === 0 ? (
                <p className="py-4 text-center text-sm text-zinc-500">
                  暂无会话记录
                </p>
              ) : (
                <div className="space-y-1">
                  {threads.map((thread) => (
                    <div
                      key={thread.id}
                      onClick={() => handleSwitchThread(thread)}
                      className={`group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                        activeThreadId === thread.id
                          ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <span className="truncate">{thread.title}</span>
                      <button
                        onClick={(e) => handleDeleteThread(e, thread.id)}
                        className="hidden rounded p-1 text-zinc-400 hover:bg-zinc-300 hover:text-zinc-600 group-hover:block dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </aside>

      {/* 主内容区 */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <svg
              className="h-5 w-5"
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
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            LangGraph Agent Demo
          </h1>
          <div className="w-9" /> {/* 占位符保持标题居中 */}
        </header>

        <main className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.length === 0 && (
              <p className="text-center text-zinc-500 dark:text-zinc-400">
                发送消息开始对话
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`rounded-lg p-3 ${
                  msg.role === "user"
                    ? "ml-auto max-w-[80%] bg-blue-500 text-white"
                    : "mr-auto max-w-[80%] bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.content === "" && (
              <div className="mr-auto max-w-[80%] rounded-lg bg-zinc-200 p-3 dark:bg-zinc-800">
                <span className="animate-pulse text-zinc-500">思考中...</span>
              </div>
            )}
          </div>
        </main>

        <footer className="border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex max-w-2xl gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入消息..."
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="rounded-lg bg-blue-500 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              发送
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
