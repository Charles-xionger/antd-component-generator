# Canvas 沙箱实现方案

## 概述

本文档描述了一个生产级别的代码沙箱实现方案，用于实现类似 GPT Canvas 的实时代码编辑和预览功能。

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│              主应用 (localhost:3000)                      │
│                                                           │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  Chat UI   │  │ Canvas Panel │  │  Code Editor    │  │
│  │            │──│              │──│  (Monaco)       │  │
│  │ LangGraph  │  │  File Tabs   │  │                 │  │
│  └────────────┘  └──────────────┘  └─────────────────┘  │
│                          │                               │
│                          │ PostMessage API               │
│                          ↓                               │
└──────────────────────────┼───────────────────────────────┘
                           │
                           │ Cross-Origin Communication
                           │
┌──────────────────────────┼───────────────────────────────┐
│                          ↓                               │
│              沙箱应用 (localhost:3001)                    │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │          Message Handler & Router                  │  │
│  └────────────────────────────────────────────────────┘  │
│                          │                               │
│          ┌───────────────┼───────────────┐               │
│          │               │               │               │
│  ┌───────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐        │
│  │  File System │ │  Transpiler│ │  Renderer  │        │
│  │   Manager    │ │   Engine   │ │            │        │
│  └──────────────┘ └────────────┘ └────────────┘        │
│          │               │               │               │
│          └───────────────┼───────────────┘               │
│                          ↓                               │
│  ┌────────────────────────────────────────────────────┐  │
│  │           Preview iframe (isolated)                │  │
│  │  - HTML/CSS/JS Rendering                          │  │
│  │  - React/Vue Runtime                              │  │
│  │  - Error Boundary                                 │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

## 技术栈与最佳实践

### 主应用

- **Next.js 15+**: 应用框架，利用 App Router 和 Server Components。
- **React 19**: UI 库，支持最新的并发特性和 Hooks。
- **shadcn/ui**: 基于 Radix UI 和 Tailwind CSS 的组件库，作为生成代码的首选组件。
- **Monaco Editor**: 高性能代码编辑器，用于展示和编辑生成的代码。
- **Tailwind CSS**: 响应式样式框架。
- **Lucide React**: 图标库。

### 沙箱应用

- **Next.js**: 独立运行的沙箱环境。
- **@babel/standalone**: 浏览器端实时转译 JSX/TypeScript。
- **PostMessage API**: 安全的跨域通信协议。
- **Tailwind Playback**: 模拟 Tailwind 运行环境（可选）。

### 生成代码最佳实践

1.  **组件化**: 逻辑与 UI 分离，优先使用小型、可复用的组件。
2.  **类型安全**: 强制要求生成 TypeScript 代码，包含完整的接口定义。
3.  **现代 React**: 使用 `use client` 指令区分客户端组件，合理使用 React 19 的新 Hooks。
4.  **样式规范**: 严格遵循 Tailwind CSS 类名规范，避免内联样式。
5.  **无障碍性 (A11y)**: 优先使用 shadcn/ui 提供的具有良好无障碍支持的组件。

## 数据流设计

### 消息协议

#### 1. 类型定义

```typescript
// ============ 消息类型枚举 ============
enum MessageType {
  // 主应用 -> 沙箱
  INIT = "INIT",
  UPDATE_FILES = "UPDATE_FILES",
  RUN_CODE = "RUN_CODE",
  INSTALL_PACKAGE = "INSTALL_PACKAGE",
  CLEAR_CONSOLE = "CLEAR_CONSOLE",
  RESET_SANDBOX = "RESET_SANDBOX",

  // 沙箱 -> 主应用
  READY = "READY",
  BUILD_START = "BUILD_START",
  BUILD_SUCCESS = "BUILD_SUCCESS",
  BUILD_ERROR = "BUILD_ERROR",
  RUNTIME_ERROR = "RUNTIME_ERROR",
  CONSOLE_LOG = "CONSOLE_LOG",
  PREVIEW_READY = "PREVIEW_READY",
}

// ============ 文件系统类型 ============
interface FileContent {
  content: string;
  type: FileType;
  lastModified: number;
}

type FileType = "html" | "css" | "js" | "jsx" | "ts" | "tsx" | "json" | "md";

interface FileMap {
  [path: string]: FileContent;
}

// ============ 消息结构 ============
interface BaseMessage {
  id: string;
  timestamp: number;
  type: MessageType;
}

interface UpdateFilesMessage extends BaseMessage {
  type: MessageType.UPDATE_FILES;
  payload: {
    files: FileMap;
    activeFile?: string;
    isIncremental?: boolean; // 是否增量更新
  };
}

interface RunCodeMessage extends BaseMessage {
  type: MessageType.RUN_CODE;
  payload: {
    entryPoint?: string; // 入口文件
    mode?: "development" | "production";
  };
}

interface InstallPackageMessage extends BaseMessage {
  type: MessageType.INSTALL_PACKAGE;
  payload: {
    packages: string[]; // ['react@18', 'lodash@4']
  };
}

// ============ 响应消息 ============
interface ReadyMessage extends BaseMessage {
  type: MessageType.READY;
  payload: {
    capabilities: {
      frameworks: string[]; // ['react', 'vue', 'vanilla']
      features: string[]; // ['hmr', 'typescript', 'css-modules']
    };
  };
}

interface BuildErrorMessage extends BaseMessage {
  type: MessageType.BUILD_ERROR;
  payload: {
    errors: CompileError[];
  };
}

interface RuntimeErrorMessage extends BaseMessage {
  type: MessageType.RUNTIME_ERROR;
  payload: {
    message: string;
    stack?: string;
    filename?: string;
    lineno?: number;
    colno?: number;
  };
}

interface ConsoleLogMessage extends BaseMessage {
  type: MessageType.CONSOLE_LOG;
  payload: {
    level: "log" | "warn" | "error" | "info";
    args: any[];
    timestamp: number;
  };
}

// ============ 错误类型 ============
interface CompileError {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning";
}
```

#### 2. 消息流程图

```
用户编辑代码
    ↓
编辑器捕获变化 (debounce 300ms)
    ↓
构建 FileMap
    ↓
发送 UPDATE_FILES 消息
    ↓
沙箱接收并解析
    ↓
更新虚拟文件系统
    ↓
触发构建流程
    ↓
┌──────────────────┐
│ 构建状态机       │
├──────────────────┤
│ IDLE             │ ──┐
│ BUILDING         │   │ 发送 BUILD_START
│ SUCCESS          │   │ 发送 BUILD_SUCCESS + 渲染
│ ERROR            │   │ 发送 BUILD_ERROR
└──────────────────┘   │
    ↓                  │
预览更新 ←─────────────┘
    ↓
用户看到结果
```

## 主应用实现

### 1. Canvas Context 设计

