---
version: "1.0"
name: "Oompt · Terminal Control"
description: "实时发布与应用管理设计系统；深石墨占 60%，分层灰占 30%，磷光绿与功能状态色控制在 10%。"
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
    divider: "#E4E8ED"
    text-primary: "#18202B"
    text-secondary: "#59677A"
    text-disabled: "#8B96A6"
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
      description: "所有明确动作的基础控件；同一语义通过 variant 表达。"
      variants:
        primary: { bg: "colors.primary.6", text: "#07110B", hover-bg: "colors.primary.5", active-bg: "colors.primary.7" }
        secondary: { bg: "transparent", text: "colors.neutral.text-primary", border: "colors.neutral.border" }
        ghost: { bg: "transparent", text: "colors.neutral.text-secondary", border: "transparent" }
        danger: { bg: "transparent", text: "colors.status.error.6", border: "colors.status.error.6" }
      sizes: { sm: { height: "32px" }, md: { height: "40px" } }
      states: { hover: "边框与文字增亮", focus: "2px 外圈", disabled: "降低对比并禁用交互" }
      radius: "rounded.sm"
    Badge:
      description: "状态短标签，必须同时包含图标或文字，不能只依赖颜色。"
      variants: { success: "绿色", running: "蓝色", warning: "琥珀色", error: "红色", neutral: "灰色" }
      radius: "rounded.full"
    Progress:
      description: "发布的六阶段进度，始终配阶段名称和当前状态。"
      variants: { linear: "4px 轨道", steps: "点线时间轴" }
    Tooltip:
      description: "承载截断文本与次要技术说明。"
      states: { open: "120ms 淡入，无位移" }
    Skeleton:
      description: "保留页面结构、避免加载时误报为空。"
      variants: { line: "文本占位", block: "面板占位" }
    Modal:
      description: "发布前、回滚和下线确认。"
      sizes: { md: "560px", lg: "720px" }
      radius: "rounded.lg"
    Drawer:
      description: "右侧发布记录与冻结日志详情。"
      sizes: { md: "440px", lg: "560px" }
    Toggle:
      description: "控制活动流自动跟随，不控制发布任务本身。"
      variants: { on: "绿色轨道", off: "中性轨道" }
  composites:
    StatusHeader:
      description: "页面第一视觉层：结果、阶段、旧版本影响和耗时。"
      variants: { running: "蓝色状态点", success: "绿色结果", failed: "红色结果", offline: "灰色结果" }
    StageTimeline:
      description: "准备、构建、上传、启动、验证、切换流量六阶段。"
      variants: { horizontal: "宽屏", compact: "窄屏纵向或可换行" }
    ActivityStream:
      description: "页面第二视觉层：实时终端事件流。"
      variants: { live: "自动跟随", paused: "显示回到最新与未读数", frozen: "只读记录" }
      states: { error: "红色整行强调", reconnecting: "琥珀连接提示" }
    ErrorResolution:
      description: "失败结果、人话原因、恢复动作和完整日志入口。"
      variants: { known: "明确步骤", unknown: "安全兜底与复制诊断" }
    ProjectReleaseCard:
      description: "发布中心的项目一级信息。"
      variants: { online: "绿点", publishing: "动态蓝点", attention: "红点", offline: "灰点" }
    ReleaseHistory:
      description: "默认降级的历史列表，展开后显示冻结状态。"
      variants: { collapsed: "最近记录摘要", expanded: "完整列表" }
  business:
    PublishPreflight:
      description: "发布前检查和旧版本保护说明。"
      variants: { ready: "允许确认", blocked: "说明阻止原因" }
    DeploymentStatusView:
      description: "独立发布状态页；状态优先、活动流次要。"
      variants: { running: "实时过程", success: "成功结果", failed: "错误恢复" }
    ReleaseCenter:
      description: "A+B 结构：项目卡优先，记录按需展开。"
      variants: { populated: "项目列表", empty: "首次发布引导", loading: "骨架" }
    DeploymentDetailDrawer:
      description: "冻结时间线、失败阶段与完整日志。"
      variants: { success: "成功记录", failed: "失败记录" }
    ReleaseConfirmation:
      description: "回滚与下线共用确认容器。"
      variants: { rollback: "URL 不变且版本保留", unpublish: "访问停止但数据保留" }
---

# Oompt · Terminal Control Design System

## 1. 核心原则

- **状态先于日志**：状态摘要与六阶段时间线始终位于活动流之前；强实时感来自持续更新，而不是让技术日志占据整页。
- **结果可理解**：内部枚举只用于数据契约，用户看到的是“正在构建”“验证可访问性”“发布未完成”等自然语言。
- **证据可展开**：活动流、冻结日志和技术错误是第二层，供需要排查的人使用。
- **旧版本保护可见**：发布中与失败态都明确说明当前线上版本是否仍然正常。

## 2. 色彩策略

- **60% 基调**：`#090C11` 页面背景与 `#11161F` 面板，避免纯黑。
- **30% 结构**：`#293241` 边框、`#202837` 分割线、`#E8EDF5/#9BA8BA` 文本层级。
- **10% 行动与反馈**：`#22C55E` 仅用于主要动作和成功证据；蓝、红、琥珀只承担明确状态。
- 亮色主题使用 `#F3F5F7/#FFFFFF`，正文 `#18202B`，保证正文对比度不低于 4.5:1。

## 3. 字体与节奏

- 普通界面使用 Inter 系统回退；日志、时间、阶段代码使用 IBM Plex Mono 系统回退。
- 所有间距来自 4/8/16/24/32/48/64px；禁止引入零散间距值。
- 日志行高 22px；时间、阶段和消息列对齐。数字、耗时和百分比右对齐。
- 桌面主内容最大宽度 1280px；页边距 32px；390px 窄屏页边距 16px，不得出现页面横向滚动。

## 4. 组件与布局

- 状态页上部约占可视内容 35%，活动流及诊断约占 65%；但主标题字号和留白确保结果仍是第一视觉锚点。
- 面板 8px 圆角，大容器 12px；常态无阴影，Modal/Drawer 可使用低强度阴影。
- 活动流默认自动跟随；用户上滚后暂停，仅显示“回到最新（n）”，不得把“暂停跟随”误解成暂停发布。
- 错误行使用红色图标、`ERROR` 文本和红色高亮三重表达；阶段变化由单一 polite live region 播报，逐行日志不播报。

## 5. 动效与可访问性

- 状态点和新日志行使用 120–150ms 淡入；其他布局不做位移动画。
- 遵循 `prefers-reduced-motion`，关闭脉冲和新行淡入。
- 所有按钮、折叠、Toggle、记录行和“回到最新”均可键盘访问并有可见焦点环。
- Success/Warning/Error/Info 均使用图标或文字，不能只靠颜色。

## 6. 极端状态

- 加载使用结构化 Skeleton，不先显示空状态。
- 空状态包含轻量终端提示图形、说明和“返回项目开始发布”。
- 长错误摘要最多三行，完整内容进入活动流或 Drawer；Tooltip 提供截断内容。
- SSE 重连显示非阻塞琥珀提示，保留已有日志和当前阶段。

## 7. Do / Don't

- **DO**：让实时日志提供可信证据；让结果和建议动作保持第一优先级。
- **DO**：同时提供亮色与暗色主题，并逐项验证文本对比度。
- **DON'T**：出现 staging、灰度发布、全量发布等未定义阶段。
- **DON'T**：提供暂停或终止发布按钮；本需求只有活动流跟随控制。
- **DON'T**：使用纯黑背景、霓虹光效、黑客风装饰或大面积高饱和色。
