# Sync the freshly built win-unpacked/ output into the portable
# release/KnowSpace-win-x64 folder.
#
# Notes:
# - Top-level files (exe, dll, pak, ...) are copied with Copy-Item -Force.
# - The `resources` folder is mirrored with `robocopy /MIR` so that its
#   contents exactly match the build output and no stale nested folders
#   (e.g. resources/resources) can ever appear.
# - Portable-only extras (docs/, assets/, release/, README.md) live at the
#   target root and are intentionally left untouched.

$ErrorActionPreference = "Stop"

$root   = Resolve-Path "$PSScriptRoot\.."
$source = Join-Path $root "release\win-unpacked"
$target = Join-Path $root "release\KnowSpace-win-x64"

if (-not (Test-Path $source)) { throw "win-unpacked not found: $source" }
if (-not (Test-Path $target)) { throw "portable folder not found: $target" }

Write-Host "Syncing $source -> $target"
Write-Host ""

# --- 1. Copy top-level files ----------------------------------------------
Get-ChildItem -Path $source -File -Force | ForEach-Object {
  Copy-Item -Force $_.FullName (Join-Path $target $_.Name)
  Write-Host "  [file] $($_.Name)"
}

# --- 2. Mirror the resources folder with robocopy -------------------------
$srcRes = Join-Path $source "resources"
$dstRes = Join-Path $target "resources"
New-Item -ItemType Directory -Path $dstRes -Force | Out-Null

# robocopy exit codes 0-7 are all success variants
$robocopyArgs = @("`"$srcRes`"", "`"$dstRes`"", "/MIR", "/NFL", "/NDL", "/NJH", "/NJS", "/NC", "/NS")
$rc = Start-Process -FilePath "robocopy" -ArgumentList $robocopyArgs -Wait -PassThru -NoNewWindow
if ($rc.ExitCode -ge 8) {
  throw "robocopy failed with exit code $($rc.ExitCode)"
}
Write-Host "  [dir ] resources (mirrored, robocopy exit=$($rc.ExitCode))"
Write-Host ""

# --- 3. Verify critical runtime files -------------------------------------
$asar = Join-Path $target "resources\app.asar"
$exe  = Join-Path $target "KnowSpace.exe"
$unp  = Join-Path $target "resources\app.asar.unpacked"

if (-not (Test-Path $asar)) { throw "app.asar missing after sync" }
if (-not (Test-Path $exe))  { throw "KnowSpace.exe missing after sync" }
if (-not (Test-Path $unp))  { throw "app.asar.unpacked missing after sync" }

$nativeCount = (Get-ChildItem -Path $unp -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count

Write-Host "app.asar     : $([math]::Round((Get-Item $asar).Length / 1MB, 1)) MB  ($((Get-Item $asar).LastWriteTime))"
Write-Host "KnowSpace.exe: $([math]::Round((Get-Item $exe).Length / 1MB, 1)) MB  ($((Get-Item $exe).LastWriteTime))"
Write-Host "unpacked     : $nativeCount native file(s)"
Write-Host ""
Write-Host "Sync complete. You can launch release\KnowSpace-win-x64\KnowSpace.exe"
