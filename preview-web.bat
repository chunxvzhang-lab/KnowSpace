@echo off
chcp 65001 >nul
title KnowSpace 独立宣传站 · 生产环境静态预览 (v2.0.0)

echo =======================================================
echo    🪐 KnowSpace 独立宣传站 - 生产静态构建与预览
echo    (摸鱼Lab Moyu Lab · v2.0.0)
echo =======================================================
echo.
echo [1/2] 正在编译生产环境静态资源 (输出目录: web/dist)...
cd /d "%~dp0"
call npm --prefix web run build
if %errorlevel% neq 0 (
    echo.
    echo [!] 静态编译失败，请检查上方错误日志。
    pause
    exit /b %errorlevel%
)

echo.
echo [2/2] 正在启动静态预览服务器并打开浏览器 (http://127.0.0.1:5200)...
npm --prefix web run preview -- --open --host 127.0.0.1 --port 5200

pause
