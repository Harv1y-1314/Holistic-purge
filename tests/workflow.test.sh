#!/bin/bash
# 工作流包结构校验：能被 workflow-lite 0.9.0 导入
set -uo pipefail
SELF="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="$SELF/workflows/holistic-pipeline.wflite.zip"
fail=0
[ -f "$ZIP" ] || { echo "  ❌ 缺 $ZIP"; exit 1; }
TMP=$(mktemp -d)
if command -v bsdtar >/dev/null 2>&1; then bsdtar -xf "$ZIP" -C "$TMP"
elif command -v unzip >/dev/null 2>&1; then unzip -q "$ZIP" -d "$TMP"
else python3 -c 'import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$ZIP" "$TMP"
fi 2>/dev/null || { echo "  ❌ 解包失败"; exit 1; }
node - "$TMP" <<'NODE' || fail=1
const fs=require("fs"),path=require("path");
const tmp=process.argv[2];
const dir=fs.readdirSync(tmp).find(d=>fs.statSync(path.join(tmp,d)).isDirectory());
const man=JSON.parse(fs.readFileSync(path.join(tmp,dir,"manifest.json"),"utf8"));
const doc=JSON.parse(fs.readFileSync(path.join(tmp,dir,"versions/1.json"),"utf8")).document;
let bad=0;
man.kind==="dsh-workflow-lite.workflow" ? console.log("  ✅ manifest kind") : (console.log("  ❌ manifest kind"),bad=1);
const steps=doc.nodes.filter(n=>n.type==="wfNode").length;
steps>=5 ? console.log("  ✅ 步骤 "+steps) : (console.log("  ❌ 步骤不足"),bad=1);
const skills=doc.nodes.filter(n=>n.type==="wfResource"&&(n.data.items||[]).some(i=>i.kind==="skill")).length;
skills>=1 ? console.log("  ✅ 车道 skill 资源 "+skills) : (console.log("  ❌ 缺 skill 资源"),bad=1);
doc.edges.some(e=>e.data&&e.data.when==="fail") ? console.log("  ✅ 失败回环") : (console.log("  ❌ 缺 fail 回环"),bad=1);
const ids=new Set(doc.nodes.map(n=>n.id));
doc.edges.every(e=>ids.has(e.source)&&ids.has(e.target)) ? console.log("  ✅ 边引用完整") : (console.log("  ❌ 悬空边"),bad=1);
process.exit(bad);
NODE
rm -rf "$TMP"
[ "$fail" = 0 ] && echo "workflow: PASS" || echo "workflow: FAIL"
exit $fail
