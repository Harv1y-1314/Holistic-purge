#!/bin/sh
# Holistic-purge · Qoder CN 安装器
#
#   sh runtime/install.sh              # 只装插件 + 建 CLI（不注入）
#   sh runtime/install.sh --apply      # 装完立刻注入（L1/L2 立即生效，L3 需重启）
#   sh runtime/install.sh --only cn    # 只装 Qoder CN（默认）
#   sh runtime/install.sh --no-bin     # 不写 ~/.local/bin
#
# 只做本机文件操作，不联网。
set -e
PKG=$(cd "$(dirname "$0")/.." && pwd)
VER=$(python3 -c "import json;print(json.load(open('$PKG/.qoder-plugin/plugin.json'))['version'])" 2>/dev/null || echo "1.0.0")
NAME="holistic-qoder-cn"
ONLY="cn"; NOBIN=0; DO_APPLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) DO_APPLY=1; shift ;;
    --only) ONLY="$2"; shift 2 ;;
    --no-bin) NOBIN=1; shift ;;
    *) shift ;;
  esac
done

echo "==== Holistic-purge · Qoder CN v$VER ===="
echo "包: $PKG"
echo

install_one() {
  home="$1"; label="$2"
  [ -d "$home" ] || { echo "[$label] 无 $home，跳过"; return; }
  dst="$home/plugins/cache/local/$NAME/$VER"
  mkdir -p "$(dirname "$dst")"
  rm -rf "$dst"
  cp -R "$PKG" "$dst"
  echo "[$label] 插件已落: $dst"

  python3 - "$home" "$dst" "$VER" <<'PY'
import json, sys, pathlib, time
home, dst, ver = sys.argv[1], sys.argv[2], sys.argv[3]
p = pathlib.Path(home) / "plugins" / "installed_plugins_v2.json"
p.parent.mkdir(parents=True, exist_ok=True)
data = {"version": 2, "plugins": {}}
if p.exists():
    try: data = json.loads(p.read_text(encoding="utf-8")) or data
    except Exception: pass
data.setdefault("plugins", {})
data["plugins"]["holistic-qoder-cn@local"] = [{
    "scope": "user", "installPath": dst, "version": ver,
    "installedAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    "displayName": "Holistic Purge · Qoder CN",
    "appRowId": "local:plugin:holistic-qoder-cn",
}]
p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("[] installed_plugins_v2.json 已登记")
PY

  python3 - "$home" <<'PY'
import json, sys, pathlib
home = pathlib.Path(sys.argv[1])
p = home / "settings.json"
if not p.exists():
    print("[] 无 settings.json，跳过启用"); raise SystemExit
data = json.loads(p.read_text(encoding="utf-8"))
ep = data.setdefault("enabledPlugins", {})
ep["holistic-qoder-cn@local"] = True
p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("[] settings.json 已启用 holistic-qoder-cn@local")
PY
}

case "$ONLY" in
  cn|qoder-cn) install_one "$HOME/.qoder-cn" "Qoder CN" ;;
  qoder) install_one "$HOME/.qoder" "Qoder" ;;
  "") install_one "$HOME/.qoder-cn" "Qoder CN" ;;
  *) echo "未知 --only: $ONLY"; exit 1 ;;
esac

# 自定义 Agent（若该版本支持 settings → Agents 从目录加载，会直接出现在列表里）
AGENT_SRC="$PKG/agent/Holistic 破甲.md"
if [ -f "$AGENT_SRC" ] && [ -d "$HOME/.qoder-cn/agents" ]; then
  cp -f "$AGENT_SRC" "$HOME/.qoder-cn/agents/Holistic 破甲.md"
  echo "[agent] ~/.qoder-cn/agents/Holistic 破甲.md 已写入"
fi

if [ "$NOBIN" = "0" ]; then
  mkdir -p "$HOME/.local/bin"
  DST="$HOME/.qoder-cn/plugins/cache/local/$NAME/$VER"
  printf '#!/bin/sh\nexec python3 "%s/runtime/holistic.py" "$@"\n' "$DST" > "$HOME/.local/bin/holistic-qoder"
  chmod +x "$HOME/.local/bin/holistic-qoder"
  echo "[bin] ~/.local/bin/holistic-qoder 已建立"
fi

if [ "$DO_APPLY" = "1" ]; then
  echo
  python3 "$PKG/runtime/holistic.py" apply --app cn
fi
# 逐轮注入 hook（即使不 --apply 也装上，等价于把内核常驻到每一轮）
python3 "$PKG/runtime/holistic.py" hooks install --apply --app cn >/dev/null 2>&1 || true

echo
echo "下一步:"
echo "  holistic-qoder status          # 四层现状"
echo "  holistic-qoder apply           # 注入（L1/L2 立即，L3 需重启 Qoder CN）"
echo "  holistic-qoder revert          # 全退"
