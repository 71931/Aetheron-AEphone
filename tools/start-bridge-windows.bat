@echo off
chcp 65001 >nul
title 小红书通道（AEphone）
echo.
echo  ===== 小红书通道 xhs-bridge =====
echo  这个黑窗口别关，关了通道就断了。
echo.
where python >nul 2>nul
if errorlevel 1 (
  echo  [!] 这台电脑没找到 python。
  echo      去 python.org 下载 Python 3 装一下（安装时记得勾 Add python.exe to PATH），再双击本文件。
  echo.
  pause
  exit /b 1
)
echo  正在启动……马上会打印一行「通道地址」（https://xxxx.trycloudflare.com）
echo  把那一行填到手机站点的「通道地址」里，令牌填 aetheron。
echo.
python "%~dp0xhs_bridge.py" --tunnel --mcp http://localhost:18061/mcp --token aetheron
echo.
echo  通道已退出。按任意键关窗口。
pause
