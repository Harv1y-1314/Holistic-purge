# Provenance — dsh-purge（vendored）

| 项 | 值 |
|---|---|
| 上游 | https://github.com/YuJunZhiXue/dsh-purge（镜像 `mmparko/dsh-purge`） |
| 版本 | 1.1.71 |
| 取得方式 | 从本机已安装副本 `~/.dsh/profiles/desktop/node_modules/dsh-purge` 整目录复制（未改动一行代码） |
| 复制日期 | 2026-11-05 |
| 许可证 | MIT，Copyright (c) 2026 小杨，原文见同目录 `LICENSE` |
| 本仓库对其做的唯一事情 | 存放 + 由 `holistic companions install` 复制回 profile，不修改内容、不参与编译 |

## 为什么 vendor 而不是外挂

它是冷备内骨骼：平时不加载，只在 `holistic fallback on` 时启用。
把代码放进仓库，保证「换机/作者删库」时仍可重建这一层——MIT 明确允许再分发，前提是保留版权与许可声明。
