/**
 * 工作区作用域注入：把内核/摘要/收尾/技能索引落到 <cwd>/AGENTS.md 的受控块里。
 *
 * 为什么不是 session prompt 段：
 *   宿主 dsh-agent-instructions 只在会话起点按 root→cwd 链读 AGENTS.md / CLAUDE.md，
 *   所以落盘 = 该目录（含所有子目录、所有新会话、重启后）自动带上内核；
 *   这是「工作区作用域」，与 /holistic 的「会话作用域」互补。
 *
 * 安全边界：
 *   - 只动 BEGIN/END 标记之间的字节；块外内容一个字都不碰（用户自己的 AGENTS.md 照旧）。
 *   - 幂等：重复写 = 原位替换，不会堆叠出第二个块。
 *   - 撤回：块外无内容 → 直接删文件；块外有内容 → 只剥块、保留原文。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * 工作区根：向上找最近的 .git（宿主 agent-instructions 的 projectRootMarkers 默认就是 .git）。
 * 找到 → 块写在该根，root→cwd 链上的子目录会话都能读到；找不到 → 就是 cwd 自己。
 * 必须和宿主的 findProjectRoot 保持同一套判定，否则块落在子目录里、父会话读不到。
 */
export function findRoot(dir, markers = [".git"]) {
  let current = resolve(dir);
  for (;;) {
    for (const m of markers) if (existsSync(join(current, m))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(dir);
    current = parent;
  }
}

/** 文件名必须是宿主发现链里的候选（AGENTS.md 优先于 CLAUDE.md）。 */
export const WORKSPACE_FILE = "AGENTS.md";

/** 标记行：块级唯一，不允许出现在正文里。 */
export const BLOCK_BEGIN = "<!-- HOLISTIC-PURGE:BEGIN · 生成块，块内勿手改（/holistic ws off 可整段撤回） -->";
export const BLOCK_END = "<!-- HOLISTIC-PURGE:END -->";

export const workspaceFile = (dir) => join(dir, WORKSPACE_FILE);

function readIfExists(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** 找块区间；只有 BEGIN 没有 END（被截断/手删）视为坏块，返回 null 交给追加逻辑。 */
function findBlock(text) {
  const start = text.indexOf(BLOCK_BEGIN);
  if (start < 0) return null;
  const end = text.indexOf(BLOCK_END, start);
  if (end < 0) return null;
  return { start, end: end + BLOCK_END.length };
}

export function renderBlock(body) {
  return [BLOCK_BEGIN, "", String(body).trim(), "", BLOCK_END].join("\n");
}

/** 只读状态：给 /holistic status、profile 工具用；不做任何写入。 */
export function workspaceState(dir) {
  const file = workspaceFile(dir);
  const text = readIfExists(file);
  if (text === null) {
    return { dir, file, exists: false, hasBlock: false, bytes: 0, blockBytes: 0, stale: false };
  }
  const blk = findBlock(text);
  const blockBytes = blk ? Buffer.byteLength(text.slice(blk.start, blk.end), "utf8") : 0;
  return {
    dir,
    file,
    exists: true,
    hasBlock: !!blk,
    bytes: Buffer.byteLength(text, "utf8"),
    blockBytes,
    stale: !!blk && !text.includes("holistic-purge v"),
  };
}

/**
 * 写入/刷新受控块。存在则原位替换，不存在则追加（保留块外内容）。
 * @returns {{file:string, dir:string, created:boolean, replaced:boolean, bytes:number, blockBytes:number}}
 */
export function writeWorkspace(dir, body) {
  const file = workspaceFile(dir);
  const block = renderBlock(body);
  const text = readIfExists(file);
  let next;
  let created = false;
  let replaced = false;

  if (text === null) {
    next = `${block}\n`;
    created = true;
  } else {
    const blk = findBlock(text);
    if (blk) {
      next = text.slice(0, blk.start) + block + text.slice(blk.end);
      replaced = true;
    } else {
      const trimmed = text.replace(/\s+$/, "");
      next = trimmed.length === 0 ? `${block}\n` : `${trimmed}\n\n${block}\n`;
    }
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(file, next, "utf8");
  return {
    dir,
    file,
    created,
    replaced,
    bytes: Buffer.byteLength(next, "utf8"),
    blockBytes: Buffer.byteLength(block, "utf8"),
  };
}

/**
 * 撤回受控块。块外还有内容 → 只剥块；块外为空 → 删文件。
 * @returns {{file:string, dir:string, changed:boolean, removedFile:boolean}}
 */
export function removeWorkspace(dir) {
  const file = workspaceFile(dir);
  const text = readIfExists(file);
  if (text === null) return { dir, file, changed: false, removedFile: false };

  const blk = findBlock(text);
  if (!blk) return { dir, file, changed: false, removedFile: false };

  const before = text.slice(0, blk.start).replace(/\n+$/, "");
  const after = text.slice(blk.end).replace(/^\n+/, "");
  const rest = before && after ? `${before}\n\n${after}` : before || after;

  if (rest.trim().length === 0) {
    if (existsSync(file)) rmSync(file, { force: true });
    return { dir, file, changed: true, removedFile: true };
  }
  writeFileSync(file, `${rest.replace(/\s+$/, "")}\n`, "utf8");
  return { dir, file, changed: true, removedFile: false };
}
