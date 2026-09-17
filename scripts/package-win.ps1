# Packages the Windows build and syncs the portable copy.
#
# Why this script exists rather than a bare `npx electron-builder`:
#
# electron-builder downloads two things from GitHub on a cold cache — the
# Electron runtime and the winCodeSign binaries it uses to sign the executable.
# Neither is vendored in the repo, and on a network where github.com is
# unreachable the packaging step fails with `connect ETIMEDOUT` after a long
# pause. That is exactly what happened once: `dist/` was rebuilt, the commit
# landed, and the packaged app silently stayed four hours behind, so a fix that
# was in the tree was nowhere near the running program.
#
# Pointing both downloads at npmmirror avoids the dependency. The mirror is
# reachable where GitHub is not, and electron-builder reads both variables.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-win.ps1

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# ── Refuse to run twice at once ─────────────────────────────────────────────
#
# electron-builder packages into release\win-unpacked, and it empties that
# directory first. Two concurrent runs therefore fight over the same files: one
# renames electron.exe to KnowSpace.exe while the other is mid-scan, and the
# loser reports
#
#   ENOENT: no such file or directory, rename '...\electron.exe' -> '...\KnowSpace.exe'
#
# which says nothing about the actual cause. Clearing the half-built directory
# by hand afterwards does not help either — a second run then fails on
# `safe-delete`, because the first still holds handles inside it.
#
# A lock file turns that into one clear message.
$lockFile = Join-Path $repoRoot "release\.packaging.lock"

if (Test-Path $lockFile) {
  $holder = Get-Content $lockFile -ErrorAction SilentlyContinue
  $alive = $false
  if ($holder) {
    $alive = [bool](Get-Process -Id $holder -ErrorAction SilentlyContinue)
  }
  if ($alive) {
    throw "Another packaging run is already in progress (pid $holder). Wait for it to finish, or stop that process first."
  }
  Write-Host "removing a stale lock left by pid $holder, which is no longer running"
  Remove-Item -Force $lockFile -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $lockFile) | Out-Null
$PID | Out-File -FilePath $lockFile -Encoding ascii

try {
  $env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
  $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"

Write-Host "packaging with npmmirror mirrors..."

# The renderer has to be rebuilt first, or the packaged app carries the previous
# bundle no matter how current the source is.
npm run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

npx electron-builder --win dir
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

& "$PSScriptRoot\sync-portable.ps1"

$exe = Join-Path $repoRoot "release\KnowSpace-win-x64\KnowSpace.exe"
if (Test-Path $exe) {
  $info = Get-Item $exe
  Write-Host ""
  Write-Host "ready: $exe"
  Write-Host "built: $($info.LastWriteTime)"
} else {
  throw "packaging reported success but $exe is missing"
}

} finally {
  # Removed on every path, including a failure, or a single bad run would block
  # every subsequent one until someone found the file by hand.
  Remove-Item -Force $lockFile -ErrorAction SilentlyContinue
}
