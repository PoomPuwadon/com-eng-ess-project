# Builds the greybox, serves it + multiplayer on :8787 and exposes it via a Cloudflare quick tunnel.
# Both processes run detached (survive closing the terminal). Logs go to .tunnel/.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$logDir = Join-Path $root '.tunnel'
New-Item -ItemType Directory -Force $logDir | Out-Null

npm run build
if (-not $?) { throw 'build failed' }

# Stop previous instances started by this script.
foreach ($f in 'preview.pid', 'tunnel.pid') {
  $p = Join-Path $logDir $f
  if (Test-Path $p) {
    try { Stop-Process -Id ([int](Get-Content $p)) -Force -ErrorAction Stop } catch {}
  }
}

# server/index.mjs serves dist/ and the multiplayer WebSocket (/ws) on one port.
$preview = Start-Process -FilePath 'node' -ArgumentList 'server/index.mjs' `
  -WorkingDirectory $root -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $logDir 'preview.log') -RedirectStandardError (Join-Path $logDir 'preview.err.log')
$preview.Id | Set-Content (Join-Path $logDir 'preview.pid')

$tunnelLog = Join-Path $logDir 'tunnel.log'
if (Test-Path $tunnelLog) { Remove-Item $tunnelLog }
$tunnel = Start-Process -FilePath 'cloudflared' -ArgumentList 'tunnel', '--url', 'http://localhost:8787', '--logfile', $tunnelLog `
  -WindowStyle Hidden -PassThru
$tunnel.Id | Set-Content (Join-Path $logDir 'tunnel.pid')

# Wait for the public URL to appear in the log.
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $tunnelLog) {
    $m = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
    if ($m) { Write-Output ('PUBLIC URL: ' + $m.Matches[0].Value); exit 0 }
  }
}
Write-Output 'Tunnel URL not found yet - check .tunnel/tunnel.log'
