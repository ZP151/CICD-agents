<#
.SYNOPSIS
Verifies the installed MSI-state verifier refuses unrelated port owners.

.DESCRIPTION
This is a negative safety gate for verify-installed-msi-state.ps1. It starts a
temporary non-MergePilot listener on the requested port, runs the installed
state verifier with daemon probing enabled, and requires that the verifier fails
with the expected refusal message while leaving the unrelated listener alive.
The harness then cleans up the listener it created.

.EXAMPLE
.\scripts\windows\verify-installed-msi-state-safety-smoke.ps1 -ExpectedVersion 0.5.20 -Port 18933
#>

param(
  [int]$Port = 18933,
  [string]$ExpectedVersion = "",
  [string]$LogDir = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
  $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "packages\daemon\package.json") -Raw | ConvertFrom-Json).version
}
if ([string]::IsNullOrWhiteSpace($LogDir)) {
  $LogDir = Join-Path $repoRoot "output\live-e2e"
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = Join-Path $LogDir "verify-installed-msi-state-safety-$stamp.log"
$verifyScript = Join-Path $PSScriptRoot "verify-installed-msi-state.ps1"

function Test-TcpPortOpen {
  param([int]$TcpPort)

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $client.Connect("127.0.0.1", $TcpPort)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Wait-TcpPort {
  param(
    [int]$TcpPort,
    [int]$Seconds = 10
  )

  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    if (Test-TcpPortOpen -TcpPort $TcpPort) {
      return $true
    }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  return $false
}

if (Test-TcpPortOpen -TcpPort $Port) {
  throw "Port $Port is already in use before the safety smoke starts."
}

$listenerCode = @"
`$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse('127.0.0.1'), $Port)
`$listener.Start()
try {
  while (`$true) { Start-Sleep -Seconds 1 }
} finally {
  `$listener.Stop()
}
"@
$encodedListenerCode = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($listenerCode))
$listener = $null

try {
  $listener = Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile",
    "-EncodedCommand",
    $encodedListenerCode
  ) -WindowStyle Hidden -PassThru

  if (-not (Wait-TcpPort -TcpPort $Port -Seconds 10)) {
    throw "Temporary non-MergePilot listener did not start on port $Port."
  }

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File $verifyScript -ExpectedVersion $ExpectedVersion -ProbeDaemon -Port $Port *> $logPath
    $verifyExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  $listenerStillAlive = $false
  try {
    $listenerProcess = Get-Process -Id $listener.Id -ErrorAction Stop
    $listenerStillAlive = -not $listenerProcess.HasExited
  } catch {
    $listenerStillAlive = $false
  }

  $logText = Get-Content -LiteralPath $logPath -Raw -ErrorAction SilentlyContinue
  $containsExpectedRefusal = $logText -match "Refusing to probe unexpected process"

  $failures = @()
  if ($verifyExitCode -eq 0) {
    $failures += "Installed MSI-state verifier unexpectedly succeeded against a non-MergePilot listener."
  }
  if (-not $containsExpectedRefusal) {
    $failures += "Expected refusal message was not found in $logPath."
  }
  if (-not $listenerStillAlive) {
    $failures += "Installed MSI-state verifier stopped the unrelated listener."
  }

  $result = [pscustomobject]@{
    ok = $failures.Count -eq 0
    expectedVersion = $ExpectedVersion
    port = $Port
    logPath = $logPath
    listenerPid = $listener.Id
    verifyExitCode = $verifyExitCode
    containsExpectedRefusal = $containsExpectedRefusal
    listenerStillAliveAfterVerify = $listenerStillAlive
    failures = $failures
  }

  $result | ConvertTo-Json -Depth 8
  if ($failures.Count -gt 0) {
    exit 1
  }
  exit 0
} finally {
  if ($listener -and -not $listener.HasExited) {
    Stop-Process -Id $listener.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
  }
}
