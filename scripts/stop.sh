#!/usr/bin/env bash
# AIGC START
# 停止快传：开发进程、打包应用、占用 3847 端口的服务
set -euo pipefail

APP_NAME="快传"
PORT=3847
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ 正在停止「${APP_NAME}」…"

lsof -ti :"${PORT}" 2>/dev/null | xargs kill -9 2>/dev/null || true

osascript -e "quit app \"${APP_NAME}\"" 2>/dev/null || true

pkill -f "electron.*${ROOT}" 2>/dev/null || true
pkill -f "electron -e" 2>/dev/null || true
pkill -f "snapdrop-personal" 2>/dev/null || true

sleep 0.4
echo "✓ 已停止（端口 ${PORT} 已释放）"
# AIGC END
