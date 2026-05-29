#!/bin/bash
# AIGC START — 双击此文件：停止快传
cd "$(dirname "$0")/.."
./scripts/stop.sh
echo ""
read -p "按回车键关闭此窗口…"
