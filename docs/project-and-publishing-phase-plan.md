# Project 与发布闭环实施方案

> 状态：待评审  
> 更新时间：2026-09-25  
> 范围：版本冻结、Project 项目层、Thread 归属、静态应用发布  
> 暂不包含：组织管理、成员管理、企业 RBAC、真实业务数据、Data Gateway、自定义顶级域名

## 1. 当前决策

1. `antd-component-generator` 与 `antd-sandbox` 继续保持两个仓库，暂不合并。
2. 当前可工作的线上版本先冻结，建立可验证、可回滚的工程基线。
3. 新增 Project，用户登录后可以创建和管理项目。
4. Thread 必须归属于 Project；一个 Project 可以有多个 Thread。
5. Project 持有唯一的当前代码工件，多个 Thread 围绕同一份项目代码协作。
6. Project 完成后实现发布：把指定代码版本发布到稳定子域名，并支持重新发布、下线和回滚。
7. 用户与组织管理延后；第一阶段 Project 直接归属于 User。GitHub 只是当前登录方式，未来可以增加邮箱密码登录，不影响 Project 所有权模型。

## 2. Project 与当前 Thread 的真实关系

当前关系是：

```text
User
└── Thread
    └── Artifact
        └── ArtifactVersion
```

当前 Thread 实际已经同时承担了两种职责：

- 对话：保存用户与 AI 的交互历史。
- 项目：持有 Artifact、版本、标题、收藏和入口 URL。

所以从用户体验看，当前“一条会话”确实已经近似“一个项目”。新增 Project 不是因为现有能力不能工作，而是为了把应用生命周期从聊天生命周期中拆出来，使发布信息、应用名称、稳定域名和后续数据配置有明确归属。

第一版不需要立即向用户暴露“一个项目多个会话”的复杂交互。推荐采用：

```text
Project
├── Primary Thread（第一版固定一个）
├── Artifact / Versions
└── Deployment
```

Project 列表展示应用；进入 Project 后仍使用现在熟悉的单会话生成界面。未来确实出现“新建讨论、需求分支、多人协作”等场景时，再开放多个 Thread。

如果只增加 `Thread.projectId`，同时继续让 Artifact 归属于 Thread，会留下以下问题：

- 在会话 A 生成的代码，会话 B 看不到。
- 无法确定 Project 当前应该发布哪个 Artifact。
- Project 只是会话文件夹，并不是真正的应用。
- 版本历史会按 Thread 分裂，后续发布和回滚语义混乱。

目标关系应改为：

```text
User
└── Project
    ├── Thread A
    ├── Thread B
    ├── Artifact
    │   └── ArtifactVersion
    └── Deployment
```

Project 是应用本身；Thread 是生成应用的对话记录；Artifact 是 Project 的代码工件。第一版二者在产品体验上保持一对一，数据模型保留未来扩展空间。

## 3. Phase 0：冻结当前版本

### 3.1 冻结内容

两个仓库分别保留独立提交历史，但使用同一个发布编号，例如 `baseline-2026-09-25`。

需要保存：

- 两个仓库的 Git commit 和 tag。
- 两个生产 Docker 镜像的不可变标签与镜像 digest。
- 生产 Compose 文件的版本副本。
- Prisma migration 状态。
- PostgreSQL 逻辑备份，并执行一次恢复验证。
- 环境变量名称清单，不保存环境变量值。
- 当前线上冒烟测试结果。

### 3.2 基线验收

- GitHub 登录成功。
- 两个模型均可完成一次最小请求。
- 新建会话、生成代码和版本保存成功。
- 沙箱预览成功。
- 分享链接成功。
- 数据库重启后数据仍存在。
- 使用旧镜像可以回滚到冻结版本。

### 3.3 两仓库兼容管理

不合并仓库，但需要明确契约：

- 为父页面与沙箱的 `postMessage` 协议增加 `protocolVersion`。
- Generator 发布清单记录兼容的 Sandbox 镜像版本。
- 协议发生破坏性变化时提升主版本，禁止不兼容组合上线。
- 两个仓库可以独立发布，但生产部署必须使用经过验证的版本组合。

## 4. Phase 1：Project 数据模型

### 4.1 推荐模型

```prisma
enum ProjectStatus {
  ACTIVE
  ARCHIVED
}

model Project {
  id                 String        @id @default(uuid())
  userId             String
  name               String
  description        String?
  slug               String        @unique
  status             ProjectStatus @default(ACTIVE)
  activeDeploymentId String?       @unique
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  user        User
  threads     Thread[]
  artifact    Artifact?
  deployments Deployment[]

  @@index([userId, updatedAt])
}

model Thread {
  id        String   @id @default(uuid())
  projectId String
  userId    String
  title     String
  favorite  Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  project Project
  user    User

  @@index([projectId, updatedAt])
  @@index([userId, updatedAt])
}

model Artifact {
  id        String   @id @default(uuid())
  projectId String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  project  Project
  versions ArtifactVersion[]
}
```

