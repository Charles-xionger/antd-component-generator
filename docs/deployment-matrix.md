# 生产部署组合

| 环境 | Generator | Sandbox | 协议 | 状态 |
| --- | --- | --- | --- | --- |
| 回退基线 | `baseline-2026-09-25` / `ed5af46` | `baseline-2026-09-25` / `db5ee9b` | 旧协议 | 已备份，可回退 |
| Project 与发布中心 | `e6ea12b` / `sha256:78f4238951e5f25d8bfb9339cebd7b7e204e4e2c8675f6a2f324de8c47247ba8` | `32e5343` / `sha256:a7a674f3d8092bfa79eee48ddf56d21dba65b8ae0ec9d3adf13f42585aaf86da` | `protocolVersion: 1` | 已部署；Project、历史迁移、React 运行上下文、Tailwind 4 静态样式、图表、匿名访问与缓存策略已验收 |
| App V1 Go 全栈运行时 | `app-v1-go-20260928-r20` / `sha256:b69f89167aef8544a10cde3b1a9b57de1166dceaed4dddb7766d63dece153ec3` | `sha256:5667cc4795efe749f779e5cbd6fa2a901ca47a595e013867fc0eb6f6ad4cef31` | `protocolVersion: 2`，兼容 V1 | 2026-09-28 已部署；修复静态代码未包装为 Artifact 时的假完成、落库确认与 Sandbox 同步，Web、Build Worker 和恢复项目预览已验收 |

生产发布必须同时记录两个镜像 digest。只更新其中一个仓库会造成 postMessage 协议不兼容。

公网通配符路由、AliDNS DNS-01 自动证书和通配符 A 记录已经验收。生产验证项目地址为 `https://project-ab39b463.apps.xiongerer.xyz/`。

App V1 Go 部署前数据库与代码备份位于服务器 `/opt/prompt-web/backups/app-v1-go-20260926-150902`。上传镜像包位于 `/opt/prompt-web/releases/app-v1-go-20260926-r1/`，SHA-256 为 `07262a6c8610f94a310f9854d378a1e93acd098738d88498fe97c97c637f6782`。
