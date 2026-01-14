// components/canvas/index.ts
// 统一导出 canvas 相关组件

export { CanvasCard } from "./canvas-card";
export { CanvasPanel } from "./canvas-panel";
export { CodePanel } from "./code-panel";
export { PreviewPanel } from "./preview-panel";
export { PreviewToolbar } from "./preview-toolbar";
export { FileIcon } from "./file-icon";
export { FullscreenPreview } from "./fullscreen-preview";
export { ErrorToast } from "./error-toast";

// Types
export type {
  Message,
  ArtifactVersion,
  HistoryFile,
  LangGraphMessage,
  ParsedFile,
  Artifact,
  DeviceType,
  TabType,
} from "./types";
