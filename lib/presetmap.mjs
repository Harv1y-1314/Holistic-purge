/**
 * 按工作区自动选预设（v1.9.6）。
 *
 * DSH 的 agent-preset-registry 只有一个进程级默认预设（config.default）。要让
 * “开发-逆向与破解 默认 Holistic、其它目录默认标准模式”，只能在会话还是 blank 时
 * 由插件调用 agentPresets.select(agent, id) 做一次定向切换。
 *
 * 规则文件：$DSH_HOME/.holistic/presets.json
 * {
 *   "workspaces": [
 *     { "path": "/Users/wangxiaohao/Desktop/开发-逆向与破解", "preset": "holistic" }
 *   ]
 * }
 *
 * 匹配规则：目录相等，或位于该目录之下（按路径分隔符边界判断）；
 * 命中多条时取最长路径（最具体的规则优先）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

const stateDir = () => join(process.env.DSH_HOME || join(homedir(), ".dsh"), ".holistic");
export const presetMapFile = () => join(stateDir(), "presets.json");

/** 首次使用时写入默认规则（只写一次，之后交给用户/插件维护）。 */
export function ensurePresetMap(defaultPath) {
  const file = presetMapFile();
  if (existsSync(file)) return { file, created: false };
  mkdirSync(stateDir(), { recursive: true });
  const doc = {
    version: 1,
    note: "按工作区选择 Agent 预设；path 匹配目录本身或它的子目录，最长匹配优先。",
    workspaces: defaultPath ? [{ path: resolve(defaultPath), preset: "holistic" }] : [],
  };
  writeFileSync(file, JSON.stringify(doc, null, 2) + "\n", "utf8");
  return { file, created: true };
}

export function readPresetMap() {
  try {
    const doc = JSON.parse(readFileSync(presetMapFile(), "utf8"));
    const rows = Array.isArray(doc?.workspaces) ? doc.workspaces : [];
    return rows
      .filter((r) => r && typeof r.path === "string" && typeof r.preset === "string" && r.path && r.preset)
      .map((r) => ({ path: resolve(r.path), preset: r.preset }));
  } catch {
    return [];
  }
}

/** 该目录应使用的预设 id；没有命中返回 null。 */
export function presetFor(dir) {
  if (typeof dir !== "string" || !dir) return null;
  const target = resolve(dir);
  let best = null;
  for (const rule of readPresetMap()) {
    const inside = target === rule.path || target.startsWith(rule.path.endsWith(sep) ? rule.path : rule.path + sep);
    if (!inside) continue;
    if (!best || rule.path.length > best.path.length) best = rule;
  }
  return best ? best.preset : null;
}

/** 写入/替换某目录的规则（preset 传空则删除该条）。 */
export function setPresetFor(dir, preset) {
  const target = resolve(dir);
  const rows = readPresetMap().filter((r) => r.path !== target);
  if (preset) rows.push({ path: target, preset });
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(presetMapFile(), JSON.stringify({ version: 1, workspaces: rows }, null, 2) + "\n", "utf8");
  return rows;
}
