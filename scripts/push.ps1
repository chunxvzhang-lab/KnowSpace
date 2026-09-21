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
# Both spellings are set, and that is not belt-and-braces. libcurl — which is
# what git uses for https — reads the lowercase `https_proxy` and ignores the
# uppercase one when both are present. Setting only `HTTPS_PROXY` therefore does
# nothing on a machine where something else has already exported the lowercase
# name (an agent session, a wrapper, a previous experiment). The push then goes
# through that other proxy instead, and the failure reads as a network fault:
# `Empty reply from server`, or a `502` from a proxy that was never asked to
# carry this traffic. Clearing them when no proxy is found matters for the same
# reason — a stale lowercase variable would otherwise outlive this script.
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
  $proxyUrl = "http://127.0.0.1:$proxyPort"
  # Lowercase first: libcurl prefers it, so it is the one that actually decides.
  $env:https_proxy = $proxyUrl
  $env:http_proxy = $proxyUrl
  $env:HTTPS_PROXY = $proxyUrl
  $env:HTTP_PROXY = $proxyUrl
  Write-Host "pushing through the local proxy on port $proxyPort"
} else {
  # Not just "leave them alone": an inherited lowercase proxy variable would
  # still be honoured by libcurl, and the failure would look like a network
  # fault rather than like a proxy that should not be in the path.
  Remove-Item Env:https_proxy, Env:http_proxy, Env:HTTPS_PROXY, Env:HTTP_PROXY -ErrorAction SilentlyContinue
  Write-Host "no local proxy found; trying a direct connection"
}

# Report what is about to be sent, so a push that turns out to be a no-op is
# visible as one rather than looking like a success.
$ahead = [int](git rev-list --count "$Remote/$Branch..HEAD" 2>$null)

if ($ahead -eq 0) {
  # Said plainly and returned early, rather than reported as a push that
  # happened. The previous version printed `pushed: <last commit>` whatever the
  # count was, which reads as though that commit had just been sent — when in
  # fact nothing was. The last commit is not evidence of a push; the branch line
  # below is.
  Write-Host "nothing to send: $Remote/$Branch is already up to date at $(git log -1 --format='%h')"
  exit 0
}

Write-Host "$ahead commit(s) to send"

git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=30 push $Remote $Branch

if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "push failed. If the cause is a connection timeout, start your proxy client and retry;"
  Write-Host "if a proxy is running on a port not listed above, add it to `$proxyCandidates."
  Write-Host "If it hung for ~30s and then reported 'could not read Username', the proxy is fine"
  Write-Host "and the credential helper is the problem: git needs the interactive desktop session"
  Write-Host "that the helper reads from, so run this from a normal terminal, not from an agent."
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "pushed $ahead commit(s); now at $(git log -1 --format='%h %s')"
# The branch line is the check: it shows `ahead` if anything failed to send.
git status --short --branch | Select-Object -First 1
