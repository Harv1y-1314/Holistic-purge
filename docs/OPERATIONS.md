# 运维手册

## 安装

```bash
# 远程（仓库公开）
curl -fsSL https://cdn.jsdelivr.net/gh/Harv1y-1314/Holistic-purge@main/install.sh \
  | bash -s -- --workspace "$HOME/Desktop/开发-逆向与破解"

# 本地仓库
bash install.sh --workspace <目录>

# 离线
bash install-offline.sh --workspace <目录>
```

行为：

| 步骤 | 说明 |
|---|---|
| 同步插件 | 复制到 `$DSH_HOME/plugins/holistic-purge`（排除 `.git`/`node_modules`/备份） |
| 生成 profile（按需） | 不存在时自动 `open -a "DeepSeek Harness"` 拉起一次并等待生成 |
| 登记 | profile `dependencies` + `dsh.profile.bundles` + `node_modules` 链接 |
| 预设块 | 写 `preset-holistic`；内置预设不动 |
| 工作区 | `presets.json` 登记目录；生成 `AGENTS.md` 块 |
| 自检 | `selftest --apply`（doctor + probe + 回归测试） |
| 重启 | Terminal 中自动执行 `~/.local/bin/dsh-restart` 并复检；在 DSH 会话内自动跳过 |

参数：`--workspace DIR`（默认当前目录）、`--offline`、`--no-restart`、`--repo URL`。

## 加装 / 撤下工作区

```bash
# 加装：登记规则 + 铺块 + 体检
bash holistic doctor --workspace <目录> --apply

# 撤下：删块 + 删规则（块外内容保留）
bash holistic ws off          # 在该工作区的会话里执行
# 或直接编辑：
$EDITOR ~/.dsh/.holistic/presets.json
```

## 健康检查

```bash
bash holistic doctor   [--apply] [--workspace DIR]
bash holistic probe    [--workspace DIR]
bash holistic selftest [--apply] [--workspace DIR]
bash holistic verify
```

| 命令 | 层级 | 检查内容 |
|---|---|---|
| `doctor` | 配置 | profile、依赖、bundles、链接、Holistic 预设块、内置预设、预设唯一性、presets 规则、AGENTS.md 块版本、内核锚点、技能数量 |
| `probe` | 运行时 | boot.log 版本 vs 磁盘版本、最近会话的 `agent-preset/selected`、notice、inbox 残留、`holistic_*` 调用、块四段完整性 |
| `selftest` | 全部 | doctor + probe + `tests/workspace.test.mjs` |

`doctor` 的 `! warn` 不阻断；`✗ fail` 会返回非零退出码。
`probe` 的 `boot-version` warn 表示"磁盘版本已更新、进程还在旧版本"，重启即可消掉。

## 更新

正常更新：

```bash
cd <repo>
bash update.sh --reinstall          # fetch --force --tags + reset --hard origin/<branch> + install.sh
```

`update.sh` 是幂等的；工作树有未提交改动时会直接退出，不会 `reset --hard`。

仓库历史为**单一初始提交**（`1.0.0`）。在该提交之前存在的旧 clone 需要强制同步一次：

```bash
git fetch --force --prune origin && git fetch --force --tags origin
git reset --hard origin/main
```

此后不再重写历史：所有改动都是普通提交 + tag，`git pull` / `bash update.sh` 即可。

安装器会重写受管块（版本号变化时）、刷新工作区块，并跑 selftest。重启后生效。

## 撤回 / 卸载

```bash
# 只撤某个工作区
bash holistic ws off

# 移除插件（保留 profile 其它配置）
bash uninstall.sh
```

## 故障排查

| 现象 | 处理 |
|---|---|
| 选择器没有 Holistic | `bash holistic doctor --apply --workspace <目录>` → 重启 |
| 新对话没切 Holistic | 确认目录在 `presets.json` 或存在 `AGENTS.md` 块；已有对话不会追溯 |
| 新对话没有 `holistic_*` 工具 | `bash holistic probe` 看 boot-version；重启后仍未出现则查 `doctor` |
| AGENTS.md 块版本旧 | `doctor --apply` 或重启（插件启动自愈会重写） |
| 在 DSH 会话内安装后没生效 | 正常：自动重启被跳过，执行 `~/.local/bin/dsh-restart` |

## 附录：purge 冷备（可选）

仓库仍保留 `holistic fallback` 与 `vendor/dsh-purge`（MIT，宿主侧补丁冷备）。
qi-nx-agent 为 UNLICENSED，不在仓库内；需要时从上游 [Shiyou-Qi/QNX-Agent](https://github.com/Shiyou-Qi/QNX-Agent) 自取，放入 `$DSH_HOME/components/qi-nx-agent`。
默认不使用，也不影响主路径：

```bash
bash holistic fallback status
bash holistic fallback on  --apply   # 双轨
bash holistic fallback off --apply   # 回到 Holistic 单边
```
