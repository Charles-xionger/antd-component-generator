# 生产部署组合

| 环境 | Generator | Sandbox | 协议 | 状态 |
| --- | --- | --- | --- | --- |
| 回退基线 | `baseline-2026-09-25` / `ed5af46` | `baseline-2026-09-25` / `db5ee9b` | 旧协议 | 已备份，可回退 |
| Project 与发布中心 | `5e2978c` / `sha256:eb8d9460bff1b25032e87268a2122b787b0e2a4d9e99636b6e7a0736ca212a83` | `32e5343` / `sha256:a7a674f3d8092bfa79eee48ddf56d21dba65b8ae0ec9d3adf13f42585aaf86da` | `protocolVersion: 1` | 已部署；Project、历史迁移、预览、静态构建、匿名公开访问与缓存策略已验收 |

生产发布必须同时记录两个镜像 digest。只更新其中一个仓库会造成 postMessage 协议不兼容。

公网通配符路由、AliDNS DNS-01 自动证书和通配符 A 记录已经验收。生产验证项目地址为 `https://project-ab39b463.apps.xiongerer.xyz/`。
