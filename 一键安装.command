#!/bin/bash
# 双击运行：安装插件 + 建立 CLI + 立即注入
set -e
cd "$(dirname "$0")"
echo "==== Holistic-purge · Qoder CN 一键安装 ===="
sh runtime/install.sh --apply
echo
echo "L3 字节层需要重启 Qoder CN 才生效。"
read -n 1 -s -r -p "按任意键关闭..."