```typescript
// lib/canvas/context.tsx
import {
  createContext,
  useContext,
  useReducer,
  useRef,
  useCallback,
} from "react";

// ============ 状态类型 ============
interface CanvasState {
  status: "idle" | "initializing" | "ready" | "building" | "error";
  files: FileMap;
  activeFile: string | null;
  errors: CompileError[];
  console: ConsoleLogMessage[];
  sandboxReady: boolean;
}

type CanvasAction =
  | { type: "SET_STATUS"; payload: CanvasState["status"] }
  | { type: "UPDATE_FILES"; payload: FileMap }
  | { type: "SET_ACTIVE_FILE"; payload: string }
  | { type: "ADD_ERROR"; payload: CompileError[] }
  | { type: "CLEAR_ERRORS" }
  | { type: "ADD_CONSOLE_LOG"; payload: ConsoleLogMessage }
  | { type: "CLEAR_CONSOLE" }
  | { type: "SANDBOX_READY"; payload: boolean };

// ============ Reducer ============
function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case "SET_STATUS":
      return { ...state, status: action.payload };

    case "UPDATE_FILES":
      return { ...state, files: action.payload };

    case "SET_ACTIVE_FILE":
      return { ...state, activeFile: action.payload };

    case "ADD_ERROR":
      return { ...state, errors: [...state.errors, ...action.payload] };

    case "CLEAR_ERRORS":
      return { ...state, errors: [] };

    case "ADD_CONSOLE_LOG":
      return {
        ...state,
        console: [...state.console, action.payload].slice(-100), // 最多保留 100 条
      };

    case "CLEAR_CONSOLE":
      return { ...state, console: [] };

    case "SANDBOX_READY":
      return { ...state, sandboxReady: action.payload };

    default:
      return state;
  }
}

// ============ Context ============
interface CanvasContextValue {
  state: CanvasState;
  updateFile: (path: string, content: string) => void;
  deleteFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  runCode: () => void;
  clearConsole: () => void;
  resetSandbox: () => void;
}

const CanvasContext = createContext<CanvasContextValue | null>(null);

// ============ Provider ============
export function CanvasProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(canvasReducer, {
    status: "idle",
    files: {},
    activeFile: null,
    errors: [],
    console: [],
    sandboxReady: false,
  });

  const sandboxRef = useRef<HTMLIFrameElement>(null);
  const messageQueue = useRef<BaseMessage[]>([]);

  // ============ 消息发送 ============
  const postToSandbox = useCallback(
    (message: BaseMessage) => {
      if (state.sandboxReady && sandboxRef.current?.contentWindow) {
        sandboxRef.current.contentWindow.postMessage(
          message,
          process.env.NEXT_PUBLIC_SANDBOX_URL || "http://localhost:3001"
        );
      } else {
        messageQueue.current.push(message);
      }
    },
    [state.sandboxReady]
  );

  // ============ 消息接收 ============
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // 验证来源
      if (
        e.origin !==
        (process.env.NEXT_PUBLIC_SANDBOX_URL || "http://localhost:3001")
      ) {
        return;
      }

      const message = e.data as BaseMessage;

      switch (message.type) {
        case MessageType.READY:
          dispatch({ type: "SANDBOX_READY", payload: true });
          dispatch({ type: "SET_STATUS", payload: "ready" });
          // 发送队列中的消息
          messageQueue.current.forEach((msg) => postToSandbox(msg));
          messageQueue.current = [];
          break;

        case MessageType.BUILD_START:
          dispatch({ type: "SET_STATUS", payload: "building" });
          dispatch({ type: "CLEAR_ERRORS" });
          break;

        case MessageType.BUILD_SUCCESS:
          dispatch({ type: "SET_STATUS", payload: "ready" });
          break;

        case MessageType.BUILD_ERROR:
          dispatch({ type: "SET_STATUS", payload: "error" });
          dispatch({
            type: "ADD_ERROR",
            payload: (message as BuildErrorMessage).payload.errors,
          });
          break;

        case MessageType.RUNTIME_ERROR:
          const errorMsg = message as RuntimeErrorMessage;
          dispatch({
            type: "ADD_CONSOLE_LOG",
            payload: {
              id: message.id,
              timestamp: message.timestamp,
              type: MessageType.CONSOLE_LOG,
              payload: {
                level: "error",
                args: [errorMsg.payload.message],
                timestamp: message.timestamp,
              },
            },
          });
          break;

        case MessageType.CONSOLE_LOG:
          dispatch({
            type: "ADD_CONSOLE_LOG",
            payload: message as ConsoleLogMessage,
          });
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [postToSandbox]);

  // ============ API 方法 ============
  const updateFile = useCallback(
    (path: string, content: string) => {
      const newFiles = {
        ...state.files,
        [path]: {
          content,
          type: inferFileType(path),
          lastModified: Date.now(),
        },
      };

      dispatch({ type: "UPDATE_FILES", payload: newFiles });

      // 发送更新到沙箱
      postToSandbox({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: MessageType.UPDATE_FILES,
        payload: {
          files: newFiles,
          activeFile: state.activeFile || path,
          isIncremental: true,
        },
      } as UpdateFilesMessage);
    },
    [state.files, state.activeFile, postToSandbox]
  );

  const deleteFile = useCallback(
    (path: string) => {
      const { [path]: _, ...newFiles } = state.files;
      dispatch({ type: "UPDATE_FILES", payload: newFiles });
    },
    [state.files]
  );

  const setActiveFile = useCallback((path: string) => {
    dispatch({ type: "SET_ACTIVE_FILE", payload: path });
  }, []);

  const runCode = useCallback(() => {
    postToSandbox({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: MessageType.RUN_CODE,
      payload: {
        entryPoint: state.activeFile || "/index.html",
        mode: "development",
      },
    } as RunCodeMessage);
  }, [state.activeFile, postToSandbox]);

  const clearConsole = useCallback(() => {
    dispatch({ type: "CLEAR_CONSOLE" });
    postToSandbox({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: MessageType.CLEAR_CONSOLE,
    } as BaseMessage);
  }, [postToSandbox]);

  const resetSandbox = useCallback(() => {
    dispatch({ type: "SET_STATUS", payload: "initializing" });
    postToSandbox({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: MessageType.RESET_SANDBOX,
    } as BaseMessage);
  }, [postToSandbox]);

  const value: CanvasContextValue = {
    state,
    updateFile,
    deleteFile,
    setActiveFile,
    runCode,
    clearConsole,
    resetSandbox,
  };

  return (
    <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>
  );
}

export function useCanvas() {
  const context = useContext(CanvasContext);
  if (!context) {
    throw new Error("useCanvas must be used within CanvasProvider");
  }
  return context;
}

// ============ 辅助函数 ============
function inferFileType(path: string): FileType {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html":
      return "html";
    case "css":
      return "css";
    case "js":
      return "js";
    case "jsx":
      return "jsx";
    case "ts":
      return "ts";
    case "tsx":
      return "tsx";
    case "json":
      return "json";
    case "md":
      return "md";
    default:
      return "js";
  }
}
```

### 2. Canvas 组件

```typescript
// components/canvas/canvas-panel.tsx
"use client";

import { useCanvas } from "@/lib/canvas/context";
import { FileExplorer } from "./file-explorer";
import { CodeEditor } from "./code-editor";
import { PreviewPanel } from "./preview-panel";
import { ConsolePanel } from "./console-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from "@/components/ui/resizable";

export function CanvasPanel() {
  const { state } = useCanvas();

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 状态栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-2">
          <StatusIndicator status={state.status} />
          <span className="text-sm text-muted-foreground">
            {state.activeFile || "No file selected"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ErrorCount count={state.errors.length} />
          <ConsoleCount count={state.console.length} />
        </div>
      </div>

      {/* 主内容区 */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* 左侧：文件树 + 编辑器 */}
        <ResizablePanel defaultSize={50} minSize={30}>
          <ResizablePanelGroup direction="vertical">
            {/* 文件浏览器 */}
            <ResizablePanel defaultSize={20} minSize={15}>
              <FileExplorer />
            </ResizablePanel>

            <ResizableHandle />

            {/* 代码编辑器 */}
            <ResizablePanel defaultSize={80}>
              <CodeEditor />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle />

        {/* 右侧：预览 + 控制台 */}
        <ResizablePanel defaultSize={50} minSize={30}>
          <Tabs defaultValue="preview" className="flex flex-col h-full">
            <TabsList className="w-full justify-start rounded-none border-b">
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="console">
                Console
                {state.console.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-muted rounded">
                    {state.console.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="preview" className="flex-1 m-0">
              <PreviewPanel />
            </TabsContent>

            <TabsContent value="console" className="flex-1 m-0">
              <ConsolePanel />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// 状态指示器
function StatusIndicator({ status }: { status: CanvasState["status"] }) {
  const config = {
    idle: { color: "bg-gray-400", text: "Idle" },
    initializing: { color: "bg-blue-400 animate-pulse", text: "Initializing" },
    ready: { color: "bg-green-400", text: "Ready" },
    building: { color: "bg-yellow-400 animate-pulse", text: "Building" },
    error: { color: "bg-red-400", text: "Error" },
  };

  const { color, text } = config[status];

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}
```

