# Data Gateway V2 开发计划

> 计划基线：2026-09-26  
> 实施方式：单人顺序开发  
> 预计周期：15～20 个有效开发日，不含需求中断和外部服务等待

时间是估算，不作为承诺日期。每个里程碑必须满足验收条件后再进入下一阶段。

## 1. 版本路线

| 版本 | 目标 | 预计时间 | 状态 |
| --- | --- | ---: | --- |
| DG-0.1 | 方案、协议和数据模型冻结 | 1～2 天 | 已完成 |
| DG-0.2 | Prisma 模型、Schema Diff 和只读 DRAFT API | 3～4 天 | 准备开始 |
| DG-0.3 | Runtime SDK、Sandbox V2 和 DRAFT CRUD | 4～5 天 | 未开始 |
| DG-0.4 | 发布时生产 Schema 升级与 PRODUCTION Gateway | 4～5 天 | 未开始 |
| DG-0.5 | 历史项目迁移、审计、软删除和回归测试 | 3～4 天 | 未开始 |
| DG-1.0 | 生产验收与文档冻结 | 1～2 天 | 未开始 |

## 2. DG-0.1：设计冻结

### 开发内容

- [x] 区分 ArtifactVersion、DataSchemaVersion、Deployment 和 DataRecord。
- [x] 确定 DRAFT / PRODUCTION 隔离。
- [x] 确定 JSONB 统一存储，不动态创建物理业务表。
- [x] 确定安全迁移规则。
- [x] 起草 Protocol V2。
- [x] 冻结第一版字段类型和公开写权限默认值。
- [x] 确认现有 Mock 项目采用显式升级且默认不导入数据。
- [x] 冻结 Prisma 初始模型和第一版部署拓扑。

### 完成标准

- 数据模型和协议没有未决的核心生命周期问题。
- Generator 与 Sandbox 对 V2 消息字段达成一致。
- 明确哪些 Schema 变化会阻止发布。

## 3. DG-0.2：数据底座与只读接口

### 开发内容

- [ ] 新增 DataCollection。
- [ ] 新增 DataSchemaVersion。
- [ ] 新增 DataRecord 与 DataEnvironment。
- [ ] 新增 DataMigration。
- [ ] 新增 DataRecordRevision。
- [ ] 两阶段 Prisma migration。
- [ ] Data Manifest Zod 校验。
- [ ] Schema Diff 服务。
- [ ] DRAFT 集合列表和记录查询 API。
- [ ] 所有权与环境隔离测试。

### 完成标准

- 用户 A 无法读取用户 B 的集合和记录。
- DRAFT 查询不会返回 PRODUCTION 数据。
- 非法字段、过滤器和分页参数被拒绝。
- 数据库迁移可在生产备份副本上演练。

## 4. DG-0.3：真实预览与 CRUD

### 开发内容

- [ ] 定义 `protocolVersion: 2` 共享类型。
- [ ] Generator 支持 V2 payload。
- [ ] Sandbox 验证 V2 消息。
- [ ] 实现 `@prompt-web/runtime` 虚拟模块或平台包。
- [ ] 实现 DRAFT 查询、新增、修改、软删除和恢复。
- [ ] 实现 requestId 幂等。
- [ ] 实现 recordVersion 乐观锁。
- [ ] Architect Prompt 输出 Data Manifest。
- [ ] Coder Prompt 禁止默认 Mock，改用 Runtime SDK。
- [ ] 页面生成 loading、empty、error、success 状态。

### 完成标准

- 新项目没有 Mock 数据也能完成首次预览。
- 预览中新建记录后刷新仍存在。
- 同一个 requestId 不会重复创建。
- 旧 recordVersion 更新返回冲突。
- 页面样式修改不会创建新的 Schema Version。

## 5. DG-0.4：生产发布

### 开发内容

- [ ] Deployment 绑定 DataSchemaVersion。
- [ ] 发布前生成 Schema Diff 摘要。
- [ ] 安全变更自动应用到 PRODUCTION。
- [ ] 危险变更阻止发布。
- [ ] 实现公开 Runtime Gateway。
- [ ] 根据 Host 解析 Project 和 activeDeployment。
- [ ] 公开写权限默认关闭。
- [ ] 增加分页、过滤、排序和请求体限制。
- [ ] DataMigration 失败时保持旧 Deployment 在线。
- [ ] 发布中心展示数据结构变化和迁移结果。

### 完成标准

- 第一次发布创建生产 Schema，但不复制草稿记录。
- 第二次发布保留所有生产记录。
- 页面变更且 Schema 不变时不执行数据迁移。
- 迁移失败不影响当前线上版本。
- 下线和页面回滚不删除生产数据。

## 6. DG-0.5：历史迁移与审计

### 开发内容

- [ ] 检测 V1 Mock 项目。
- [ ] 根据现有代码生成待确认 Data Manifest。
- [ ] 创建 V2 ArtifactVersion。
- [ ] 可选导入 Mock 数据到 DRAFT。
- [ ] DataRecordRevision 查询。
- [ ] 软删除恢复入口。
- [ ] 生产备份和恢复演练。
- [ ] V1 / V2 并存回归测试。

### 完成标准

- 历史项目不会被自动写入生产数据。
- V1 项目可继续访问旧发布版本。
- V2 升级失败不会破坏旧 ArtifactVersion。
- 可以追踪记录的创建、修改和删除人。

## 7. DG-1.0：生产验收

### 验收场景

- [ ] 创建一个客户管理项目。
- [ ] 预览环境创建、修改和删除草稿客户。
- [ ] 首次发布得到空生产数据集。
- [ ] 线上新增真实客户并刷新恢复。
- [ ] 修改页面样式并重新发布，客户数据不变。
- [ ] 新增可选字段并发布，旧客户数据仍可读取。
- [ ] 尝试删除字段，发布被阻止并显示原因。
- [ ] 回滚页面，新增字段和数据继续保留。
- [ ] 下线后数据继续存在，重新发布后可恢复访问。
- [ ] 用户 A 无法访问用户 B 的草稿数据。
- [ ] 非法 Host 和伪造 projectId 被拒绝。

## 8. 测试分层

### 单元测试

- Manifest 校验。
- Schema Diff。
- 数据类型校验。
- 权限矩阵。
- requestId 幂等。
- recordVersion 冲突。

### 集成测试

- Prisma 数据关系。
- DRAFT / PRODUCTION 隔离。
- Deployment 与 Schema 绑定。
- 迁移失败事务回滚。
- 软删除和 Revision。

### 端到端测试

- Prompt → V2 Artifact → 真实预览。
- DRAFT CRUD。
- 发布 → 公开子域名 → PRODUCTION CRUD。
- 重新发布、回滚和下线后的数据持久性。

## 9. 发布和回退

- Protocol V2 上线前继续保留 V1 兼容读取。
- 数据库先 expand，再切换代码，最后 contract；第一阶段不执行 contract 删除。
- 每个阶段更新 `docs/deployment-matrix.md`。
- 每个生产版本记录 Generator commit、Sandbox commit、镜像 digest、migration 和 protocolVersion。
- 生产迁移前创建 PostgreSQL 备份并验证可读取。
- 新版本失败时回退应用镜像，不回滚或覆盖业务数据。

## 10. 每日开发记录模板

在 `CHANGELOG.md` 追加：

```markdown
## YYYY-MM-DD · DG-x.y

### 完成
- 内容

### 验证
- 测试和结果

### 决策
- 新增或变更的设计决策

### 风险 / 未决
- 需要后续处理的问题

### 版本
- Generator commit：
- Sandbox commit：
- Image digest：
- Migration：
```
