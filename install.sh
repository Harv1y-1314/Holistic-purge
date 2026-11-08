#!/bin/bash
# Holistic-purge 一键安装：装进 DSH、写好预设、指定工作区默认 Holistic。
#
#   bash install.sh [--workspace <dir>] [--offline] [--no-restart] [--repo <git-url>]
#
# 远程一条命令（仓库公开；jsDelivr 秒级刷新，GitHub raw 个别路径可能滞后几分钟）：
#   curl -fsSL https://cdn.jsdelivr.net/gh/Harv1y-1314/Holistic-purge@main/install.sh \
#     | bash -s -- --workspace "$HOME/Desktop/开发-逆向与破解"
# 或 GitHub 原生：
#   curl -fsSL https://raw.githubusercontent.com/Harv1y-1314/Holistic-purge/main/install.sh | bash -s -- --workspace DIR
# 离线/内网：git clone 后在本目录跑 bash install.sh
#
# --workspace 省略时 = 当前目录。装完会**自动重启 DSH**（在 DSH 会话内运行时自动跳过），之后全自动：
# 指定工作区新对话 → Holistic 预设 + 内核常驻 + AGENTS.md 技能索引 + 3 个工具。
set -euo pipefail

WORKSPACE=""
OFFLINE=0
RESTART=1
REPO="${HOLISTIC_REPO:-https://github.com/Harv1y-1314/Holistic-purge.git}"
while [ $# -gt 0 ]; do
  case "$1" in
    --workspace) WORKSPACE="${2:?--workspace 需要目录}"; shift 2 ;;
    --workspace=*) WORKSPACE="${1#*=}"; shift ;;
    --repo) REPO="${2:?--repo 需要 URL}"; shift 2 ;;
    --offline) OFFLINE=1; shift ;;
    --no-restart) RESTART=0; shift ;;
    --no-sync) shift ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="${DSH_PROFILE:-desktop}"
TARGET="$DSH_HOME/plugins/holistic-purge"
WORKSPACE="${WORKSPACE:-$PWD}"

echo "== Holistic-purge 一键安装 =="
echo "   插件目标: $TARGET"
echo "   工作区  : $WORKSPACE"

# ---- 1. 取得源码：本地仓库 / 远端克隆 ----
SELF=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
if [ -n "$SELF" ] && [ -f "$SELF/package.json" ] && grep -q '"name"[[:space:]]*:[[:space:]]*"holistic-purge"' "$SELF/package.json"; then
  SRC="$SELF"
else
  if [ "$OFFLINE" = 1 ]; then
    echo "离线模式但不在仓库内：请先 git clone，再在仓库目录里运行 install.sh" >&2
    exit 1
  fi
  SRC="$(mktemp -d)/holistic-purge"
  echo "   源     : 克隆 $REPO"
  git clone --depth 1 "$REPO" "$SRC" >/dev/null 2>&1 || { echo "克隆失败：$REPO" >&2; exit 1; }
fi

# ---- 2. 同步到 DSH 插件目录 ----
mkdir -p "$DSH_HOME/plugins"
if [ "$(cd "$SRC" && pwd)" != "$(cd "$TARGET" 2>/dev/null && pwd || true)" ]; then
  rm -rf "$TARGET"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude '.git' --exclude 'node_modules' --exclude '*.bak-*' "$SRC/" "$TARGET/"
  else
    cp -R "$SRC" "$TARGET"
    rm -rf "$TARGET/.git"
  fi
  echo "   已同步插件 → $TARGET"
else
  echo "   插件已在目标位置"
fi

if [ ! -f "$DSH_HOME/profiles/$PROFILE/package.json" ]; then
  if [ "${HOLISTIC_SKIP_APP_LAUNCH:-0}" = 1 ] || ! command -v open >/dev/null 2>&1; then
    echo "未找到 profile：$DSH_HOME/profiles/$PROFILE/package.json（且无法自动拉起宿主）" >&2
    exit 1
  fi
  echo "   未发现 profile → 自动启动一次 DSH 生成（最多等 60s）"
  open -a "DeepSeek Harness" 2>/dev/null || open "/Applications/DeepSeek Harness.app" 2>/dev/null || true
  for _ in $(seq 1 120); do
    [ -f "$DSH_HOME/profiles/$PROFILE/package.json" ] && break
    sleep 0.5
  done
  if [ ! -f "$DSH_HOME/profiles/$PROFILE/package.json" ]; then
    echo "profile 仍未生成：$DSH_HOME/profiles/$PROFILE/package.json" >&2
    exit 1
  fi
  echo "   profile 已生成"
fi

# ---- 3. 登记依赖 + bundles，写 Holistic 预设块，铺组件与技能 ----
bash "$TARGET/holistic" apply --apply --no-sync

# ---- 4. 指定工作区：登记规则 + 写 AGENTS.md 块（没有宿主进程也能完成）----
node --input-type=module -e "
import { setPresetFor } from 'file://$TARGET/lib/presetmap.mjs';
import { bootstrapWorkspaces } from 'file://$TARGET/index.js';
const ws = process.argv[1];
setPresetFor(ws, 'holistic');
for (const w of bootstrapWorkspaces()) {
  console.log('   工作区块: ' + w.dir + ' → ' + (w.action ?? w.error));
}
console.log('   预设规则: ' + ws + ' → holistic');
" "$WORKSPACE"

# ---- 5. 自检：doctor（缺什么补什么）+ probe（真注入痕迹）+ 回归测试 ----
bash "$TARGET/holistic" selftest --apply --workspace "$WORKSPACE" || true

# ---- 6. 自动重启 + 重启后复检 ----
VERSION="$(node -p "require('$TARGET/package.json').version" 2>/dev/null || echo 0)"
if [ "$RESTART" = 1 ] && [ -z "${DSH_SESSION_ID:-}" ] && [ -x "$HOME/.local/bin/dsh-restart" ]; then
  echo
  echo "== 自动重启 DSH（只动主进程）=="
  "$HOME/.local/bin/dsh-restart" --timeout 20 || true
  echo "   等待插件加载（v${VERSION}）…"
  for _ in $(seq 1 120); do
    tail -200 "$DSH_HOME/.holistic/boot.log" 2>/dev/null | grep -q "apply v${VERSION}" && break
    sleep 0.5
  done
  echo
  bash "$TARGET/holistic" probe --workspace "$WORKSPACE" || true
elif [ "$RESTART" = 1 ]; then
  echo
  echo "提示：当前在 DSH 会话内（DSH_SESSION_ID 已设置）或没有 dsh-restart，"
  echo "      为避免杀掉你自己所在的会话，自动重启已跳过。稍后执行："
  echo "      ~/.local/bin/dsh-restart"
else
  echo
  echo "已指定 --no-restart：稍后手动重启 DSH 生效。"
fi

cat <<EOF

安装完成。
$([ "$RESTART" = 0 ] && echo "  · --no-restart：稍后手动执行 ~/.local/bin/dsh-restart" || ([ -n "${DSH_SESSION_ID:-}" ] && echo "  · 在 DSH 会话内运行：手动执行一次 ~/.local/bin/dsh-restart" || echo "  · 已自动重启并复检，probe 全 pass 即生效"))

后续：
  · 新建任务选择器：标准模式 / 创造模式 / Holistic（外源 QNX 预设已移除）
  · 在 $WORKSPACE 新建对话 → 自动 Holistic，内核 + 技能索引 + holistic_* 工具全部就绪
  · 其它工作区 → 仍是标准模式；已有对话不受影响
EOF
