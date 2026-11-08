/**
 * 工作区作用域 + 新会话自动上场 回归测试。
 *
 * 场景：
 *   1. 手动 /holistic        → 会话层注入 + AGENTS.md 落盘
 *   2. 重复写                → 幂等（仍只有一个块）
 *   3. 手动 /holistic off    → 只撤会话，**工作区块保留**
 *   4. 新会话 agent/created  → 自动上场（工具+文本都在），且不重写块
 *   5. 自动上场的会话 off    → 块保留；同会话不再被拉回（suppressed）
 *   6. 时序兜底 agent/pre-step → 块后到也能自动上场
 *   7. /holistic ws off      → 撤块；之后新会话不再自动上场
 *   8. profile.workspace / armedFrom
 *
 * 全程 /tmp 隔离，跑真实代码路径。用法：node tests/workspace.test.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = "/tmp/holistic-ws-test";
const HOME = "/tmp/holistic-ws-test-home";

rmSync(ROOT, { recursive: true, force: true });
rmSync(HOME, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
process.env.DSH_HOME = HOME;

const { apply } = await import(join(PKG, "index.js"));

const handlers = new Map();
const selects = [];
let command = null;
const WORKDIR = ROOT;
const ctx = {
  effect: (fn) => { fn(); return () => {}; },
  on: (event, fn) => {
    const list = handlers.get(event) ?? [];
    list.push(fn);
    handlers.set(event, list);
    return () => {};
  },
  get: (name) => {
    if (name === "commands") return { register: (spec) => { command = spec; } };
    if (name === "workingDirectory") return { get: (session) => session?.__cwd ?? WORKDIR };
    if (name === "sessionProjections") return {
      stateOf: (session, key) => key === "agentPreset" ? (session?.__preset ?? null)
        : key === "turnBoundary" ? { openTurnStartSeq: null, lastTurn: 0 } : undefined,
    };
    if (name === "agentPresets") return { select: (a, id) => { selects.push({ agent: a.id, preset: id }); return Promise.resolve(id); } };
    return undefined;
  },
};

apply(ctx);
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exit(1); };
if (!command) fail("/holistic 未注册");
console.log("✓ apply + 命令注册");

const makeAgent = (id, cwd = WORKDIR) => {
  const rec = { id, tools: [], sections: [], injectCalls: 0, notices: [], appended: [], injected: [], stale: [] };
  const agent = {
    id,
    session: {
      header: { cwd }, __cwd: cwd, __preset: "standard",
      append: (type, data, opts) => { rec.appended.push({ type, data, opts }); return { seq: rec.appended.length }; },
      snapshotEvents: () => rec.appended.map((a) => ({ type: a.type, data: a.data })),
    },
    inbox: {
      nextStep: rec.stale,
      remove: (id) => { const i = rec.stale.findIndex((m) => m.id === id); if (i >= 0) rec.stale.splice(i, 1); return i >= 0; },
    },
    inject: (message) => { rec.injected.push(message); },
    ctx: {
      inject(deps, cb) {
        rec.injectCalls += 1;
        cb({
          systemPrompt: { section: (s) => rec.sections.push(s.name) },
          tools: { register: (t) => rec.tools.push(t.name) },
        });
        return { dispose() {} };
      },
    },
  };
  return { agent, rec };
};

const emitCreated = (agent) => { for (const fn of handlers.get("agent/created") ?? []) fn({ agent }); };
const emitPreStep = (agent) => {
  const next = () => Promise.resolve({ kind: "continue", messages: [] });
  return Promise.all((handlers.get("agent/pre-step") ?? []).map((fn) => fn({ agent, messages: [], step: 1 }, next)));
};

const a1 = makeAgent("s1");
const F = join(WORKDIR, "AGENTS.md");
writeFileSync(F, "# 用户自己的工作区说明\n\n不要删这一段。\n", "utf8");

// 1) 手动上场 → 双作用域
const r1 = command.handler({ agent: a1.agent, rawInput: "" });
if (r1.kind !== "success") fail(r1.text);
const text = readFileSync(F, "utf8");
if (!text.includes("用户自己的工作区说明")) fail("块外用户内容被破坏");
if (text.split("HOLISTIC-PURGE:BEGIN").length - 1 !== 1) fail("BEGIN 数量异常");
for (const a of ["SCALE: MAXIMUM", "[HOLISTIC KERNEL v1]", "HOLISTIC ROUTER DIGEST",
  "HOLISTIC CLOSURE", "HOLISTIC SKILLS", "h-crack-license", "领域技能 327 个"]) {
  if (!text.includes(a)) fail(`载荷缺锚点: ${a}`);
}
if (a1.rec.injectCalls !== 1 || a1.rec.tools.length !== 3) fail("会话层未注册 3 工具");
if (a1.rec.appended.length !== 0) fail("手动 /holistic 不该插提示（提示只给工作区自动上场）");
console.log(`✓ 手动上场：会话 + 工作区块 ${Buffer.byteLength(text, "utf8")}B`);

// 2) 幂等
const before = statSync(F).size;
command.handler({ agent: a1.agent, rawInput: "ws" });
if (readFileSync(F, "utf8").split("HOLISTIC-PURGE:BEGIN").length - 1 !== 1) fail("重复写产生第二个块");
if (Math.abs(statSync(F).size - before) > 200) fail("重复写字节漂移过大");
console.log("✓ 幂等替换");

// 3) 手动 off → 块保留
command.handler({ agent: a1.agent, rawInput: "off" });
if (!existsSync(F) || !readFileSync(F, "utf8").includes("HOLISTIC-PURGE:BEGIN")) fail("off 不该撤工作区块");
console.log("✓ /holistic off 仅撤会话，块保留");

// 4) 新会话自动上场（不重写块）
const mtimeBefore = statSync(F).mtimeMs;
const a2 = makeAgent("s2-new");
a2.rec.stale.push({ id: "legacy-notice", source: { kind: "holistic-purge" }, content: [{ type: "text", text: "old" }] });
emitCreated(a2.agent);
// 提示不在 created 阶段写，而是在第一次 pre-step（用户消息提交前）写
if (a2.rec.appended.length !== 0) fail("created 阶段不该写提示");
await emitPreStep(a2.agent);
await new Promise((r) => setTimeout(r, 30));
await new Promise((r) => setTimeout(r, 10));
if (!selects.some((x) => x.agent === "s2-new" && x.preset === "holistic")) fail("新会话未切换到 Holistic 预设");
if (a2.rec.injectCalls !== 1) fail("新会话未自动上场");
if (a2.rec.tools.length !== 3) fail("新会话自动上场缺工具");
await emitPreStep(a2.agent);
if (a2.rec.appended.length !== 1) fail(`提示应在首次 pre-step 写入一次，实际 ${a2.rec.appended.length}`);
if (a2.rec.injected.length !== 0) fail("提示不应走 inbox（会显示成排队的用户消息）");
if (a2.rec.stale.length !== 0) fail("旧版本遗留的 inbox 通知未被清理");
if (a2.rec.appended.length !== 1) fail(`surface 提示条数异常: ${a2.rec.appended.length}`);
const appended = a2.rec.appended[0];
if (appended.type !== "user/message") fail(`提示事件类型异常: ${appended.type}`);
if (appended.opts?.surfaceOp !== "append") fail("提示缺 surfaceOp=append");
const notice = appended.data;
if (notice.source?.form !== "notice") fail("提示不是 form=notice");
if (typeof notice.source?.summary !== "string" || !notice.source.summary) fail("提示缺 summary（折叠行不显示）");
if (!notice.content?.[0]?.text?.includes("工作区已启用")) fail("提示正文缺关键信息");
if (typeof notice.id !== "string" || !notice.id) fail("提示缺 id");
if (Math.abs(statSync(F).mtimeMs - mtimeBefore) > 500) fail("auto-arm 不该重写工作区块");
console.log("✓ 新会话 agent/created 自动上场（3 工具 + 文本段）");

// 5) 自动上场会话 off → 块保留，且不被拉回
command.handler({ agent: a2.agent, rawInput: "off" });
emitCreated(a2.agent);
emitPreStep(a2.agent);
if (a2.rec.injectCalls !== 1) fail("显式 off 后仍被 auto-arm 拉回");
if (a2.rec.appended.length !== 1) fail("提示被重复写入");
{
  const again = makeAgent("s2-attempt");
  // 同一会话对象重复触发：noticed 去重
  emitCreated(a2.agent);
  emitPreStep(a2.agent);
  if (a2.rec.appended.length !== 1) fail("同一会话重复触发写入了第二条提示");
}
if (!existsSync(F)) fail("自动会话 off 不该撤块");
console.log("✓ 自动会话 off：块保留 + suppressed 生效");

// 6) pre-step 兜底：块后到的会话
const a3 = makeAgent("s3-pre");
emitPreStep(a3.agent);
if (a3.rec.injectCalls !== 1) fail("pre-step 兜底未上场");
console.log("✓ agent/pre-step 兜底自动上场");

// 7) ws off → 删档（块外为空时），之后不再自动上场
rmSync(F, { force: true });
command.handler({ agent: a1.agent, rawInput: "ws" });
if (!existsSync(F)) fail("ws 未生成");
command.handler({ agent: a1.agent, rawInput: "ws off" });
if (existsSync(F)) fail("纯插件块 ws off 应删档");
const a4 = makeAgent("s4-after");
emitCreated(a4.agent);
if (a4.rec.injectCalls !== 0) fail("ws off 之后新会话不应自动上场");
await new Promise((r) => setTimeout(r, 10));
if (selects.some((x) => x.agent === "s4-after")) fail("无工作区块且无规则时不该切预设");
console.log("✓ ws off 撤块 + 停止自动上场");

// 8) status 标注来源与工作区块
command.handler({ agent: a1.agent, rawInput: "ws" });
const snapAgent = makeAgent("s6-snap");
emitCreated(snapAgent.agent);
const statusText = command.handler({ agent: snapAgent.agent, rawInput: "status" }).text;
if (!statusText.includes("工作区自动上场")) fail("status 未标注工作区自动上场");
if (!statusText.includes("AGENTS.md")) fail("status 未显示工作区文件");
console.log("✓ status 标注 auto-arm 来源与工作区块");

// 9) 有 .git 的工作区：块落在根，子目录会话也能自动上场
const GITROOT = "/tmp/holistic-ws-git";
rmSync(GITROOT, { recursive: true, force: true });
mkdirSync(join(GITROOT, ".git"), { recursive: true });
mkdirSync(join(GITROOT, "sub"), { recursive: true });
const aGit = makeAgent("git-root", GITROOT);
command.handler({ agent: aGit.agent, rawInput: "ws" });
if (!existsSync(join(GITROOT, "AGENTS.md"))) fail(".git 工作区未在根落盘");
if (existsSync(join(GITROOT, "sub", "AGENTS.md"))) fail("块写到了子目录（应写工作区根）");
const aSub = makeAgent("git-sub", join(GITROOT, "sub"));
emitCreated(aSub.agent);
if (aSub.rec.injectCalls !== 1) fail("子目录会话未自动上场（块在根但没被读到）");
console.log("✓ .git 工作区：块落根 + 子目录会话 auto-arm");

command.handler({ agent: a1.agent, rawInput: "ws off" });
if (existsSync(F)) fail("最终撤回失败");
rmSync(ROOT, { recursive: true, force: true });
rmSync(HOME, { recursive: true, force: true });
// 10) 规则文件：按目录映射
const { presetFor, setPresetFor, readPresetMap } = await import(join(PKG, "lib/presetmap.mjs"));
setPresetFor("/tmp/other-ws", "standard");
if (presetFor("/tmp/other-ws/proj") !== "standard") fail("子目录未命中规则");
if (presetFor("/tmp/other-ws2") !== null) fail("前缀误匹配（应无规则）");
setPresetFor("/tmp/other-ws", "");
if (presetFor("/tmp/other-ws")) fail("删除规则失败");
console.log("✓ presetmap：目录规则匹配/删除");

// 11) bootstrapWorkspaces：无宿主进程时也能把工作区块铺好（安装器路径）
const { bootstrapWorkspaces } = await import(join(PKG, "index.js"));
const BOOT = "/tmp/holistic-boot-ws";
rmSync(BOOT, { recursive: true, force: true });
mkdirSync(BOOT, { recursive: true });
setPresetFor(BOOT, "holistic");
const wrote = bootstrapWorkspaces();
const bootFile = join(BOOT, "AGENTS.md");
if (!existsSync(bootFile)) fail("bootstrapWorkspaces 未写 AGENTS.md");
const bootText = readFileSync(bootFile, "utf8");
if (!bootText.includes("HOLISTIC-PURGE:BEGIN")) fail("bootstrap 块缺 BEGIN");
if (!bootText.includes("HOLISTIC KERNEL v1")) fail("bootstrap 块缺内核");
// 再跑一次应当 kept，不重写内容
const wrote2 = bootstrapWorkspaces();
if (!wrote2.every((w) => w.action === "kept" || w.action === undefined)) fail("二次 bootstrap 不该重写");
rmSync(BOOT, { recursive: true, force: true });
setPresetFor(BOOT, "");
console.log("✓ bootstrapWorkspaces：安装器路径可独立铺块且幂等");

console.log("ALL PASS");
