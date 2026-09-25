# 生产部署组合

| 环境 | Generator | Sandbox | 协议 | 状态 |
| --- | --- | --- | --- | --- |
| 回退基线 | `baseline-2026-09-25` / `ed5af46` | `baseline-2026-09-25` / `db5ee9b` | 旧协议 | 已备份，可回退 |
| Project 与发布中心 | `3810057` / `sha256:21823cd39c5b96b1bdbb90a06757dbe2e307fefc134a5ca75900f8c10e5e8ac8` | `32e5343` / `sha256:a7a674f3d8092bfa79eee48ddf56d21dba65b8ae0ec9d3adf13f42585aaf86da` | `protocolVersion: 1` | 已部署；Project、历史迁移、预览、发布入口与匿名 Host rewrite 已验收 |

生产发布必须同时记录两个镜像 digest。只更新其中一个仓库会造成 postMessage 协议不兼容。

公网通配符路由配置已经写入生产 Compose，但在 AliDNS RAM 凭据和通配符 A 记录就绪前，`*.apps.xiongerer.xyz` 不作为已验收入口。
