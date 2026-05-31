#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/electron/native/copy-files.swift"
OUT="${ROOT}/electron/native/copy-files"
if [[ "$(uname)" != "Darwin" ]]; then
  echo "skip native copy-files (non-macOS)"
  exit 0
fi
if ! command -v swiftc >/dev/null 2>&1; then
  echo "✗ 未找到 swiftc，无法编译 copy-files"
  exit 1
fi
swiftc -O "${SRC}" -o "${OUT}"
chmod +x "${OUT}"
echo "✓ built ${OUT}"
VENDOR="${ROOT}/public/vendor"
mkdir -p "${VENDOR}"
if [[ -f "${ROOT}/node_modules/mammoth/mammoth.browser.min.js" ]]; then
  cp "${ROOT}/node_modules/mammoth/mammoth.browser.min.js" "${VENDOR}/"
fi
if [[ -f "${ROOT}/node_modules/xlsx/dist/xlsx.full.min.js" ]]; then
  cp "${ROOT}/node_modules/xlsx/dist/xlsx.full.min.js" "${VENDOR}/"
fi
if [[ -f "${ROOT}/node_modules/marked/lib/marked.umd.js" ]]; then
  cp "${ROOT}/node_modules/marked/lib/marked.umd.js" "${VENDOR}/marked.min.js"
fi
