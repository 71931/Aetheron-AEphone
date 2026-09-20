#!/bin/bash
# 双击前若提示「没有执行权限」：终端里执行  chmod +x start-bridge-mac.command  再双击
cd "$(dirname "$0")" || exit 1
echo "===== 小红书通道 xhs-bridge ====="
echo "这个窗口别关，关了通道就断了。"
echo
exec /usr/bin/env python3 xhs_bridge.py --tunnel --mcp http://localhost:18061/mcp --token aetheron
