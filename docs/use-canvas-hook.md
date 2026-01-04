# useCanvas Hook 文档

## 概述

`useCanvas` 是一个用于管理代码预览画布的 Hook，负责版本管理、代码更新、沙箱通信、文件选择等功能。

## 职责范围

- 📦 **版本管理**：加载、切换、缓存历史版本
- 📝 **代码更新**：接收流式代码、合并文件
- 🖥️ **沙箱通信**：将代码发送到 iframe 沙箱
- 📄 **文件选择**：管理多文件项目的文件切换
- 🎨 **UI 状态**：预览/代码切换、设备类型切换
- 📋 **复制功能**：复制代码到剪贴板

## 类型定义

### UseCanvasOptions

```typescript
interface UseCanvasOptions {
  /** 当前 threadId */
  threadId?: string;

  /** 初始代码内容 */
  initialCode?: string;
}
```

### UseCanvasReturn

```typescript
interface UseCanvasReturn {
  // 展开状态（已废弃，保留用于兼容）
  isExpanded: boolean;
  expand: () => void;
  collapse: () => void;
  toggle: () => void;

  // Artifact 数据
  artifact: ArtifactData | null;
  selectedFile: ParsedFile | null;
  selectFile: (file: ParsedFile) => void;

  // 版本管理
  versions: ArtifactVersion[];
  selectedVersion: number | null;
  isLoadingVersions: boolean;
  selectVersion: (versionNumber: number, allowSandboxUpdate?: boolean) => void;
  fetchVersionHistory: () => Promise<void>;
  refreshVersionList: () => Promise<void>;
  createOptimisticVersion: () => void;

  // UI 状态
  activeTab: "preview" | "code";
  setActiveTab: (tab: "preview" | "code") => void;
  selectedDevice: DeviceType;
  setSelectedDevice: (device: DeviceType) => void;

  // 代码更新
  setGeneratedCode: (code: string) => void;
  mergeAndSetGeneratedCode: (newCode: string) => void;
  generatedCode: string;

  // Sandbox 通信
  sendFilesToSandbox: (iframeRef: React.RefObject<HTMLIFrameElement>) => void;
  shouldSendToSandbox: boolean;
  setShouldSendToSandbox: (should: boolean) => void;

  // 复制功能
  copiedFile: string | null;
  copyToClipboard: (content: string, fileName: string) => Promise<void>;
}
```

### ArtifactVersion

```typescript
interface ArtifactVersion {
  id: string;
  versionNumber: number;
  createdAt: string;
  files: Array<{
    path: string;
    content: string;
  }>;
}
```

## 使用示例

### 基础用法

```typescript
import { useCanvas } from "@/hooks/use-canvas";

function CanvasPanel() {
  const { artifact, selectedFile, selectFile, activeTab, setActiveTab } =
    useCanvas({
      threadId: "thread-123",
    });

  return (
    <div>
      {/* Tab 切换 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="preview">预览</TabsTrigger>
          <TabsTrigger value="code">代码</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* 文件列表 */}
      <div>
        {artifact?.files.map((file) => (
          <button
            key={file.path}
            onClick={() => selectFile(file)}
            className={selectedFile?.path === file.path ? "active" : ""}
          >
            {file.path}
          </button>
        ))}
      </div>

      {/* 代码显示 */}
      {selectedFile && <pre>{selectedFile.content}</pre>}
    </div>
  );
}
```

### 版本管理

```typescript
const {
  versions,
  selectedVersion,
  selectVersion,
  fetchVersionHistory,
  isLoadingVersions,
} = useCanvas({ threadId });

// 加载版本历史
useEffect(() => {
  if (threadId) {
    fetchVersionHistory();
  }
}, [threadId]);

// 切换版本
const handleVersionChange = (versionNumber: number) => {
  selectVersion(versionNumber, true); // 允许更新沙箱
};

// 显示版本列表
{
  versions.map((version) => (
    <div
      key={version.id}
      onClick={() => handleVersionChange(version.versionNumber)}
      className={selectedVersion === version.versionNumber ? "active" : ""}
    >
      Version {version.versionNumber}
      <span>{new Date(version.createdAt).toLocaleString()}</span>
    </div>
  ));
}
```