### 3. Monaco 编辑器集成

```typescript
// components/canvas/code-editor.tsx
"use client";

import { useCanvas } from "@/lib/canvas/context";
import { useCallback, useEffect, useRef } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import { debounce } from "@/lib/utils";

export function CodeEditor() {
  const { state, updateFile } = useCanvas();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const currentFile = state.activeFile ? state.files[state.activeFile] : null;

  // 防抖更新
  const debouncedUpdate = useCallback(
    debounce((path: string, content: string) => {
      updateFile(path, content);
    }, 300),
    [updateFile]
  );

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined && state.activeFile) {
      debouncedUpdate(state.activeFile, value);
    }
  };

  const handleEditorDidMount = (
    editor: editor.IStandaloneCodeEditor,
    monaco: Monaco
  ) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // 配置编辑器
    editor.updateOptions({
      fontSize: 14,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      formatOnPaste: true,
      formatOnType: true,
    });

    // 添加错误标记
    updateErrorMarkers();
  };

  // 更新错误标记
  const updateErrorMarkers = useCallback(() => {
    if (!editorRef.current || !monacoRef.current || !state.activeFile) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    const markers = state.errors
      .filter((err) => err.file === state.activeFile)
      .map((err) => ({
        severity:
          err.severity === "error"
            ? monacoRef.current!.MarkerSeverity.Error
            : monacoRef.current!.MarkerSeverity.Warning,
        startLineNumber: err.line,
        startColumn: err.column,
        endLineNumber: err.line,
        endColumn: err.column + 1,
        message: err.message,
      }));

    monacoRef.current.editor.setModelMarkers(model, "sandbox", markers);
  }, [state.errors, state.activeFile]);

  useEffect(() => {
    updateErrorMarkers();
  }, [updateErrorMarkers]);

  if (!currentFile) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a file to edit
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      language={getLanguageFromType(currentFile.type)}
      value={currentFile.content}
      onChange={handleEditorChange}
      onMount={handleEditorDidMount}
      theme="vs-dark"
      options={{
        readOnly: state.status === "building",
      }}
    />
  );
}

function getLanguageFromType(type: FileType): string {
  switch (type) {
    case "jsx":
      return "javascript";
    case "tsx":
      return "typescript";
    default:
      return type;
  }
}
```

## 沙箱应用实现

### 1. 沙箱入口

```typescript
// sandbox/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { SandboxRuntime } from "@/lib/sandbox-runtime";

export default function SandboxPage() {
  const [runtime] = useState(() => new SandboxRuntime());
  const [status, setStatus] = useState<"initializing" | "ready">(
    "initializing"
  );

  useEffect(() => {
    runtime.initialize().then(() => {
      setStatus("ready");
    });

    return () => {
      runtime.destroy();
    };
  }, [runtime]);

  if (status === "initializing") {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto" />
          <p className="mt-4 text-sm text-gray-600">Initializing sandbox...</p>
        </div>
      </div>
    );
  }

  return (
    <div id="sandbox-root" className="w-full h-screen">
      <iframe
        id="preview-frame"
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-forms allow-modals allow-popups"
        title="Preview"
      />
    </div>
  );
}
```

### 2. 沙箱运行时

```typescript
// sandbox/lib/sandbox-runtime.ts
import { FileSystemManager } from "./file-system";
import { TranspilerEngine } from "./transpiler";
import { PreviewRenderer } from "./renderer";

export class SandboxRuntime {
  private fileSystem: FileSystemManager;
  private transpiler: TranspilerEngine;
  private renderer: PreviewRenderer;
  private messageHandlers: Map<MessageType, (msg: any) => void>;

  constructor() {
    this.fileSystem = new FileSystemManager();
    this.transpiler = new TranspilerEngine();
    this.renderer = new PreviewRenderer();
    this.messageHandlers = new Map();

    this.setupMessageHandlers();
  }

  async initialize() {
    // 初始化消息监听
    window.addEventListener("message", this.handleMessage.bind(this));

    // 初始化转译器
    await this.transpiler.initialize();

    // 通知主应用已准备就绪
    this.postMessage({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: MessageType.READY,
      payload: {
        capabilities: {
          frameworks: ["react", "vue", "vanilla"],
          features: ["hmr", "typescript", "css-modules"],
        },
      },
    } as ReadyMessage);
  }

  private setupMessageHandlers() {
    this.messageHandlers.set(
      MessageType.UPDATE_FILES,
      this.handleUpdateFiles.bind(this)
    );

    this.messageHandlers.set(
      MessageType.RUN_CODE,
      this.handleRunCode.bind(this)
    );

    this.messageHandlers.set(
      MessageType.RESET_SANDBOX,
      this.handleReset.bind(this)
    );
  }

  private handleMessage(event: MessageEvent) {
    // 验证来源
    if (
      event.origin !==
      (process.env.NEXT_PUBLIC_MAIN_APP_URL || "http://localhost:3000")
    ) {
      return;
    }

    const message = event.data as BaseMessage;
    const handler = this.messageHandlers.get(message.type);

    if (handler) {
      try {
        handler(message);
      } catch (error) {
        this.postError(message.id, error);
      }
    }
  }

  private async handleUpdateFiles(message: UpdateFilesMessage) {
    try {
      // 更新文件系统
      this.fileSystem.updateFiles(message.payload.files);

      // 触发构建
      await this.build();
    } catch (error) {
      this.postError(message.id, error);
    }
  }

  private async handleRunCode(message: RunCodeMessage) {
    await this.build(message.payload.entryPoint);
  }

  private async build(entryPoint?: string) {
    // 发送构建开始消息
    this.postMessage({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: MessageType.BUILD_START,
    } as BaseMessage);

    try {
      // 获取所有文件
      const files = this.fileSystem.getAllFiles();

      // 检测项目类型
      const projectType = this.detectProjectType(files);

      // 转译代码
      const transpiledFiles = await this.transpiler.transpile(
        files,
        projectType
      );

      // 渲染预览
      await this.renderer.render(transpiledFiles, entryPoint);

      // 发送构建成功消息
      this.postMessage({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: MessageType.BUILD_SUCCESS,
      } as BaseMessage);
    } catch (error) {
      this.postMessage({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: MessageType.BUILD_ERROR,
        payload: {
          errors: this.parseErrors(error),
        },
      } as BuildErrorMessage);
    }
  }

  private detectProjectType(files: FileMap): "react" | "vue" | "vanilla" {
    const hasReact = Object.values(files).some(
      (file) =>
        file.content.includes("import React") ||
        file.content.includes('from "react"')
    );

    const hasVue = Object.keys(files).some((path) => path.endsWith(".vue"));

    if (hasReact) return "react";
    if (hasVue) return "vue";
    return "vanilla";
  }

  private parseErrors(error: any): CompileError[] {
    // 解析 Babel 或其他编译错误
    if (error.loc) {
      return [
        {
          file: error.filename || "unknown",
          line: error.loc.line,
          column: error.loc.column,
          message: error.message,
          severity: "error",
        },
      ];
    }

    return [
      {
        file: "unknown",
        line: 0,
        column: 0,
        message: error.message || "Unknown error",
        severity: "error",
      },
    ];
  }

  private handleReset() {
    this.fileSystem.clear();
    this.renderer.clear();

    this.postMessage({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: MessageType.READY,
      payload: {
        capabilities: {
          frameworks: ["react", "vue", "vanilla"],
          features: ["hmr", "typescript", "css-modules"],
        },
      },
    } as ReadyMessage);
  }

  private postMessage(message: BaseMessage) {
    window.parent.postMessage(
      message,
      process.env.NEXT_PUBLIC_MAIN_APP_URL || "http://localhost:3000"
    );
  }

  private postError(messageId: string, error: any) {
    this.postMessage({
      id: messageId,
      timestamp: Date.now(),
      type: MessageType.BUILD_ERROR,
      payload: {
        errors: this.parseErrors(error),
      },
    } as BuildErrorMessage);
  }

  destroy() {
    window.removeEventListener("message", this.handleMessage);
    this.renderer.destroy();
  }
}
```

