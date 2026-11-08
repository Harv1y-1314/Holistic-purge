#!/bin/bash
# 伴生插件：清单合法 + 状态可查 + fallback 缺件会被挡
set -uo pipefail
SELF="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
node -e '
  const c=require(process.argv[1]);
  if(!c.companions||c.companions.length<2) process.exit(1);
  for(const x of c.companions){for(const k of ["id","version","spec","check","role"]) if(!x[k]) process.exit(1)}
' "$SELF/companions.json" && echo "  ✅ companions.json 结构合法" || { echo "  ❌ companions.json 不合法"; fail=1; }
bash "$SELF/holistic" companions status | grep -q "dsh-purge" && echo "  ✅ 能查到 dsh-purge" || { echo "  ❌ 查不到 dsh-purge"; fail=1; }
bash "$SELF/holistic" companions status | grep -q "qi-nx-agent" && echo "  ✅ 能查到 qi-nx-agent" || { echo "  ❌ 查不到 qi-nx-agent"; fail=1; }
# 注意：pipefail + grep -q 会因 SIGPIPE 误判，先落变量再匹配
INST=$(bash "$SELF/holistic" companions install)
case "$INST" in *vendor/dsh-purge*) echo "  ✅ install 指向 vendor/dsh-purge" ;; *) echo "  ❌ install 未指向 vendor"; fail=1 ;; esac
case "$INST" in *vendor/qi-nx-agent*) echo "  ✅ install 指向 vendor/qi-nx-agent" ;; *) echo "  ❌ qi 未纳入 install"; fail=1 ;; esac
[ -f "$SELF/vendor/qi-nx-agent/PROVENANCE.md" ] && grep -q "UNLICENSED" "$SELF/vendor/qi-nx-agent/PROVENANCE.md" && echo "  ✅ qi 出处与限制已标注" || { echo "  ❌ 缺 qi PROVENANCE"; fail=1; }
bash "$SELF/holistic" companions plan | grep -q "plugin --profile" && echo "  ✅ plan 给出安装命令" || { echo "  ❌ plan 缺命令"; fail=1; }
[ "$fail" = 0 ] && echo "companions: PASS" || echo "companions: FAIL"
exit $fail
