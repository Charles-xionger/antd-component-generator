# Data Gateway 第一版拓扑

> 版本：Topology V1  
> 冻结日期：2026-09-26  
> 适用阶段：DG-0.2 ～ DG-1.0

## 1. 拓扑结论

第一版沿用现有四个核心容器，不为每个 Project 或子域名创建独立容器、数据库或 Data Gateway 实例。

```text
Internet
   │
   ▼
Traefik
   ├── prompt.xiongerer.xyz
   │      └── prompt-web-app
   │             ├── 管理端 UI
   │             ├── Project / Artifact / Deployment API
   │             ├── DRAFT Data API
   │             └── Data Gateway 服务模块
   │
   ├── sandbox.prompt.xiongerer.xyz
   │      └── prompt-web-sandbox
   │             └── 生成代码预览环境
   │
   └── *.apps.xiongerer.xyz
          └── prompt-web-app
                 ├── 已发布静态文件
                 └── PRODUCTION Runtime API

prompt-web-app
   ├── PostgreSQL
   └── /deployments Docker Volume
```

子域名只是 Project 的访问入口。Traefik 把所有公开应用 Host 路由到同一个 `prompt-web-app`，应用根据 Host 解析 Project 和 activeDeployment。

## 2. 容器职责

| 容器 | 第一版职责 | 不负责 |
| --- | --- | --- |
| `traefik` | TLS、Host 路由、安全响应头 | 项目数据权限、Schema、构建 |
| `prompt-web-app` | 控制面、构建入口、DRAFT API、PRODUCTION Gateway、静态文件读取 | 运行用户任意后端代码 |
| `prompt-web-sandbox` | 隔离预览生成代码、Runtime SDK Preview Adapter | 直接连接数据库、持有管理端 Session |
| `prompt-web-postgres` | 平台元数据、Schema、DRAFT/PRODUCTION 记录、Revision | 静态构建产物和附件 |

Verdaccio 与 Data Gateway 无直接关系，继续作为现有 npm 服务保留。

## 3. 网络边界

```text
traefik_net
├── traefik
├── prompt-web-app
└── prompt-web-sandbox

prompt_web_internal
├── prompt-web-app
└── prompt-web-postgres
```

规则：

- PostgreSQL 不加入公网路由网络，不映射公网端口。
- Sandbox 不加入数据库内部网络。
- 只有 Generator 可以访问 PostgreSQL。
- Data Gateway 首版是 Generator 的服务端模块，不是浏览器直连数据库的代理。
- Traefik 不读取 Project 数据，也不做业务权限判断。

## 4. 路由表

| Host / Path | 目标 | 数据环境 | 认证方式 |
| --- | --- | --- | --- |
| `prompt.xiongerer.xyz/projects/*` | Generator 管理端 | 平台数据 | GitHub Session |
| `prompt.xiongerer.xyz/api/projects/:id/data/*` | DRAFT API | DRAFT | Session + Project Owner |
| `sandbox.prompt.xiongerer.xyz/sandbox.html` | Sandbox | 不直接访问数据库 | 受信任父页面 |
| `{slug}.apps.xiongerer.xyz/*` | 已发布静态产物 | 无 | 匿名读取 |
| `{slug}.apps.xiongerer.xyz/api/runtime/data/*` | Runtime Gateway | PRODUCTION | Host + Collection Capability |

公开 Runtime API 不接受浏览器指定 `projectId`、`environment`、`schemaVersionId` 或物理表名。

## 5. DRAFT 预览数据流

Sandbox 与管理端是不同 Origin。第一版不依赖跨站 Cookie，也不把管理端 Session 暴露给 Sandbox。

```text
生成页面
   │ Runtime SDK query/mutation
   ▼
Sandbox Preview Adapter
   │ postMessage: data-request
   ▼
Generator Parent Bridge
   │ 当前登录 Session
   ▼
/api/projects/:projectId/data/:collectionKey
   │ 校验 Project.userId、Schema、DRAFT
   ▼
PostgreSQL DataRecord(environment=DRAFT)
   │
   └── data-response → Parent Bridge → postMessage → Sandbox
```

安全要求：

- 校验 postMessage origin 和 `protocolVersion: 2`。
- 每个请求携带 requestId，并限制超时和并发数。
- Generator 从当前页面上下文确定 projectId，不接受 Sandbox 任意切换项目。
- Parent Bridge 只暴露 Runtime SDK 定义的动作。