### 3. 文件系统管理器

```typescript
// sandbox/lib/file-system.ts
export class FileSystemManager {
  private files: Map<string, FileContent> = new Map();

  updateFiles(newFiles: FileMap) {
    Object.entries(newFiles).forEach(([path, content]) => {
      this.files.set(path, content);
    });
  }

  getFile(path: string): FileContent | undefined {
    return this.files.get(path);
  }

  getAllFiles(): FileMap {
    const result: FileMap = {};
    this.files.forEach((content, path) => {
      result[path] = content;
    });
    return result;
  }

  getFilesByType(type: FileType): Array<[string, FileContent]> {
    return Array.from(this.files.entries()).filter(
      ([_, content]) => content.type === type
    );
  }

  deleteFile(path: string) {
    this.files.delete(path);
  }

  clear() {
    this.files.clear();
  }

  hasFile(path: string): boolean {
    return this.files.has(path);
  }
}
```

### 4. 转译引擎

```typescript
// sandbox/lib/transpiler.ts
import { transform } from "@babel/standalone";

export class TranspilerEngine {
  private babelLoaded = false;

  async initialize() {
    // Babel standalone 会自动加载
    this.babelLoaded = true;
  }

  async transpile(
    files: FileMap,
    projectType: "react" | "vue" | "vanilla"
  ): Promise<FileMap> {
    const result: FileMap = {};

    for (const [path, file] of Object.entries(files)) {
      if (this.needsTranspilation(file.type)) {
        result[path] = {
          ...file,
          content: await this.transpileFile(file, projectType),
        };
      } else {
        result[path] = file;
      }
    }

    return result;
  }

  private needsTranspilation(type: FileType): boolean {
    return ["jsx", "tsx", "ts"].includes(type);
  }

  private async transpileFile(
    file: FileContent,
    projectType: string
  ): Promise<string> {
    try {
      const presets: string[] = [];
      const plugins: string[] = [];

      // 根据文件类型添加预设
      if (file.type === "tsx" || file.type === "ts") {
        presets.push("typescript");
      }

      if (file.type === "jsx" || file.type === "tsx") {
        presets.push("react");
      }

      const result = transform(file.content, {
        presets,
        plugins,
        filename: "file." + file.type,
      });

      return result.code || file.content;
    } catch (error) {
      console.error("Transpilation error:", error);
      throw error;
    }
  }
}
```

### 5. 预览渲染器

```typescript
// sandbox/lib/renderer.ts
export class PreviewRenderer {
  private previewFrame: HTMLIFrameElement | null = null;
  private currentBlob: string | null = null;

  constructor() {
    this.previewFrame = document.getElementById(
      "preview-frame"
    ) as HTMLIFrameElement;
    this.setupErrorCapture();
  }

  async render(files: FileMap, entryPoint?: string) {
    const html = this.buildHTML(files, entryPoint);
    this.updatePreview(html);
  }

  private buildHTML(files: FileMap, entryPoint?: string): string {
    // 查找入口文件
    const entry = entryPoint || "/index.html";
    const htmlFile = files[entry];

    if (!htmlFile) {
      return this.buildDefaultHTML(files);
    }

    // 注入 CSS 和 JS
    let html = htmlFile.content;

    // 收集所有 CSS
    const cssFiles = Object.entries(files)
      .filter(([_, file]) => file.type === "css")
      .map(([_, file]) => file.content);

    if (cssFiles.length > 0) {
      const cssTag = `<style>${cssFiles.join("\n")}</style>`;
      html = html.replace("</head>", `${cssTag}</head>`);
    }

    // 收集所有 JS
    const jsFiles = Object.entries(files)
      .filter(([_, file]) => ["js", "jsx"].includes(file.type))
      .map(([_, file]) => file.content);

    if (jsFiles.length > 0) {
      const jsTag = `<script type="module">${jsFiles.join("\n")}</script>`;
      html = html.replace("</body>", `${jsTag}</body>`);
    }

    return this.wrapWithErrorCapture(html);
  }

  private buildDefaultHTML(files: FileMap): string {
    const cssFiles = Object.entries(files).filter(
      ([_, file]) => file.type === "css"
    );

    const jsFiles = Object.entries(files).filter(([_, file]) =>
      ["js", "jsx"].includes(file.type)
    );

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  ${cssFiles.map(([_, file]) => `<style>${file.content}</style>`).join("\n")}
</head>
<body>
  <div id="root"></div>
  ${jsFiles
    .map(([_, file]) => `<script type="module">${file.content}</script>`)
    .join("\n")}
</body>
</html>
    `.trim();
  }

  private wrapWithErrorCapture(html: string): string {
    const errorScript = `
      <script>
        window.addEventListener('error', function(e) {
          window.parent.postMessage({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            type: 'RUNTIME_ERROR',
            payload: {
              message: e.message,
              filename: e.filename,
              lineno: e.lineno,
              colno: e.colno,
              stack: e.error?.stack
            }
          }, '*');
        });

        window.addEventListener('unhandledrejection', function(e) {
          window.parent.postMessage({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            type: 'RUNTIME_ERROR',
            payload: {
              message: e.reason?.message || String(e.reason),
              stack: e.reason?.stack
            }
          }, '*');
        });

        // 劫持 console
        ['log', 'warn', 'error', 'info'].forEach(function(method) {
          const original = console[method];
          console[method] = function(...args) {
            original.apply(console, args);
            window.parent.postMessage({
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              type: 'CONSOLE_LOG',
              payload: {
                level: method,
                args: args.map(arg => 
                  typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                ),
                timestamp: Date.now()
              }
            }, '*');
          };
        });
      </script>
    `;

    return html.replace("</head>", `${errorScript}</head>`);
  }

  private updatePreview(html: string) {
    if (!this.previewFrame) return;

    // 清理旧的 blob URL
    if (this.currentBlob) {
      URL.revokeObjectURL(this.currentBlob);
    }

    // 创建新的 blob URL
    const blob = new Blob([html], { type: "text/html" });
    this.currentBlob = URL.createObjectURL(blob);

    // 更新 iframe
    this.previewFrame.src = this.currentBlob;
  }

  private setupErrorCapture() {
    // 已经在 wrapWithErrorCapture 中处理
  }

  clear() {
    if (this.previewFrame) {
      this.previewFrame.src = "about:blank";
    }
    if (this.currentBlob) {
      URL.revokeObjectURL(this.currentBlob);
      this.currentBlob = null;
    }
  }

  destroy() {
    this.clear();
  }
}
```

## 状态管理

### 状态机设计

```typescript
// lib/canvas/state-machine.ts
export type SandboxStatus =
  | "idle" // 空闲状态
  | "initializing" // 初始化中
  | "ready" // 就绪
  | "building" // 构建中
  | "error"; // 错误

