# P0 Workspace Agent 验证与交接（待用户 Review）

状态：独立 `feature/workspace-agent` worktree；未合并、未发布。依据 `docs/specs/2026-10-21-workspace-agent.md` 逐项核对。本文只记录已执行的证据，不把代码提交或 Preview BuildJob 排队当作运行成功。

## 验证接缝与结果

| 接缝 | 当前证据 |
| --- | --- |
| 固定脚本模型 + 真实 PostgreSQL + 隔离命令 | `lib/workspace/*.test.ts` 与 `lib/agent/workspace-node.db.test.ts`：59/59；包含断点恢复、CAS、诊断、定向修复、Go/TS 检查、提交。 |
| 真实 Next.js HTTP + 工作区 Worker | `pnpm test:workspace-http-e2e`：静态首次生成 → 修改 → v1/v2 → 发布 API → 公开 HTML/JS 文件，且所有权、事件游标通过。 |
| Go 容器与真实运行时 | `pnpm test:workspace-go-preview-e2e`：成功/失败 Preview 分支；成功项目 v2 定向修改后，经部署 API 发布，容器 `/healthz`、前端 JS 和业务 API 均返回 v2 内容。失败 Preview 不触发 Agent 自动修复。 |
| 既有安全网 | `pnpm test:app-runtime` 72/72；`pnpm test:data-gateway` 8/8；`pnpm test:fullstack-e2e` 和 `pnpm test:publishing-e2e` 通过；`pnpm lint` 0 错误、7 个原有 warning；`pnpm exec next build` 通过。 |
| 真实页面 BOT | `test/workspace-agent-browser-fixture.ts` 可启动隔离的首次生成、Go 修改、旧 XML 历史和中断恢复场景；已用浏览器操作并对照数据库核查 BOT-1 至 BOT-5、BOT-7。BOT-6 的状态与静态 Sandbox 已走查，Go 应用在隔离容器网络内可访问。 |

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
| 19 | 本地接缝通过：Go Preview 构建/健康/API、失败状态和静态 Sandbox 已验证；外部 HTTPS Preview 域名未在隔离测试中路由，见待完成项。 |
| 20 | 通过：结构化 Item、序号游标与去重，`workspace-agent-http-e2e.ts`、BOT-3；浏览器刷新后事件序列连续。 |
| 21 | 通过：旧 XML 历史仍可读；新任务编译失败/修复/提交为独立 Item，代码仅在文件面板，BOT-7。 |
| 22 | 通过：跨用户项目/工作区 API 拒绝、路径和日志不暴露 Secret，`service.db.test.ts`、HTTP E2E、BOT-5。 |
| 23 | 通过：截断、多调用、伪造事件和无效参数不提前落库；成功事件由执行器生成，`model-adapter.test.ts`、`agent-run.db.test.ts`。 |

## UI 与 BOT 核对

| 项目 | 结果 |
| --- | --- |
| AC-UI-1/2/3 | 双栏、状态文字、诊断定位与明细折叠已在 BOT-1/2/4/6/7 走查；`presentation.test.ts` 覆盖状态投影。 |
| AC-UI-4 | BOT-3 刷新及 Worker 恢复后任务、计划、文件与事件仍在；事件期间聚焦的 Code 标签保持焦点；live region 仅包状态，工具日志不逐行播报。 |
| AC-UI-5 | 精确 `innerWidth=390`、`scrollWidth=390`，文件列表在代码上方；亮色计算样式与 `DESIGN.md` token 一致，暗色媒体规则已加载。**暗色真实视觉/对比度截图与完整键盘巡检尚未完成**。 |
| BOT-1/2/3/4/5/7 | 实际 Next 页面和隔离 PostgreSQL 走查通过；夹具提供重复启动/清理方式。截图只留在本次浏览器验收记录中，尚未归档到仓库。 |
| BOT-6 | Go 成功/失败及静态 Sandbox 页面状态已走查；Go 预览和发布容器的前端/API 实测可用。外部 HTTPS 域名仍需有 Traefik/DNS 的环境确认。 |

## 进入用户 Review 前仍需补齐

1. 用浏览器暗色媒体模拟核对工作区状态、诊断、文件面板的视觉和文本对比度；补完整键盘路径。当前只有暗色 CSS 规则加载证据，不能等同于视觉验收。
2. 在有 Traefik/DNS 的隔离环境核对 Go Preview 与发布返回的 HTTPS 地址；本地 Docker E2E 已验证相应容器的页面、JS、健康检查和业务 API，但没有真实域名路由。
3. 将 spec 中 BOT-1 至 BOT-7 要求的关键截图归档到可复查的验收资产。浏览器手工结果不能替代可追溯截图。

以上未补齐前，不合并到共享分支，也不发布 stage/production。用户 Review 通过后再讨论后续合并/发布动作。
