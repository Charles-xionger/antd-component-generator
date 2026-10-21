# Data Gateway V2 变更记录

本文件同时记录方案决策、开发进度、测试结论和生产版本。最新记录放在最上方。

## 2026-09-26 · DG-0.2

### 完成

- 新增 DataCollection、DataSchemaVersion、DataRecord、DataRecordRevision 和 DataMigration 数据模型。
- 增加 expand-only Prisma migration，不修改或删除 V1 表与数据。
- 实现 Data Manifest V1 严格校验、稳定 ID 补全和系统保留字段保护。
- 实现 Schema Diff，将兼容变更和危险变更分开处理。
- 实现 Project Owner 限定的只读 DRAFT 集合、记录列表和记录详情 API。
- 查询固定限定 Project、Collection、DRAFT 环境和未删除记录。

### API

- `GET /api/projects/:projectId/data`
- `GET /api/projects/:projectId/data/:collectionKey`
- `GET /api/projects/:projectId/data/:collectionKey/:recordId`

### 验证

- 在一次性 PostgreSQL 16 数据库完整应用现有 3 个 migration，结果通过。
- Manifest 与 Schema Diff 单元测试 8 项通过。
- 数据库集成测试验证 Project 所有权、DRAFT / PRODUCTION 隔离、过滤器白名单与危险 Schema 拒绝，结果通过。
- Prisma validate、TypeScript、ESLint 和 Next.js 生产构建通过；保留 15 个既有 ESLint warning，无新增 error。

### 决策

- DG-0.2 只开放读取 API；集合结构写入暂时只作为内部服务，等 DG-0.3 由生成协议统一驱动。
- 数据库迁移继续采用 expand-and-contract；本次只有 expand，不执行字段或表删除。
- 无权限和资源不存在统一为 404；非法查询参数返回 400。

### 风险 / 未决

- 生产数据库尚未应用 DG-0.2 migration，V1 线上行为保持不变。
- DRAFT 写入、幂等、乐观锁和 Runtime SDK 属于 DG-0.3。

### 版本

- Generator branch：`codex/data-gateway-v2`
- Sandbox branch：`codex/data-gateway-v2`（DG-0.2 无代码变更）
- Migration：`20260926190000_add_data_gateway_foundation`
- 当前生产协议：`protocolVersion: 1`

## 2026-09-26 · DG-0.1 Topology V1

### 完成

- 冻结第一版容器、网络、Host 路由和存储拓扑。
- 确认第一版不增加 Project 专属容器和数据库。
- 确认 Data Gateway 首版作为 Generator 内部服务模块运行。
- 确认 Sandbox 通过受信任 postMessage RPC 访问 DRAFT API。
- 确认公开应用使用同源 Runtime API 访问 PRODUCTION 数据。
- DG-0.1 标记完成，准备进入 DG-0.2。

### 冻结默认值

- 字段类型：string、number、boolean、date、datetime、enum、受限 json。
- 公开读取按 Collection 能力开启；公开写入默认关闭。
- 历史 Mock 项目必须显式升级，默认不导入 Mock 数据。
- DRAFT 和 PRODUCTION 共用 PostgreSQL 物理实例，通过环境字段隔离。
- 发布只提升 Schema，不自动复制或覆盖业务记录。

### 开发基线

- 第二阶段分支：`codex/data-gateway-v2`
- 起点提交：以本次拓扑 V1 文档提交为准。
- 第一个开发目标：Prisma expand migration、Manifest 校验、Schema Diff 和只读 DRAFT API。

## 2026-09-26 · DG-0.1

### 完成

- 建立 Data Gateway V2 独立文档目录。
- 明确业务数据属于 Project，不属于 Deployment。
- 明确页面发布不能覆盖或重建生产数据。
- 明确 DRAFT 与 PRODUCTION 使用真实 PostgreSQL 数据并进行环境隔离。
- 明确第一版采用 DataCollection、DataSchemaVersion 和 JSONB DataRecord。
- 起草 `protocolVersion: 2`、Data Manifest 和 Runtime SDK 契约。
- 制定 DG-0.1 至 DG-1.0 开发路线和验收场景。

### 当前生产基线

- Generator 分支：`codex/project-publishing`
- Generator 已验证代码镜像 commit：`e6ea12b`
- Generator 镜像：`prompt-web-app:project-publishing-20260926-r7`
- Generator 镜像 digest：`sha256:78f4238951e5f25d8bfb9339cebd7b7e204e4e2c8675f6a2f324de8c47247ba8`
- Sandbox commit：`32e5343`
- 当前协议：`protocolVersion: 1`
- 当前数据状态：生成页面仍使用 Mock Helper；尚未实现 Data Gateway。

### 已冻结决策

- 预览使用 DRAFT 数据，线上使用 PRODUCTION 数据。
- 发布同步 Schema，不默认同步草稿记录。
- 第一版只自动执行向前兼容的 Schema 变更。
- 页面回滚不进行破坏性数据库回滚。
- 现有 V1 项目不会自动把 Mock 数据导入生产。

### 未决事项

- 字段类型最终集合及各类型校验规则。
- 公开匿名写入是否进入 DG-0.4，或推迟到 DG-0.5。
- Mock 项目升级界面的具体交互。
- Revision 默认保留周期。
- PRODUCTION 初始化草稿数据的限制和确认文案。

### 下一步

- 评审并冻结 Prisma 初始模型。
- 在两个仓库定义共享 Protocol V2 类型。
- 编写 Schema Diff 单元测试，再开始数据库迁移。
