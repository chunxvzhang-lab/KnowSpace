# Runs the GitHub release publisher with the tool paths it needs.
#
# git and python are not on this machine's global PATH, so they are prepended
# here. The publisher reads the GitHub token through `git credential fill`,
# which is why git has to be reachable.

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$gitDir = Join-Path $env:LOCALAPPDATA "GitHubDesktop\app-3.6.3\resources\app\git\cmd"
$pythonDir = Join-Path $env:LOCALAPPDATA "Programs\Python\Python313"
$nodeDir = "C:\Program Files\nodejs"

$env:Path = "$gitDir;$pythonDir;$nodeDir;$env:Path"

$logPath = Join-Path $root "release_publish.log"
Set-Location $root

Write-Host "Publishing GitHub release (log: $logPath) ..."
& "$pythonDir\python.exe" "scripts\publish_github_release.py" *>&1 | Tee-Object -FilePath $logPath

Write-Host ""
Write-Host "Done. Log written to $logPath"
