#!/usr/bin/env bash
# 启用快传：停止旧实例 → 打包 .app → 启动应用
# 用法:
#   ./scripts/enable.sh           完整流程（默认）
#   ./scripts/enable.sh --launch  仅启动，不重新打包
#   ./scripts/enable.sh --build   仅打包，不启动
#   ./scripts/enable.sh --stop    仅停止
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="快传"
APP_PATH="${ROOT}/dist/mac-arm64/${APP_NAME}.app"

cd "${ROOT}"

do_stop() {
  bash "${ROOT}/scripts/stop.sh"
}

do_build() {
  echo "→ 正在打包 ${APP_NAME}.app（首次或依赖变更较慢，请稍候）…"
  node "${ROOT}/scripts/generate-build-info.js"
  rm -rf "${ROOT}/dist/mac-arm64"
  npm run build:mac:app
  node "${ROOT}/scripts/finalize-build.js"
  if [[ ! -d "${APP_PATH}" ]]; then
    echo "✗ 打包失败：未找到 ${APP_PATH}"
    exit 1
  fi
  node "${ROOT}/scripts/publish-release.js"
  echo "✓ 打包完成：${APP_PATH}"
  echo "  若旧版正在运行，打开后会提示可升级"
}

do_launch() {
  if [[ ! -d "${APP_PATH}" ]]; then
    echo "✗ 未找到应用，请先执行: npm run enable"
    exit 1
  fi
  echo "→ 正在启动 ${APP_NAME}…"
  open -a "${APP_PATH}"
  sleep 1
  if lsof -ti :3847 >/dev/null 2>&1; then
    echo "✓ 已启动，服务端口 3847"
    echo "  本机: http://127.0.0.1:3847/"
  else
    echo "⚠ 应用已打开，若无法访问请检查防火墙或稍后重试"
  fi
}

MODE="${1:-}"

case "${MODE}" in
  --stop|stop)
    do_stop
    ;;
  --launch|-l|--no-build)
    do_stop
    do_launch
    ;;
  --build|-b|--build-only)
    do_stop
    do_build
    ;;
  --help|-h)
    echo "用法: $0 [--stop | --launch | --build | 默认完整启用]"
    ;;
  "")
    do_stop
    do_build
    do_launch
    ;;
  *)
    echo "未知参数: ${MODE}（可用 --stop / --launch / --build）"
    exit 1
    ;;
esac