实际 Prisma 关系字段需要在实现时完整补齐。`activeDeploymentId` 与 Deployment 的双向关系可以在第二次迁移中添加，避免初始循环关系增加迁移复杂度。

### 4.2 Slug 决策

- `name` 是用户可修改的展示名称。
- `slug` 用于域名，创建后默认保持稳定，重命名项目不自动修改域名。
- 第一阶段使用全局唯一 slug，建议生成 `{readable-slug}-{shortId}`，避免不同用户抢占常见名称。
- slug 仅允许小写字母、数字和连字符，设置长度上限并保留系统关键字。

### 4.3 数据迁移必须分步

禁止直接增加必填 `projectId` 后上线。推荐 expand/migrate/contract：

1. 新增 Project 表。
2. 为 Thread 增加可空 `projectId`。
3. 为每个现有 Thread 创建一个迁移 Project，保留当前“一会话一项目”的行为。
4. 将现有 Artifact 从 Thread 迁移到对应 Project。
5. 运行一致性检查，确认 Thread、Artifact 和版本数量无损。
6. 应用代码切换为 Project 语义。
7. 确认稳定后再把 `projectId` 改为必填，并删除 `Artifact.threadId`。

整个迁移期间保留数据库备份；不在同一次发布中同时执行不可逆删列和业务代码切换。

## 5. Project 产品流程

### 5.1 页面结构

建议路由：

```text
/projects                         项目列表
/projects/new                     创建项目
/projects/:projectId              项目工作区
/projects/:projectId?thread=:id   指定会话
/projects/:projectId/settings     项目设置和发布信息
```

登录后的默认入口为项目列表。项目卡片展示：

- 项目名称和描述。
- 最后修改时间。
- 当前代码版本号。
- 发布状态和线上地址。
- 最近一次发布结果。

### 5.2 创建流程

推荐先创建 Project，再创建第一个 Thread：

1. 用户点击“新建项目”。
2. 输入名称，可选填写描述。
3. 服务端生成稳定 slug。
4. 创建 Project 和默认 Thread。
5. 跳转到项目工作区，开始首次生成。

不建议继续采用“发送第一条 Prompt 时才隐式产生项目”，否则失败重试、空项目和 URL 状态会更难处理。

### 5.3 项目内会话

- 第一版每个 Project 创建一个 Primary Thread，不增加多会话管理 UI。
- 现有侧边栏可以调整为项目列表，进入项目后展示该项目的对话历史。
- Primary Thread 读取 Project 当前 ArtifactVersion 作为代码上下文。
- 对话产生的新代码版本写入 Project Artifact。
- 删除 Thread 不删除 Project Artifact 和版本。
- 删除 Project 才会处理 Thread、Artifact 和 Deployment；第一阶段采用软删除或归档，不立即物理删除。

多个 Thread 属于同一 Project 作为后续能力保留，不作为本阶段验收要求。

### 5.4 重复写入与轻量版本保护

即使只有一个用户，也可能因为两个浏览器标签、重复点击、网络重试，或者“Coder 自动保存 + 前端再次保存”产生两个写入。当前项目已经同时存在服务端和前端保存路径，因此这是实际工程问题，不是多人协作的假设。

第一阶段不建设复杂协作系统，只做轻量保护：

- 每次生成带一个请求 ID，重复请求不重复创建版本。
- 统一为一个保存入口，避免服务端和前端各保存一次。
- `versionNumber` 必须增加数据库唯一约束 `@@unique([artifactId, versionNumber])`。
- 版本号分配与版本写入放在短事务中。

`baseVersionId` 和 409 冲突提示可以等到真正支持多标签编辑或多会话后再加入，不阻塞第一版产品闭环。

## 6. API 设计与安全基线

### 6.1 Project API

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/:projectId
PATCH  /api/projects/:projectId
DELETE /api/projects/:projectId        # 第一阶段实际归档

