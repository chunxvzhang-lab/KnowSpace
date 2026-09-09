@echo off
chcp 65001 >nul
title KnowSpace 独立宣传站 · 本地开发服务器 (v2.0.0)

echo =======================================================
echo    🪐 KnowSpace 现代化个人知识工作台 - 独立宣传站
echo    Write. Read. Connect. Know. (摸鱼Lab Moyu Lab)
echo =======================================================
echo.
echo [*] 正在启动独立宣传站本地开发服务器 (端口: 5200)...
echo [*] 启动完成后将自动在默认浏览器中打开: http://127.0.0.1:5200
echo [*] 按 Ctrl+C 可停止服务器。
echo.

cd /d "%~dp0"
npm --prefix web run dev -- --open --host 127.0.0.1 --port 5200

pause
