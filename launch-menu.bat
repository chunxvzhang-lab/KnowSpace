@echo off
chcp 65001 >nul
title KnowSpace 全能快捷调度终端 (v2.0.0)

:MENU
cls
echo =======================================================
echo    🪐 KnowSpace 现代化个人知识工作台 · 调度中心
echo    摸鱼Lab (Moyu Lab) · 生产版本 v2.0.0
echo =======================================================
echo.
echo   [1] 启动独立宣传站 (开发模式 · 支持热重载 · 自动开浏览器)
echo   [2] 预览独立宣传站 (一键生产构建 + 启动静态预览)
echo   [3] 构建独立宣传站静态包 (仅编译输出至 web/dist)
echo   [4] 启动 KnowSpace 桌面客户端 (Electron 桌面模式)
echo   [5] 运行项目自动化单元测试 (Vitest)
echo   [0] 退出
echo.
echo =======================================================
set /p choice=请输入选项编号 [0-5]: 

if "%choice%"=="1" goto DEV_WEB
if "%choice%"=="2" goto PREVIEW_WEB
if "%choice%"=="3" goto BUILD_WEB
if "%choice%"=="4" goto DESKTOP
if "%choice%"=="5" goto RUN_TEST
if "%choice%"=="0" exit /b 0

echo.
echo [!] 无效选项，请重新输入。
timeout /t 2 >nul
goto MENU

:DEV_WEB
cls
echo [*] 正在启动独立宣传站本地开发服务器...
cd /d "%~dp0"
npm --prefix web run dev -- --open --host 127.0.0.1 --port 5200
pause
goto MENU

:PREVIEW_WEB
cls
echo [*] 正在执行生产编译并启动静态预览...
cd /d "%~dp0"
call npm --prefix web run build
if %errorlevel% equ 0 (
    npm --prefix web run preview -- --open --host 127.0.0.1 --port 5200
) else (
    echo [!] 编译出错，请检查日志。
)
pause
goto MENU

:BUILD_WEB
cls
echo [*] 正在编译独立宣传站静态资源...
cd /d "%~dp0"
call npm --prefix web run build
echo.
echo [*] 编译完成！静态产物已保存在: web/dist/
pause
goto MENU

:DESKTOP
cls
echo [*] 正在启动 KnowSpace 桌面客户端...
cd /d "%~dp0"
npm run desktop
pause
goto MENU

:RUN_TEST
cls
echo [*] 正在运行自动化测试套件...
cd /d "%~dp0"
npm run test
pause
goto MENU
