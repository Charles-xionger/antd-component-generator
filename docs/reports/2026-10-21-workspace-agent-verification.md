# P0 Workspace Agent 验证与交接（待用户 Review）

状态：独立 `feature/workspace-agent` worktree；未合并、未发布。依据 `docs/specs/2026-10-21-workspace-agent.md` 逐项核对。本文只记录已执行的证据，不把代码提交或 Preview BuildJob 排队当作运行成功。

## 验证接缝与结果

| 接缝 | 当前证据 |
| --- | --- |
| 固定脚本模型 + 真实 PostgreSQL + 隔离命令 | `lib/workspace/*.test.ts` 与 `lib/agent/workspace-node.db.test.ts`：59/59；包含断点恢复、CAS、诊断、定向修复、Go/TS 检查、提交。 |
| 真实 Next.js HTTP + 工作区 Worker | `pnpm test:workspace-http-e2e`：静态首次生成 → 修改 → v1/v2 → 发布 API → 公开 HTML/JS 文件，且所有权、事件游标通过。 |
| Go 容器与真实运行时 | `pnpm test:workspace-go-preview-e2e`：成功/失败 Preview 分支；成功项目 v2 定向修改后，经部署 API 发布，容器 `/healthz`、前端 JS 和业务 API 均返回 v2 内容。隔离 Traefik 的 Docker provider 通过 HTTPS Host 规则转发 Preview 与发布地址的页面/JS；失败 Preview 不触发 Agent 自动修复。 |
| 既有安全网 | 截图归档后重跑：`lib/workspace/*.test.ts` + `workspace-node.db.test.ts` 59/59，`pnpm test:app-runtime` 72/72，`pnpm test:data-gateway` 8/8，Workspace HTTP、Go Preview、全栈运行时与发布 E2E 均通过；`pnpm lint` 0 错误、7 个原有 warning；`pnpm exec next build` 通过。全栈 E2E 曾因 `pg_isready` 对初始化临时 Unix socket 提前返回而失败，改为检查容器 TCP 后同一测试重跑通过。 |
| 真实页面 BOT | `test/workspace-agent-browser-fixture.ts` 可启动隔离的首次生成、Go 修改、旧 XML 历史和中断恢复场景；已用浏览器操作并对照数据库核查 BOT-1 至 BOT-5、BOT-7。夹具的 `DARK_MODE_URL` 用同源 iframe 触发真实暗色媒体查询；诊断、修复与提交在暗色页面重新走查。BOT-6 的状态与静态 Sandbox 已走查，Go 应用在隔离容器网络内可访问。 |

## AC 核对

| AC | 结果与主要证据 |
| --- | --- |
| 1 | 通过：空/基线工作区和项目关联，`service.db.test.ts`、BOT-1/2。 |
| 2 | 通过：数据库修订可重新投影，`projection.test.ts`、`service.db.test.ts`、BOT-3 刷新恢复。 |
| 3 | 通过：路径、权限、容量与畸形 Unicode 在入库前拒绝；`path.test.ts`、`service.db.test.ts`。投影只从受控字符串在新临时目录创建文件，模型无符号链接创建工具。 |
| 4 | 通过：原子修订、事件、收据与 CAS，`service.db.test.ts`。 |
| 5 | 通过：只接受完整结构化工具调用；伪造事件/文本/XML 无法写文件，`model-adapter.test.ts`、`workspace-node.db.test.ts`、BOT-1/2。 |
| 6 | 通过：静态与 Go 分阶段写入；Acceptance 错误仅修当前文件，`task.db.test.ts`。 |
| 7 | 通过：普通修改与直接 Bug Fix 共用工具循环，只变更目标文件；`task.db.test.ts`、Go 浏览器 v1/v2 文件摘要对比。 |
| 8 | 通过：JSON/Schema、Migration、契约、TS/Go 诊断，`diagnostics.test.ts`、`compiler-diagnostics.test.ts`、`validation.test.ts`。 |
| 9 | 通过：场景顶层数组指出 `$`、预期外壳和实际数组；局部修复后通过，`diagnostics.test.ts`、`task.db.test.ts`。 |
| 10 | 通过：受控命令限制超时/输出/环境，Go 校验器不可写源投影，`command.test.ts`、`go-check.test.ts`、`agent-run.db.test.ts`。 |
| 11 | 通过：步数、截止时间和重复阻塞诊断停止，`agent-run.db.test.ts`。 |
| 12 | 通过：三处 Worker 中断断点恢复，无重复文件变化/版本；`worker.db.test.ts`、BOT-3。 |
| 13 | 通过：取消阻止后续模型/写入并保留 Draft，`agent-run.db.test.ts`、BOT-4。 |
| 14 | 通过：`needs_input` 停止并由下一执行段继续，`agent-run.db.test.ts`、BOT-4。 |
| 15 | 通过：同项目写入互斥，不同项目并行；`service.db.test.ts`、BOT-5 双标签。 |
| 16 | 通过：P0 代码面板只读，运行中输入不可注入当前执行段；BOT-1/3。人工编辑留到下一需求。 |
| 17 | 通过：仅校验通过的确定修订创建版本；失败 Draft 不入版本，`commit.db.test.ts`、BOT-1/2。 |
| 18 | 通过：重复提交幂等、快照锁定，`commit.db.test.ts`、`worker.db.test.ts`。 |
| 19 | 本地接缝通过：Go Preview 构建/健康/API、失败状态和静态 Sandbox 已验证；隔离 Traefik 实测 HTTPS Host 路由。外部 DNS/可信证书仍待环境验收，见待完成项。 |
| 20 | 通过：结构化 Item、序号游标与去重，`workspace-agent-http-e2e.ts`、BOT-3；浏览器刷新后事件序列连续。 |
| 21 | 通过：旧 XML 历史仍可读；新任务编译失败/修复/提交为独立 Item，代码仅在文件面板，BOT-7。 |
| 22 | 通过：跨用户项目/工作区 API 拒绝、路径和日志不暴露 Secret，`service.db.test.ts`、HTTP E2E、BOT-5。 |
| 23 | 通过：截断、多调用、伪造事件和无效参数不提前落库；成功事件由执行器生成，`model-adapter.test.ts`、`agent-run.db.test.ts`。 |

