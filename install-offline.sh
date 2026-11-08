#!/bin/bash
# 离线一键安装：不联网、不走 git/pnpm。等价于 install.sh --offline。
set -euo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SELF/install.sh" --offline "$@"
