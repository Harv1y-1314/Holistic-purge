# Holistic-purge

DSH 插件。安装后，指定工作区的新对话默认运行 **Holistic**：内核常驻、技能索引自动注入、
工具自动就位。不改宿主源码，不影响其它工作区。

当前版本 `1.0.0` · 契约 [BOTTOM-LINES.md](BOTTOM-LINES.md) · 文档索引 [docs/](docs/README.md)

## 安装

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/Harv1y-1314/Holistic-purge@main/install.sh \
  | bash -s -- --workspace "$HOME/Desktop/开发-逆向与破解"
```

一条命令完成：部署插件 → 按需生成 profile → 登记依赖与 bundles → 写入 Holistic 预设 →
登记工作区规则 → 生成 `AGENTS.md` 块 → `selftest --apply` → 自动重启并复检。

在 DSH 会话内运行时跳过自动重启（避免杀掉当前进程），执行 `~/.local/bin/dsh-restart` 即可。

| 场景 | 命令 |
|---|---|
| 已 clone | `bash install.sh --workspace <目录>` |
| 离线 | `bash install-offline.sh --workspace <目录>` |
| 追加工作区 | `bash holistic doctor --workspace <目录> --apply` |
| 更新 | `bash update.sh --reinstall`（旧 clone 会强制同步历史） |

## 生效范围

| 范围 | 结果 |
|---|---|
| 指定工作区的新对话 | 切到 Holistic：内核三段 + 技能索引 + `holistic_*` 三工具 |
| 该工作区首条消息 | 上方出现一条 `holistic-purge` 上下文提示 |
| 其它工作区 | 标准模式，不干预 |
| 已有对话 | 不追溯（宿主只允许 blank 会话切预设） |
| 子代理 | 自动继承 |

内置「标准模式 / 创造模式」保留；外源 QNX-Agent 预设已移除。

## 命令

```text
/holistic            当前会话上场          /holistic off      仅收起当前会话
/holistic ws         只补工作区块          /holistic ws off   撤区块并停止自动上场
```

```bash
bash holistic doctor   [--apply] [--workspace DIR]   # 配置体检 + 幂等修复
bash holistic probe    [--workspace DIR]             # 运行时探针
bash holistic selftest [--apply] [--workspace DIR]   # doctor + probe + 回归测试
bash holistic verify                                 # 安装完整性
```

## 目录

```text
install.sh / install-offline.sh  安装        holistic   CLI
index.js                         插件入口    kernel/    内核三段
lib/                             实现        router/    车道映射
skills/ (10) + skills-pack/ (327) 技能        presets/   离线兜底预设模板
tests/                           测试        docs/      文档
```

其它端：Qoder CN 适配见 `qoder-lite` 分支（独立交付线，L0–L4 本机注入，自带 selftest）。

## 来源与致谢

思路与组件的原始来源：

| 来源 | 说明 |
|---|---|
| [DeepSeek Harness](https://github.com/deepseek-ai) | 宿主；本插件仅使用公开扩展点（systemPrompt / tools / agent-presets / agent-instructions） |
| [Qi-NX / QNX-Agent](https://github.com/Shiyou-Qi/QNX-Agent) | `vendor/qi-nx-agent`（MCP 工具包），版权 Qi-NX；仅本机自用，不随本仓库分发 |
| dsh-purge（YuJunZhiXue，mmparko 镜像） | 宿主侧补丁冷备组件，MIT |
| 无限四代内核、qoder-armor、富江预设（HanKuCha） | 设计思路参考 |
| OWASP、PayloadsAllTheThings、SecLists、SnailSploit offensive-checklist 等 | `skills-pack` 领域技能的内容来源（公开资料整理） |

维护：[Harv1y-1314](https://github.com/Harv1y-1314)。许可 MIT，见 [LICENSE](LICENSE)。
