# useArtifactParser Hook 文档

## 概述

`useArtifactParser` 是一个专门用于解析 Artifact XML 标签的 Hook，支持流式解析，能够处理不完整的标签和增量更新。

## 职责范围

- 🔍 **XML 解析**：解析 `<boltArtifact>` 和 `<boltAction>` 标签
- 🌊 **流式支持**：处理不完整的标签和增量内容
- 📝 **文件提取**：提取多文件项目中的所有文件
- 📊 **状态跟踪**：跟踪文件生成状态（完成/生成中）
- 🎯 **文件选择**：管理当前选中的文件
- 💾 **缓存优化**：避免重复解析相同内容

## 类型定义

### ParsedFile

```typescript
interface ParsedFile {
  path: string; // 文件路径
  content: string; // 文件内容
  language: string; // 语言类型（用于语法高亮）
  isComplete: boolean; // 文件是否完全生成
  isGenerating: boolean; // 文件是否正在生成
}
```

### ArtifactData

```typescript
interface ArtifactData {
  id: string; // Artifact ID
  title: string; // 标题
  files: ParsedFile[]; // 文件列表
  currentGeneratingFile: string | null; // 当前正在生成的文件路径
}
```

## API

### 输入参数

```typescript
useArtifactParser(code: string): {
  artifact: ArtifactData | null;
  selectedFile: ParsedFile | null;
  selectFile: (file: ParsedFile) => void;
}
```

### 返回值

```typescript
{
  // 解析结果
  artifact: ArtifactData | null;    // 解析后的 artifact 数据

  // 文件选择
  selectedFile: ParsedFile | null;  // 当前选中的文件
  selectFile: (file: ParsedFile) => void; // 选择文件
}
```

## 使用示例

### 基础用法

```typescript
import { useArtifactParser } from "@/hooks/use-artifact-parser";

function CodeViewer({ code }: { code: string }) {
  const { artifact, selectedFile, selectFile } = useArtifactParser(code);

  if (!artifact) {
    return <div>没有检测到代码</div>;
  }

  return (
    <div>
      {/* 文件列表 */}
      <ul>
        {artifact.files.map((file) => (
          <li
            key={file.path}
            onClick={() => selectFile(file)}
            className={selectedFile?.path === file.path ? "active" : ""}
          >
            {file.path}
            {file.isGenerating && <span> (生成中...)</span>}
          </li>
        ))}
      </ul>

      {/* 代码内容 */}
      {selectedFile && (
        <pre>
          <code className={`language-${selectedFile.language}`}>
            {selectedFile.content}
          </code>
        </pre>
      )}
    </div>
  );
}
```

### 流式更新

```typescript
function StreamingCodeViewer() {
  const [streamingCode, setStreamingCode] = useState("");
  const { artifact } = useArtifactParser(streamingCode);

  // 模拟流式更新
  useEffect(() => {
    const chunks = [
      '<boltArtifact id="1" title="App">',
      '<boltAction type="file" filePath="App.tsx">',
      'import React from "react";\n',
      "function App() {\n",
      "  return <div>Hello</div>;\n",
      "}\n",
      "export default App;",
      "</boltAction>",
      "</boltArtifact>",
    ];

    let index = 0;
    const interval = setInterval(() => {
      if (index < chunks.length) {
        setStreamingCode((prev) => prev + chunks[index]);
        index++;
      } else {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      {artifact?.files.map((file) => (
        <div key={file.path}>
          <strong>{file.path}</strong>
          {file.isGenerating && " (生成中...)"}
          <pre>{file.content}</pre>
        </div>
      ))}
    </div>
  );
}
```

### 处理多文件项目

```typescript
function MultiFileProject({ code }: { code: string }) {
  const { artifact, selectedFile, selectFile } = useArtifactParser(code);

  if (!artifact) return null;

  const completedFiles = artifact.files.filter((f) => f.isComplete);
  const generatingFiles = artifact.files.filter((f) => f.isGenerating);

  return (
    <div>
      <h3>{artifact.title}</h3>

      {/* 已完成的文件 */}
      <div>
        <h4>已完成 ({completedFiles.length})</h4>
        {completedFiles.map((file) => (
          <button key={file.path} onClick={() => selectFile(file)}>
            {file.path}
          </button>
        ))}
      </div>

      {/* 正在生成的文件 */}
      {generatingFiles.length > 0 && (
        <div>
          <h4>生成中 ({generatingFiles.length})</h4>
          {generatingFiles.map((file) => (
            <div key={file.path}>
              {file.path} - {file.content.length} 字符
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

## 核心特性

### 1. ArtifactParserBuffer 缓冲机制

避免重复解析相同内容：

```typescript
class ArtifactParserBuffer {
  private buffer = "";
  private cachedResult: ArtifactData | null = null;

  parse(newContent: string): ArtifactData | null {
    // 内容没变，返回缓存
    if (newContent === this.buffer) {
      return this.cachedResult;
    }

    // 更新缓冲区
    this.buffer = newContent;
    this.cachedResult = this.parseArtifact(this.buffer);
    return this.cachedResult;
  }
}
```

### 2. 容错解析

支持不完整和格式不规范的标签：

```typescript
// ✅ 完整标签
<boltArtifact id="1" title="App">...</boltArtifact>

