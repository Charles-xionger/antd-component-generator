// stores/use-generation-store.ts
import { create } from "zustand";

/**
 * 生成阶段枚举
 */
export enum GenerationStage {
  /** 空闲状态 */
  IDLE = "idle",
  /** 思考中（通用状态） */
  THINKING = "thinking",
  /** 生成中（通用状态） */
  GENERATING = "generating",
}

/**
 * 生成状态接口
 */
export interface GenerationState {
  /** 是否正在生成中 */
  isGenerating: boolean;
  /** 当前生成阶段 */
  stage: GenerationStage;
  /** 当前处理的消息 ID */
  currentMessageId?: string;
}

/**
 * 生成状态操作接口
 */
export interface GenerationActions {
  /** 开始思考 */
  startThinking: (messageId?: string) => void;
  /** 开始生成内容 */
  startGenerating: (messageId?: string) => void;
  /** 完成所有生成 */
  complete: () => void;
  /** 重置状态 */
  reset: () => void;
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
  currentMessageId: undefined,

  // Actions
  startThinking: (messageId) =>
    set({
      isGenerating: true,
      stage: GenerationStage.THINKING,
      currentMessageId: messageId,
    }),

  startGenerating: (messageId) =>
    set({
      isGenerating: true,
      stage: GenerationStage.GENERATING,
      currentMessageId: messageId,
    }),

  complete: () =>
    set({
      isGenerating: false,
      stage: GenerationStage.IDLE,
      currentMessageId: undefined,
    }),

  reset: () =>
    set({
      isGenerating: false,
      stage: GenerationStage.IDLE,
      currentMessageId: undefined,
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
export const useProgressText = () => undefined;

/** 获取生成状态和操作 */
export const useGenerationActions = () =>
  useGenerationStore((state) => ({
    startThinking: state.startThinking,
    startGenerating: state.startGenerating,
    complete: state.complete,
    reset: state.reset,
  }));
