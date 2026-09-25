# Project 与发布中心实现说明

## 产品闭环

本版本把原有 Thread 入口提升为 Project：创建项目后仍从第一条 Prompt 开始，后续生成结果保存为不可变的 ArtifactVersion。用户选择一个版本手动发布后，公开子域名始终指向 Project 当前激活的 Deployment；继续编辑不会自动改变线上内容。

## 核心边界

- GitHub OAuth 只确认用户身份，所有管理接口最终以 `Project.userId` 判定所有权。
- 第一版固定一个 Project、一个 Primary Thread、一个 Artifact。
- ArtifactVersion 只追加，不因删除消息或重新生成而删除。
- 发布应用是静态前端，只能导入平台白名单依赖，浏览器网络连接被 CSP 限制为同源。
- 分享链接和已发布应用允许匿名读取；编辑、分享管理和发布操作必须登录。

## 数据迁移

迁移 `20260925150000_add_projects_and_deployments` 在同一个数据库事务中依次完成扩展、回填、校验约束所需的收紧操作：

1. 创建 Project、Deployment 与状态枚举，先为旧表增加可空字段。
2. 每个历史 Thread 建立一个 Project，并把 Artifact 所有权迁移到 Project。
3. 将新外键改为必填，移除 Artifact.threadId。
4. 为版本号、slug、主会话和 activeDeployment 增加唯一约束。

上线前备份位于服务器 `/opt/prompt-web/backups/baseline-2026-09-25`。本地迁移演练使用旧结构样例验证了 Thread、Artifact、ArtifactVersion 和 File 数量保持不变。

## 发布过程

`POST /api/projects/:projectId/deployments` 同步完成一次构建：

1. 验证版本属于当前用户的 Project。
2. 在 `/deployments/.tmp` 写入源码并通过原生 esbuild 构建。
3. 校验依赖白名单与产物大小，把 JS/CSS 改为内容哈希文件名。
4. 原子移动到 `/deployments/{projectId}/{deploymentId}`。
5. 在数据库事务中激活新 Deployment，并把旧 ACTIVE 标为 SUPERSEDED。

构建失败会保留 FAILED 记录，当前线上版本不变。回滚只激活已有成功产物；下线清空 activeDeploymentId 并保留历史。

## 生产配置

应用容器需要：

```text
DEPLOYMENTS_ROOT=/deployments
PUBLISHED_APPS_DOMAIN=apps.xiongerer.xyz
```

并把宿主机 `/opt/prompt-web/deployments` 挂载到容器 `/deployments`。Traefik 的公开应用路由使用 `*.apps.xiongerer.xyz`，通配符证书由 AliDNS DNS-01 解析器签发。

Traefik 2.5 的 AliDNS 解析器需要通过服务器 Secret 或受限环境文件提供：

```text
ALICLOUD_ACCESS_KEY
ALICLOUD_SECRET_KEY
ALICLOUD_REGION_ID
```

DNS 中还需要一条 `*.apps.xiongerer.xyz` 指向 ECS 公网地址的通配符 A 记录。访问密钥必须是最小权限 RAM 用户，不写入 Git 仓库或应用环境文件。

## 双仓库兼容性

Generator 与 Sandbox 的 postMessage 均要求 `protocolVersion: 1`。部署时必须按经过验证的组合一起更新；协议不匹配时 Sandbox 会拒绝消息，避免静默渲染错误。

