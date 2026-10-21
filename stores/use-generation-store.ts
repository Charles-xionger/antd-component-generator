import { create } from "zustand";

export enum GenerationStage {
  IDLE = "idle",
  INTENT = "intent",
  REQUIREMENTS = "requirements",
  AWAITING_CONFIRMATION = "awaiting_confirmation",
  RESPONDING = "responding",
  ARCHITECTURE = "architecture",
  CODING = "coding",
  VALIDATING = "validating",
  REPAIRING = "repairing",
  FAILED = "failed",
}

export type GenerationStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export interface GenerationStep {
  stage: GenerationStage;
  status: GenerationStepStatus;
}

export const GENERATION_STAGE_META: Record<
  GenerationStage,
  { label: string; description: string }
> = {
  [GenerationStage.IDLE]: {
    label: "准备就绪",
    description: "等待新的业务需求",
  },
  [GenerationStage.INTENT]: {
    label: "识别业务意图",
    description: "判断是创建、修改、修复还是一般咨询",
  },
  [GenerationStage.REQUIREMENTS]: {
    label: "梳理业务需求",
    description: "明确角色、流程、数据、规则和验收结果",
  },
  [GenerationStage.AWAITING_CONFIRMATION]: {
    label: "等待需求确认",
    description: "确认规格后再进入应用设计与开发",
  },
  [GenerationStage.RESPONDING]: {
    label: "组织回复",
    description: "根据当前应用上下文生成答复",
  },
  [GenerationStage.ARCHITECTURE]: {
    label: "设计应用方案",
    description: "生成页面、关系模型、接口和验收场景",
  },
  [GenerationStage.CODING]: {
    label: "生成全栈应用",
    description: "生成 React、Go、SQL Migration 和业务测试",
  },
  [GenerationStage.VALIDATING]: {
    label: "校验生成结果",
    description: "检查文件完整性、契约和运行时安全规则",
  },
  [GenerationStage.REPAIRING]: {
    label: "修复生成结果",
    description: "根据校验结果自动修复应用代码",
  },
  [GenerationStage.FAILED]: {
    label: "生成未完成",
    description: "处理过程中发生错误，请查看提示后重试",
  },
};

interface GenerationState {
  isGenerating: boolean;
  stage: GenerationStage;
  currentMessageId?: string;
  steps: GenerationStep[];
  error?: string;
  startThinking: (messageId?: string) => void;
  startGenerating: (messageId?: string) => void;
  updateStage: (
    stage: GenerationStage,
    status?: GenerationStepStatus,
    messageId?: string,
  ) => void;
  fail: (message?: string) => void;
  complete: () => void;
  reset: () => void;
}

function updateSteps(
  steps: GenerationStep[],
  stage: GenerationStage,
  status: GenerationStepStatus,
) {
  if (stage === GenerationStage.IDLE) return steps;
  const existing = steps.findIndex((step) => step.stage === stage);
  if (existing === -1) return [...steps, { stage, status }];
  return steps.map((step, index) =>
    index === existing ? { ...step, status } : step,
  );
}

export const useGenerationStore = create<GenerationState>((set) => ({
  isGenerating: false,
  stage: GenerationStage.IDLE,
  currentMessageId: undefined,
  steps: [],
  error: undefined,

  startThinking: (messageId) =>
    set({
      isGenerating: true,
      stage: GenerationStage.INTENT,
      currentMessageId: messageId,
      steps: [{ stage: GenerationStage.INTENT, status: "running" }],
      error: undefined,
    }),

  startGenerating: (messageId) =>
    set((state) => ({
      isGenerating: true,
      stage: GenerationStage.CODING,
      currentMessageId: messageId ?? state.currentMessageId,
      steps: updateSteps(state.steps, GenerationStage.CODING, "running"),
    })),

  updateStage: (stage, status = "running", messageId) =>
    set((state) => ({
      isGenerating: status !== "failed",
      stage,
      currentMessageId: messageId ?? state.currentMessageId,
      steps: updateSteps(state.steps, stage, status),
      error: status === "failed" ? state.error : undefined,
    })),

  fail: (message) =>
    set((state) => ({
      isGenerating: false,
      stage: GenerationStage.FAILED,
      steps: updateSteps(state.steps, state.stage, "failed"),
      error: message,
    })),

  complete: () =>
    set((state) => ({
      isGenerating: false,
      stage: GenerationStage.IDLE,
      currentMessageId: undefined,
      steps: state.steps.map((step) =>
        step.status === "running" ? { ...step, status: "completed" } : step,
      ),
    })),

  reset: () =>
    set({
      isGenerating: false,
      stage: GenerationStage.IDLE,
      currentMessageId: undefined,
      steps: [],
      error: undefined,
    }),
}));

export const useIsGenerating = () =>
  useGenerationStore((state) => state.isGenerating);
export const useGenerationStage = () =>
  useGenerationStore((state) => state.stage);
export const useGenerationSteps = () =>
  useGenerationStore((state) => state.steps);
export const useProgressText = () =>
  useGenerationStore((state) =>
    state.stage === GenerationStage.IDLE
      ? undefined
      : GENERATION_STAGE_META[state.stage]?.label,
  );
export const useGenerationActions = () =>
  useGenerationStore((state) => ({
    startThinking: state.startThinking,
    startGenerating: state.startGenerating,
    updateStage: state.updateStage,
    complete: state.complete,
    reset: state.reset,
  }));
