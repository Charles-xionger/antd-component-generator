// components/canvas/types.ts

export interface Message {
  id: string;
  type: "human" | "ai";
  content: string;
  isCollapsed?: boolean;
}

export interface ArtifactVersion {
  id: string;
  versionNumber: number;
  description: string;
  createdAt: string;
  files: {
    path: string;
    content: string;
  }[];
}

export interface HistoryFile {
  id: string;
  path: string;
  content: string;
}

export interface LangGraphMessage {
  id: string;
  type: string;
  content: string;
}

export interface ParsedFile {
  path: string;
  content: string;
  language: string;
  isComplete: boolean; // 文件是否完全生成
  isGenerating: boolean; // 文件是否正在生成
}

export interface Artifact {
  id: string;
  title: string;
  files: ParsedFile[];
}

export type DeviceType = "desktop" | "tablet" | "mobile";
export type TabType = "preview" | "code";
