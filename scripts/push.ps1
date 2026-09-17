# Pushes to origin, going through a local proxy when one is running.
#
# Why this is a script rather than `git push`:
#
# github.com is unreachable directly on this network. git reports that as a
# twenty-second timeout and `Failed to connect to github.com port 443`, which
# says nothing about what to do next. A proxy client is usually running and its
# port is not the one most documentation names — 7890 is the commonly cited
# default, 7897 was the one actually listening here.
#
# Setting the environment variable by hand in a terminal does not help across
# separate shells, which is the trap: the variable looks set, and the next
# command behaves as though it were not. This sets it for the push it runs.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/push.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/push.ps1 origin main

param(
  [string]$Remote = "origin",
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$proxyCandidates = @(7897, 7890, 7891, 10809, 10808, 1080, 20171, 8080)
$proxyPort = $null
foreach ($port in $proxyCandidates) {
  if (Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue) {
    $proxyPort = $port
    break
  }
}

if ($proxyPort) {
  $env:HTTPS_PROXY = "http://127.0.0.1:$proxyPort"
  $env:HTTP_PROXY = "http://127.0.0.1:$proxyPort"
  Write-Host "pushing through the local proxy on port $proxyPort"
} else {
  Write-Host "no local proxy found; trying a direct connection"
}

# Report what is about to be sent, so a push that turns out to be a no-op is
# visible as one rather than looking like a success.
$ahead = git rev-list --count "$Remote/$Branch..HEAD" 2>$null
if ($ahead) { Write-Host "$ahead commit(s) to send" }

git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 push $Remote $Branch

if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "push failed. If the cause is a connection timeout, start your proxy client and retry;"
  Write-Host "if a proxy is running on a port not listed above, add it to `$proxyCandidates."
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "pushed: $(git log -1 --format='%h %s')"
git status --short --branch | Select-Object -First 1
