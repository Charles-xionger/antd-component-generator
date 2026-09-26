# Data Gateway 与生成协议 V2

> 状态：拓扑 V1 已冻结，准备进入 DG-0.2
> 建档时间：2026-09-26  
> 当前协议：`protocolVersion: 1`  
> 目标协议：`protocolVersion: 2`

## 目标

把当前依赖 Mock 数据的静态生成页面升级为可以持续保存真实业务数据的轻应用，同时保证页面重新生成、重新发布、回滚和下线不会覆盖或重建既有业务数据。

核心原则：

> 生成决定数据需求，预览使用真实草稿数据，发布只升级生产结构，业务数据独立于代码版本并持续保留。

## 文档索引

- [architecture.md](./architecture.md)：产品边界、数据模型、数据生命周期、发布与回滚设计。
- [topology-v1.md](./topology-v1.md)：第一版容器、网络、路由、数据流和未来拆分边界。
- [protocol-v2.md](./protocol-v2.md)：Generator、Sandbox、Runtime SDK 和 Data Gateway 的协议约定。
- [development-plan.md](./development-plan.md)：实施顺序、预计时间、验收条件和风险控制。
- [CHANGELOG.md](./CHANGELOG.md)：方案与开发版本的时间记录。

## 与现有系统的关系

当前已经完成：

- Project、Primary Thread、ArtifactVersion 与 Deployment。
- 静态发布、稳定公开子域名、重新发布、回滚和下线。
- Generator 与 Sandbox 的 `protocolVersion: 1`。
- PostgreSQL 持久化平台数据。

本阶段新增：

```text
Project
├── ArtifactVersion       页面代码版本
├── DataCollection        业务数据集合
├── DataSchemaVersion     数据结构版本
├── DataRecord            持续存在的业务数据
└── Deployment            代码版本与数据结构版本的发布绑定
```

## 第一阶段范围

包括：

- 生成协议 V2。
- Data Manifest。
- DRAFT 与 PRODUCTION 数据隔离。
- JSONB 数据记录。
- Runtime SDK。
- 查询、新增、修改和软删除。
- 发布时安全升级生产数据结构。
- 数据结构版本、迁移记录和基础审计。
- 现有 Mock 项目的转换入口。

暂不包括：

- 任意 SQL 和 AI 直接执行数据库迁移。
- 为每个 Project 创建独立 PostgreSQL 物理表。
- 复杂关联、JOIN、聚合查询和工作流。
- 文件上传与对象存储。
- 外部数据库、外部 API 和密钥管理。
- 组织、成员和企业 RBAC。
- 破坏性 Schema 自动迁移。
- 随页面回滚生产数据库。

## 当前关键决策

1. 业务数据属于 Project，不属于 Deployment。
2. 发布不复制、覆盖或重建生产数据。
3. 预览使用 PostgreSQL 中真实保存的 DRAFT 数据，不使用默认 Mock 数据。
4. 生产应用只访问 PRODUCTION 数据。
5. 发布同步数据结构，不默认同步草稿数据内容。
6. 第一版只自动执行向前兼容的数据结构变更。
7. 页面回滚不删除字段，也不反向恢复数据库。
8. 公开应用通过同源 Data Gateway 访问数据，生成代码不持有数据库凭证。
