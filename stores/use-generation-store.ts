// stores/use-generation-store.ts
import { create } from "zustand";

/**
 * 生成阶段枚举
 */
export enum GenerationStage {
  /** 空闲状态 */
  IDLE = "idle",
  /** Architect 规划阶段 */
  ARCHITECT = "architect",
  /** Coder 代码生成阶段 */
  CODING = "coding",
}

/**
 * 生成状态接口
 */
export interface GenerationState {
  /** 是否正在生成中 */
  isGenerating: boolean;
  /** 当前生成阶段 */
  stage: GenerationStage;
  /** 生成进度描述（可选） */
  progressText?: string;
  /** 当前处理的消息 ID */
  currentMessageId?: string;
}

/**
 * 生成状态操作接口
 */
export interface GenerationActions {
  /** 开始 Architect 规划 */
  startArchitect: (messageId?: string) => void;
  /** 完成 Architect，进入 Coding */
  startCoding: (messageId?: string) => void;
  /** 完成所有生成 */
  complete: () => void;
  /** 重置状态 */
  reset: () => void;
  /** 设置进度文本 */
  setProgressText: (text?: string) => void;
}

/**
 * 生成状态 Store
 */
export type GenerationStore = GenerationState & GenerationActions;

/**
 * 创建生成状态 Store
 */
export const useGenerationStore = create<GenerationStore>((set) => ({
  // 初始状态
  isGenerating: false,
  stage: GenerationStage.IDLE,
  progressText: undefined,
  currentMessageId: undefined,

  // Actions
  startArchitect: (messageId) =>
    set({
      isGenerating: true,
      stage: GenerationStage.ARCHITECT,
      currentMessageId: messageId,
      progressText: "正在分析需求和规划架构...",
    }),

  startCoding: (messageId) =>
    set({
      isGenerating: true,
      stage: GenerationStage.CODING,
      currentMessageId: messageId,
      progressText: "正在生成代码，请稍候...",
    }),

  complete: () =>
    set({
      isGenerating: false,
      stage: GenerationStage.IDLE,
      currentMessageId: undefined,
      progressText: undefined,
    }),

  reset: () =>
    set({
      isGenerating: false,
      stage: GenerationStage.IDLE,
      currentMessageId: undefined,
      progressText: undefined,
    }),

  setProgressText: (text) =>
    set({
      progressText: text,
    }),
}));

/**
 * 便捷的 Selector Hooks
 */

/** 获取是否正在生成中 */
export const useIsGenerating = () =>
  useGenerationStore((state) => state.isGenerating);

/** 获取当前生成阶段 */
export const useGenerationStage = () =>
  useGenerationStore((state) => state.stage);

/** 获取进度文本 */
export const useProgressText = () =>
  useGenerationStore((state) => state.progressText);

/** 获取生成状态和操作 */
export const useGenerationActions = () =>
  useGenerationStore((state) => ({
    startArchitect: state.startArchitect,
    startCoding: state.startCoding,
    complete: state.complete,
    reset: state.reset,
    setProgressText: state.setProgressText,
  }));