GET    /api/projects/:projectId/threads
POST   /api/projects/:projectId/threads
```

生成、历史、保存和分享接口需要显式传递并校验 Project：

```text
POST /api/projects/:projectId/agent/stream
GET  /api/projects/:projectId/threads/:threadId
POST /api/projects/:projectId/artifacts/versions
POST /api/projects/:projectId/deployments
```

### 6.2 登录认证与资源所有权

GitHub OAuth 解决的是 Authentication：确认“当前用户是谁”。未来增加邮箱和密码，只是多一种登录方式。Project 的 `userId`、资源归属和访问规则属于 Authorization：确认“当前用户能操作什么”。两者需要分开设计。

第一阶段可以继续只使用 GitHub 登录。后续增加邮箱密码时，同一个 User 可以拥有多个 Account，不需要改 Project、Thread、Artifact 和 Deployment 的所有权关系。

### 6.3 当前必须补齐的所有权校验

资源所有权校验不是组织权限系统，而是一条最基本的规则：用户只能读取和修改 `project.userId` 等于自己的项目。

目前部分按 ID 查询、修改、删除 Thread/Artifact/Share 的接口没有统一验证当前用户是否拥有目标资源。仅仅“通过 GitHub 登录”并不足够；如果另一个用户获得某个 UUID，就可能读取或修改不属于自己的数据。

在 Project 改造中必须统一使用以下查询边界：

```text
project.id = routeProjectId
project.userId = session.user.id
thread.projectId = routeProjectId
```

要求：

- 所有读写 API 都先做资源归属校验。
- 不接受仅凭客户端传入的 `threadId` 或 `artifactVersionId` 执行操作。
- 不存在与无权限统一返回 404，减少资源枚举。
- 分享读取可以匿名，但创建、撤销分享必须验证版本所有权。
- 日志不能打印密钥、完整 Prompt 图片或用户业务数据。

建议建立 `getOwnedProject()`、`getOwnedThread()` 等服务层函数，避免每个 Route 重复且遗漏授权逻辑。

## 7. Phase 2：静态应用发布

### 7.1 Share 与 Publish 必须分离

当前 Share 是某个 ArtifactVersion 的预览链接。Publish 应是稳定的产品能力：

| 能力 | Share | Publish |
|---|---|---|
| 地址 | 随机分享码 | 稳定项目子域名 |
| 指向 | 固定版本 | 当前激活 Deployment |
| 用途 | 临时预览 | 正式访问 |
| 回滚 | 不需要 | 必须支持 |
| 下线 | 删除分享 | Project 级下线 |

不能直接把现有 `/preview/:shareCode` 当作最终发布系统，否则每位访问者都需要重新下载 WASM 并在浏览器编译，首屏慢且难以保证稳定性。

### 7.2 Deployment 模型

```prisma
enum DeploymentStatus {
  QUEUED
  BUILDING
  VALIDATING
  READY
  ACTIVE
  FAILED
  SUPERSEDED
  DISABLED
}

model Deployment {
  id                String           @id @default(uuid())
  projectId         String
  artifactVersionId String
  status            DeploymentStatus @default(QUEUED)
  buildKey          String?
  errorMessage      String?
  createdAt         DateTime         @default(now())
  activatedAt       DateTime?

  @@index([projectId, createdAt])
  @@index([status, createdAt])
}
```

`buildKey` 指向对象存储或本地不可变目录，例如：

```text
projects/{projectId}/deployments/{deploymentId}/
```

### 7.3 第一阶段发布流水线

```text
用户选择 ArtifactVersion
  → 创建 QUEUED Deployment
  → Worker 领取任务
  → 在隔离环境构建
  → 校验依赖、体积和输出
  → 写入不可变静态产物
  → 标记 READY
  → 健康检查
  → 原子更新 activeDeploymentId
  → 新版本 ACTIVE，旧版本 SUPERSEDED
