/**
 * 空气开关状态（单一事实源）。
 *
 * 只有两个概念：
 *   deployed  恒为 true —— 所有资产（车道 + 327 领域技能 + 预设 + 伴生组件）始终在磁盘上
 *   armed     运行期开关 —— 只有 armed 时，内核文本 / 路由摘要 / 收尾段 / 两个工具 / 技能目录
 *             才进入 system prompt 与工具链；否则一个字节都不注入
 *
 * 默认 armed = false（待命）。切换入口：会话内 `/holistic`、`/holistic off`、`/holistic status`。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const stateDir = () => join(process.env.DSH_HOME || join(homedir(), ".dsh"), ".holistic");
export const gateFile = () => join(stateDir(), "gate.json");

export function readGate() {
  try {
    const g = JSON.parse(readFileSync(gateFile(), "utf8"));
    return { armed: g.armed === true, updatedAt: g.updatedAt ?? null, lastBy: g.lastBy ?? "unknown" };
  } catch {
    return { armed: false, updatedAt: null, lastBy: "default" };
  }
}

export function writeGate(armed, lastBy = "command") {
  mkdirSync(stateDir(), { recursive: true });
  const g = { armed: !!armed, updatedAt: new Date().toISOString(), lastBy: String(lastBy) };
  writeFileSync(gateFile(), JSON.stringify(g, null, 2) + "\n");
  return g;
}
