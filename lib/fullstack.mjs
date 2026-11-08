/**
 * 全量编排：插件加载时把「技能 + 预设 + 伴生组件」一次性铺好。
 * 只做幂等写入；任何一步失败都隔离，不影响内核注入。
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { readMode } from "./mode.mjs";
export { readMode };

const home = () => process.env.DSH_HOME || join(homedir(), ".dsh");
const profile = () => process.env.DSH_PROFILE || "desktop";
const BEGIN = "# >>> HOLISTIC-PRESETS (managed) >>>";
const END = "# <<< HOLISTIC-PRESETS <<<";

const COMPONENTS = [
  { id: "dsh-purge", dir: "dsh-purge" },
  { id: "qi-nx-agent", dir: "qi-nx-agent" },
];

export function ensureCompanions(pkgRoot) {
  const out = [];
  for (const c of COMPONENTS) {
    const src = join(pkgRoot, "vendor", c.dir);
    const dst = join(home(), "components", c.dir);
    if (!existsSync(src)) continue;
    if (existsSync(join(dst, "package.json"))) continue;
    mkdirSync(join(home(), "components"), { recursive: true });
    cpSync(src, dst, { recursive: true });
    out.push(c.id);
  }
  return out;
}


function stripBlock(text) {
  const out = [];
  let inside = false;
  for (const line of text.split("\n")) {
    if (line.trim() === BEGIN) { inside = true; continue; }
    if (line.trim() === END) { inside = false; continue; }
    if (!inside) out.push(line);
  }
  return out.join("\n");
}

const STANDARD_CANDIDATES = () => {
  const out = [];
  const appDir = process.env.DSH_APP_DIR;
  if (appDir) out.push(join(appDir, "node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml"));
  // Electron 宿主：<App>.app/Contents/MacOS/<bin> → Contents/Resources/app/dsh
  try {
    const exe = process.execPath;
    out.push(join(dirname(exe), "..", "Contents", "Resources", "app", "dsh",
      "node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml"));
  } catch {}
  out.push("/Applications/DeepSeek Harness.app/Contents/Resources/app/dsh/node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml");
  return [...new Set(out)];
};

function kernelParts(pkgRoot) {
  const clean = (f) => readFileSync(join(pkgRoot, "kernel", f), "utf8")
    .replace(/\{\{(?!(?:cwd|model|provider)\}\})/g, "{ {").trim();
  return [clean("holistic-kernel.md"), clean("taskdigest.md"), clean("closure.md")].join("\n\n");
}

/** 从宿主内置 standard 预设派生 Holistic 的插件树（工具栈跟随宿主，不硬编码）。 */
function buildHolisticBlock(pkgRoot) {
  let items = null;
  let source = "template";
  for (const f of STANDARD_CANDIDATES()) {
    if (!existsSync(f)) continue;
    const lines = readFileSync(f, "utf8").split("\n");
    const at = lines.findIndex((l) => l.trim() === "plugins:");
    if (at < 0) continue;
    items = lines.slice(at + 1);
    while (items.length && !items[items.length - 1].trim()) items.pop();
    source = "standard";
    break;
  }
  if (items === null) {
    const tpl = join(pkgRoot, "presets", "holistic-managed.yml");
    if (!existsSync(tpl)) return null;
    return readFileSync(tpl, "utf8").replace(/\s*$/, "") + "\n";
  }
  const body = kernelParts(pkgRoot);
  const pi = items.findIndex((l) => l.includes("prefix:") && l.includes("coding agent"));
  if (pi >= 0) {
    items.splice(pi, 1, "              prefix: |-", ...body.split("\n").map((l) => (l ? "                " + l : "")));
  }
  const desc = "Holistic 全量模式：内核 / 路由摘要 / 收尾段常驻（persona），工具栈不裁剪，始终按最大尺度产出。"
    + "只在被 holistic-purge 指定的工作区自动选中；其它工作区继续用标准模式。";
  return [
    BEGIN,
    "# 外源（QNX-Agent）预设已移除；DSH 内置预设保持原样。",
    "# 新增：Holistic —— 由 holistic-purge 按工作区自动选中，不作为全局默认。",
    "",
    "- insert:",
    "    - id: preset-holistic",
    "      name: '@deepseek-ai/dsh-agent-preset'",
    "      config:",
    "        id: holistic",
    "        name: Holistic",
    "        description: >-",
    "          " + desc,
    "        order: 2",
    "        plugins:",
    ...items,
    END,
    "",
  ].join("\n");
}

/** 确保 profile 受管块包含 Holistic 预设；已存在则不动（改由 profile 维护）。 */
export function ensurePresets(pkgRoot) {
  const patch = join(home(), "profiles", profile(), "cordis.patch.yml");
  const raw = existsSync(patch) ? readFileSync(patch, "utf8") : "";
  if (/id:\s*preset-holistic\b/.test(raw)) return { changed: false, reason: "already installed" };
  const block = buildHolisticBlock(pkgRoot);
  if (!block) return { changed: false, reason: "no standard preset row and no bundled template" };
  mkdirSync(dirname(patch), { recursive: true });
  writeFileSync(patch, raw.replace(/\s*$/, "\n") + "\n" + block, "utf8");
  return { changed: true, file: patch };
}

export function status(pkgRoot) {
  const comps = Object.fromEntries(
    COMPONENTS.map((c) => [c.id, existsSync(join(home(), "components", c.dir, "package.json"))]),
  );
  const patch = join(home(), "profiles", profile(), "cordis.patch.yml");
  const presets = existsSync(patch) && readFileSync(patch, "utf8").includes(BEGIN);
  return { components: comps, presets };
}


const marker = () => join(home(), ".holistic", "deps.ok");
const lock = () => join(home(), ".holistic", "deps.lock");
const log = () => join(home(), ".holistic", "deps.log");

/** 首次加载时后台拉起工具链安装（不阻塞宿主启动）。 */
function probeBinaries() {
  const dirs = [`${homedir()}/.local/bin`, "/opt/homebrew/bin", "/usr/local/bin"];
  const need = ["binwalk", "analyzeHeadless", "frida", "chipsec_main", "apktool", "osv-scanner"];
  const missing = [];
  for (const b of need) {
    const found = dirs.some((d) => existsSync(join(d, b)));
    if (!found) missing.push(b);
  }
  return missing;
}

export function ensureDeps(pkgRoot) {
  if (process.env.HOLISTIC_NO_AUTO_DEPS === "1") return { state: "disabled" };
  if (existsSync(marker())) {
    const missing = probeBinaries();
    if (!missing.length) return { state: "ok" };
    // marker 过期或工具被删：重新装
    try { writeFileSync(marker(), ""); } catch {}
  }
  if (existsSync(lock())) return { state: "running" };

  mkdirSync(join(home(), ".holistic"), { recursive: true });
  writeFileSync(lock(), String(Date.now()));
  const cmd = process.env.HOLISTIC_DEPS_CMD || `bash '${join(pkgRoot, "holistic")}' deps install --apply --with-ghidra`;
  try {
    const child = spawn("/bin/bash", ["-lc", `${cmd} >> '${log()}' 2>&1; rm -f '${lock()}'; [ $? -eq 0 ] && date > '${marker()}'`], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });
    child.unref();
    console.log(`[holistic] 首次加载：已在后台安装工具链（日志 ${log()}）`);
    return { state: "started" };
  } catch (err) {
    return { state: `failed:${err?.message ?? err}` };
  }
}
