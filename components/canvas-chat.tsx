// components/canvas-chat.tsx
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useArtifactParser } from "@/hooks/use-artifact-parser";

interface Message {
  id: string;
  type: "human" | "ai";
  content: string;
  isCollapsed?: boolean; // AI 消息是否折叠
}

interface CanvasChatProps {
  threadId?: string;
  onThreadUpdate?: () => void;
}

// 版本相关的类型定义
interface ArtifactVersion {
  id: string;
  versionNumber: number;
  description: string;
  createdAt: string;
  files: {
    path: string;
    content: string;
  }[];
}

// 文件图标组件
function FileIcon({ language }: { language: string }) {
  const getIconColor = () => {
    switch (language) {
      case "typescript":
      case "tsx":
        return "text-blue-400";
      case "javascript":
      case "jsx":
        return "text-yellow-400";
      case "css":
      case "scss":
        return "text-blue-300";
      case "html":
        return "text-orange-400";
      case "json":
        return "text-green-400";
      default:
        return "text-gray-400";
    }
  };

  return (
    <svg
      className={`w-3 h-3 ${getIconColor()}`}
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path d="M4 3a2 2 0 00-2 2v1.5h16V5a2 2 0 00-2-2H4z" />
      <path
        fillRule="evenodd"
        d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function CanvasChat({
  threadId: initialThreadId,
  onThreadUpdate,
}: CanvasChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState(initialThreadId);
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  // 沙箱相关状态
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isSandboxReady, setIsSandboxReady] = useState(false);
  const [sandboxError, setSandboxError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  // 防重复发送的引用
  const isSendingRef = useRef(false);
  const lastMessageRef = useRef<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRenderedArtifactRef = useRef<string | null>(null); // 跟踪已渲染的 artifact

  // 版本管理相关状态
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [showVersionPanel, setShowVersionPanel] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // 使用新的 artifact 解析 hook
  const { artifact, selectedFile, selectFile } =
    useArtifactParser(generatedCode);

  // 消息展开/折叠状态
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
    new Set()
  );

  // 切换消息展开/折叠状态
  const toggleMessageExpansion = useCallback((messageId: string) => {
    setExpandedMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  }, []);

  // 沙箱消息监听
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, payload } = event.data;

      switch (type) {
        case "IFRAME_LOADED":
          setIsSandboxReady(true);
          setSandboxError(null);
          console.log("沙箱已就绪");
          break;

        case "artifacts-success":
          setIsRendering(false);
          setSandboxError(null);
          console.log("渲染成功");
          break;

        case "artifacts-error":
          setIsRendering(false);
          setSandboxError(payload.errorMessage);
          console.error("渲染失败:", payload.errorMessage);
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // 发送代码到沙箱
  const sendToSandbox = useCallback(() => {
    if (
      !isSandboxReady ||
      !artifact ||
      !artifact.files.length ||
      !iframeRef.current?.contentWindow
    ) {
      return;
    }

    // 防止重复渲染同一个 artifact
    const artifactId = artifact.id;
    if (lastRenderedArtifactRef.current === artifactId) {
      console.log("跳过重复渲染:", artifactId);
      return;
    }

    console.log("开始渲染:", artifactId);
    lastRenderedArtifactRef.current = artifactId;

    // 转换文件格式，只使用文件名（不包含路径）
    const files: Record<string, string> = {};
    artifact.files.forEach((file) => {
      // 提取文件名，移除路径
      const fileName = file.path.split("/").pop() || file.path;
      files[fileName] = file.content;
    });

    // 找到入口文件：优先App.tsx，然后任何.tsx文件，避免选择.ts Hook文件
    const entryFileName = (() => {
      // 1. 优先选择 App.tsx
      const appFile = artifact.files.find((f) => f.path.includes("App.tsx"));
      if (appFile) {
        return appFile.path.split("/").pop() || "App.tsx";
      }

      // 2. 选择任何 .tsx 组件文件（排除 .ts Hook文件）
      const componentFile = artifact.files.find(
        (f) => f.path.endsWith(".tsx") && !f.path.toLowerCase().includes("use")
      );
      if (componentFile) {
        return componentFile.path.split("/").pop() || "App.tsx";
      }

      // 3. fallback：第一个 .tsx 文件
      const tsxFile = artifact.files.find((f) => f.path.endsWith(".tsx"));
      if (tsxFile) {
        return tsxFile.path.split("/").pop() || "App.tsx";
      }

      // 4. 最后的fallback
      return "App.tsx";
    })();

    setIsRendering(true);
    setSandboxError(null);

    console.log("发送到沙箱的文件:", Object.keys(files));
    console.log("入口文件:", entryFileName);

    iframeRef.current.contentWindow.postMessage(
      {
        type: "artifacts",
        payload: { files, entryFile: entryFileName },
      },
      "*"
    );
  }, [isSandboxReady, artifact]);

  // 获取版本历史
  const fetchVersionHistory = useCallback(async () => {
    if (!threadId) return;

    setIsLoadingVersions(true);
    try {
      const response = await fetch(`/api/agent/history/${threadId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.artifact && data.artifact.versions) {
          setVersions(data.artifact.versions);
          // 默认选中最新版本
          if (data.artifact.versions.length > 0) {
            const latestVersion = data.artifact.versions[0];
            setSelectedVersion(latestVersion.versionNumber);

            // 立即生成最新版本的代码XML
            const filesXml = latestVersion.files
              .map(
                (file: HistoryFile) =>
                  `<boltAction type="file" filePath="${file.path}">\n${file.content}\n</boltAction>`
              )
              .join("\n");
            const versionXml = `<boltArtifact id="version-${latestVersion.versionNumber}" title="Version ${latestVersion.versionNumber}">\n${filesXml}\n</boltArtifact>`;
            setGeneratedCode(versionXml);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch version history:", error);
    } finally {
      setIsLoadingVersions(false);
    }
  }, [threadId]);

  interface HistoryFile {
    id: string;
    path: string;
    content: string;
  }

  interface LangGraphMessage {
    id: string;
    type: string;
    content: string;
  }

  // 获取历史消息
  const fetchHistoryMessages = useCallback(async () => {
    if (!threadId) {
      setMessages([]);
      return;
    }

    try {
      const response = await fetch(`/api/agent/history/${threadId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.messages && data.messages.length > 0) {
          // 将LangGraph消息转换为组件需要的格式
          const formattedMessages: Message[] = data.messages
            .filter(
              (msg: LangGraphMessage) =>
                msg.type === "human" || msg.type === "ai"
            )
            .map((msg: LangGraphMessage, index: number) => ({
              id: msg.id || index.toString(),
              type: msg.type === "human" ? "human" : "ai",
              content: msg.content || "",
            }));
          setMessages(formattedMessages);
        } else {
          setMessages([]);
        }
      }
    } catch (error) {
      console.error("Failed to fetch history messages:", error);
      setMessages([]);
    }
  }, [threadId]);

  // 选择版本并更新代码
  const selectVersion = useCallback(
    (versionNumber: number) => {
      const version = versions.find((v) => v.versionNumber === versionNumber);
      if (version) {
        setSelectedVersion(versionNumber);
        // 构造版本代码的XML格式
        const filesXml = version.files
          .map(
            (file) =>
              `<boltAction type="file" filePath="${file.path}">\n${file.content}\n</boltAction>`
          )
          .join("\n");
        const versionXml = `<boltArtifact id="version-${versionNumber}" title="Version ${versionNumber}">\n${filesXml}\n</boltArtifact>`;
        setGeneratedCode(versionXml);
      }
    },
    [versions]
  );

  // 当props中的threadId变化时更新内部状态
  useEffect(() => {
    setThreadId(initialThreadId);
  }, [initialThreadId]);

  // 当threadId变化时获取版本历史和消息历史
  useEffect(() => {
    if (threadId) {
      fetchVersionHistory();
      fetchHistoryMessages();
    } else {
      setMessages([]);
      setVersions([]);
      lastRenderedArtifactRef.current = null; // 重置渲染记录
    }
  }, [threadId, fetchVersionHistory, fetchHistoryMessages]);

  // 复制代码到剪贴板
  const copyToClipboard = async (content: string, fileName: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedFile(fileName);
      setTimeout(() => setCopiedFile(null), 2000); // 2秒后清除复制提示
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const sendMessage = async () => {
    // 防重复发送检查
    if (!input.trim() || isLoading || isSendingRef.current) {
      return;
    }

    const currentInput = input.trim();

    // 检查是否与上一条消息相同
    if (currentInput === lastMessageRef.current) {
      console.log("检测到重复消息，跳过发送");
      return;
    }

    // 设置发送状态
    isSendingRef.current = true;
    lastMessageRef.current = currentInput;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "human",
      content: currentInput,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // 取消之前的请求（如果存在）
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // 创建新的控制器
      abortControllerRef.current = new AbortController();

      const response = await fetch("/api/agent/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: currentInput,
          threadId,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      let aiMessage = "";
      let currentThreadId = threadId;

      const aiMessageObj: Message = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content: "",
      };

      setMessages((prev) => [...prev, aiMessageObj]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "content") {
                aiMessage += data.content;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === aiMessageObj.id
                      ? { ...msg, content: aiMessage }
                      : msg
                  )
                );

                // 如果包含 XML，提取代码
                if (aiMessage.includes("<boltArtifact")) {
                  setGeneratedCode(aiMessage);
                }
              } else if (data.type === "saved") {
                console.log("Code saved:", data.message);
                // 代码保存完成时，重置渲染记录并触发渲染
                lastRenderedArtifactRef.current = null;
                setTimeout(async () => {
                  // 重新获取版本历史
                  await fetchVersionHistory();
                  // 稍微延迟确保 artifact 已更新
                  setTimeout(() => {
                    sendToSandbox();
                  }, 200);
                }, 500);
              } else if (data.threadId && !currentThreadId) {
                currentThreadId = data.threadId;
                setThreadId(currentThreadId);
                // 通知父组件更新 thread 列表
                if (onThreadUpdate) {
                  onThreadUpdate();
                }
              }
            } catch (e) {
              // 忽略解析错误
              console.error("Failed to parse chunk data:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          type: "ai",
          content: "抱歉，发生了错误。请重试。",
        },
      ]);
    } finally {
      setIsLoading(false);
      isSendingRef.current = false; // 重置发送状态

      // 3秒后清除最后消息记录，允许重发相同消息
      setTimeout(() => {
        lastMessageRef.current = "";
      }, 3000);

      // 如果有 threadId，更新 thread 的 updatedAt 时间戳并通知父组件
      if (threadId && onThreadUpdate) {
        try {
          await fetch(`/api/agent/history/${threadId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}), // 空 body，只触发 updatedAt 更新
          });
          onThreadUpdate();
        } catch (error) {
          console.error("Failed to update thread:", error);
        }
      }
    }
  };

  return (
    <div className="flex h-full">
      {/* Chat Panel */}
      <div className="w-1/3 flex flex-col border-r min-h-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-4 message-list">
          {(() => {
            const groupedMessages: (Message | Message[])[] = [];
            let currentAiGroup: Message[] = [];

            // 将连续的 AI 消息分组
            messages.forEach((message, index) => {
              if (message.type === "ai") {
                currentAiGroup.push(message);
                // 如果是最后一条消息或下一条是用户消息，就结束当前组
                if (
                  index === messages.length - 1 ||
                  messages[index + 1]?.type === "human"
                ) {
                  groupedMessages.push([...currentAiGroup]);
                  currentAiGroup = [];
                }
              } else {
                groupedMessages.push(message);
              }
            });

            return groupedMessages.map((item, groupIndex) => {
              // 用户消息
              if (!Array.isArray(item)) {
                return (
                  <div
                    key={item.id}
                    className="bg-blue-100 ml-auto max-w-xs p-3 rounded-lg"
                  >
                    <div className="whitespace-pre-wrap text-sm text-gray-900">
                      {item.content}
                    </div>
                  </div>
                );
              }

              // AI 消息组
              const aiMessages = item;
              const groupId = `group-${groupIndex}`;
              const isExpanded = expandedMessages.has(groupId);

              // 检查是否包含代码生成
              const hasCode = aiMessages.some((msg) =>
                msg.content.includes("<boltArtifact")
              );
              const hasApprove = aiMessages.some((msg) =>
                msg.content.includes("APPROVE")
              );

              // 提取摘要和状态
              let summary = "AI 正在处理...";
              let status: "processing" | "completed" | "reviewing" =
                "processing";

              if (hasCode && hasApprove) {
                summary = "代码生成完成并已通过审核";
                status = "completed";
              } else if (hasCode) {
                summary = "代码生成完成，等待审核...";
                status = "reviewing";
              } else if (hasApprove) {
                summary = "审核通过";
                status = "completed";
              } else {
                // 尝试从第一条消息提取摘要
                const firstMsg = aiMessages[0]?.content || "";
                const lines = firstMsg
                  .split("\n")
                  .filter((line) => line.trim());
                if (lines.length > 0) {
                  summary = lines[0].substring(0, 100);
                }
              }

              return (
                <div
                  key={groupId}
                  className="bg-white border border-gray-200 rounded-lg shadow-sm mr-auto max-w-2xl overflow-hidden"
                >
                  {/* 折叠头部 */}
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleMessageExpansion(groupId)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* 状态图标 */}
                        <div className="flex-shrink-0 mt-0.5">
                          {status === "completed" ? (
                            <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                              <svg
                                className="w-3 h-3 text-green-600"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </div>
                          ) : status === "reviewing" ? (
                            <div className="w-5 h-5 rounded-full bg-yellow-100 flex items-center justify-center">
                              <svg
                                className="w-3 h-3 text-yellow-600"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                            </div>
                          )}
                        </div>

                        {/* 摘要 */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 mb-1">
                            {summary}
                          </div>
                          <div className="text-xs text-gray-500">
                            {aiMessages.length} 个步骤
                            {hasCode && " • 包含代码"}
                            {hasApprove && " • 已审核"}
                          </div>
                        </div>
                      </div>

                      {/* 展开/收起按钮 */}
                      <button
                        className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-transform duration-200"
                        style={{
                          transform: isExpanded
                            ? "rotate(180deg)"
                            : "rotate(0deg)",
                        }}
                      >
                        <svg
                          className="w-5 h-5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* 展开内容 */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 bg-gray-50">
                      <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                        {aiMessages.map((msg, index) => {
                          const isCodeMsg =
                            msg.content.includes("<boltArtifact");
                          const isApproveMsg = msg.content
                            .toUpperCase()
                            .includes("APPROVE");
                          const isRejectMsg = msg.content
                            .toUpperCase()
                            .includes("REJECT");

                          return (
                            <div key={msg.id} className="text-xs">
                              {/* 步骤标题 */}
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-5 h-5 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center text-xs font-medium text-gray-600">
                                  {index + 1}
                                </div>
                                <div className="font-medium text-gray-700">
                                  {isCodeMsg
                                    ? "📝 代码生成"
                                    : isApproveMsg
                                    ? "✅ 审核通过"
                                    : isRejectMsg
                                    ? "❌ 需要修改"
                                    : "🤖 AI 回复"}
                                </div>
                              </div>

                              {/* 消息内容 */}
                              <div className="ml-7 pl-4 border-l-2 border-gray-200">
                                {isCodeMsg ? (
                                  <div className="bg-gray-800 text-gray-300 p-2 rounded text-xs font-mono overflow-x-auto">
                                    <div className="text-green-400 mb-1">
                                      &lt;boltArtifact&gt;
                                    </div>
                                    <div className="text-gray-500 ml-2">
                                      •{" "}
                                      {msg.content.match(/filePath="[^"]+"/g)
                                        ?.length || 0}{" "}
                                      个文件
                                    </div>
                                    <div className="text-green-400 mt-1">
                                      &lt;/boltArtifact&gt;
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-gray-600 whitespace-pre-wrap break-words">
                                    {msg.content}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            });
          })()}
          {isLoading && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm mr-auto max-w-xs p-4">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                  <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                </div>
                <div className="text-sm text-gray-600">AI 正在思考...</div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isLoading && input.trim()) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="请描述你想要的功能..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-500"
              disabled={isLoading}
            />
            <button
              onClick={(e) => {
                e.preventDefault();
                if (!isLoading && input.trim()) {
                  sendMessage();
                }
              }}
              disabled={!input.trim() || isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "发送中..." : "发送"}
            </button>
          </div>
          {threadId && (
            <div className="text-xs text-gray-600 mt-2">
              会话 ID: {threadId}
            </div>
          )}
        </div>
      </div>

      {/* Code Preview */}
      <div className="w-1/3 flex flex-col border-r min-h-0">
        {/* Header with file tabs */}
        <div className="bg-gray-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3 p-2">
            <div className="text-sm font-mono">
              {artifact ? artifact.title : "代码预览"}
            </div>
            {/* 版本选择下拉菜单 */}
            {versions.length > 0 && (
              <div className="relative">
                <select
                  value={selectedVersion || ""}
                  onChange={(e) => selectVersion(Number(e.target.value))}
                  className="bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                  disabled={isLoadingVersions}
                >
                  {versions.map((version) => (
                    <option key={version.id} value={version.versionNumber}>
                      v{version.versionNumber} - {version.description}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 px-2">
            {/* 版本历史按钮 */}
            {threadId && (
              <button
                onClick={() => setShowVersionPanel(!showVersionPanel)}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded flex items-center gap-1"
                title="查看版本历史"
              >
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                    clipRule="evenodd"
                  />
                </svg>
                历史
              </button>
            )}
            {artifact && artifact.files.length > 0 && (
              <>
                <div className="text-xs text-gray-400">
                  {artifact.files.length} 个文件
                </div>
                <button
                  onClick={sendToSandbox}
                  disabled={!isSandboxReady || isRendering}
                  className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                  title="手动发送到沙箱渲染"
                >
                  {isRendering ? "渲染中..." : "渲染"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* File Tabs */}
        {artifact && artifact.files.length > 0 && (
          <div className="bg-gray-700 flex overflow-x-auto border-b border-gray-600">
            {artifact.files.map((file) => {
              const fileName = file.path.split("/").pop() || file.path;
              const isSelected = selectedFile?.path === file.path;

              return (
                <button
                  key={file.path}
                  onClick={() => selectFile(file)}
                  className={`px-3 py-2 text-xs font-mono whitespace-nowrap border-r border-gray-600 hover:bg-gray-600 transition-colors flex items-center gap-1 ${
                    isSelected ? "bg-gray-600 text-white" : "text-gray-300"
                  }`}
                  title={file.path}
                >
                  <FileIcon language={file.language} />
                  {fileName}
                </button>
              );
            })}
          </div>
        )}

        {/* File Content with Version Panel */}
        <div className="flex-1 overflow-auto bg-gray-50 relative">
          {/* 版本历史面板 */}
          {showVersionPanel && (
            <div className="absolute top-0 right-0 w-80 h-full bg-white border-l border-gray-200 z-10 flex flex-col">
              <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">
                  版本历史
                </h3>
                <button
                  onClick={() => setShowVersionPanel(false)}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {isLoadingVersions ? (
                  <div className="text-center text-gray-500 text-sm">
                    加载中...
                  </div>
                ) : versions.length === 0 ? (
                  <div className="text-center text-gray-500 text-sm">
                    暂无版本历史
                  </div>
                ) : (
                  <div className="space-y-2">
                    {versions.map((version) => (
                      <div
                        key={version.id}
                        onClick={() => selectVersion(version.versionNumber)}
                        className={`p-3 rounded border cursor-pointer transition-colors ${
                          selectedVersion === version.versionNumber
                            ? "bg-blue-50 border-blue-200"
                            : "bg-white border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">
                            v{version.versionNumber}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(version.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 mb-2">
                          {version.description}
                        </div>
                        <div className="text-xs text-gray-500">
                          {version.files.length} 个文件
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedFile ? (
            <div className="h-full">
              {/* File path header with copy button */}
              <div className="bg-gray-100 px-4 py-2 text-xs text-gray-800 border-b font-mono flex items-center justify-between">
                <span className="font-medium">{selectedFile.path}</span>
                <button
                  onClick={() =>
                    copyToClipboard(selectedFile.content, selectedFile.path)
                  }
                  className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded transition-colors flex items-center gap-1"
                  title="复制代码"
                >
                  {copiedFile === selectedFile.path ? (
                    <>
                      <svg
                        className="w-3 h-3 text-green-600"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      已复制
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                        <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                      </svg>
                      复制
                    </>
                  )}
                </button>
              </div>
              <div className="h-full overflow-auto bg-white code-preview">
                <pre className="p-4 text-sm text-gray-900 whitespace-pre-wrap break-anywhere font-mono leading-relaxed">
                  <code
                    className={`language-${selectedFile.language} block text-gray-900`}
                    style={{ color: "#1f2937" }}
                  >
                    {selectedFile.content}
                  </code>
                </pre>
              </div>
            </div>
          ) : artifact && artifact.files.length > 0 ? (
            <div className="p-8 text-gray-500 text-center bg-gray-50 h-full flex items-center justify-center">
              <div>
                <div className="text-lg mb-2">📁</div>
                <div className="text-sm">选择一个文件来查看代码...</div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-gray-500 text-center bg-gray-50 h-full flex items-center justify-center">
              <div>
                <div className="text-lg mb-2">⚡</div>
                <div className="text-sm">生成的代码将在这里显示...</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sandbox Preview */}
      <div className="w-1/3 flex flex-col min-h-0">
        {/* Sandbox Header */}
        <div className="bg-gray-800 text-white flex items-center justify-between p-2">
          <div className="text-sm font-mono">实时预览</div>
          <div className="flex items-center gap-2">
            {/* 沙箱状态指示器 */}
            <div className="flex items-center gap-1 text-xs">
              <div
                className={`w-2 h-2 rounded-full ${
                  isSandboxReady ? "bg-green-400" : "bg-yellow-400"
                }`}
              />
              {isSandboxReady ? "就绪" : "加载中"}
            </div>
            {/* 渲染状态 */}
            {isRendering && (
              <div className="text-xs text-yellow-400">渲染中...</div>
            )}
          </div>
        </div>

        {/* Sandbox Error */}
        {sandboxError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 text-xs">
            <div className="font-semibold">渲染错误:</div>
            <div>{sandboxError}</div>
          </div>
        )}

        {/* Sandbox iframe */}
        <div className="flex-1 relative bg-white">
          {!isSandboxReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <div className="text-center text-gray-500">
                <div className="text-sm">沙箱加载中...</div>
                <div className="text-xs mt-1">等待渲染环境就绪</div>
              </div>
            </div>
          )}
          <iframe
            ref={iframeRef}
            src="http://localhost:4000"
            className="w-full h-full border-0"
            title="Code Sandbox"
          />
        </div>
      </div>
    </div>
  );
}
