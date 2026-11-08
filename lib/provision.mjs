/**
 * 落盘层：全量部署 + 上线/下线（空气开关的物理侧）。
 *
 * 语义只剩三件事，没有 light/full 之分：
 *
 *   deploy(pkgRoot)  把两条技能线的完整副本铺进待命区 $DSH_HOME/.holistic/skills-off/
 *                    —— 这就是"部署完成"。幂等；包版本没变时只做一次 readdir，不重算哈希。
 *   mount()          待命区 → $DSH_HOME/skills/（上线：技能目录立刻被宿主发现）
 *   unmount()        $DSH_HOME/skills/ → 待命区（下线：只收「内容未被用户改过」的副本）
 *
 * 为什么待命区不放在 $DSH_HOME/skills：宿主的 skill-filesystem 只认 skills/ 目录，
 * 放进 skills-off 就等于"在磁盘上、不在上下文里"，这才是零占用的待命态。
 */
import { createHash } from "node:crypto";
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const PREFIX = "h-";

const LINES = {
  lanes: { key: "lanes", dir: "skills", prefix: PREFIX },
  pack: { key: "pack", dir: "skills-pack", prefix: "" },
};

const home = () => process.env.DSH_HOME || join(homedir(), ".dsh");
const skillsDir = () => join(home(), "skills");
const offDir = () => join(home(), ".holistic", "skills-off");
const manifestPath = () => join(home(), ".holistic", "manifest.json");

const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

function dirHash(dir) {
  const parts = [];
  const walk = (d, rel = "") => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, join(rel, name));
      else parts.push(rel + "/" + name + ":" + sha(readFileSync(p)));
    }
  };
  walk(dir);
  return sha(parts.join("\n"));
}

function readManifest() {
  try {
    const m = JSON.parse(readFileSync(manifestPath(), "utf8"));
    m.lanes ||= {};
    m.pack ||= {};
    return m;
  } catch {
    return { version: 0, lanes: {}, pack: {} };
  }
}

function writeManifest(m) {
  mkdirSync(join(home(), ".holistic"), { recursive: true });
  writeFileSync(manifestPath(), JSON.stringify(m, null, 2) + "\n");
}

function listDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => {
    try { return statSync(join(dir, n)).isDirectory(); } catch { return false; }
  });
}

function pkgVersion(pkgRoot) {
  try { return JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")).version || "0"; }
  catch { return "0"; }
}

/** 目标已存在时先删再搬（rename 不能跨卷，失败则退回 cp+rm）。 */
function moveInto(from, to) {
  rmSync(to, { recursive: true, force: true });
  try {
    renameSync(from, to);
  } catch {
    cpSync(from, to, { recursive: true });
    rmSync(from, { recursive: true, force: true });
  }
}

/**
 * 全量部署：保证待命区里每条线都齐全。幂等。
 * 包版本没变 + 待命区已存在同名目录 → 直接跳过（不做哈希，启动几乎零成本）。
 */
export function deploy(pkgRoot) {
  const m = readManifest();
  const version = pkgVersion(pkgRoot);
  const fresh = m.pkg !== version;
  const out = { deployed: [], refreshed: [], missing: [], pkg: version };
  mkdirSync(offDir(), { recursive: true });

  for (const line of Object.values(LINES)) {
    const src = join(pkgRoot, line.dir);
    if (!existsSync(src)) continue;
    for (const name of listDirs(src)) {
      const liveName = line.prefix + name;
      const target = join(offDir(), liveName);
      const live = join(skillsDir(), liveName);
      const bucket = (m[line.key] ||= {});
      if (existsSync(target) && !fresh) {
        if (!bucket[name]) bucket[name] = dirHash(target); // 补齐历史缺哈希，unmount 才收得回
        continue;
      }
      if (existsSync(target)) {
        rmSync(target, { recursive: true, force: true });
        cpSync(join(src, name), target, { recursive: true });
        bucket[name] = dirHash(target);
        out.refreshed.push(liveName);
      } else if (existsSync(live)) {
        moveInto(live, target); // 线上还留着一份：直接收进待命区
        bucket[name] = dirHash(target);
        out.deployed.push(liveName);
      } else {
        cpSync(join(src, name), target, { recursive: true });
        bucket[name] = dirHash(target);
        out.deployed.push(liveName);
      }
    }
  }

  // 清点漏项：包里有、待命区没有 → 记录，不静默
  for (const line of Object.values(LINES)) {
    const src = join(pkgRoot, line.dir);
    if (!existsSync(src)) continue;
    for (const name of listDirs(src)) {
      if (!existsSync(join(offDir(), line.prefix + name))) out.missing.push(line.prefix + name);
    }
  }

  m.pkg = version;
  m.deployed = true;
  m.version = (m.version || 0) + 1;
  m.updatedAt = new Date().toISOString();
  writeManifest(m);
  out.ok = out.missing.length === 0;
  return out;
}

/** 上线：待命区全部搬进 skills/。 */
export function mount() {
  const moved = [];
  const off = offDir();
  mkdirSync(skillsDir(), { recursive: true });
  if (existsSync(off)) {
    for (const name of readdirSync(off)) {
      const from = join(off, name);
      try {
        if (!statSync(from).isDirectory()) continue;
      } catch { continue; }
      moveInto(from, join(skillsDir(), name));
      moved.push(name);
    }
  }
  const m = readManifest();
  m.mounted = true;
  m.updatedAt = new Date().toISOString();
  writeManifest(m);
  return { moved };
}

/** 下线：只收「未被用户改过」的副本（按 manifest 里的哈希判断），改过的留在线上。 */
export function unmount() {
  const m = readManifest();
  const moved = [], kept = [];
  mkdirSync(offDir(), { recursive: true });
  for (const line of Object.values(LINES)) {
    for (const [name, hash] of Object.entries(m[line.key])) {
      const live = join(skillsDir(), line.prefix + name);
      if (!existsSync(live)) continue;
      let h = null;
      try { h = dirHash(live); } catch { kept.push(line.prefix + name); continue; }
      if (h === hash) {
        moveInto(live, join(offDir(), line.prefix + name));
        moved.push(line.prefix + name);
      } else kept.push(line.prefix + name);
    }
  }
  m.mounted = kept.length === 0;
  m.updatedAt = new Date().toISOString();
  writeManifest(m);
  return { moved, kept };
}

/** 兼容旧调用名。 */
export const suspend = unmount;

/** 兼容 v1.5 的 index.js：只做部署，不上线。 */
export function provision(pkgRoot) {
  const d = deploy(pkgRoot);
  return { ok: d.ok, mode: "gated", lanes: { provisioned: [], kept: [] }, pack: { provisioned: [], kept: [] }, ...d };
}

export function status(pkgRoot) {
  const m = readManifest();
  const count = (dir, pred) => (existsSync(dir) ? readdirSync(dir).filter(pred).length : 0);
  const liveDir = skillsDir(), off = offDir();
  return {
    deployed: m.deployed === true,
    pkg: m.pkg ?? null,
    manifest: m.version || 0,
    onDisk: {
      lanes: listDirs(join(pkgRoot, "skills")).length,
      pack: listDirs(join(pkgRoot, "skills-pack")).length,
    },
    online: count(liveDir, (n) => existsSync(join(liveDir, n, "SKILL.md"))),
    standby: listDirs(off).length,
    mounted: m.mounted === true,
  };
}