export type SandboxEvent =
  | { type: "INIT" }
  | { type: "SANDBOX_READY" }
  | { type: "FILE_UPDATE" }
  | { type: "BUILD_START" }
  | { type: "BUILD_SUCCESS" }
  | { type: "BUILD_ERROR" }
  | { type: "RESET" };

export const statusTransitions: Record<
  SandboxStatus,
  Partial<Record<SandboxEvent["type"], SandboxStatus>>
> = {
  idle: {
    INIT: "initializing",
  },
  initializing: {
    SANDBOX_READY: "ready",
    BUILD_ERROR: "error",
  },
  ready: {
    FILE_UPDATE: "building",
    BUILD_START: "building",
    RESET: "initializing",
  },
  building: {
    BUILD_SUCCESS: "ready",
    BUILD_ERROR: "error",
  },
  error: {
    FILE_UPDATE: "building",
    BUILD_START: "building",
    RESET: "initializing",
  },
};

export function getNextStatus(
  currentStatus: SandboxStatus,
  event: SandboxEvent
): SandboxStatus {
  const transitions = statusTransitions[currentStatus];
  return transitions?.[event.type] || currentStatus;
}
```

## 安全策略

### 1. CSP 配置

```typescript
// sandbox/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // 设置 CSP 头
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https:",
      "frame-ancestors http://localhost:3000",
      "frame-src 'self' blob:",
    ].join("; ")
  );

  // CORS 头
  response.headers.set("Access-Control-Allow-Origin", "http://localhost:3000");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");

  return response;
}

export const config = {
  matcher: "/:path*",
};
```

### 2. iframe 沙箱属性

```typescript
// 主应用中的 iframe 配置
const SANDBOX_ATTRIBUTES = [
  "allow-scripts", // 允许脚本执行
  "allow-forms", // 允许表单提交
  "allow-modals", // 允许模态框
  "allow-popups", // 允许弹窗
  // 注意：不要同时使用 allow-same-origin，会降低安全性
].join(" ");

<iframe
  src={SANDBOX_URL}
  sandbox={SANDBOX_ATTRIBUTES}
  allow="accelerometer; camera; geolocation; microphone"
/>;
```

## 性能优化

### 1. 防抖策略

```typescript
// lib/utils/debounce.ts
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

// 智能防抖：根据变更大小调整延迟
export function smartDebounce<T extends (...args: any[]) => any>(
  func: T,
  minWait: number = 100,
  maxWait: number = 1000
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  let lastChangeSize = 0;

  return function executedFunction(...args: Parameters<T>) {
    // 估算变更大小
    const changeSize = JSON.stringify(args).length;
    const ratio = Math.min(changeSize / 10000, 1);
    const wait = minWait + (maxWait - minWait) * ratio;

    const later = () => {
      timeout = null;
      func(...args);
      lastChangeSize = 0;
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    lastChangeSize = changeSize;
    timeout = setTimeout(later, wait);
  };
}
```

### 2. 增量更新

```typescript
// lib/canvas/diff.ts
export interface FileDiff {
  added: string[];
  modified: string[];
  deleted: string[];
}

export function diffFiles(oldFiles: FileMap, newFiles: FileMap): FileDiff {
  const diff: FileDiff = {
    added: [],
    modified: [],
    deleted: [],
  };

  // 检测新增和修改
  for (const path in newFiles) {
    if (!oldFiles[path]) {
      diff.added.push(path);
    } else if (oldFiles[path].content !== newFiles[path].content) {
      diff.modified.push(path);
    }
  }

  // 检测删除
  for (const path in oldFiles) {
    if (!newFiles[path]) {
      diff.deleted.push(path);
    }
  }

  return diff;
}

export function shouldFullRebuild(diff: FileDiff): boolean {
  // 如果修改了入口文件或配置文件，需要完全重新构建
  const criticalFiles = [
    "/index.html",
    "/index.js",
    "/index.jsx",
    "/package.json",
  ];

  return (
    diff.added.length > 5 ||
    diff.deleted.length > 0 ||
    diff.modified.some((path) => criticalFiles.includes(path))
  );
}
```

### 3. 缓存策略

```typescript
// sandbox/lib/cache.ts
export class TranspileCache {
  private cache: Map<string, { hash: string; result: string }> = new Map();
  private maxSize = 100;

  set(path: string, content: string, result: string) {
    const hash = this.hash(content);

    // LRU 策略
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(path, { hash, result });
  }

  get(path: string, content: string): string | null {
    const cached = this.cache.get(path);
    if (!cached) return null;

    const hash = this.hash(content);
    if (hash !== cached.hash) return null;

    return cached.result;
  }

  private hash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  clear() {
    this.cache.clear();
  }
}
```

## 部署配置

### 1. 环境变量

```bash
# .env.local (主应用)
NEXT_PUBLIC_SANDBOX_URL=http://localhost:3001
# 生产环境
# NEXT_PUBLIC_SANDBOX_URL=https://sandbox.yourdomain.com

# .env.local (沙箱应用)
NEXT_PUBLIC_MAIN_APP_URL=http://localhost:3000
# 生产环境
# NEXT_PUBLIC_MAIN_APP_URL=https://yourdomain.com
```

### 2. Docker 配置

```dockerfile
# 主应用 Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]

# 沙箱应用 Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
```

### 3. docker-compose.yml

```yaml
version: "3.8"

services:
  main-app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_SANDBOX_URL=http://sandbox:3001
    depends_on:
      - sandbox

  sandbox:
    build:
      context: ./sandbox
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - NEXT_PUBLIC_MAIN_APP_URL=http://main-app:3000
    # 资源限制
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
```

## 测试策略

### 1. 单元测试

```typescript
// __tests__/canvas/file-system.test.ts
import { FileSystemManager } from "@/sandbox/lib/file-system";

describe("FileSystemManager", () => {
  let fs: FileSystemManager;

  beforeEach(() => {
    fs = new FileSystemManager();
  });

  test("should store and retrieve files", () => {
    const file: FileContent = {
      content: 'console.log("test")',
      type: "js",
      lastModified: Date.now(),
    };

    fs.updateFiles({ "/test.js": file });
    expect(fs.getFile("/test.js")).toEqual(file);
  });

  test("should filter files by type", () => {
    fs.updateFiles({
      "/style.css": { content: "", type: "css", lastModified: 0 },
      "/script.js": { content: "", type: "js", lastModified: 0 },
    });

    const cssFiles = fs.getFilesByType("css");
    expect(cssFiles).toHaveLength(1);
    expect(cssFiles[0][0]).toBe("/style.css");
  });
});
```

### 2. 集成测试

```typescript
// __tests__/canvas/integration.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { CanvasProvider, useCanvas } from "@/lib/canvas/context";

function TestComponent() {
  const { state, updateFile } = useCanvas();

  return (
    <div>
      <div data-testid="status">{state.status}</div>
      <button onClick={() => updateFile("/test.js", 'console.log("test")')}>
        Update
      </button>
    </div>
  );
}

describe("Canvas Integration", () => {
  test("should update files and trigger build", async () => {
    render(
      <CanvasProvider>
        <TestComponent />
      </CanvasProvider>
    );

    const button = screen.getByText("Update");
    button.click();

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("building");
    });
  });
});
```

## 监控和调试

### 1. 性能监控

```typescript
// lib/monitoring/performance.ts
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();

  measure(name: string, fn: () => void | Promise<void>) {
    const start = performance.now();

    const result = fn();

    if (result instanceof Promise) {
      return result.finally(() => {
        this.record(name, performance.now() - start);
      });
    }

    this.record(name, performance.now() - start);
    return result;
  }

  private record(name: string, duration: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metrics = this.metrics.get(name)!;
    metrics.push(duration);

    // 保留最近 100 次
    if (metrics.length > 100) {
      metrics.shift();
    }
  }

  getStats(name: string) {
    const metrics = this.metrics.get(name) || [];
    if (metrics.length === 0) return null;

    const sorted = [...metrics].sort((a, b) => a - b);

    return {
      avg: metrics.reduce((a, b) => a + b, 0) / metrics.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }
}
```

### 2. 错误追踪

```typescript
// lib/monitoring/error-tracker.ts
export class ErrorTracker {
  private errors: Array<{
    timestamp: number;
    type: string;
    message: string;
    stack?: string;
    context?: any;
  }> = [];

