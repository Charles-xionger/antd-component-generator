# 生产部署组合

| 环境 | Generator | Sandbox | 协议 | 状态 |
| --- | --- | --- | --- | --- |
| 回退基线 | `baseline-2026-09-25` / `ed5af46` | `baseline-2026-09-25` / `db5ee9b` | 旧协议 | 已备份，可回退 |
| Project 与发布中心 | `e6ea12b` / `sha256:78f4238951e5f25d8bfb9339cebd7b7e204e4e2c8675f6a2f324de8c47247ba8` | `32e5343` / `sha256:a7a674f3d8092bfa79eee48ddf56d21dba65b8ae0ec9d3adf13f42585aaf86da` | `protocolVersion: 1` | 已部署；Project、历史迁移、React 运行上下文、Tailwind 4 静态样式、图表、匿名访问与缓存策略已验收 |

生产发布必须同时记录两个镜像 digest。只更新其中一个仓库会造成 postMessage 协议不兼容。

公网通配符路由、AliDNS DNS-01 自动证书和通配符 A 记录已经验收。生产验证项目地址为 `https://project-ab39b463.apps.xiongerer.xyz/`。