## 6. PRODUCTION 数据流

已发布应用与 Runtime API 使用同一公开子域名，因此不需要 CORS 和第三方 Cookie。

```text
浏览器
   │ GET /api/runtime/data/customers
   ▼
Traefik HostRegexp
   ▼
prompt-web-app
   │ Host → Project.slug
   │ Project.activeDeploymentId
   │ Deployment → DataSchemaVersion
   │ Collection Capability
   ▼
PostgreSQL DataRecord(environment=PRODUCTION)
```

Gateway 必须以 Host 和 activeDeployment 为事实来源，客户端只能提交集合 key、查询条件或业务数据。

## 7. 存储拓扑

```text
PostgreSQL
├── 平台数据
│   ├── User
│   ├── Project
│   ├── Thread
│   ├── ArtifactVersion
│   └── Deployment
├── 数据结构
│   ├── DataCollection
│   ├── DataSchemaVersion
│   └── DataMigration
└── 业务数据
    ├── DataRecord(environment=DRAFT)
    ├── DataRecord(environment=PRODUCTION)
    └── DataRecordRevision

/deployments Docker Volume
└── {projectId}/{deploymentId}
    ├── index.html
    ├── app.{hash}.js
    └── app.{hash}.css
```

业务数据不进入 `/deployments`，静态产物也不存入 DataRecord。

## 8. DataRecord 第一版形式

```text
id                UUID
projectId         UUID
collectionId      UUID
environment       DRAFT | PRODUCTION
data              JSONB
recordVersion     Integer
createdBy         UUID nullable
updatedBy         UUID nullable
createdAt         Timestamp
updatedAt         Timestamp
deletedAt         Timestamp nullable
```

基础索引：

```text
(projectId, collectionId, environment, deletedAt, createdAt)
(projectId, collectionId, environment, updatedAt)
GIN(data) 仅在查询需求明确后加入
```

第一版字段类型固定为：

- `string`
- `number`
- `boolean`
- `date`
- `datetime`
- `enum`
- 受限 `json`

## 9. 发布边界

发布处理：

- 静态代码构建。
- Data Manifest Diff。
- 安全 Schema 提升。
- Deployment 与 Schema Version 绑定。
- 成功后切换 activeDeployment。

发布不处理：

- 覆盖 PRODUCTION DataRecord。
- 自动复制 DRAFT DataRecord。
- 删除字段或集合。
- 反向恢复数据库。
- 为 Project 创建新容器。

第一次发布创建 PRODUCTION Schema，记录集默认为空。后续发布复用既有 PRODUCTION DataRecord。

## 10. 权限默认值

```text
read    按 Collection 显式开启
create  默认关闭
update  默认关闭
delete  默认关闭
```

DG-0.2 只实现登录用户的只读 DRAFT API。写入、幂等和乐观锁在 DG-0.3 实现；公开写入在 DG-0.4 以后按明确业务场景启用。

## 11. 容量和拆分触发条件

第一版统一服务适合当前作品展示和轻量业务应用。满足以下任一条件时再拆分 Data Gateway：

- Runtime API 流量明显影响管理端响应。
- 需要独立扩缩容或发布节奏。
- 企业要求更强网络隔离。
- 数据查询需要独立限流、缓存或审计管道。
- 引入后台任务、Webhook 或长耗时数据处理。

拆分后保持 URL 与 Runtime SDK 不变，只修改 Traefik 路由：

```text
*.apps.xiongerer.xyz/api/runtime/* → data-gateway 容器
*.apps.xiongerer.xyz/*             → app-runtime 容器
```

## 12. DG-0.2 开发入口

第二阶段按以下顺序开始：

1. Prisma expand migration：枚举与新表全部先增量添加，不删除旧字段。
2. Data Manifest 的 Zod 类型和稳定 key 校验。
3. Schema Diff 纯函数与单元测试。
4. DataCollection / DataSchemaVersion 服务层。
5. 只读 DRAFT API。
6. Project Owner、Environment 和分页边界集成测试。
7. 在生产数据库备份副本上执行 migration 演练。

DG-0.2 不修改现有 V1 生成、Sandbox 和生产发布行为。

