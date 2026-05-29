#!/bin/bash
# AIGC START — 双击此文件：停止旧实例 → 打包 → 启动快传
cd "$(dirname "$0")/.."
./scripts/enable.sh
echo ""
read -p "按回车键关闭此窗口…"
