# =======================================================
#    🪐 KnowSpace 独立宣传站启动脚本 (PowerShell)
#    Write. Read. Connect. Know. (摸鱼Lab Moyu Lab · v2.0.0)
# =======================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "   🪐 KnowSpace 独立宣传站 - 本地开发服务器 (v2.0.0)" -ForegroundColor Green
Write-Host "   Write. Read. Connect. Know. (摸鱼Lab Moyu Lab)" -ForegroundColor DarkGray
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[*] 正在启动独立宣传站开发服务器 (端口: 5200)..." -ForegroundColor Yellow
Write-Host "[*] 页面将自动在默认浏览器中打开: http://127.0.0.1:5200" -ForegroundColor Gray
Write-Host "[*] 按 Ctrl+C 可停止服务。" -ForegroundColor DarkGray
Write-Host ""

Set-Location -Path $PSScriptRoot
npm --prefix web run dev -- --open --host 127.0.0.1 --port 5200