### 沙箱通信

```typescript
const { sendFilesToSandbox, shouldSendToSandbox, setShouldSendToSandbox } =
  useCanvas({ threadId });

const iframeRef = useRef<HTMLIFrameElement>(null);

// 审查通过后允许渲染
const handleApprove = () => {
  setShouldSendToSandbox(true);
};

// 自动发送文件到沙箱
useEffect(() => {
  if (shouldSendToSandbox && artifact?.files.length > 0) {
    sendFilesToSandbox(iframeRef);
  }
}, [shouldSendToSandbox, artifact]);

// iframe 渲染
<iframe
  ref={iframeRef}
  src="/sandbox"
  onLoad={() => sendFilesToSandbox(iframeRef)}
/>;
```

### 代码更新和合并

```typescript
const { generatedCode, setGeneratedCode, mergeAndSetGeneratedCode } = useCanvas(
  { threadId }
);

// 完全替换代码（新生成）
const handleNewCode = (code: string) => {
  setGeneratedCode(code);
};

// 智能合并代码（修改模式）
const handleModifiedCode = (newCode: string) => {
  // 保留未修改的文件，只更新变化的文件
  mergeAndSetGeneratedCode(newCode);
};
```

### 乐观更新

```typescript
const { createOptimisticVersion } = useCanvas({ threadId });

// 在流式生成开始时创建临时版本
onStreamStart: () => {
  createOptimisticVersion(); // 创建 "正在生成..." 版本
};
```

## 核心特性

### 1. 版本缓存机制

使用 Map 缓存版本数据，避免重复请求：

```typescript
// 每个 threadId 独立的缓存
const versionCache = new Map<string, Map<number, ArtifactVersion>>();

// 缓存版本
const cacheVersion = (version: ArtifactVersion) => {
  const cache = getThreadCache();
  cache.set(version.versionNumber, version);
};

// 从缓存获取
const getCachedVersion = (versionNumber: number) => {
  const cache = getThreadCache();
  return cache.get(versionNumber);
};
```

### 2. 文件合并算法

智能合并新旧代码，保留未修改的文件：

```typescript
const mergeAndSetGeneratedCode = (newCode: string) => {
  const newArtifact = parseArtifactFromContent(newCode);
  if (!newArtifact) return;

  // 从缓存中获取旧文件
  const oldFiles = currentVersionFilesRef.current;
  const newFilesMap = new Map<string, string>();

  // 添加新文件
  newArtifact.files.forEach((file) => {
    newFilesMap.set(file.path, file.content);
  });

  // 合并：保留旧文件 + 添加/覆盖新文件
  const mergedFiles = new Map(oldFiles);
  newFilesMap.forEach((content, path) => {
    mergedFiles.set(path, content);
  });

  // 生成 XML
  const filesXml = Array.from(mergedFiles.entries())
    .map(
      ([path, content]) =>
        `<boltAction type="file" filePath="${path}">\n${content}\n</boltAction>`
    )
    .join("\n");

  setGeneratedCode(`<boltArtifact...>\n${filesXml}\n</boltArtifact>`);
};
```

### 3. 沙箱通信协议

通过 `postMessage` 发送文件到沙箱：

```typescript
const sendFilesToSandbox = (iframeRef) => {
  if (!artifact?.files.length) return;

  const iframe = iframeRef.current;
  if (!iframe?.contentWindow) return;

  iframe.contentWindow.postMessage(
    {
      type: "UPDATE_FILES",
      files: artifact.files.map((file) => ({
        path: file.path,
        content: file.content,
      })),
    },
    "*"
  );
};
```

### 4. 乐观更新

创建临时版本，展示代码生成过程：

