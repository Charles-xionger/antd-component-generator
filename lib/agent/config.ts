// lib/agent/config.ts
// AI 代理配置

/**
 * 流式响应配置
 */
export const STREAM_CONFIG = {
  // 心跳间隔（毫秒）- 防止连接超时
  HEARTBEAT_INTERVAL: 15000, // 15秒

  // 心跳检查阈值（毫秒）- 超过此时间未发送数据则发送心跳
  HEARTBEAT_THRESHOLD: 15000, // 15秒

  // Vercel 函数最大执行时间（秒）
  MAX_DURATION: 300, // 5分钟（Pro 计划）
} as const;

/**
 * 模型 API 配置
 */
export const MODEL_API_CONFIG = {
  // API 调用超时时间（毫秒）
  TIMEOUT: 120000, // 120秒

  // 最大重试次数
  MAX_RETRIES: 5,

  // 最大输出 token 数（避免内容被截断）
  MAX_TOKENS: 16000, // 默认 16000，足够生成大型、复杂组件

  // 温度设置
  TEMPERATURE: {
    DEFAULT: 0.7,
    TITLE_GENERATION: 0.3,
    CODE_GENERATION: 0.3,
  },
} as const;

/**
 * 代码生成配置
 */
export const CODE_GENERATION_CONFIG = {
  // 单个文件最大大小（字符数）
  MAX_FILE_SIZE: 50000,

  // 最大文件数量
  MAX_FILES: 50,

  // 流式解析缓冲区大小
  PARSE_BUFFER_SIZE: 4096,
} as const;

/**
 * 错误处理配置
 */
export const ERROR_CONFIG = {
  // 错误重试延迟（毫秒）
  RETRY_DELAY: 1000,

  // 超时错误消息
  TIMEOUT_MESSAGE:
    "请求超时，可能是因为代码生成时间过长。请尝试简化需求或重试。",

  // 网络错误消息
  NETWORK_MESSAGE: "网络连接出现问题，请检查网络后重试。",

  // 中断错误消息
  ABORT_MESSAGE: "请求被中断，请重新发送消息。",

  // 默认错误消息
  DEFAULT_MESSAGE: "抱歉，发生了错误。请重试。",
} as const;
