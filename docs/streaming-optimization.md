# 流式渲染优化总结

## 问题分析

### 现象

- 第一个文件：流式显示 ✅
- 后续文件：突然蹦出 ❌

### 根本原因

1. `use-artifact-parser` 默认总是选择第一个文件
2. 没有跟踪"当前正在生成的文件"状态
3. 缺少视觉反馈（文件生成状态指示器）

## 优化方案

### 1. 增强数据结构

#### ParsedFile 接口

```typescript
export interface ParsedFile {
  path: string;
  content: string;
  language: string;
  isComplete: boolean; // 文件是否完全生成
  isGenerating: boolean; // 文件是否正在生成
}
```

#### ArtifactData 接口

```typescript
export interface ArtifactData {
  id: string;
  title: string;
  files: ParsedFile[];
  currentGeneratingFile: string | null; // 当前正在生成的文件路径
}
```

### 2. 解析器优化

#### extractFilesWithState 方法

三阶段解析，精确跟踪每个文件的生成状态：

1. **阶段 1**: 完整闭合的文件

   - `isComplete: true`
   - `isGenerating: false`

2. **阶段 2**: 标签完整但内容未完成

   - `isComplete: false`
   - `isGenerating: true` （正在流式写入）

3. **阶段 3**: 标签不完整的文件
   - `isComplete: false`
   - `isGenerating: false` （等待生成）

#### 状态追踪

```typescript
const { files, currentGeneratingFile } = this.extractFilesWithState(content);
```

### 3. Hook 优化

#### useArtifactParser 自动切换

```typescript
// 检测到新文件开始生成时，自动切换过去
useEffect(() => {
  if (artifact?.currentGeneratingFile !== lastGeneratingFile) {
    console.log(
      "[Artifact Parser] 检测到新文件生成:",
      artifact.currentGeneratingFile
    );
    setSelectedFilePath(artifact.currentGeneratingFile);
    setLastGeneratingFile(artifact.currentGeneratingFile);
  }
}, [artifact?.currentGeneratingFile, lastGeneratingFile]);
```

#### 文件选择优先级

1. 用户手动选择的文件
2. 当前正在生成的文件（自动切换）
3. 第一个文件（兜底）

### 4. UI 增强

#### 文件列表视觉反馈

```tsx
{
  /* 生成状态指示器 */
}
{
  file.isGenerating && (
    <span className="flex items-center gap-1 text-blue-400 text-xs">
      <span className="animate-pulse">●</span>
    </span>
  );
}
{
  file.isComplete && !file.isGenerating && (
    <span className="text-green-500 text-xs">✓</span>
  );
}
```

**状态说明**：

- 🔵 蓝色脉冲点：正在生成
- ✅ 绿色对勾：已完成

## 效果

### 优化前

```
文件1 (流式) ███████████████░░░
文件2 (突然)                    ██████
文件3 (突然)                          ███
```

### 优化后

```
文件1 (流式) ███████████████░░░
文件2 (流式)                    ██████░░
文件3 (流式)                          ███░
```

## 技术细节

### 流式解析流程

```
SSE Chunk 到达
    ↓
ArtifactParserBuffer 缓冲
    ↓
extractFilesWithState 解析
    ├─ 识别完整文件
    ├─ 识别正在生成的文件 ← currentGeneratingFile
    └─ 识别等待生成的文件
    ↓
useArtifactParser 检测变化
    ↓
自动切换到新文件 (setSelectedFilePath)
    ↓
CodePanel 渲染
    ├─ 文件列表显示状态指示器
    └─ 编辑器显示正在生成的文件内容
```

### 性能优化

- 使用 `useMemo` 缓存解析结果
- 使用 `useEffect` 监听文件切换
- 增量更新而非全量重绘

## 测试建议

### 测试场景

1. 单文件生成：验证流式显示
2. 多文件生成：验证自动切换
3. 快速切换：验证状态更新
4. 中断重试：验证错误恢复

### 预期行为

- 每个文件都应该看到流式效果
- 文件列表应该实时显示生成状态
- 用户手动选择文件后，不应自动切换
- 生成完成后，所有文件都显示完成标记

## 扩展空间

### 未来优化方向

1. **进度条**：显示整体生成进度
2. **光标动画**：编辑器中显示打字光标
3. **声音反馈**：文件完成时播放提示音
4. **性能监控**：记录每个文件的生成时间
