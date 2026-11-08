# 变更记录

## 1.0.0 — 初始版本

首个发布版本，包含以下能力（后续改动从这里开始追加）。

### 安装

- `install.sh`：一条命令完成同步插件、按需生成 profile、登记依赖与 bundles、写入 Holistic 预设、
  登记工作区规则、生成 `AGENTS.md` 块、`selftest --apply` 自检、Terminal 下自动重启并复检；
- `install-offline.sh`：离线安装；
- `update.sh`：强制对齐远端（`fetch --force --tags` + `reset --hard origin/<branch>`，
  已跟踪文件有改动时拒绝执行），支持 `--reinstall` / `--branch`。

### 注入

- 会话层 `/holistic`：注册内核、路由摘要、收尾段、技能索引与三个工具；`/holistic off` 注销；
  子代理自动继承并级联收起；
- 工作区层：`AGENTS.md` 受控块（内核三段 + 技能索引），幂等、块外内容不动，宿主自动读取；
- 预设层：`preset-holistic` 常驻内核，按目录自动选中；内置预设保持原样；
- 自动上场提示：首个 `agent/pre-step` 追加 `form: notice` 上下文行；
- 启动自愈：重铺/刷新已登记工作区的 `AGENTS.md` 块。

### 健康检查

- `holistic doctor [--apply]`：配置体检 + 幂等修复；
- `holistic probe`：boot.log 版本、会话预设切换、notice、inbox 残留、工具调用、块完整性；
- `holistic selftest`：doctor + probe + 回归测试；
- `holistic verify`：安装完整性。

### 技能

- 10 条车道 + 327 个领域技能；索引注入 + 按需读盘，不挂载 `$DSH_HOME/skills`。

### 其它端

- `qoder-lite` 分支：Qoder CN 适配（L0 hook / L1 权限 / L2 记忆 / L3 字节层 / L4 技能），独立交付线。

### 测试

- `tests/workspace.test.mjs`、`tests/doctor.test.mjs`、`tests/contract.test.sh` 等。
