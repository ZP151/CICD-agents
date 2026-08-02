[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$DevPort = 1421,
  [ValidateRange(1, 65535)]
  [int]$DaemonPort = 8788,
  [ValidatePattern('^[A-Za-z0-9.-]+$')]
  [string]$AppIdentifier = 'com.mergepilot.desktop.ux'
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$pnpm = Join-Path $workspaceRoot '.tools\pnpm.exe'
$node = Join-Path $workspaceRoot '.tools\node-v22.11.0-win-x64\node.exe'

if (-not (Test-Path -LiteralPath $pnpm) -or -not (Test-Path -LiteralPath $node)) {
  throw 'Repository-local Node.js and pnpm are required. Run bootstrap before starting the desktop worktree.'
}

function Assert-PortAvailable([int]$Port, [string]$Purpose) {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($null -ne $listener) {
    throw "$Purpose port $Port is already in use by PID $($listener.OwningProcess). Choose another port; do not take over an existing app."
  }
}

Assert-PortAvailable $DevPort 'Vite'
Assert-PortAvailable $DaemonPort 'MergePilot runtime'

$env:PATH = "$(Join-Path $workspaceRoot '.tools\node-v22.11.0-win-x64');$(Join-Path $workspaceRoot '.tools');$env:PATH"
$env:VITE_DEV_SERVER_PORT = "$DevPort"
$env:VITE_RUNTIME_URL = "http://127.0.0.1:$DaemonPort"
$env:MERGEPILOT_RUNTIME_PORT = "$DaemonPort"

& $node 'apps/desktop/scripts/ensure-sidecar.mjs'
if ($LASTEXITCODE -ne 0) { throw "Sidecar preparation failed with exit code $LASTEXITCODE." }

$vite = Start-Process -FilePath $pnpm -ArgumentList @(
  '--filter', '@mergepilot/desktop', 'exec', 'vite', '--host', '127.0.0.1'
) -WorkingDirectory $workspaceRoot -WindowStyle Hidden -PassThru

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    Start-Sleep -Milliseconds 250
    if (Get-NetTCPConnection -LocalPort $DevPort -State Listen -ErrorAction SilentlyContinue) {
      $ready = $true
      break
    }
  }
  if (-not $ready) { throw "Vite did not start on port $DevPort." }

  $config = @{ identifier = $AppIdentifier; build = @{ beforeDevCommand = ''; devUrl = "http://127.0.0.1:$DevPort" } } |
    ConvertTo-Json -Compress
  & $pnpm --filter '@mergepilot/desktop' exec tauri dev --config $config
  if ($LASTEXITCODE -ne 0) { throw "Tauri exited with code $LASTEXITCODE." }
}
finally {
  if (-not $vite.HasExited) {
    Stop-Process -Id $vite.Id -ErrorAction SilentlyContinue
  }
}
