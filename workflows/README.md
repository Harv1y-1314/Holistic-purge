# 工作流包（与 workflow-lite 0.9.0 对接）

## `holistic-pipeline.wflite.zip`

5 步破甲流水线，按车道（crack / reverse / cheat / adult）切换 playbook：

```
input:lane ─┐
input:target┴→ 测绘 → 定位与建模 → 产出物 → 验证 ─pass→ 交付
                          ↑                │
                          └──── fail ──────┘
资源：profile.md · findings.md · artifact/ · verify.md · report.md · 车道 playbook(skill)
```

- 13 节点 = 2 输入 + 5 步 + 6 资源；15 条边，含 `verify→build` 的 fail 回环
- 车道资源 `kind: skill` 指向 `h-crack`，执行时按 `input:lane` 换成 `h-reverse`/`h-cheat`/`h-adult`

## 导入

1. 确认 workflow-lite 已装（`~/.dsh/plugins/dsh-workflow-lite`，bundle 已登记）；
2. 重启 DSH → 侧栏「工作流」→ 工作流中心 → 导入 → 选这个 zip；
3. 运行时先填两个输入（车道 + 目标），再点执行。

## 为什么用 skill 资源而不是把方法论塞进步骤

步骤提示词只写"做什么"，方法论留在 `h-<lane>/SKILL.md` 里按步加载：
改方法论不用改工作流，工作流也能跨车道复用。
