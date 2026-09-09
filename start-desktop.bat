@echo off
chcp 65001 >nul
title KnowSpace 桌面客户端 · 启动器 (v2.0.0)

echo =======================================================
echo    🪐 KnowSpace 现代化个人知识工作台 - 桌面客户端
echo    Write. Read. Connect. Know. (v2.0.0)
echo =======================================================
echo.
echo [*] 正在启动 KnowSpace 桌面客户端...
echo.

cd /d "%~dp0"
npm run desktop

pause
