#!/bin/zsh
cd "$(dirname "$0")"
echo "啟動原物料行情查詢系統..."
echo ""
node server.js
echo ""
echo "服務已停止。按 Enter 關閉視窗。"
read