```typescript
const createOptimisticVersion = () => {
  if (!threadId) return;

  const optimisticVersion: ArtifactVersion = {
    id: "optimistic-" + Date.now(),
    versionNumber: -1,
    createdAt: new Date().toISOString(),
    files: [
      {
        path: "loading.txt",
        content: "代码生成中，请稍候...",
      },
    ],
  };

  setVersions((prev) => [optimisticVersion, ...prev]);
  setSelectedVersion(-1);
};
```

### 5. 版本刷新策略

区分两种刷新场景：

```typescript
// 场景 1：完整刷新（切换到最新版本）
fetchVersionHistory: async () => {
  // 1. 加载版本列表
  // 2. 切换到最新版本
  // 3. 更新代码内容
  // 4. 允许渲染
};

// 场景 2：静默刷新（只更新列表，不切换）
refreshVersionList: async () => {
  // 1. 加载版本列表
  // 2. 保持当前选中版本
  // 3. 不触发代码更新
};
```

## 使用 use-artifact-parser

内部使用 `useArtifactParser` 解析代码：

```typescript
import { useArtifactParser } from "./use-artifact-parser";

const { artifact, selectedFile, selectFile } = useArtifactParser(generatedCode);
```

解析结果包含：

- `artifact`: 解析后的 artifact 数据
- `selectedFile`: 当前选中的文件
- `selectFile`: 切换文件的方法

## 注意事项

### 1. 沙箱渲染控制

默认不自动渲染，需要审查通过后才允许：

```typescript
// 初始状态
const [shouldSendToSandbox, setShouldSendToSandbox] = useState(false);

// 审查通过后
handleApprove: () => {
  setShouldSendToSandbox(true);
};

// 只有 shouldSendToSandbox=true 时才发送
if (shouldSendToSandbox && artifact?.files.length > 0) {
  sendFilesToSandbox(iframeRef);
}
```

### 2. 版本缓存有效期

缓存在整个应用生命周期内有效：

```typescript
// 全局缓存
const versionCache = new Map<string, Map<number, ArtifactVersion>>();

// 切换 threadId 时缓存保留
// 如需清理缓存：
versionCache.delete(oldThreadId);
```

### 3. 文件合并时机

只在 modify 模式下使用 `mergeAndSetGeneratedCode`：

```typescript
// Create 模式：完全替换
if (mode === "create") {
  setGeneratedCode(newCode);
}

// Modify 模式：智能合并
if (mode === "modify") {
  mergeAndSetGeneratedCode(newCode);
}
```

### 4. 展开状态已废弃

`isExpanded`、`expand`、`collapse` 等接口已废弃：

```typescript
// ❌ 不再使用
const [isExpanded, setIsExpanded] = useState(false);

// ✅ 现在使用固定布局
// Canvas 始终显示在右侧，无需展开/收起
```

## 性能优化

1. **版本缓存**：避免重复请求相同版本
2. **文件缓存**：存储当前版本文件，用于合并
3. **条件渲染**：只在需要时发送文件到沙箱
4. **延迟加载**：版本列表按需加载

## 与其他 Hook 的配合

```typescript
// unified-chat.tsx
const chat = useChat({
  onArtifactDetected: (content) => {
    canvas.setGeneratedCode(content); // 实时更新代码
  },
  onStreamStart: () => {
    canvas.createOptimisticVersion(); // 创建乐观版本
  },
  onStreamComplete: async (content) => {
    await saveArtifact(content); // 保存到数据库
    canvas.refreshVersionList(); // 刷新版本列表
  },
});

const canvas = useCanvas({ threadId });
```

## 相关文件

- `hooks/use-artifact-parser.ts` - Artifact 解析引擎
- `components/canvas/canvas-panel.tsx` - 使用此 Hook 的主组件
- `app/api/agent/history/[threadId]/route.ts` - 版本历史 API

## 更新日志

- **2024-12**: 添加文件合并功能，支持 modify 模式
- **2024-11**: 添加版本缓存机制
- **2024-10**: 添加沙箱渲染控制
- **2024-09**: 初始版本