## UI 与 BOT 核对

| 项目 | 结果 |
| --- | --- |
| AC-UI-1/2/3 | 双栏、状态文字、诊断定位与明细折叠已在 BOT-1/2/4/6/7 走查；`presentation.test.ts` 覆盖状态投影。 |
| AC-UI-4 | BOT-3 刷新及 Worker 恢复后任务、计划、文件与事件仍在；事件期间聚焦的 Code 标签保持焦点；live region 仅包状态，工具日志不逐行播报。 |
| AC-UI-5 | 精确 `innerWidth=390`、`scrollWidth=390`，文件列表在代码上方；亮色计算样式与 `DESIGN.md` token 一致。`DARK_MODE_URL` 内实际 `matchMedia('(prefers-color-scheme: dark)').matches === true`，任务面板计算背景/正文为 `rgb(17, 22, 31)` / `rgb(232, 237, 245)`，代码文件按钮为 `rgb(30, 41, 59)` / `rgb(248, 250, 252)`；[暗色诊断与最终版本截图](assets/workspace-agent/README.md)已归档。设计 token 的正文/次级文本在亮暗面板上的计算对比度依次为 16.40/5.76 和 15.42/7.51。暗色 390px 视口 `scrollWidth=390`；窄屏 Code → 两个文件 → 复制按钮可按 Tab 到达且焦点环可见。 |
| BOT-1/2/3/4/5/7 | 实际 Next 页面和隔离 PostgreSQL 走查通过；夹具提供重复启动/清理方式。19 张真实页面截图已归档，逐项映射见 [验收截图索引](assets/workspace-agent/README.md)。BOT-3 的暂停→刷新→恢复，以及 BOT-5 的同项目占用/不同项目并行现均有独立画面。 |
| BOT-6 | [Go 验证中、成功、失败截图](assets/workspace-agent/README.md)已归档；中间态经数据库证实为真实 `FULLSTACK_PREVIEW` `QUEUED` Job，成功/失败来自另一隔离 E2E，不冒充同一 Job 时间线。静态 Sandbox 页面状态已走查；Go 预览和发布容器的前端/API 实测可用，隔离 Traefik 实测 HTTPS Host 路由。外部 DNS/可信证书仍需环境确认。 |

## 用户 Review 与目标环境待办

### 分支集成门槛

`feature/workspace-agent` 的直接开发基线是 `codex/data-gateway-v2`（`d25860c`），不是 `main`（`ed5af46`）。P0 自身相对该基线增加 42 个提交、110 个变动文件；直接把该 feature 合入当前 `main` 还会带入基线上的项目发布、Go 运行时、Data Gateway 与实时发布等前置提交。当前仓库没有 `develop`、`stage`、`production` 分支，因此不能套用工作流默认的分支命令，也不能把 `main` 擅自当作其中任一环境。用户 Review 通过后，须先确定这些前置提交的集成状态与实际环境分支映射，再决定合并及部署路径。

1. [截图索引](assets/workspace-agent/README.md)已覆盖 BOT-1 至 BOT-7 与暗色模式的关键状态。请用户按本报告审查截图、交互与验收标准；截图覆盖不等于用户 Review 通过。
2. 用户 Review 后，在获准的目标环境核对 Go Preview 与发布返回的 HTTPS 地址，包括真实 DNS、可信证书与公网入口。隔离 Docker E2E 已通过 Traefik 的 HTTPS Host 路由验证页面/JS，但使用自签名测试证书和容器内 Host 解析，不能替代环境验收。测试还发现 API 与 Worker 原有默认域名不一致；现已共用 `getPublishedAppsDomain()`，部署时仍应明确配置相同的 `PUBLISHED_APPS_DOMAIN`。

当前只交付独立 worktree 供用户 Review；在用户确认前，不合并到共享分支，也不发布 stage/production。目标环境验证属于获准发布后的门槛，不把隔离测试冒充公网验证。
