# Packages release/KnowSpace-win-x64 into the portable zip published on GitHub.
#
# Uses the .NET ZipFile API rather than Compress-Archive: the latter buffers
# aggressively and struggles with a ~500 MB tree, while CreateFromDirectory
# streams straight to disk.
#
# Run from the repository root:  powershell -File scripts/build-portable-zip.ps1

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $root "release\KnowSpace-win-x64"
$targetZip = Join-Path $root "release\KnowSpace-win-x64-portable.zip"

if (-not (Test-Path $sourceDir)) {
    Write-Error "Portable directory not found: $sourceDir`nRun scripts/sync-portable.ps1 first."
    exit 1
}

if (Test-Path $targetZip) {
    Remove-Item -Force $targetZip
    Write-Host "Removed previous archive."
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

Write-Host "Compressing $sourceDir ..."
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $sourceDir,
    $targetZip,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false   # no base directory: keep KnowSpace.exe at the archive root
)

$size = [math]::Round((Get-Item $targetZip).Length / 1MB, 1)
Write-Host "Portable archive written: $targetZip ($size MB)"
