#!/bin/bash
# 同步到远端最新（用于遇到过强制推送/重写历史的旧 clone）。
#
#   bash update.sh                 # fetch --force + reset --hard origin/<当前分支>
#   bash update.sh --reinstall     # 同步后顺带跑 install.sh 刷新工作区块
#   bash update.sh --branch NAME   # 换分支同步（例如 qoder-lite）
#
# 注意：reset --hard 会丢弃未提交改动；脚本检测到脏工作树会直接退出，不会动手。
set -euo pipefail

SELF="$(cd "$(dirname "$0")" && pwd)"
cd "$SELF"

BRANCH=""
REINSTALL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --branch) BRANCH="${2:?--branch 需要名字}"; shift 2 ;;
    --reinstall) REINSTALL=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

[ -d .git ] || { echo "不是 git 仓库：$SELF" >&2; exit 1; }

CURRENT="$(git symbolic-ref --short HEAD 2>/dev/null || echo "")"
[ -n "$CURRENT" ] || { echo "当前是 detached HEAD；先 git checkout <branch>" >&2; exit 1; }
TARGET_BRANCH="${BRANCH:-$CURRENT}"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "工作树有未提交改动，已停止（不会 reset --hard）：" >&2
  git status --short >&2
  echo "先提交/暂存，或手动执行：" >&2
  echo "  git fetch --force origin && git reset --hard origin/$TARGET_BRANCH" >&2
  exit 1
fi

echo "· 当前分支: $CURRENT → $TARGET_BRANCH"
git fetch --force --prune origin
git fetch --force --tags origin
if [ "$TARGET_BRANCH" != "$CURRENT" ]; then
  git checkout -B "$TARGET_BRANCH" "origin/$TARGET_BRANCH"
else
  git reset --hard "origin/$TARGET_BRANCH"
fi

echo "· 已同步到 $(git rev-parse --short HEAD)（$(git log -1 --pretty=%s)）"

if [ "$REINSTALL" = 1 ]; then
  echo "· 刷新安装"
  bash "$SELF/install.sh"
fi
