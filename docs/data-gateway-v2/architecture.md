# Data Gateway V2 架构方案

## 1. 背景

当前生成代码通过 `helpers.ts` 返回 Mock 数据。页面预览和静态发布可以工作，但生成结果仍是展示页面，无法持续保存企业业务数据。

新方案保持前端通过 API 获取数据的开发方式，但把 Mock Helper 替换为平台 Runtime SDK。Data Gateway 负责校验 Project、数据结构、环境和操作权限，并统一访问 PostgreSQL。

## 2. 核心生命周期

```text
用户 Prompt
  ↓
Architect 输出页面结构与 Data Manifest
  ↓
平台创建或升级 DRAFT Schema
  ↓
Coder 生成 Runtime SDK 调用
  ↓
Sandbox 通过 API 读写 DRAFT 数据
  ↓
用户手动发布
  ↓
比较 DRAFT 与 PRODUCTION Schema
  ↓
执行安全的生产结构升级
  ↓
升级成功后激活 Deployment
  ↓
公开应用继续使用既有 PRODUCTION 数据
```

第一次发布会创建生产数据结构，但不会默认把草稿测试数据写入生产。后续发布只升级数据结构，不能重建或覆盖业务记录。

## 3. 四类独立状态

### 3.1 ArtifactVersion

页面代码快照。每次生成只追加新版本，不修改旧版本。

### 3.2 DataSchemaVersion

Data Manifest 的不可变快照，描述集合、字段、类型、约束和能力。

### 3.3 Deployment

一次发布记录，绑定一个 ArtifactVersion 和一组 DataSchemaVersion。Deployment 本身不拥有业务数据。

### 3.4 DataRecord

业务数据记录，归属于 Project、Collection 和 Environment。页面重新发布、回滚或下线都不能删除 DataRecord。

## 4. 数据模型

### 4.1 DataCollection

```text
id                    UUID
projectId             UUID
key                   稳定代码标识
name                  用户可修改的显示名称
activeDraftSchemaId   当前草稿结构
activeProductionSchemaId 当前生产结构
createdAt
updatedAt
```

约束：

- `@@unique([projectId, key])`
- `key` 创建后默认不修改。
- 修改显示名称只改变 `name`，不改变 API 地址。

### 4.2 DataSchemaVersion

```text
id
collectionId
versionNumber
schema                JSONB
status                DRAFT | ACTIVE | SUPERSEDED
createdAt
activatedAt
```

建议约束：

- `@@unique([collectionId, versionNumber])`
- Schema Version 不原地修改。

### 4.3 DataRecord

```text
id
projectId
collectionId
environment           DRAFT | PRODUCTION
data                  JSONB
recordVersion         乐观锁版本
createdBy
updatedBy
createdAt
updatedAt
deletedAt
```

关键规则：

- DataRecord 不保存 `deploymentId`。
- 删除默认使用 `deletedAt` 软删除。
- 更新时校验 `recordVersion`，成功后递增。
- 所有查询必须同时限定 `projectId`、`collectionId` 和 `environment`。

### 4.4 DataMigration

```text
id
projectId
deploymentId
fromSchemaVersionIds  JSONB
toSchemaVersionIds    JSONB
changes               JSONB
status                PENDING | APPLYING | SUCCEEDED | FAILED
errorMessage
createdAt
completedAt
```

### 4.5 DataRecordRevision

```text
id
recordId
operation             CREATE | UPDATE | DELETE | RESTORE
beforeData            JSONB
afterData             JSONB
actorId
createdAt
```

第一版至少记录创建、修改、软删除和恢复。字段级审计和长期归档策略后续补充。

## 5. 字段定义

每个字段同时包含稳定身份、代码标识和显示名称：

```ts
{
  id: "field_c8a2",
  key: "customer_name",
  label: "客户名称",
  type: "string",
  required: true
}
```

规则：

- 修改文案只修改 `label`。
- `id` 永久稳定。
- `key` 用于 API 和生成代码，不能因改名自动变化。
- 第一版字段类型只支持 `string`、`number`、`boolean`、`date`、`datetime`、`enum` 和受限 `json`。
- 关联字段、公式字段和文件字段延后。

## 6. DRAFT 与 PRODUCTION

两个环境可以使用同一个 PostgreSQL 和同一张 DataRecord 表，通过 `environment` 隔离。

### DRAFT

- 只允许登录后的 Project Owner 使用。
- Sandbox 预览真实读写。
- AI 安全地增加集合或字段。
- 测试数据不会自动进入生产。

### PRODUCTION

- 由公开应用通过 Data Gateway 访问。
- 使用当前 activeDeployment 对应的 DataSchemaVersion。
- 页面重新发布不会清空记录。
- 下线应用不会删除记录。

