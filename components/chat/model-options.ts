export interface ChatModelOption {
  id: string;
  name: string;
  icon: string;
}

export const CHAT_MODEL_OPTIONS: readonly ChatModelOption[] = [
  {
    id: "qwen3.7-flash-2026-07-15",
    name: "Qwen 3.7 Flash (2026-07-15)",
    icon: "Q",
  },
  {
    id: "qwen3.8-max-0902",
    name: "Qwen 3.8 Max (0902)",
    icon: "Q",
  },
  {
    id: "qwen3.7-flash",
    name: "Qwen 3.7 Flash (Latest)",
    icon: "Q",
  },
  {
    id: "deepseek-v4-flash-0731",
    name: "DeepSeek V4 Flash",
    icon: "D",
  },
];
