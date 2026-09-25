# 生产部署组合

| 环境 | Generator | Sandbox | 协议 | 状态 |
| --- | --- | --- | --- | --- |
| 回退基线 | `baseline-2026-09-25` / `ed5af46` | `baseline-2026-09-25` / `db5ee9b` | 旧协议 | 已备份，可回退 |
| Project 与发布中心 | `codex/project-publishing` | `codex/project-publishing` | `protocolVersion: 1` | 待生产验收后填写 commit 与镜像 digest |

生产发布必须同时记录两个镜像 digest。只更新其中一个仓库会造成 postMessage 协议不兼容。
