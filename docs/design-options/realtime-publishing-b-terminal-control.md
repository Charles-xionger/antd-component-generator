---
version: "candidate-b"
name: "Oompt · Terminal Control"
description: "把发布塑造成实时控制台；深石墨占 60%，分层灰占 30%，磷光绿与状态色占 10%。"
colors:
  primary: { 1: "#10261C", 5: "#4ADE80", 6: "#22C55E", 7: "#16A34A" }
  secondary: { 1: "#172033", 5: "#8B9AAF", 6: "#64748B", 7: "#475569" }
  neutral:
    bg-layout: "#090C11"
    bg-container: "#11161F"
    border: "#293241"
    divider: "#202837"
    text-primary: "#E8EDF5"
    text-secondary: "#9BA8BA"
    text-disabled: "#667386"
  status:
    success: { 1: "#10261C", 6: "#22C55E", 7: "#16A34A" }
    warning: { 1: "#2D2311", 6: "#F5B942", 7: "#D99A24" }
    error: { 1: "#30171B", 6: "#F0646E", 7: "#D94B57" }
    info: { 1: "#11243A", 6: "#4C9AFF", 7: "#2E7DD1" }
  light:
    bg-layout: "#F3F5F7"
    bg-container: "#FFFFFF"
    border: "#CDD5DF"
    text-primary: "#18202B"
    text-secondary: "#59677A"
typography:
  font-family: "Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  font-mono: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace"
  h1: { size: "28px", weight: "600", line-height: "36px" }
  h2: { size: "20px", weight: "600", line-height: "28px" }
  body-md: { size: "14px", weight: "400", line-height: "22px" }
  caption: { size: "12px", weight: "450", line-height: "18px" }
spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px", xxl: "48px", xxxl: "64px" }
rounded: { sm: "4px", md: "8px", lg: "12px", full: "9999px" }
components:
  basics:
    Button:
      description: "控制台动作单元。"
      variants: { primary: "绿实底深色字", secondary: "深底细边框", ghost: "透明", danger: "红色边框" }
      sizes: { sm: "32px", md: "40px" }
      states: { hover: "边框与文字增亮", focus: "2px 绿色外圈", disabled: "低对比" }
    Badge:
      description: "状态短标签，含图标与文字。"
      variants: { success: "绿色", running: "蓝色", error: "红色", neutral: "灰色" }
    Progress:
      description: "以终端轨道呈现阶段。"
      variants: { linear: "4px 轨道", steps: "点线时间轴" }
    Tooltip: { description: "暗色浮层技术提示。", states: { open: "无位移动画" } }
    Skeleton: { description: "低闪烁暗色骨架。", variants: { line: "文本", block: "面板" } }
    Modal: { description: "高风险确认。", sizes: { md: "560px", lg: "720px" } }
    Drawer: { description: "右侧审计详情。", sizes: { md: "440px", lg: "560px" } }
  composites:
    StatusHeader:
      description: "类似任务运行头部，含状态点、阶段和耗时。"
      variants: { running: "蓝色状态点", success: "绿色", failed: "红色", offline: "灰色" }
    ActivityStream:
      description: "页面核心的实时控制台。"
      variants: { live: "绿光标与自动跟随", paused: "顶部未读条", frozen: "只读" }
      states: { error: "红色整行强调", reconnecting: "琥珀连接提示" }
    ErrorResolution:
      description: "控制台上方的恢复命令区。"
      variants: { known: "明确步骤", unknown: "复制诊断" }
    ProjectReleaseCard:
      description: "紧凑的应用运行卡。"
      variants: { online: "绿点", publishing: "动态点", attention: "红点", offline: "灰点" }
  business:
    PublishPreflight: { description: "清单式发布前检查。", variants: { ready: "全绿", blocked: "错误锁定" } }
    DeploymentStatusView: { description: "运行控制台式发布页。", variants: { running: "活动", success: "冻结", failed: "恢复" } }
    ReleaseCenter: { description: "紧凑项目列表与右侧详情。", variants: { populated: "列表", empty: "命令提示", loading: "暗色骨架" } }
    DeploymentDetailDrawer: { description: "审计时间线与原始日志。", variants: { success: "绿时间线", failed: "红时间线" } }
    ReleaseConfirmation: { description: "回滚/下线确认。", variants: { rollback: "中性", unpublish: "危险" } }
---

# B · Terminal Control

## 设计意图

把发布过程表达成可观察的实时系统。主状态仍在页面上方，但活动流占据更大视觉面积；等宽字体、细分隔线和状态光点形成工程控制台气质。适合技术用户，但会提高非技术用户的认知负担。

## 布局与节奏

- 桌面内容最大宽度 1280px；状态区与日志区约 35/65。
- 面板 8px 圆角，边框比背景亮一级；绝不使用大面积纯黑。
- 日志行高 22px，时间、阶段、消息三列对齐。
- 动画仅用于状态点和新行淡入，150ms，支持减少动画。

## 适用取舍

实时感最强、技术证据最充足，但日志更容易成为视觉主角，与当前“结果优先”的产品方向存在轻微冲突。