可选功能“将草稿数据作为生产初始数据”必须由用户显式触发，并且只允许在目标生产集合为空时执行。

## 7. Schema Diff 与迁移规则

第一版只自动执行向前兼容变更：

| 变更 | DRAFT | 发布到 PRODUCTION |
| --- | --- | --- |
| 新增集合 | 自动 | 自动 |
| 新增可选字段 | 自动 | 自动 |
| 新增带默认值字段 | 自动 | 自动并回填 |
| 修改 label | 自动 | 自动 |
| 新增 enum 选项 | 自动 | 自动 |
| 删除字段 | 保留旧字段并提示 | 阻止自动发布 |
| 修改字段类型 | 创建迁移建议 | 阻止自动发布 |
| 修改字段 key | 创建迁移建议 | 阻止自动发布 |
| 删除集合 | 归档建议 | 阻止自动发布 |
| 收紧 required | 要求默认值或回填 | 阻止自动发布 |

JSONB 模式下，新增字段主要更新 Schema；旧记录可以暂时缺少可选字段。禁止因为 Schema 变化重建 DataRecord。

## 8. 发布事务边界

```text
1. 创建 BUILDING Deployment
2. 构建静态产物
3. 计算 Schema Diff
4. 拒绝未经确认的危险变更
5. 创建并应用 DataMigration
6. 验证 Data Gateway 可按新 Schema 读取
7. 原子切换 Project.activeDeploymentId
8. 旧 Deployment 变为 SUPERSEDED
```

失败规则：

- 静态构建失败：生产结构和线上版本不变。
- Schema 迁移失败：不激活新 Deployment。
- 激活事务失败：旧线上版本继续工作。
- 失败记录保留 errorMessage 和 Schema Diff。

## 9. 回滚策略

普通回滚只切换页面代码，不执行破坏性数据库回滚。

```text
V1：name、phone
V2：name、phone、email
V2 → V1：页面回到 V1，email 字段和数据继续保留
```

发布前必须检查目标 ArtifactVersion 是否能读取当前生产 Schema。采用 expand-and-contract：先增加新结构，旧结构长期保留；真正删除需要独立的数据治理流程。

数据库备份恢复是管理员灾难恢复操作，不与普通 Deployment 回滚绑定。

## 10. API 与安全边界

### 管理端 DRAFT API

```text
GET    /api/projects/:projectId/data/:collectionKey
POST   /api/projects/:projectId/data/:collectionKey
PATCH  /api/projects/:projectId/data/:collectionKey/:recordId
DELETE /api/projects/:projectId/data/:collectionKey/:recordId
```

必须验证 Session、`Project.userId`、Collection 归属和 DRAFT 环境。

### 公开 PRODUCTION API

```text
GET    /api/runtime/data/:collectionKey
POST   /api/runtime/data/:collectionKey
PATCH  /api/runtime/data/:collectionKey/:recordId
DELETE /api/runtime/data/:collectionKey/:recordId
```

根据 Host 查找 Project 和 activeDeployment，不能信任浏览器传入的 projectId、userId、表名或 Schema Version。

### 网关限制

- 默认每页 20 条，最大 100 条。
- 过滤、排序和字段选择使用白名单。
- 限制请求体大小、JSON 深度和批量操作数量。
- 所有写入进行 Schema 校验。
- 使用 `requestId` 防止重复创建。
- 更新使用 `recordVersion` 防止静默覆盖。
- 公开写权限默认关闭。
- 匿名写入开启频率限制和审计。
- 无权限和不存在统一返回 404，避免资源枚举。

## 11. 数据历史与备份

必须区分：

- Deployment History：页面发布历史。
- DataSchemaVersion：数据结构历史。
- DataRecordRevision：业务记录修改历史。
- PostgreSQL Backup：灾难恢复。

四者不能互相替代。建议每日 PostgreSQL 逻辑备份，并在未来允许破坏性迁移前创建独立备份点。

## 12. 现有 Mock 项目迁移

迁移不自动把 Mock 数据写入生产：

1. 分析现有 `interface.ts`、`helpers.ts` 和组件消费方式。
2. 生成待确认 Data Manifest。
3. 创建 DRAFT Collection 和 Schema。
4. 把代码改为 Runtime SDK。
5. 默认创建空 DRAFT 数据集。
6. 用户可选择一次性导入原 Mock 数据作为草稿数据。
7. 生产数据只在用户发布并显式初始化后产生。

## 13. 暂缓问题

- Project 间数据关联。
- 自定义 SQL 和数据库视图。
- 大规模全文检索和复杂聚合。
- 数据附件与对象存储。
- 外部 API、Webhook 和 Secret 管理。
- 组织级数据权限。
- 行级自定义权限表达式。
- 数据保留周期和合规删除策略。

