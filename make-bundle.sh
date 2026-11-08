#!/bin/bash
# 打离线分发包：git archive 干净树 + vendor/，输出 tar.gz
set -euo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)"
VER=$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$SELF/package.json")
OUT="${1:-$HOME/Desktop/Holistic-purge-offline-$VER.tar.gz}"
cd "$SELF"
git archive --format=tar --prefix=Holistic-purge/ HEAD | gzip -9 > "$OUT"
echo "$OUT"
ls -lh "$OUT" | awk '{print "  大小:",$5}'
tar -tzf "$OUT" | grep -cE 'vendor/|install-offline.sh' | xargs -I{} echo "  含 vendor/install 条目: {} 个"