```

关键原则：

- 构建失败不能影响当前线上版本。
- 发布不能在 Next.js 请求进程中同步执行。
- Worker 不持有生产数据库管理员权限。
- 构建只允许白名单依赖，禁用任意安装脚本。
- 发布产物不可原地覆盖；重新发布产生新的 Deployment。
- 回滚只切换 `activeDeploymentId`，不重新构建。

### 7.4 外网演示阶段的基础设施选择

2 vCPU / 2 GiB ECS 足以承担当前作品的外网展示。首版重点是产品闭环，不提前建设复杂基础设施：

- 使用 Deployment 表记录发布状态。
- 使用一个简单的单任务发布进程或独立脚本完成构建；先不引入 Redis、消息队列和任务平台。
- 本地 Docker Volume 保存构建产物，目录保持不可变。
- App Runtime 或只读 Nginx 根据 Host 解析 Project 并提供当前产物。

MinIO、Redis、复杂 Worker 编排和对象存储可以延后。发布链路稳定后，再把产物存储替换成 OSS/S3，而不改变 Deployment 模型。

## 8. 子域名与证书

建议正式应用域名：

```text
{project-slug}.apps.xiongerer.xyz
```

需要提前完成：

1. DNS 增加 `*.apps.xiongerer.xyz` 指向 ECS。
2. Traefik 增加 HostRegexp 路由到 App Runtime。
3. 申请 `*.apps.xiongerer.xyz` 通配符证书。

重要限制：Let's Encrypt 通配符证书必须使用 DNS-01，当前普通 HTTP-01 配置无法签发通配符证书。需要配置 DNS 服务商 API 凭证，并把凭证作为 Secret 保存，不能写进仓库或 Traefik 标签。

### 8.1 发布可见性

在组织和应用登录体系实现前，第一阶段只支持：

- `PRIVATE`：仅项目所有者在管理端预览。
- `PUBLIC`：任何知道地址的人都能访问。

默认应为 PRIVATE；用户点击发布时明确确认公开。所谓“无法搜索但知道链接可访问”的 unlisted 不是安全边界。

## 9. 两仓库在发布体系中的职责

### antd-component-generator

- Project、Thread、Artifact、Deployment 数据模型。
- 项目列表和项目工作区。
- AI 生成与版本管理。
- 发布控制面 API。
- Worker 调度与发布状态展示。

### antd-sandbox

- 继续承担编辑阶段的即时预览。
- 定义受支持依赖和运行时契约。
- 提供可复用的构建配置，但不直接作为正式发布页面。
- 与 Generator 通过带版本号的消息协议通信。

正式发布访问的是预构建静态产物，不依赖浏览器中的 `esbuild.wasm`。

## 10. 容易欠考虑的事项

### 10.1 Project 当前版本

不能简单认为版本号最大的版本就是线上版本或编辑版本。建议明确：

- Artifact 最新版本：编辑器当前版本。
- Deployment 对应版本：某次不可变发布来源。
- Project activeDeploymentId：当前线上版本。

三者不能混用。

### 10.2 删除语义

- 删除 Thread 不得级联删除 Project 代码。
- 删除一个正在发布的 ArtifactVersion 应被禁止。
- Project 首先归档；延迟物理删除构建产物和数据库记录。
- 发布域名下线后返回明确的 404/410 页面。

### 10.3 构建的确定性

- 固定依赖版本和 pnpm lockfile。
- 记录 Generator、Sandbox/Runtime 和构建器版本。
- 相同 ArtifactVersion 应产生可追踪的构建结果。
- 限制输出体积，防止单个项目耗尽磁盘。

### 10.4 演示环境边界

当前 ECS 的职责是承载作品演示，不按大规模商业并发设计。第一版只需要设置基本构建超时、失败清理和磁盘告警，避免明显故障；资源调度、弹性扩容和复杂配额等到真实使用量出现后再做。

### 10.5 备案与内容风险

公开发布意味着服务器承载用户生成内容。个人作品阶段应限制注册范围、保留关闭应用能力，并明确禁止上传敏感或违法内容。产品对外开放前需要重新确认备案主体和服务边界。

## 11. 实施顺序

### Milestone 0：冻结基线

交付：双仓库 tag、镜像 digest、数据库备份、部署清单、冒烟测试与回滚验证。

### Milestone 1：Project 最小闭环

交付：Project 数据模型、迁移脚本、项目列表、创建/重命名/归档、Primary Thread、项目工作区路由。产品界面仍保持一个项目一个主要对话。

### Milestone 2：代码归属迁移

交付：Artifact 改归 Project、统一版本保存入口、事务化版本写入、所有 API 所有权校验。多 Thread 和复杂版本冲突处理延后。

### Milestone 3：发布数据面

交付：Deployment 状态机、Worker、不可变静态构建产物、构建日志、失败重试。

### Milestone 4：线上运行面

交付：App Runtime、通配符 DNS/TLS、发布/下线/回滚、项目稳定子域名、访问日志。

### Milestone 5：稳定性验收

交付：发布失败不影响线上版本、历史版本回滚、并发保存冲突测试、越权访问测试、磁盘配额和备份恢复测试。

## 12. 完成定义

本阶段完成时，用户可以：

1. 登录并看到自己的项目列表。
2. 创建 Project，并在项目的主要对话中生成页面。
3. 对话持续修改同一个 Project 的代码和版本。
4. 选择一个 ArtifactVersion 发布。
5. 通过稳定的 `*.apps.xiongerer.xyz` 子域名访问预构建应用。
6. 发布新版本失败时继续访问旧版本。
7. 一键回滚到历史 READY 版本。
8. 下线项目且不删除编辑数据和历史版本。

## 13. 评审后仍需确认的产品决策

进入编码前只需要确认以下三项：

1. Project 删除采用“归档后可恢复”，还是立即进入延迟删除队列；建议归档。
2. 首版发布默认 PRIVATE 还是用户点击后直接 PUBLIC；建议默认 PRIVATE，发布时明确确认。
3. 第一版构建产物先放本机 Volume，还是直接接阿里云 OSS；建议先用 Volume 验证闭环，但从第一天保留 StorageAdapter 接口。
