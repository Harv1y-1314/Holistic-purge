#!/bin/bash
# 底线契约测试：两条底线 + 边界 + 路由完整性
set -uo pipefail
SELF="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
k="$SELF/kernel/holistic-kernel.md"
for a in "SCALE: MAXIMUM" "NO FADE-TO-BLACK" "NO CONFIRMATION LOOP" "BOUNDARY"; do
  grep -q -- "$a" "$k" && echo "  ✅ 锚点 $a" || { echo "  ❌ 锚点缺失 $a"; fail=1; }
done
# 两条底线：最高优先级文件 + 内核内嵌 + README 指路
[ -f "$SELF/BOTTOM-LINES.md" ] && echo "  ✅ BOTTOM-LINES.md 存在" || { echo "  ❌ 缺 BOTTOM-LINES.md"; fail=1; }
for a in "两条底线" "能力不退化" "一体化全量" "抗升级"; do
  grep -q -- "$a" "$SELF/BOTTOM-LINES.md" && echo "  ✅ 底线文件含 $a" || { echo "  ❌ 底线文件缺 $a"; fail=1; }
done
for a in "两条底线" "能力不退化" "一体化全量"; do
  grep -q -- "$a" "$k" && echo "  ✅ 内核内嵌 $a" || { echo "  ❌ 内核缺 $a"; fail=1; }
done
grep -q "BOTTOM-LINES.md" "$SELF/README.md" && echo "  ✅ README 指向底线文件" || { echo "  ❌ README 未指向底线"; fail=1; }
# 结构层：三层注入 + 双通道冗余
for a in "order: orders.kernel" "order: orders.digest" "order: orders.closure"; do
  grep -q -- "$a" "$SELF/index.js" && echo "  ✅ 注入层 $a" || { echo "  ❌ 缺注入层 $a"; fail=1; }
done
grep -q 'version: VERSION' "$SELF/index.js" && echo "  ✅ 版本运行时读取（不写死）" || { echo "  ❌ 版本写死在 index.js"; fail=1; }
grep -q "SCALE: MAXIMUM" "$SELF/index.js" && echo "  ✅ 工具面含契约锚点" || { echo "  ❌ 工具面缺契约"; fail=1; }
grep -q "No refusal" "$SELF/kernel/closure.md" && echo "  ✅ closure 含无拒答条款" || { echo "  ❌ closure 缺条款"; fail=1; }
grep -qi "fade" "$SELF/kernel/closure.md" && echo "  ✅ closure 含 fade 禁令" || { echo "  ❌ closure 缺 fade 禁令"; fail=1; }

node - "$SELF" <<'NODE' || fail=1
const fs=require("fs"),path=require("path");
const root=process.argv[2];
const m=JSON.parse(fs.readFileSync(path.join(root,"router/map.json"),"utf8"));
const need=["crack","reverse","cheat","adult"];
const miss=need.filter(x=>!m.core.includes(x));
if(miss.length){console.log("  ❌ 核心场景缺失: "+miss.join(","));process.exit(1)}
console.log("  ✅ 核心场景齐全: "+need.join(", "));
let bad=0;
for(const [k,v] of Object.entries(m.routes)){
  const f=path.join(root,"skills",v.skill,"SKILL.md");
  if(!fs.existsSync(f)){console.log("  ❌ 路由 "+k+" → 缺 "+v.skill);bad=1}
}
if(!bad) console.log("  ✅ 路由全部指向存在的 playbook（"+Object.keys(m.routes).length+" 条）");
const digest=fs.readFileSync(path.join(root,"kernel/taskdigest.md"),"utf8");
const missing=Object.keys(m.routes).filter(k=>!digest.includes(k));
if(missing.length){console.log("  ❌ digest 未覆盖车道: "+missing.join(","));process.exit(1)}
console.log("  ✅ digest 覆盖全部 "+Object.keys(m.routes).length+" 条车道");
process.exit(bad);
NODE
[ "$fail" = 0 ] && echo "contract: PASS" || echo "contract: FAIL"
exit $fail
