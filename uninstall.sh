#!/bin/bash
set -euo pipefail
SELF="$(cd "$(dirname "$0")" && pwd)"
bash "$SELF/holistic" uninstall --apply "$@"
