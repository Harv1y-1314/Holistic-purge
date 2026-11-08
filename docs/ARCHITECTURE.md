# 架构

Holistic-purge 只做一件事：**让指定工作区的每一次新对话，自动带着完整的内核与工具开工**，
同时不干扰其它工作区、不修改宿主源码。实现分三层，彼此独立。

## 1. 内核三段（文本层）

来源：`kernel/`

| 文件 | 作用 |
|---|---|
| `holistic-kernel.md` | 契约与交付纪律：尺度、边界、任务分类、输出格式、入口词 |
| `taskdigest.md` | 场景路由：十车道 → 该载入哪个 playbook |
| `closure.md` | 收尾：禁止软化/拒绝/确认循环 |

内核锚点（`SCALE: MAXIMUM`、`NO FADE-TO-BLACK`、`NO CONFIRMATION LOOP`、`BOUNDARY`、两条底线）
缺失时插件**拒绝上场**，`holistic verify` 也会拦。

## 2. Holistic 预设（常驻层）

`~/.dsh/profiles/<profile>/cordis.patch.yml` 的受管块声明一个 `@deepseek-ai/dsh-agent-preset`：

- `id: holistic`，`name: Holistic`，工具树从宿主内置 standard 预设派生（跟随宿主升级，不硬编码）；
- `persona` 里嵌入内核三段 —— 会话一开始就在，不依赖任何开关；
- 内置的「标准模式 / 创造模式」等预设保持原样，`agent-preset-registry.default` 仍指标准模式。

预设是**按目录选择**的：注册表只有进程级默认值，所以由插件在 `agent/created` 时
（会话还是 blank）调用 `agentPresets.select(agent, "holistic")` 定向切换。规则顺序：

1. `$DSH_HOME/.holistic/presets.json` 里的目录规则（相等或子目录命中，最长路径优先）；
2. 该目录已有本插件的 `AGENTS.md` 受控块 → 视为 Holistic 工作区；
3. 都没有 → 不切，沿用默认（标准模式）。

已开过 turn 的会话不会被切换，这是宿主硬约束。

## 3. 工作区注入（工作区层）

`AGENTS.md`（工作区根 = 最近的 `.git`，没有就是当前目录）里由插件维护一段受控块：

```text
<!-- HOLISTIC-PURGE:BEGIN ... -->
## Holistic 破甲内核 · 工作区作用域
<内核三段> + [HOLISTIC SKILLS] 技能索引
<!-- HOLISTIC-PURGE:END -->
```

- 只改块内，块外内容一个字节不动；重复写是原位替换（幂等）；
- 宿主 `dsh-agent-instructions` 在会话起点读 `AGENTS.md`，所以该根目录及其子目录的新会话都会读到；
- `/holistic ws off` 或删掉 BEGIN/END 之间整段即可撤回；块外为空时文件会被删除。

## 4. 会话层开关（`/holistic`）

不依赖工作区块也能用：`/holistic` 直接在 `agent.ctx` 上注册内核/摘要/收尾/技能索引四个 prompt 段
和三个工具，`/holistic off` 整体注销。默认零注入。

- 技能索引只列名字与车道描述，正文由 `holistic_skill` 按需读盘（`skills/` 与 `skills-pack/`）；
- 子代理通过 `agents.isOwnedBy` 自动继承；父会话收起时级联收起；
- 显式 `/holistic off` 过的会话进入抑制名单，不会被自动上场拉回来。

## 5. 自动上场与提示

工作区里有块时，插件在 `agent/created`（兜底 `agent/pre-step`）自动注册工具，并在该会话第一个
`agent/pre-step`、用户消息落盘之前，往 session surface 追加一条 `form: "notice"` 的上下文行。
不走 inbox，避免被 UI 渲染成"排队中的用户消息"。

## 6. 启动自愈

插件每次加载时：

1. 确保 `presets.json` 存在；
2. 对其中每个 Holistic 工作区检查 `AGENTS.md` 块：缺失或版本落后就重写（块外内容不动）；
3. 预设块本身由 `holistic doctor --apply` 修复（需要重启生效）。

## 目录职责

| 路径 | 职责 |
|---|---|
| `index.js` | 插件入口：会话开关、自动上场、预设切换、启动自愈 |
| `lib/workspace.mjs` | `AGENTS.md` 受控块的读写与撤回 |
| `lib/presetmap.mjs` | 目录 → 预设规则 |
| `lib/fullstack.mjs` | 预设受管块的生成/守护、组件落盘 |
| `lib/provision.mjs` | 技能副本的部署/挂载（供 CLI 使用） |
| `lib/doctor.mjs` / `lib/probe.mjs` | 体检与探针 |
| `holistic` | CLI 入口 |
