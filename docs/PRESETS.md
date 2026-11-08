# 预设策略

## 保留什么

| 预设 | 归属 | 状态 |
|---|---|---|
| 标准模式 `standard` | 宿主内置 | 保留，仍是全局默认 |
| 创造模式 `cordis` | 宿主内置 | 保留 |
| 极简 / PTC `minimal` / `ptc` | 宿主内置 | 保留（如宿主装配了） |
| **Holistic** `holistic` | 本插件新增 | 由工作区规则自动选中 |

外源 QNX-Agent 预设（二进制/固件/APK/团队协作）已移除，源文件仅作本地归档。

## Holistic 预设里有什么

- `id: holistic`、`name: Holistic`、`order: 2`；
- `plugins` 与宿主内置 standard 预设一致（22 项工具栈），**不裁剪**；
- `persona.prefix` 嵌入内核三段（`kernel/holistic-kernel.md`、`taskdigest.md`、`closure.md`）。

生成方式：`lib/fullstack.mjs` 在安装时读取宿主内置 `standard.patch.yml` 派生插件树，
因此宿主升级后工具列表自然跟随；离线兜底模板在 `presets/holistic-managed.yml`。

## 什么时候切到 Holistic

注册表只有一个进程级默认预设（`standard`）。插件在会话还是 blank 时做定向切换：

```text
agent/created
  ├─ 目录命中 presets.json 规则          → select(holistic)
  ├─ 目录已有 AGENTS.md 受控块            → select(holistic)
  └─ 否则                                → 不切（继续标准模式）
```

- 目录规则支持子目录：`/a/b` 的规则对 `/a/b/c` 生效；多条命中取最长路径；
- 不切的情况：会话已经开过 turn（宿主硬约束）、用户在别处显式选了其它预设。

## 规则文件

```json
// ~/.dsh/.holistic/presets.json
{
  "version": 1,
  "workspaces": [
    { "path": "/Users/me/Desktop/开发-逆向与破解", "preset": "holistic" }
  ]
}
```

写入途径：

| 操作 | 效果 |
|---|---|
| `install.sh --workspace DIR` | 写入 DIR → holistic |
| `bash holistic doctor --workspace DIR --apply` | 同上 |
| 会话内 `/holistic ws` | 同上（当前 cwd） |
| `/holistic ws off` | 删除该目录的规则与块 |

## 预设块的位置与修复

在 `~/.dsh/profiles/<profile>/cordis.patch.yml` 的受管块里，标记：

```text
# >>> HOLISTIC-PRESETS (managed) >>>
...
# <<< HOLISTIC-PRESETS <<<
```

缺失或损坏时：`bash holistic doctor --apply`（重启后生效）。
`install.sh` 也会在首次安装时自动写入。