  track(error: Error, context?: any) {
    this.errors.push({
      timestamp: Date.now(),
      type: error.name,
      message: error.message,
      stack: error.stack,
      context,
    });

    // 上报到监控服务
    this.report(error, context);
  }

  private report(error: Error, context?: any) {
    // 发送到 Sentry、DataDog 等服务
    console.error("[ErrorTracker]", error, context);
  }

  getRecentErrors(limit = 10) {
    return this.errors.slice(-limit);
  }

  clear() {
    this.errors = [];
  }
}
```

## Agent 与前端交互设计

### 1. Bolt Artifact 协议集成

#### 协议格式

```xml
<boltArtifact id="project-{timestamp}" title="{项目描述}">
  <boltAction type="file" filePath="{文件路径}">
    {文件内容}
  </boltAction>
  <boltAction type="file" filePath="{文件路径}">
    {文件内容}
  </boltAction>
</boltArtifact>
```

#### 类型定义

```typescript
// lib/agent/artifact-types.ts
export interface BoltArtifact {
  id: string;
  title: string;
  actions: BoltAction[];
}

export interface BoltAction {
  type: "file" | "shell" | "start";
  filePath?: string;
  content?: string;
  command?: string;
}

export interface ParsedChunk {
  type: "text" | "artifact" | "action" | "complete";
  data: string | BoltAction;
  artifactId?: string;
}
```

### 2. LangGraph Agent 实现

#### 三阶段 Agent 架构

为了提高代码生成的准确性和质量，我们将 Agent 逻辑拆分为三个阶段：

1.  **分析 Agent (Analyzer Agent)**：分析用户需求，确定页面结构、所需组件（如 shadcn/ui 组件）、图标库及状态管理方案。
2.  **代码生成 Agent (Code Generator Agent)**：基于分析结果，遵循 Next.js/React 最佳实践和 Bolt Artifact 协议生成完整代码。
3.  **文件提取 Agent (File Generator Agent)**：对生成的代码进行提取和格式化，确保 XML 内容能够流式传递给前端进行解析和展示。

#### System Prompts 配置

```typescript
// lib/agent/prompts.ts

// 1. 分析阶段 Prompt
export const ANALYZER_PROMPT = `
你是一个资深的系统架构师。你的任务是分析用户的页面生成需求。
请输出以下信息：
- 页面功能描述
- 所需的 shadcn/ui 组件列表
- 所需的图标库 (如 lucide-react)
- 页面布局结构建议
- 状态管理方案 (如 React Context 或 useState)

请以 JSON 格式输出分析结果。
`;

// 2. 代码生成阶段 Prompt
export const CODE_GENERATOR_PROMPT = `
你是一个精通 Next.js 15、React 19 和 shadcn/ui 的高级前端工程师。
根据分析 Agent 提供的架构建议，生成高质量的代码。

最佳实践要求：
- 使用 Tailwind CSS 进行样式设计
- 优先使用 shadcn/ui 组件
- 遵循 React 19 的最新特性（如 Server Components vs Client Components）
- 代码结构清晰，逻辑解耦
- 包含必要的类型定义 (TypeScript)

你必须使用 Bolt Artifact 协议包装代码：
<boltArtifact id="project-{timestamp}" title="{项目描述}">
  <boltAction type="file" filePath="/components/example.tsx">
    {代码内容}
  </boltAction>
</boltArtifact>
`;

// 3. 文件提取阶段 Prompt
export const FILE_EXTRACTOR_PROMPT = `
你是一个文件处理专家。你的任务是将生成的代码块提取并确保其符合 Bolt Artifact XML 格式，以便前端解析器能够正确识别。
确保每个文件都有正确的 filePath，并且 XML 标签闭合正确。
`;
```

#### Agent 状态图配置 (LangGraph)

```typescript
// lib/agent/canvas-agent.ts
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, END } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

interface AgentState {
  messages: BaseMessage[];
  analysis?: any;
  rawCode?: string;
  finalArtifact?: string;
}

export class CanvasAgent {
  private model: ChatOpenAI;
  private graph: StateGraph<AgentState>;

  constructor() {
    this.model = new ChatOpenAI({
      // ... 配置
    });

    this.setupGraph();
  }

  private setupGraph() {
    const workflow = new StateGraph<AgentState>({
      channels: {
        messages: { value: (x, y) => x.concat(y), default: () => [] },
        analysis: { value: (x, y) => y ?? x, default: () => null },
        rawCode: { value: (x, y) => y ?? x, default: () => "" },
        finalArtifact: { value: (x, y) => y ?? x, default: () => "" },
      },
    });

    // 1. 分析节点
    workflow.addNode("analyze", async (state) => {
      const response = await this.model.invoke([
        new HumanMessage({ content: ANALYZER_PROMPT }),
        ...state.messages,
      ]);
      return { analysis: response.content };
    });

    // 2. 生成节点
    workflow.addNode("generate", async (state) => {
      const response = await this.model.invoke([
        new HumanMessage({ content: CODE_GENERATOR_PROMPT }),
        new HumanMessage({
          content: `分析结果: ${JSON.stringify(state.analysis)}`,
        }),
        ...state.messages,
      ]);
      return { rawCode: response.content };
    });

    // 3. 提取节点
    workflow.addNode("extract", async (state) => {
      // 这里可以进行流式处理或最终格式化
      const response = await this.model.invoke([
        new HumanMessage({ content: FILE_EXTRACTOR_PROMPT }),
        new HumanMessage({ content: state.rawCode }),
      ]);
      return { finalArtifact: response.content };
    });

    workflow.addEdge("analyze", "generate");
    workflow.addEdge("generate", "extract");
    workflow.addEdge("extract", END);

    workflow.setEntryPoint("analyze");
    this.graph = workflow.compile();
  }

  async *streamResponse(messages: BaseMessage[]) {
    // 实际实现中，我们会使用 graph.stream 来获取中间状态和最终输出
    // 并将 XML 内容实时推送到前端
  }
}
```

### 3. 流式数据解析器

#### 核心解析器实现

```typescript
// lib/agent/artifact-parser.ts
export class ArtifactParser {
  private buffer: string = "";
  private currentArtifact: Partial<BoltArtifact> | null = null;
  private currentAction: Partial<BoltAction> | null = null;
  private insideArtifact: boolean = false;
  private insideAction: boolean = false;

