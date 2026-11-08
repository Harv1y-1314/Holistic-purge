/**
 * holistic doctor：一次性体检 + 自动修复（幂等）。
 *
 * 检查的是"装完之后该成立的事实"：
 *   profile 登记 / 解析链接 / Holistic 预设块 / 内置预设未被禁用 /
 *   工作区规则 / AGENTS.md 块 / 内核契约锚点 / 技能索引规模。
 *
 * 用法：
 *   node lib/doctor.mjs [--apply] [--workspace DIR] [--json]
 *   holistic doctor [--apply] [--workspace DIR]
 *
 * --apply（别名 --fix）才写盘；不带只读检查。
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ensurePresets } from "./fullstack.mjs";
import { presetFor, setPresetFor, readPresetMap, ensurePresetMap } from "./presetmap.mjs";
import { workspaceState, workspaceFile, writeWorkspace, BLOCK_BEGIN } from "./workspace.mjs";
import { workspacePayload } from "../index.js";

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const home = (opts) => opts.dshHome || process.env.DSH_HOME || join(homedir(), ".dsh");
const profile = (opts) => opts.profile || process.env.PROFILE || "desktop";

const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const read = (f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };

export function runDoctor(opts = {}) {
  const pkgRoot = opts.pkgRoot || PKG;
  const dshHome = home(opts);
  const prof = profile(opts);
  const apply = opts.apply === true;
  const ws = opts.workspace ? resolve(opts.workspace) : null;

  const checks = [];
  const add = (id, level, detail, fixed) => checks.push({ id, level, detail, ...(fixed ? { fixed } : {}) });
  const tryFix = (id, needFix, fix, detail) => {
    if (!needFix) return add(id, "pass", detail);
    if (!apply) return add(id, "fixable", detail + "（加 --apply 修复）");
    try { fix(); add(id, "fixed", detail); } catch (e) { add(id, "fail", detail + " → 修复失败：" + (e?.message ?? e)); }
  };

  // ---- 1. profile 与环境 ----
  const profDir = join(dshHome, "profiles", prof);
  const profPkgFile = join(profDir, "package.json");
  if (!existsSync(profPkgFile)) {
    add("profile", "fail", `缺少 profile：${profPkgFile}（先启动一次 DSH 生成）`);
    return finish(checks);
  }
  add("profile", "pass", `profile 存在：${profPkgFile}`);

  const patchFile = join(profDir, "cordis.patch.yml");
  const profPkg = readJson(profPkgFile) || {};

  // ---- 2. 依赖与 bundles ----
  tryFix("deps",
    (profPkg.dependencies || {})["holistic-purge"] !== `link:${join(dshHome, "plugins", "holistic-purge")}`,
    () => {
      const p = readJson(profPkgFile) || {};
      p.dependencies = p.dependencies || {};
      p.dependencies["holistic-purge"] = `link:${join(dshHome, "plugins", "holistic-purge")}`;
      p.dsh = p.dsh || {}; p.dsh.profile = p.dsh.profile || {};
      const b = p.dsh.profile.bundles = p.dsh.profile.bundles || [];
      if (!b.includes("holistic-purge")) b.push("holistic-purge");
      writeJson(profPkgFile, p);
    },
    "profile.dependencies[\"holistic-purge\"] = link:…");

  tryFix("bundle",
    !((profPkg.dsh?.profile?.bundles) || []).includes("holistic-purge"),
    () => {
      const p = readJson(profPkgFile) || {};
      p.dsh = p.dsh || {}; p.dsh.profile = p.dsh.profile || {};
      const b = p.dsh.profile.bundles = p.dsh.profile.bundles || [];
      if (!b.includes("holistic-purge")) b.push("holistic-purge");
      writeJson(profPkgFile, p);
    },
    "profile 的 bundles 含 holistic-purge");

  // ---- 3. node_modules 解析链接 ----
  const link = join(profDir, "node_modules", "holistic-purge");
  const linkOk = (() => {
    try { return existsSync(link) && lstatSync(link).isSymbolicLink(); } catch { return false; }
  })();
  tryFix("link", !linkOk, () => {
    mkdirp(join(dshHome, "plugins", "holistic-purge"));
    mkdirp(join(profDir, "node_modules"));
    try { unlinkSyncSafe(link); } catch {}
    symlinkSync(join(dshHome, "plugins", "holistic-purge"), link);
  }, `node_modules 链接 → ${join(dshHome, "plugins", "holistic-purge")}`);

  // ---- 4. 预设块 ----
  const patch = read(patchFile);
  const hasHolistic = /id:\s*preset-holistic\b/.test(patch);
  tryFix("preset", !hasHolistic, () => { ensurePresets(pkgRoot); }, "profile 含 preset-holistic 受管块");

  const patch2 = read(patchFile);
  const disabledBuiltin = ["standard", "cordis", "minimal", "ptc"]
    .filter((id) => new RegExp(`^- id:\\s*preset-${id}\\s*\\n\\s*disabled:\\s*true`, "m").test(patch2));
  add("builtins", disabledBuiltin.length ? "warn" : "pass",
    disabledBuiltin.length ? `内置预设被禁用：${disabledBuiltin.join(", ")}（需手工恢复）` : "内置预设未被禁用");

  const twin = (patch2.match(/id:\s*preset-holistic\b/g) || []).length;
  add("preset-dup", twin > 1 ? "warn" : "pass", twin > 1 ? `preset-holistic 出现 ${twin} 次（应 1 次）` : "preset-holistic 唯一");

  const plugCount = (patch2.match(/^\s+- id: (?!preset-)[a-z0-9-]+$/gm) || []).length;
  add("preset-plugins", plugCount >= 15 ? "pass" : "warn", `预设插件行约 ${plugCount} 条（≥15 视为全量）`);

  // ---- 5. 工作区规则 ----
  tryFix("presetmap", !existsSync(join(dshHome, ".holistic", "presets.json")), () => { ensurePresetMap(); }, "presets.json 存在");
  if (ws) {
    tryFix("rule", presetFor(ws) !== "holistic", () => { setPresetFor(ws, "holistic"); }, `${ws} → holistic`);
  } else {
    const rules = readPresetMap();
    add("rule", rules.length ? "pass" : "warn", rules.length ? `已登记 ${rules.length} 个工作区` : "没有工作区规则（用 --workspace DIR 指定）");
  }

  // ---- 6. 工作区块 ----
  const targets = ws ? [ws] : readPresetMap().filter((r) => r.preset === "holistic").map((r) => r.path);
  if (!targets.length) add("block", "warn", "没有可检查的工作区块");
  for (const dir of targets) {
    const st = workspaceState(dir);
    const text = st.exists ? read(workspaceFile(dir)) : "";
    const stale = !st.hasBlock || !text.includes(`holistic-purge v${versionOf(pkgRoot)}`);
    tryFix(`block:${dir}`, stale, () => { writeWorkspace(dir, workspacePayload(dir)); },
      stale ? (st.hasBlock ? "块版本旧" : "块缺失") : "块存在且版本匹配");
  }

  // ---- 7. 内核契约锚点 ----
  const kernel = read(join(pkgRoot, "kernel", "holistic-kernel.md"));
  const anchors = ["SCALE: MAXIMUM", "NO FADE-TO-BLACK", "NO CONFIRMATION LOOP", "BOUNDARY", "两条底线"];
  const miss = anchors.filter((a) => !kernel.includes(a));
  add("kernel", miss.length ? "fail" : "pass", miss.length ? `缺锚点：${miss.join(", ")}` : "内核 5 个锚点齐全");

  // ---- 8. 技能索引规模 ----
  const lanes = countSkill(pkgRoot, "skills");
  const pack = countSkill(pkgRoot, "skills-pack");
  add("skills", lanes === 10 && pack >= 327 ? "pass" : "warn", `车道 ${lanes}（期望 10）· 领域 ${pack}（期望 ≥327）`);

  return finish(checks);
}

function finish(checks) {
  const order = { fail: 0, fixable: 1, fixed: 2, warn: 3, pass: 4 };
  checks.sort((a, b) => order[a.level] - order[b.level]);
  return { ok: checks.every((c) => c.level !== "fail"), checks };
}

function versionOf(pkgRoot) {
  try { return JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")).version; } catch { return "0"; }
}
function countSkill(root, dir) {
  try {
    return readdirSync(join(root, dir), { withFileTypes: true })
      .filter((d) => d.isDirectory()).length;
  } catch { return 0; }
}
function mkdirp(d) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }
function writeJson(f, v) { writeFileSync(f, JSON.stringify(v, null, 2) + "\n"); }
function unlinkSyncSafe(f) { try { unlinkSync(f); } catch {} }

// ---- CLI ----
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply") || args.includes("--fix");
  const json = args.includes("--json");
  const wi = args.indexOf("--workspace");
  const workspace = wi >= 0 ? args[wi + 1] : (args.find((a) => a.startsWith("--workspace=")) || "").split("=")[1];
  const res = runDoctor({ apply, workspace: workspace || null });
  if (json) console.log(JSON.stringify(res, null, 2));
  else {
    const icon = { pass: "✓", fixed: "✚", fixable: "·", warn: "!", fail: "✗" };
    for (const c of res.checks) console.log(`${icon[c.level]} ${c.level.padEnd(7)} ${c.id}  ${c.detail}`);
    console.log(`\ndoctor: ${res.ok ? "OK" : "FAIL"}（失败 ${res.checks.filter((c) => c.level === "fail").length} / 可修 ${res.checks.filter((c) => c.level === "fixable").length} / 警告 ${res.checks.filter((c) => c.level === "warn").length}）`);
  }
  process.exit(res.ok ? 0 : 1);
}
