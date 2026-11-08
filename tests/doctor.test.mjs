/**
 * doctor/probe 回归测试：在隔离的 DSH_HOME 里从"半成品安装"修到通过。
 *
 * 用法：node tests/doctor.test.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const HOME = "/tmp/holistic-doctor-home";
const WS = "/tmp/holistic-doctor-ws";

rmSync(HOME, { recursive: true, force: true });
rmSync(WS, { recursive: true, force: true });
mkdirSync(join(HOME, "profiles", "desktop"), { recursive: true });
mkdirSync(WS, { recursive: true });
process.env.DSH_HOME = HOME;
process.env.PROFILE = "desktop";

writeFileSync(join(HOME, "profiles/desktop/package.json"), JSON.stringify({ name: "p", private: true }, null, 2));
writeFileSync(join(HOME, "profiles/desktop/cordis.patch.yml"), "# empty patch\n");

const { runDoctor } = await import(join(PKG, "lib/doctor.mjs"));
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };

// 1) 缺依赖/缺预设/缺块 → 应报可修，且不写盘
const dry = runDoctor({ dshHome: HOME, profile: "desktop", workspace: WS, apply: false });
if (dry.ok !== true) fail("doctor 只读模式不应该报 fail（可修项不算失败）");
const fixable = dry.checks.filter((c) => c.level === "fixable").map((c) => c.id);
if (!fixable.includes("deps")) fail("未检出依赖缺失");
if (!fixable.some((id) => id.startsWith("block:"))) fail("未检出工作区块缺失");
console.log("✓ doctor 只读：检出可修项", JSON.stringify(fixable));

// 2) --apply 修复
const fixed = runDoctor({ dshHome: HOME, profile: "desktop", workspace: WS, apply: true });
if (!fixed.ok) fail("doctor --apply 后仍有失败");
if (fixed.checks.some((c) => c.level === "fixable")) fail("doctor --apply 后仍有可修项");
if (!existsSync(join(WS, "AGENTS.md"))) fail("修复后没有生成 AGENTS.md");
const prof = JSON.parse(readFileSync(join(HOME, "profiles/desktop/package.json"), "utf8"));
if (prof.dependencies?.["holistic-purge"] !== `link:${join(HOME, "plugins", "holistic-purge")}`) fail("依赖未写入");
if (!(prof.dsh?.profile?.bundles || []).includes("holistic-purge")) fail("bundles 未写入");
if (!readFileSync(join(HOME, "profiles/desktop/cordis.patch.yml"), "utf8").includes("preset-holistic")) fail("预设块未写入");
console.log("✓ doctor --apply：依赖/预设/区块全部修好");

// 3) 再跑一次应全 pass（幂等）
const again = runDoctor({ dshHome: HOME, profile: "desktop", workspace: WS, apply: true });
if (!again.ok) fail("二次 doctor 失败");
if (again.checks.some((c) => c.level !== "pass" && c.level !== "warn")) fail("二次 doctor 仍有可修项（不幂等）");
console.log("✓ doctor 幂等");

// 4) probe：没有会话日志时应给 warn 而不是崩
const { runProbe } = await import(join(PKG, "lib/probe.mjs"));
const pr = runProbe({ dshHome: HOME, workspace: WS });
if (!pr.ok) fail("probe 在没有会话时不应 fail");
if (!pr.checks.some((c) => c.id.startsWith("session:") && c.level === "warn")) fail("probe 未给出无会话提示");
if (!pr.checks.some((c) => c.id.startsWith("block:") && c.level === "pass")) fail("probe 未确认工作区块");
console.log("✓ probe：无会话时降级为 warn，区块检查通过");

rmSync(HOME, { recursive: true, force: true });
rmSync(WS, { recursive: true, force: true });
console.log("ALL PASS");