  /**
   * 解析流式 chunk
   * @param chunk 新接收的文本片段
   * @returns 解析出的事件数组
   */
  parse(chunk: string): ParsedChunk[] {
    this.buffer += chunk;
    const events: ParsedChunk[] = [];

    // 循环处理 buffer 中的所有标签
    while (true) {
      const event = this.parseNext();
      if (!event) break;
      events.push(event);
    }

    return events;
  }

  private parseNext(): ParsedChunk | null {
    // 检测 <boltArtifact> 开始
    if (!this.insideArtifact) {
      const artifactMatch = this.buffer.match(
        /<boltArtifact\s+id="([^"]+)"\s+title="([^"]+)">/
      );

      if (artifactMatch) {
        this.insideArtifact = true;
        this.currentArtifact = {
          id: artifactMatch[1],
          title: artifactMatch[2],
          actions: [],
        };

        // 移除已解析的部分
        this.buffer = this.buffer.slice(
          artifactMatch.index! + artifactMatch[0].length
        );

        return {
          type: "artifact",
          data: "",
          artifactId: this.currentArtifact.id,
        };
      }

      // 如果没有找到 artifact 标签，检查是否有普通文本
      const nextTagIndex = this.buffer.indexOf("<boltArtifact");
      if (nextTagIndex === -1 && this.buffer.length > 0) {
        // 保留最后 50 个字符以防标签被截断
        if (this.buffer.length > 50) {
          const text = this.buffer.slice(0, -50);
          this.buffer = this.buffer.slice(-50);
          return {
            type: "text",
            data: text,
          };
        }
      } else if (nextTagIndex > 0) {
        const text = this.buffer.slice(0, nextTagIndex);
        this.buffer = this.buffer.slice(nextTagIndex);
        return {
          type: "text",
          data: text,
        };
      }

      return null;
    }

    // 检测 <boltAction> 开始
    if (this.insideArtifact && !this.insideAction) {
      const actionMatch = this.buffer.match(
        /<boltAction\s+type="([^"]+)"\s+filePath="([^"]+)">/
      );

      if (actionMatch) {
        this.insideAction = true;
        this.currentAction = {
          type: actionMatch[1] as "file",
          filePath: actionMatch[2],
          content: "",
        };

        this.buffer = this.buffer.slice(
          actionMatch.index! + actionMatch[0].length
        );

        return {
          type: "action",
          data: this.currentAction as BoltAction,
          artifactId: this.currentArtifact!.id,
        };
      }

      // 检测 </boltArtifact> 结束
      const artifactEndMatch = this.buffer.match(/<\/boltArtifact>/);
      if (artifactEndMatch) {
        this.insideArtifact = false;
        this.buffer = this.buffer.slice(
          artifactEndMatch.index! + artifactEndMatch[0].length
        );

        const artifact = this.currentArtifact;
        this.currentArtifact = null;

        return {
          type: "complete",
          data: artifact as any,
          artifactId: artifact!.id,
        };
      }

      return null;
    }

    // 收集 action 内容
    if (this.insideAction) {
      const actionEndMatch = this.buffer.match(/<\/boltAction>/);

      if (actionEndMatch) {
        // 提取内容
        const content = this.buffer.slice(0, actionEndMatch.index!);
        this.currentAction!.content =
          (this.currentAction!.content || "") + content;

        // 将 action 添加到 artifact
        this.currentArtifact!.actions!.push(this.currentAction as BoltAction);

        this.buffer = this.buffer.slice(
          actionEndMatch.index! + actionEndMatch[0].length
        );
        this.insideAction = false;
        this.currentAction = null;

        return this.parseNext(); // 继续解析
      } else {
        // 内容尚未完整，保留最后 20 个字符防止标签被截断
        if (this.buffer.length > 20) {
          const content = this.buffer.slice(0, -20);
          this.currentAction!.content =
            (this.currentAction!.content || "") + content;
          this.buffer = this.buffer.slice(-20);

          // 返回内容更新事件
          return {
            type: "action",
            data: this.currentAction as BoltAction,
            artifactId: this.currentArtifact!.id,
          };
        }
      }

      return null;
    }

    return null;
  }

  /**
   * 获取当前解析状态
   */
  getState() {
    return {
      insideArtifact: this.insideArtifact,
      insideAction: this.insideAction,
      currentArtifact: this.currentArtifact,
      currentAction: this.currentAction,
      bufferLength: this.buffer.length,
    };
  }

  /**
   * 重置解析器
   */
  reset() {
    this.buffer = "";
    this.currentArtifact = null;
    this.currentAction = null;
    this.insideArtifact = false;
    this.insideAction = false;
  }

  /**
   * 完成解析，处理剩余的 buffer
   */
  finalize(): ParsedChunk[] {
    const events: ParsedChunk[] = [];

    // 处理剩余的文本
    if (this.buffer.length > 0 && !this.insideArtifact) {
      events.push({
        type: "text",
        data: this.buffer,
      });
    }

    this.reset();
    return events;
  }
}
```

#### 使用示例

```typescript
// 示例：解析流式数据
const parser = new ArtifactParser();

// 模拟流式接收数据
const chunks = [
  "好的，我来创建一个",
  '计时器应用。\n\n<boltArtifact id="project-',
  '1703123456789" title="计时器应用">',
  '\n<boltAction type="file" filePath="/index.html">',
  "<!DOCTYPE html>\n<html>\n<head>",
  "\n  <title>Timer</title>",
  "\n</head>\n</html>",
  "</boltAction>\n",
  "</boltArtifact>\n\n这就是代码。",
];

for (const chunk of chunks) {
  const events = parser.parse(chunk);
  events.forEach((event) => {
    console.log("Event:", event.type, event.data);
  });
}

const finalEvents = parser.finalize();
```

### 4. React Hook 集成

#### useArtifactStream Hook

```typescript
// hooks/use-artifact-stream.ts
import { useState, useCallback, useRef } from "react";
import { ArtifactParser } from "@/lib/agent/artifact-parser";
import { useCanvas } from "@/lib/canvas/context";

export function useArtifactStream() {
  const { updateFile } = useCanvas();
  const [messages, setMessages] = useState<string[]>([]);
  const [currentArtifact, setCurrentArtifact] = useState<BoltArtifact | null>(
    null
  );
  const [isStreaming, setIsStreaming] = useState(false);

  const parserRef = useRef(new ArtifactParser());
  const messageBufferRef = useRef("");

  const handleStreamChunk = useCallback(
    (chunk: string) => {
      const events = parserRef.current.parse(chunk);

      events.forEach((event) => {
        switch (event.type) {
          case "text":
            // 普通文本消息
            messageBufferRef.current += event.data;
            setMessages((prev) => {
              const newMessages = [...prev];
              if (newMessages.length > 0) {
                newMessages[newMessages.length - 1] = messageBufferRef.current;
              } else {
                newMessages.push(messageBufferRef.current);
              }
              return newMessages;
            });
            break;

          case "artifact":
            // 开始新的 artifact
            messageBufferRef.current = "";
            setCurrentArtifact({
              id: event.artifactId!,
              title: "",
              actions: [],
            });
            break;

          case "action":
            // 文件内容更新
            const action = event.data as BoltAction;
            if (action.filePath && action.content) {
              // 实时更新到沙箱
              updateFile(action.filePath, action.content);
            }
            break;

          case "complete":
            // artifact 完成
            const artifact = event.data as BoltArtifact;
            setCurrentArtifact(artifact);

            // 确保所有文件都更新到沙箱
            artifact.actions.forEach((action) => {
              if (action.type === "file" && action.filePath && action.content) {
                updateFile(action.filePath, action.content);
              }
            });
            break;
        }
      });
    },
    [updateFile]
  );

  const startStream = useCallback(
    async (input: string) => {
      setIsStreaming(true);
      parserRef.current.reset();
      messageBufferRef.current = "";

      try {
        const response = await fetch("/api/agent/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: input }),
        });

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // 处理剩余的 buffer
            const finalEvents = parserRef.current.finalize();
            finalEvents.forEach((event) => {
              if (event.type === "text") {
                messageBufferRef.current += event.data;
              }
            });
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          handleStreamChunk(chunk);
        }
      } catch (error) {
        console.error("Stream error:", error);
      } finally {
        setIsStreaming(false);
      }
    },
    [handleStreamChunk]
  );

  return {
    messages,
    currentArtifact,
    isStreaming,
    startStream,
  };
}
```

### 5. API Route 实现

#### 流式响应端点

```typescript
// app/api/agent/stream/route.ts
import { NextRequest, NextResponse } from "next/server";
import { CanvasAgent } from "@/lib/agent/canvas-agent";
import { HumanMessage } from "@langchain/core/messages";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { message, threadId } = await req.json();

    // 创建 agent 实例
    const agent = new CanvasAgent();

    // 获取历史消息（从数据库）
    const history = await getThreadHistory(threadId);

    // 添加新消息
    const messages = [...history, new HumanMessage({ content: message })];

    // 创建流式响应
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of agent.streamResponse(messages)) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Stream error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function getThreadHistory(threadId?: string) {
  if (!threadId) return [];

  // 从数据库获取历史消息
  // 这里需要实现实际的数据库查询
  return [];
}
```

### 6. 完整的交互流程

```
1. 用户在 Chat 界面输入："创建一个使用 shadcn/ui 的登录页面"
   ↓
