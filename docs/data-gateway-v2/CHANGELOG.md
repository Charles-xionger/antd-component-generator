# Data Gateway V2 变更记录

本文件同时记录方案决策、开发进度、测试结论和生产版本。最新记录放在最上方。

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

