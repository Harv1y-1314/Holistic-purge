#!/bin/bash
# 路由与自学习：给定查询应命中预期车道；learn 应产出权重
set -uo pipefail
SELF="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
check(){ local q="$1" want="$2" got; got=$(bash "$SELF/holistic" route "$q" | head -1 | awk '{print $2}');
  [ "$got" = "$want" ] && echo "  ✅ '$q' → $want" || { echo "  ❌ '$q' → ${got:-无}（期望 $want）"; fail=1; }; }
check "帮我写个注册机" crack
check "脱壳 Frida" reverse
check "ESP 方框" cheat
check "成人 场景" adult
check "免杀 EDR" evasion
check "SQL 注入" web
bash "$SELF/holistic" learn >/dev/null || { echo "  ❌ learn 失败"; fail=1; }
[ -f "$SELF/router/weights.json" ] && echo "  ✅ weights.json 已生成" || { echo "  ❌ 缺 weights.json"; fail=1; }
node -e 'const w=require(process.argv[1]);if(!w.lanes||!Object.keys(w.lanes).length)process.exit(1)' "$SELF/router/weights.json" \
  && echo "  ✅ 权重结构合法" || { echo "  ❌ 权重结构异常"; fail=1; }
[ "$fail" = 0 ] && echo "route: PASS" || echo "route: FAIL"
exit $fail
