// components/canvas/use-canvas-chat.ts
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useArtifactParser } from "@/hooks/use-artifact-parser";
import type { Message, ArtifactVersion, DeviceType, TabType } from "./types";
import type { MCPConfig } from "@/components/mcp-config-panel";

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

interface UseCanvasChatProps {
  initialThreadId?: string;
  onThreadUpdate?: () => void;
}

export function useCanvasChat({
  initialThreadId,
  onThreadUpdate,
}: UseCanvasChatProps) {
  // Core state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState(initialThreadId);
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  // Sandbox state
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isSandboxReady, setIsSandboxReady] = useState(false);
  const [sandboxError, setSandboxError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  // Refs for deduplication
  const isSendingRef = useRef(false);
  const lastMessageRef = useRef<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRenderedArtifactRef = useRef<string | null>(null);
  const pendingRefreshRef = useRef(false); // 标记是否有待处理的刷新

  // Version management
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // Artifact parser hook
  const { artifact, selectedFile, selectFile } =
    useArtifactParser(generatedCode);

  // Canvas panel state
  const [activeTab, setActiveTab] = useState<TabType>("code");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceType>("desktop");

  // Message expansion state
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
    new Set()
  );

  // MCP configuration state
  const [mcpConfigs, setMcpConfigs] = useState<MCPConfig[]>([]);
  const [selectedMcpId, setSelectedMcpId] = useState<string | null>(null);
  const [isMcpLoading, setIsMcpLoading] = useState(false);

  // Fetch MCP configurations
  const fetchMcpConfigs = useCallback(async () => {
    setIsMcpLoading(true);
    try {
      const response = await fetch("/api/mcp/configs");
      if (response.ok) {
        const data = await response.json();
        setMcpConfigs(data.configs || []);
      }
    } catch (error) {
      console.error("Failed to fetch MCP configs:", error);
    } finally {
      setIsMcpLoading(false);
    }
  }, []);

  // Load MCP configs on mount
  useEffect(() => {
    fetchMcpConfigs();
  }, [fetchMcpConfigs]);

  // Toggle message expansion
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

  // Send code to sandbox - 移到 effect 之前以避免引用问题
  const sendToSandbox = useCallback(() => {
    if (
      !isSandboxReady ||
      !artifact ||
      !artifact.files.length ||
      !iframeRef.current?.contentWindow
    ) {
      return;
    }

    // Prevent duplicate renders
    const artifactId = artifact.id;
    if (lastRenderedArtifactRef.current === artifactId) {
      console.log("跳过重复渲染:", artifactId);
      return;
    }

    console.log("开始渲染:", artifactId);
    lastRenderedArtifactRef.current = artifactId;

    // Transform files
    const files: Record<string, string> = {};
    artifact.files.forEach((file) => {
      const fileName = file.path.split("/").pop() || file.path;
      files[fileName] = file.content;
    });

    // Find entry file
    const entryFileName = (() => {
      const appFile = artifact.files.find((f) => f.path.includes("App.tsx"));
      if (appFile) return appFile.path.split("/").pop() || "App.tsx";

      const componentFile = artifact.files.find(
        (f) => f.path.endsWith(".tsx") && !f.path.toLowerCase().includes("use")
      );
      if (componentFile)
        return componentFile.path.split("/").pop() || "App.tsx";

      const tsxFile = artifact.files.find((f) => f.path.endsWith(".tsx"));
      if (tsxFile) return tsxFile.path.split("/").pop() || "App.tsx";

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

  // Sandbox message listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, payload } = event.data;

      switch (type) {
        case "IFRAME_LOADED":
          setIsSandboxReady(true);
          setSandboxError(null);
          console.log("沙箱已就绪");

          // 如果有待处理的刷新，重新发送代码
          if (pendingRefreshRef.current) {
            pendingRefreshRef.current = false;
            lastRenderedArtifactRef.current = null;
          }
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

  // 刷新后沙箱就绪时自动重新发送代码
  useEffect(() => {
    if (isSandboxReady && pendingRefreshRef.current === false && artifact) {
      // 检查是否需要重新渲染（刷新后 lastRenderedArtifactRef 被清空了）
      if (lastRenderedArtifactRef.current === null) {
        sendToSandbox();
      }
    }
  }, [isSandboxReady, artifact, sendToSandbox]);

  // Fetch version history
  const fetchVersionHistory = useCallback(async () => {
    if (!threadId) return;

    setIsLoadingVersions(true);
    try {
      const response = await fetch(`/api/agent/history/${threadId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.artifact && data.artifact.versions) {
          setVersions(data.artifact.versions);
          if (data.artifact.versions.length > 0) {
            const latestVersion = data.artifact.versions[0];
            setSelectedVersion(latestVersion.versionNumber);

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

  // Fetch history messages
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

  // Select version
  const selectVersion = useCallback(
    (versionNumber: number) => {
      const version = versions.find((v) => v.versionNumber === versionNumber);
      if (version) {
        setSelectedVersion(versionNumber);
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

  // Update threadId when prop changes
  useEffect(() => {
    setThreadId(initialThreadId);
  }, [initialThreadId]);

  // Fetch history when threadId changes
  useEffect(() => {
    if (threadId) {
      fetchVersionHistory();
      fetchHistoryMessages();
    } else {
      setMessages([]);
      setVersions([]);
      lastRenderedArtifactRef.current = null;
    }
  }, [threadId, fetchVersionHistory, fetchHistoryMessages]);

  // Copy to clipboard
  const copyToClipboard = async (content: string, fileName: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedFile(fileName);
      setTimeout(() => setCopiedFile(null), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || isLoading || isSendingRef.current) {
      return;
    }

    const currentInput = input.trim();

    if (currentInput === lastMessageRef.current) {
      console.log("检测到重复消息，跳过发送");
      return;
    }

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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      const response = await fetch("/api/agent/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: currentInput,
          threadId,
          mcpConfigId: selectedMcpId,
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

                if (aiMessage.includes("<boltArtifact")) {
                  setGeneratedCode(aiMessage);
                }
              } else if (data.type === "saved") {
                console.log("Code saved:", data.message);
                lastRenderedArtifactRef.current = null;
                setTimeout(async () => {
                  await fetchVersionHistory();
                  setTimeout(() => {
                    sendToSandbox();
                  }, 200);
                }, 500);
              } else if (data.threadId && !currentThreadId) {
                currentThreadId = data.threadId;
                setThreadId(currentThreadId);
                if (onThreadUpdate) {
                  onThreadUpdate();
                }
              }
            } catch (e) {
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
      isSendingRef.current = false;

      setTimeout(() => {
        lastMessageRef.current = "";
      }, 3000);

      if (threadId && onThreadUpdate) {
        try {
          await fetch(`/api/agent/history/${threadId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          });
          onThreadUpdate();
        } catch (error) {
          console.error("Failed to update thread:", error);
        }
      }
    }
  };

  // Refresh preview - 刷新后重新发送代码
  const refreshPreview = useCallback(() => {
    if (iframeRef.current) {
      // 标记待刷新，等沙箱就绪后重新发送代码
      pendingRefreshRef.current = true;
      setIsSandboxReady(false);

      // 刷新 iframe
      iframeRef.current.src = iframeRef.current.src;
    }
  }, []);

  // Get device size
  const getDeviceSize = useCallback(() => {
    switch (selectedDevice) {
      case "mobile":
        return { width: "375px", height: "667px" };
      case "tablet":
        return { width: "768px", height: "1024px" };
      default:
        return { width: "100%", height: "100%" };
    }
  }, [selectedDevice]);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // Handle tab change with preview trigger
  const handleTabChange = useCallback(
    (tab: TabType) => {
      const wasPreview = activeTab === "preview";
      setActiveTab(tab);

      // Trigger render when switching to Preview
      if (tab === "preview" && !wasPreview) {
        lastRenderedArtifactRef.current = null;
        const waitAndSend = () => {
          if (isSandboxReady && iframeRef.current?.contentWindow) {
            sendToSandbox();
          } else {
            setTimeout(waitAndSend, 200);
          }
        };
        setTimeout(waitAndSend, 100);
      }
    },
    [activeTab, isSandboxReady, sendToSandbox]
  );

  return {
    // State
    messages,
    input,
    setInput,
    isLoading,
    threadId,
    copiedFile,

    // Sandbox
    iframeRef,
    isSandboxReady,
    sandboxError,
    isRendering,

    // Versions
    versions,
    selectedVersion,
    isLoadingVersions,

    // Artifact
    artifact,
    selectedFile,
    selectFile,

    // Panel state
    activeTab,
    isFullscreen,
    selectedDevice,
    setSelectedDevice,

    // Message expansion
    expandedMessages,
    toggleMessageExpansion,

    // MCP configuration
    mcpConfigs,
    selectedMcpId,
    isMcpLoading,
    onSelectMcp: setSelectedMcpId,
    onRefreshMcp: fetchMcpConfigs,

    // Actions
    sendMessage,
    selectVersion,
    copyToClipboard,
    refreshPreview,
    getDeviceSize,
    toggleFullscreen,
    handleTabChange,
  };
}
