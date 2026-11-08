/**
 * holistic probe：对"已经发生的事实"做只读探针（不写盘）。
 *
 * 与 doctor 的分工：
 *   doctor = 配置该成立的事（缺了就修）
 *   probe  = 运行期留下的痕迹（会话日志 / boot.log），证明"真的注入过"
 *
 * 探针：
 *   boot-version  磁盘版本 vs 进程最近一次 apply 的版本（不一致 = 待重启）
 *   session       工作区最近一个会话：是否切到 holistic、是否插入 notice、是否残留 inbox 通知
 *   block         工作区 AGENTS.md 块是否含 kernel/digest/closure/skills 四段
 *   tools         该会话是否调用过 holistic_* 工具（有则说明工具真的挂上了）
 *
 * 用法：node lib/probe.mjs [--workspace DIR] [--json]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPresetMap } from "./presetmap.mjs";
import { workspaceFile, workspaceState } from "./workspace.mjs";

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const home = () => process.env.DSH_HOME || join(homedir(), ".dsh");
const read = (f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };

function zstd(file) {
  const r = spawnSync("zstd", ["-dc", file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  return r.stdout;
}

function sessionFiles(root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const dir of readdirSync(root)) {
    const dirPath = join(root, dir);
    let names;
    try { names = readdirSync(dirPath); } catch { continue; }
    for (const n of names) {
      if (!n.startsWith("session-")) continue;
      const f = join(dirPath, n, "session.v4.jsonl.zstd");
      if (!existsSync(f)) continue;
      try { out.push({ file: f, mtime: statSync(f).mtimeMs }); } catch {}
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

export function runProbe(opts = {}) {
  const dshHome = opts.dshHome || home();
  const pkgRoot = opts.pkgRoot || PKG;
  const version = (() => { try { return JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")).version; } catch { return "0"; } })();
  const workspace = opts.workspace ? resolve(opts.workspace) : null;
  const checks = [];
  const add = (id, level, detail) => checks.push({ id, level, detail });

  // ---- boot-version ----
  const boot = read(join(dshHome, ".holistic", "boot.log"));
  const applies = [...boot.matchAll(/apply v([0-9]+\.[0-9]+\.[0-9]+)/g)].map((m) => m[1]);
  const running = applies.at(-1);
  if (!running) add("boot-version", "warn", "boot.log 里没有 apply 记录（DSH 还没加载过本插件）");
  else if (running !== version) add("boot-version", "warn", `磁盘 v${version}，进程最近加载 v${running}（重启后生效）`);
  else add("boot-version", "pass", `进程与磁盘都是 v${version}`);

  // ---- 工作区列表 ----
  const targets = workspace ? [workspace]
    : readPresetMap().filter((r) => r.preset === "holistic").map((r) => r.path);
  if (!targets.length) add("workspace", "warn", "没有已登记的工作区（holistic doctor --workspace DIR --apply）");

  const sessionsRoot = join(dshHome, "sessions");
  for (const ws of targets) {
    // ---- block ----
    const st = workspaceState(ws);
    const text = st.exists ? read(workspaceFile(ws)) : "";
    const parts = {
      kernel: text.includes("[HOLISTIC KERNEL v1]"),
      digest: text.includes("HOLISTIC ROUTER DIGEST"),
      closure: text.includes("HOLISTIC CLOSURE"),
      skills: text.includes("HOLISTIC SKILLS"),
    };
    const missing = Object.entries(parts).filter(([, v]) => !v).map(([k]) => k);
    add(`block:${ws}`, missing.length ? "fail" : "pass",
      missing.length ? `块缺段：${missing.join(", ")}` : `块完整（${st.bytes}B，v${(text.match(/holistic-purge v([0-9.]+)/) || [])[1] || "?"}）`);

    // ---- session（按 mtime 取最近 20 个，逐个分析；优先展示已切到 holistic 的那个）----
    const summaries = [];
    for (const f of sessionFiles(sessionsRoot).slice(0, 20)) {
      const raw = zstd(f.file);
      if (!raw) continue;
      const lines = raw.split("\n").filter(Boolean);
      let header;
      try { header = JSON.parse(lines[0]); } catch { continue; }
      if (resolve(header.cwd || "") !== ws) continue;
      const events = lines.slice(1).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const selected = events.find((e) => e.type === "agent-preset/selected");
      const notice = events.find((e) => e.type === "user/message" && e.data?.source?.kind === "holistic-purge");
      const firstInsert = events.findIndex((e) => e.type === "agent/inbox/spliced"
        && (e.data?.inserted || []).some((m) => m?.source?.kind === "holistic-purge"));
      const cleaned = firstInsert >= 0 && events.slice(firstInsert + 1).some((e) =>
        e.type === "agent/inbox/spliced" && (e.data?.removedCount ?? 0) > 0
        && !(e.data?.inserted || []).some((m) => m?.source?.kind === "holistic-purge"));
      const toolCalls = events.filter((e) => e.type === "tool/call" && /^holistic_/.test(e.data?.name || e.data?.tool || ""));
      summaries.push({
        sid: header.id || "?",
        preset: selected?.data?.agentPreset ?? null,
        notice: !!notice,
        inboxResidue: firstInsert >= 0 && !cleaned,
        hadInsert: firstInsert >= 0,
        tools: toolCalls.length,
        mtime: f.mtime,
      });
    }
    if (!summaries.length) { add(`session:${ws}`, "warn", "还没有该工作区的会话记录（开一个对话再跑）"); continue; }
    const newest = summaries[0];
    const withPreset = summaries.find((x) => x.preset === "holistic");
    if (newest.preset === "holistic") {
      add(`session:${ws}`, "pass", `最近会话 ${newest.sid.slice(0, 20)} · 预设=holistic`);
    } else if (withPreset) {
      add(`session:${ws}`, "pass",
        `最近会话 ${newest.sid.slice(0, 20)} 早于配置；${withPreset.sid.slice(0, 20)} 已切到 holistic`);
    } else {
      add(`session:${ws}`, "warn", "该工作区还没有任何会话切到 holistic（旧会话不会追溯切换，新开一个即可）");
    }
    const ref = newest.preset === "holistic" ? newest : (withPreset || newest);
    add(`notice:${ws}`, ref.notice ? "pass" : "warn", ref.notice ? `${ref.sid.slice(0, 20)} 已插入 holistic-purge notice` : "参考会话没有 notice");
    add(`inbox:${ws}`, ref.inboxResidue ? "warn" : "pass",
      ref.inboxResidue ? "inbox 里有 holistic-purge 通知（旧版本残留）" : (ref.hadInsert ? "旧版本 inbox 通知已清理" : "inbox 无残留通知"));
    const totalTools = summaries.reduce((n, x) => n + x.tools, 0);
    add(`tools:${ws}`, totalTools ? "pass" : "warn",
      totalTools ? `已调用 ${totalTools} 次 holistic_*（说明工具真挂上了）` : "尚未调用 holistic_*（可让模型跑一次 holistic_profile）");
  }

  checks.sort((a, b) => ({ fail: 0, warn: 1, pass: 2 })[a.level] - ({ fail: 0, warn: 1, pass: 2 })[b.level]);
  return { ok: checks.every((c) => c.level !== "fail"), checks };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const wi = args.indexOf("--workspace");
  const ws = wi >= 0 ? args[wi + 1] : (args.find((a) => a.startsWith("--workspace=")) || "").split("=")[1];
  const res = runProbe({ workspace: ws || null });
  if (args.includes("--json")) console.log(JSON.stringify(res, null, 2));
  else {
    const icon = { pass: "✓", warn: "!", fail: "✗" };
    for (const c of res.checks) console.log(`${icon[c.level]} ${c.level.padEnd(4)} ${c.id}  ${c.detail}`);
    console.log(`\nprobe: ${res.ok ? "OK" : "FAIL"}（${res.checks.filter((c) => c.level === "warn").length} 警告）`);
  }
  process.exit(res.ok ? 0 : 1);
}
