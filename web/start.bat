@echo off
chcp 65001 >nul
title KnowSpace 独立宣传站 (v2.0.0)

echo =======================================================
echo    🪐 KnowSpace 独立宣传站本地开发服务器
echo =======================================================
echo.
echo [*] 正在启动开发服务器并自动在浏览器中打开...
cd /d "%~dp0"
npm run dev -- --open --host 127.0.0.1 --port 5200

pause
