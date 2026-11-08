#!/bin/bash
# 冒烟：语法 + 干跑安装（不碰真实 DSH_HOME）
set -uo pipefail
SELF="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
node --check "$SELF/index.js" && echo "  ✅ index.js 语法" || fail=1
for f in "$SELF/holistic" "$SELF/install.sh" "$SELF/uninstall.sh" "$SELF/tests/contract.test.sh"; do
  bash -n "$f" && echo "  ✅ $(basename "$f") 语法" || fail=1
done
TMP="$(mktemp -d)"; mkdir -p "$TMP/profiles/desktop"
printf '{"name":"dsh-profile-desktop","private":true,"dependencies":{},"dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base"]}}}\n' > "$TMP/profiles/desktop/package.json"
DSH_HOME="$TMP" "$SELF/holistic" apply >/dev/null && echo "  ✅ 干跑 apply" || fail=1
DSH_HOME="$TMP" "$SELF/holistic" apply --apply --no-sync >/dev/null && echo "  ✅ 沙盒安装" || fail=1
DSH_HOME="$TMP" "$SELF/holistic" verify >/dev/null && echo "  ✅ 沙盒校验" || fail=1
M=$(DSH_HOME="$TMP" node --input-type=module -e "import {readMode} from 'file://$SELF/lib/mode.mjs';process.stdout.write(readMode())")
[ "$M" = light ] && echo "  ✅ 安装默认 light（全量待命）" || { echo "  ❌ 安装默认不是 light（$M）"; fail=1; }
OFF=$(ls -d "$TMP/.holistic/skills-off"/*/ 2>/dev/null | wc -l | tr -d ' ')
[ "${OFF:-0}" -gt 300 ] && echo "  ✅ 待命区 $OFF 个领域技能（全量在盘）" || { echo "  ❌ 待命区不全（$OFF）"; fail=1; }
DSH_HOME="$TMP" "$SELF/holistic" uninstall --apply --no-sync >/dev/null && echo "  ✅ 沙盒卸载" || fail=1
if [ ! -d "$TMP/skills" ] || [ -z "$(ls -A "$TMP/skills" 2>/dev/null)" ]; then
  echo "  ✅ 卸载后技能清空"
else
  echo "  ❌ 卸载后仍有技能残留"; fail=1
fi
rm -rf "$TMP"
# 冒烟顺带把其余套件跑一遍（CI 只调 smoke，避免 workflow 文件频繁变更）
for t in contract provision workflow route companions; do
  echo "  ---- $t ----"
  bash "$SELF/tests/$t.test.sh" >/dev/null 2>&1 && echo "  ✅ $t" || { echo "  ❌ $t"; fail=1; }
done
[ "$fail" = 0 ] && echo "smoke: PASS" || echo "smoke: FAIL"
exit $fail
