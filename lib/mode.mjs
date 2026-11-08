/**
 * 运行模式（单一事实源）。
 *
 *   light = 默认：车道 + 预设在线；327 领域技能与 MCP 行待命（仍在磁盘，不占上下文）
 *   full         ：车道 + 327 + 预设 + MCP 行全部在线
 *
 * 两种模式下"全量资产"都随安装落盘——light 只是把重的那部分收进
 * $DSH_HOME/.holistic/skills-off/ 待命，切 full 无需联网、无需重装。
 * 安装默认可用环境变量 HOLISTIC_DEFAULT_MODE=full 覆盖。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const MODES = ["light", "full"];
export const DEFAULT_MODE = process.env.HOLISTIC_DEFAULT_MODE === "full" ? "full" : "light";

const stateDir = () => join(process.env.DSH_HOME || join(homedir(), ".dsh"), ".holistic");
export const modeFile = () => join(stateDir(), "mode");

export function readMode() {
  try {
    const m = readFileSync(modeFile(), "utf8").trim();
    if (m === "light" || m === "full") return m;
  } catch {}
  return DEFAULT_MODE;
}

export function writeMode(mode) {
  if (!MODES.includes(mode)) throw new Error(`未知运行模式: ${mode}`);
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(modeFile(), mode + "\n");
  return mode;
}

export function isLight() {
  return readMode() === "light";
}
