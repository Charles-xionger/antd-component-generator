# DG-0.2 数据底座实现记录

## 1. 本阶段结果

DG-0.2 建立真实业务数据所需的数据库和服务端读取底座，但不改变当前 Generator、Sandbox 和公开应用的 V1 行为。

```text
登录用户
  ↓ Session
Project 所有权校验
  ↓
DataCollection → activeDraftSchema
  ↓
DataRecord(environment = DRAFT, deletedAt = null)
  ↓
分页后的 JSON 响应
```

## 2. 数据表

| 表 | 职责 |
| --- | --- |
| DataCollection | Project 内稳定的业务集合及当前草稿/生产 Schema 指针 |
| DataSchemaVersion | 不可变的集合结构版本 |
| DataRecord | 按 Project、Collection、Environment 隔离的 JSONB 业务记录 |
| DataRecordRevision | 后续 CRUD 使用的创建、修改、删除和恢复审计基础 |
| DataMigration | 后续发布阶段记录 Schema 提升过程和结果 |

迁移 `20260926190000_add_data_gateway_foundation` 只增加枚举、表、索引和外键。它不会修改 V1 现有表，也不会接触既有 Artifact、Deployment 或业务记录。

## 3. Manifest 校验

第一版字段类型：

```text
string | number | boolean | date | datetime | enum | json
```

当前限制：

- collection key 和 field key 使用小写字母开头的 snake_case 标识。
- 单个 Manifest 最多 20 个集合，单个集合最多 100 个字段。
- collection key、field key 和稳定 ID 不允许重复。
- 系统保留字段不能由生成代码声明。
- enum 必须提供非空且无重复的 options。
- defaultValue 必须与字段类型一致。
- Manifest 和内部对象拒绝未声明属性。

## 4. Schema Diff

可以继续创建新草稿 Schema Version 的兼容变更：

- 新增集合。
- 新增可选字段。
- 新增带默认值的必填字段。
- 修改显示名称或 label。
- 将必填字段放宽为可选。
- 修改默认值。
- 新增 enum 选项。

会被当前内部服务拒绝的危险变更：

- 删除集合或字段。
- 修改 collection key 或 field key。
- 修改字段类型。
- 将可选字段收紧为必填。
- 删除 enum 选项。
- 新增没有默认值的必填字段。

## 5. 只读 DRAFT API

### 集合列表

```http
GET /api/projects/:projectId/data
```

### 记录列表

```http
GET /api/projects/:projectId/data/:collectionKey
```

支持的查询参数：

| 参数 | 默认值 | 约束 |
| --- | --- | --- |
| page | 1 | 大于等于 1 |
| pageSize | 20 | 1～100 |
| sortBy | createdAt | createdAt 或 updatedAt |
| sortDirection | desc | asc 或 desc |
| filterField | 无 | 必须是当前 DRAFT Schema 中的字段 |
| filterValue | 无 | 与 filterField 同时提供，按字段类型解析 |

DG-0.2 只支持一个字段的精确过滤，不支持 json 字段过滤。

### 记录详情

```http
GET /api/projects/:projectId/data/:collectionKey/:recordId
```

## 6. 安全边界

每次读取必须同时满足：

```text
project.userId = session.user.id
collection.projectId = project.id
record.projectId = project.id
record.collectionId = collection.id
record.environment = DRAFT
record.deletedAt = null
```

无 Session 返回 401。Project、Collection、Record 不存在或不归属当前用户时统一返回 404。浏览器不能选择 PRODUCTION 环境。

## 7. 下一阶段入口

DG-0.3 在此基础上增加：

- Generator 与 Sandbox 的 protocolVersion 2 payload。
- Runtime SDK。
- DRAFT 新增、更新、软删除和恢复。
- requestId 幂等和 recordVersion 乐观锁。
- Architect 输出 Data Manifest，Coder 使用 Runtime SDK 替代 Mock Helper。
