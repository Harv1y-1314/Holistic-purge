#!/bin/bash
# 自检：两条底线 + 插件结构 + L3 补丁/回滚字节一致（在副本上跑，不碰真 App）
set -uo pipefail
SELF="$(cd "$(dirname "$0")/.." && pwd)"
TMP=$(mktemp -d)
fail=0
ok(){ echo "  ✅ $*"; }
bad(){ echo "  ❌ $*"; fail=1; }

echo "== 1) 两条底线与结构 =="
[ -f "$SELF/BOTTOM-LINES.md" ] && ok "BOTTOM-LINES.md 存在" || bad "缺 BOTTOM-LINES.md"
for a in "两条底线" "能力不退化" "一体化全量" "抗升级"; do
  grep -q -- "$a" "$SELF/BOTTOM-LINES.md" && ok "底线文件含 $a" || bad "底线文件缺 $a"
done
for a in "两条底线" "能力不退化" "一体化全量" "SCALE: MAXIMUM" "BOUNDARY"; do
  grep -q -- "$a" "$SELF/runtime/tpl/kernel.md" && ok "内核含 $a" || bad "内核缺 $a"
done
python3 - "$SELF" <<'PY' || fail=1
import json,sys,pathlib
root=pathlib.Path(sys.argv[1])
j=json.loads((root/'.qoder-plugin/plugin.json').read_text())
bad=[]
for k in ("name","version","skills","interface"):
    if k not in j: bad.append(k)
n=len([p for p in (root/'skills').iterdir() if (p/'SKILL.md').exists()])
if n < 12: bad.append(f"skills={n}")
print(("  ❌ 插件描述缺: "+",".join(bad)) if bad else f"  ✅ 插件描述完整（skills {n} 个）")
sys.exit(1 if bad else 0)
PY

echo "== 1.5) L0 逐轮 hook =="
HOOK="$SELF/runtime/hooks/holistic-prompt.py"
[ -f "$HOOK" ] && ok "hook 脚本存在" || bad "缺 hook 脚本"
if [ -f "$HOOK" ]; then
  OUT=$(python3 "$HOOK" </dev/null 2>/dev/null)
  echo "$OUT" | grep -q "HOLISTIC" && ok "hook 输出含 HOLISTIC 段" || bad "hook 输出异常"
  echo "$OUT" | grep -q "SCALE: MAXIMUM" && ok "hook 含内核锚点" || bad "hook 缺内核"
  [ ${#OUT} -gt 3000 ] && ok "hook 载荷 ${#OUT} 字符" || bad "hook 载荷过短（${#OUT}）"
fi

echo "== 2) 内核契约 =="
python3 "$SELF/runtime/holistic.py" verify >/dev/null && ok "verify 底线校验 PASS" || bad "verify 底线校验 FAIL"

echo "== 3) L3 补丁 / 回滚（副本）=="
W="/Applications/Qoder CN.app/Contents/Resources/app.asar.unpacked/node_modules/@qoder-ai/qoder-cn-agent-sdk/dist/_worker/qoder-worker-runtime.obf.mjs"
if [ -f "$W" ]; then
  mkdir -p "$TMP/home"
  cp "$W" "$TMP/w.mjs"
  before=$(shasum -a 256 "$TMP/w.mjs" | cut -d' ' -f1)
  HOME="$TMP/home" python3 "$SELF/runtime/holistic.py" --worker "$TMP/w.mjs" apply >/dev/null 2>&1
  n=$(HOME="$TMP/home" python3 - "$TMP/w.mjs" <<'PY'
import re,base64,sys
t=open(sys.argv[1],encoding='utf-8',errors='replace').read()
m=re.search(r'const (_\$d\w*)=\(s,k="([^"]{6,32})"\)=>',t[:400000])
fn,key=m.group(1),m.group(2).encode()
def dec(b):
    r=bytearray(base64.b64decode(b))
    for i in range(len(r)): r[i]^=key[i%len(key)]
    return r.decode('utf-8','replace')
print(sum(1 for x in re.finditer(re.escape(fn)+r'\("([A-Za-z0-9+/=]{16,})"\)',t) if '[HOLISTIC-QODER:' in dec(x.group(1))))
PY
)
  [ "${n:-0}" -ge 7 ] && ok "补丁站点 $n 个（≥7）" || bad "补丁站点不足（$n）"
  HOME="$TMP/home" python3 "$SELF/runtime/holistic.py" --worker "$TMP/w.mjs" revert >/dev/null 2>&1
  after=$(shasum -a 256 "$TMP/w.mjs" | cut -d' ' -f1)
  [ "$before" = "$after" ] && ok "回滚后字节一致" || bad "回滚后字节不一致"
else
  echo "  · 无 Qoder CN worker，跳过 L3 测试"
fi

echo "== 4) 记忆层内容 =="
grep -q "两条底线" "$SELF/runtime/tpl/kernel.md" && ok "L2 记忆将包含两条底线" || bad "L2 缺底线"

rm -rf "$TMP"
[ "$fail" = 0 ] && echo "selftest: PASS" || echo "selftest: FAIL"
exit $fail