2. 前端调用 /api/agent/stream
   POST { message: "...", threadId: "xxx" }
   ↓
3. LangGraph Agent 启动三阶段流程：
   a. Analyzer Agent: 分析需求，确定需要 Button, Input, Card 等 shadcn 组件。
   b. Code Generator Agent: 根据分析结果，生成符合 Bolt Artifact 协议的 Next.js 代码。
   c. File Generator Agent: 提取代码文件，确保 XML 格式正确并准备流式输出。
   ↓
4. 流式传输 XML 内容到前端
   chunk1: "<boltArtifact id='...' title='登录页面'>"
   chunk2: "<boltAction type='file' filePath='/components/login-form.tsx'>..."
   ...
   ↓
5. ArtifactParser 实时解析
   - 识别 <boltAction> 标签。
   - 提取文件路径和内容。
   - 实时更新到前端代码编辑器 (Monaco Editor)。
   ↓
6. 代码展示与同步
   - 用户在编辑器中看到代码逐字生成。
   - 所有代码文件生成完毕后，触发沙箱渲染。
   ↓
7. 沙箱渲染 (Sandbox Rendering)
   - 前端将完整的文件系统状态发送给沙箱 iframe。
   - 沙箱内部进行代码转译 (Babel) 和依赖加载。
   - 最终在预览区域展示渲染后的 React 组件。
```

### 7. 错误处理和边缘情况

#### 解析错误处理

```typescript
// lib/agent/error-handler.ts
export class ArtifactParserError extends Error {
  constructor(message: string, public code: string, public context?: any) {
    super(message);
    this.name = "ArtifactParserError";
  }
}

export function handleParseError(error: unknown, chunk: string) {
  if (error instanceof ArtifactParserError) {
    console.error("Parse error:", {
      code: error.code,
      message: error.message,
      context: error.context,
      chunk: chunk.slice(0, 100),
    });

    // 上报错误到监控服务
    reportError(error);

    // 返回降级方案：将内容作为普通文本显示
    return {
      type: "text" as const,
      data: chunk,
    };
  }

  throw error;
}

// 处理不完整的标签
export function isIncompleteTag(buffer: string): boolean {
  // 检查是否以不完整的标签结尾
  const openTagPattern = /<[^>]*$/;
  const incompleteAttrPattern = /\s[a-zA-Z]+="[^"]*$/;

  return openTagPattern.test(buffer) || incompleteAttrPattern.test(buffer);
}
```

#### 超时和重试机制

```typescript
// hooks/use-artifact-stream.ts (扩展)
export function useArtifactStream() {
  // ... 前面的代码

  const startStreamWithRetry = useCallback(
    async (input: string, maxRetries = 3) => {
      let attempt = 0;

      while (attempt < maxRetries) {
        try {
          await startStream(input);
          return; // 成功
        } catch (error) {
          attempt++;

          if (attempt >= maxRetries) {
            console.error("Max retries reached:", error);
            throw error;
          }

          // 指数退避
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000)
          );
        }
      }
    },
    [startStream]
  );

  return {
    // ... 其他返回值
    startStreamWithRetry,
  };
}
```

### 8. 性能优化

#### 批量更新策略

```typescript
// lib/agent/batch-updater.ts
export class BatchFileUpdater {
  private pendingUpdates: Map<string, string> = new Map();
  private updateTimer: NodeJS.Timeout | null = null;
  private batchDelay = 100; // ms

  constructor(private updateFile: (path: string, content: string) => void) {}

  scheduleUpdate(path: string, content: string) {
    this.pendingUpdates.set(path, content);

    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    this.updateTimer = setTimeout(() => {
      this.flush();
    }, this.batchDelay);
  }

  flush() {
    if (this.pendingUpdates.size === 0) return;

    // 批量更新所有文件
    this.pendingUpdates.forEach((content, path) => {
      this.updateFile(path, content);
    });

    this.pendingUpdates.clear();
    this.updateTimer = null;
  }

  destroy() {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.flush();
    }
  }
}
```

### 9. 调试工具

#### 解析器调试面板

```typescript
// components/debug/parser-debug-panel.tsx
"use client";

import { useEffect, useState } from "react";

export function ParserDebugPanel({ parser }: { parser: ArtifactParser }) {
  const [state, setState] = useState(parser.getState());

  useEffect(() => {
    const interval = setInterval(() => {
      setState(parser.getState());
    }, 100);

    return () => clearInterval(interval);
  }, [parser]);

  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black/90 text-white p-4 rounded-lg text-xs font-mono max-w-md">
      <h3 className="font-bold mb-2">Parser State</h3>
      <div className="space-y-1">
        <div>Inside Artifact: {state.insideArtifact ? "✅" : "❌"}</div>
        <div>Inside Action: {state.insideAction ? "✅" : "❌"}</div>
        <div>Buffer Length: {state.bufferLength}</div>
        <div>Current Artifact: {state.currentArtifact?.id || "None"}</div>
        <div>Current Action: {state.currentAction?.filePath || "None"}</div>
      </div>
    </div>
  );
}
```

## 总结

这个方案提供了一个生产级别的沙箱实现，包含：

1. **完整的架构设计**：主应用和沙箱应用分离
2. **类型安全的通信协议**：基于 PostMessage API
3. **状态管理**：使用状态机管理沙箱生命周期
4. **安全策略**：CSP、iframe 沙箱、CORS 配置
5. **性能优化**：防抖、缓存、增量更新
6. **错误处理**：完善的错误捕获和报告机制
7. **可测试性**：单元测试和集成测试策略
8. **生产部署**：Docker 配置和资源限制
9. **Agent 集成**：Bolt Artifact 协议解析和流式数据处理
10. **实时交互**：流式代码生成和实时预览

该方案可以支持：

- HTML/CSS/JS 的实时预览
- React/Vue 等框架的支持
- TypeScript/JSX 的实时转译
- 控制台日志捕获
- 构建错误提示
- 性能监控
- AI 流式代码生成
- 实时代码写入效果