// ✅ 未闭合标签（流式）
<boltArtifact id="1" title="App">
  <boltAction type="file" filePath="App.tsx">
    const App = () => {
      // 内容还在生成中...

// ✅ 分别匹配 id 和 title（容错）
<boltArtifact id="1"
  title="App"
```

### 3. 文件生成状态跟踪

准确跟踪每个文件的生成状态：

```typescript
// 阶段 1: 完整闭合的文件（已完成）
<boltAction type="file" filePath="App.tsx">
  content...
</boltAction>
→ isComplete: true, isGenerating: false

// 阶段 2: 标签完整但内容未完成（正在生成）
<boltAction type="file" filePath="index.ts">
  const app =
→ isComplete: false, isGenerating: true

// 阶段 3: 标签未完成（正在打开）
<boltAction type="file" filePath=
→ 不创建文件对象，等待标签完成
```

### 4. 语言类型识别

根据文件扩展名自动识别语言：

```typescript
const languageMap: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  css: "css",
  json: "json",
  html: "html",
  md: "markdown",
  // ...
};

const ext = filePath.split(".").pop() || "";
const language = languageMap[ext] || "text";
```

### 5. 自动选择文件

智能选择默认文件：

```typescript
// 规则：
// 1. 如果有 index.tsx/index.ts，选择它
// 2. 如果有 App.tsx/App.ts，选择它
// 3. 否则选择第一个文件
// 4. 保持用户选择（已选中文件仍然存在时）

useEffect(() => {
  if (!artifact || artifact.files.length === 0) {
    setSelectedFile(null);
    return;
  }

  // 保持用户选择
  if (
    selectedFile &&
    artifact.files.some((f) => f.path === selectedFile.path)
  ) {
    return;
  }

  // 自动选择
  const indexFile = artifact.files.find((f) =>
    /^(index|App)\.(tsx?|jsx?)$/.test(f.path)
  );
  setSelectedFile(indexFile || artifact.files[0]);
}, [artifact]);
```

## 解析流程

### 完整流程图

```
输入 XML 字符串
    ↓
检查是否包含 <boltArtifact>
    ↓
提取 id 和 title
    ↓
提取文件（分两阶段）
    ↓
阶段 1: 完整闭合的文件
    ├─ 正则匹配: /<boltAction[^>]*>(.*?)<\/boltAction>/g
    ├─ 提取文件路径和内容
    └─ 标记为 isComplete: true
    ↓
阶段 2: 未闭合的文件（流式）
    ├─ 正则匹配: /<boltAction[^>]*>(.*)$/
    ├─ 提取部分内容
    └─ 标记为 isGenerating: true
    ↓
返回 ArtifactData
```

### 正则表达式详解

```typescript
// 1. 完整文件
/<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>([\s\S]*?)<\/boltAction>/g
//           ^^^^                        ^^^^^^^^^                    ^^^^^^^^^^
//           属性区域                    文件路径                      闭合标签

// 2. 未闭合文件
/<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>([\s\S]*?)$/
//                                                                  ^
//                                                                  到字符串末尾

// 3. ID 和 Title（容错版）
/<boltArtifact[^>]*id="([^"]*)"/    // 单独匹配 id
/title="([^"]*)"/                   // 单独匹配 title
```

## 性能优化

### 1. 缓存机制

避免重复解析：

```typescript
// 内容没变，直接返回缓存
if (newContent === this.buffer) {
  return this.cachedResult;
}
```

### 2. useMemo 优化

解析结果使用 `useMemo` 缓存：

```typescript
const parserBuffer = useMemo(() => new ArtifactParserBuffer(), []);

const artifact = useMemo(() => {
  return parserBuffer.parse(code);
}, [code, parserBuffer]);
```

### 3. 增量更新

只处理新增的内容，不重新解析已完成的部分。

## 注意事项

### 1. 空文件处理

即使文件列表为空，也返回 artifact 结构：

```typescript
if (files.length === 0) {
  console.warn("[parseArtifact] 未找到文件");
  return { id, title, files: [] }; // 保留结构
}
```

### 2. 路径唯一性

文件路径作为唯一标识：

```typescript
const processedPaths = new Set<string>();

if (processedPaths.has(filePath)) {
  continue; // 跳过重复文件
}
processedPaths.add(filePath);
```

### 3. 内容截断

日志输出时截断长内容：

```typescript
console.log(
  "[parseArtifact] 内容片段:",
  content.substring(0, 200) // 只显示前 200 字符
);
```

### 4. 流式场景优化

处理 chunk 被拆分的情况：

```typescript
// ❌ 可能被拆分
chunk1: '<boltAction type="fi';
chunk2: 'le" filePath="App.tsx">';

// ✅ 拼接后再解析
fullContent = chunk1 + chunk2;
parse(fullContent);
```

## 与其他 Hook 的配合

```typescript
// use-canvas.ts
import { useArtifactParser } from "./use-artifact-parser";

const { artifact, selectedFile, selectFile } = useArtifactParser(generatedCode);
```

## 相关文件

- `hooks/use-canvas.ts` - 使用此 Hook 的主要消费者
- `components/canvas/code-panel.tsx` - 代码展示组件
- `test/artifact-parser-streaming-test.ts` - 单元测试

## 测试

运行测试：

```bash
# 流式解析测试
npm test test/artifact-parser-streaming-test.ts
```

测试覆盖：

- ✅ 完整标签解析
- ✅ 流式不完整标签
- ✅ 多文件项目
- ✅ 文件生成状态
- ✅ 容错解析

## 更新日志

- **2024-12**: 添加文件生成状态跟踪
- **2024-11**: 优化流式解析性能
- **2024-10**: 添加缓冲机制
- **2024-09**: 初始版本
