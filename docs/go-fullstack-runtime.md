# Go 全栈轻应用运行时

> 状态：App V1 主链路已实现并通过本地容器验收  
> 运行时：`go-1.24`

## 产品结果

生成平台保留浏览器 iframe Sandbox 作为交互预览，同时把已确认的应用构建为独立 Go 服务。Go 二进制内嵌 React 产物，提供同源 API、健康检查、结构化日志和优雅关闭，并连接项目自己的 PostgreSQL 关系型 Schema。

```text
RequirementSpec → AppBlueprint → React + Go business package + SQL
                       ├→ Sandbox V2 / in-memory runtime
                       └→ BuildJob → DRAFT full-stack preview → PROD deployment
```

## 生成边界

平台固定并版本化：`main.go`、HTTP Server、pgx 连接池、静态资源、健康检查、日志、安全响应头、优雅关闭与 Dockerfile。

AI 只生成：

- `frontend/`：React 页面与 `@prompt-web/app-runtime` 调用。
- `backend/`：model、repository、service、handler 与 `Register` 入口。
- `migrations/`：向前兼容 SQL。
- `acceptance/`：业务验收场景和种子数据。

ArtifactVersion 是完整快照，并记录 RequirementSpec、AppBlueprint、RuntimeManifest、runtimeVersion 和文件清单。

## 双预览

- **交互预览**：Sandbox V2 使用内存运行时，流式展示 UI 和基础交互；兼容 V1 消息。
- **真实预览**：代码生成完成后自动排队，Worker 对 DRAFT Schema 迁移、测试、构建并启动 Go 容器。成功后在工作区通过 iframe 打开。
- Worker 在健康检查后执行 `acceptance/scenarios.json` 中的有序 API 步骤和业务断言；`{{runId}}` 为每次验收生成隔离数据标识，因此同一个 DRAFT Schema 可以重复验证。
- 验收场景只在 DRAFT 运行。PROD 发布复用已经验证的同一 ArtifactVersion，不写入测试数据。
- 只有同一 ArtifactVersion 的真实预览成功后才允许发布。

## 数据库

- `platform`：Prisma 管理的用户、项目、Artifact、BuildJob 和 Deployment。
- `public`：LangGraph checkpoint 与 Prisma migration history。
- `app_<project>_draft`：真实预览数据。
- `app_<project>_prod`：生产数据。

应用 Schema 名只由服务端 Project ID 推导。Worker 使用迁移连接执行 DDL，并为每个环境创建只拥有对应 Schema DML 权限的运行角色。第一次发布不复制 DRAFT 数据；代码回滚不反向回滚数据。

## 构建与发布

独立 Build Worker 使用 PostgreSQL 租约领取 `FULLSTACK_PREVIEW`、`PUBLISH` 和 `UNPUBLISH` 任务，通过 Docker Socket Proxy 管理镜像、容器与网络。Go 应用使用精确 Host 的 Traefik 路由，旧静态发布继续由原通配符路由提供。

生成应用使用 Go 1.24 Alpine 构建，最终镜像为 `scratch`、非 root 用户、静态二进制和 CA 证书，不依赖运行时 Shell 或远程 Distroless 镜像源。Worker 镜像包含 Docker CLI，但只通过受限 Socket Proxy 访问宿主 Docker。

自动 Migration 仅允许新增关系表、字段、索引和兼容约束。删除、截断、字段删除、类型替换、权限语句和扩展安装会在执行前拒绝。构建、Migration、测试、启动或健康检查失败均不会切换当前生产 Deployment。

## 当前验收基线

固定案例位于 `test/fixtures/aigc-storyboard-productivity/`，覆盖人员、短剧项目、分镜任务、工时记录和统一产能统计。`pnpm test:fullstack-e2e` 会启动独立 PostgreSQL 与 Go 应用容器，执行 10 步 API 场景，并在应用容器重启后验证数据持久化。
