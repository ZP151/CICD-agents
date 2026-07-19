<#
.SYNOPSIS
Verifies that the default installed runtime port is not owned by the wrong process.

.DESCRIPTION
This is a non-mutating guard for installed desktop trust. It does not start,
stop, or restart any process. If the default runtime port is free, the check
passes. If the port is occupied, the owner must be the installed Program Files
daemon and, when health is available, it must report the expected version.
#>

param(
  [string]$ExpectedVersion = "",
  [int]$Port = 8787,
  [string]$InstalledDaemonPath = "C:\Program Files\MergePilot\mergepilot-daemon.exe",
  [switch]$RequireRuntime,
  [switch]$RequireDesktopSidecarMode
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
  $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "packages\daemon\package.json") -Raw | ConvertFrom-Json).version
}

function Get-ListeningProcessInfo {
  param([int]$TcpPort)

  $connection = Get-NetTCPConnection -LocalPort $TcpPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $connection) {
    return $null
  }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue
  return [pscustomobject]@{
    id = $connection.OwningProcess
    path = if ($process) { [string]$process.ExecutablePath } else { $null }
    commandLine = if ($process) { [string]$process.CommandLine } else { $null }
  }
}

function Test-SamePath {
  param(
    [string]$Left,
    [string]$Right
  )

  if ([string]::IsNullOrWhiteSpace($Left) -or [string]::IsNullOrWhiteSpace($Right)) {
    return $false
  }

  try {
    $leftFull = [System.IO.Path]::GetFullPath($Left).TrimEnd('\')
    $rightFull = [System.IO.Path]::GetFullPath($Right).TrimEnd('\')
    return [string]::Equals($leftFull, $rightFull, [System.StringComparison]::OrdinalIgnoreCase)
  } catch {
    return [string]::Equals($Left, $Right, [System.StringComparison]::OrdinalIgnoreCase)
  }
}

$owner = Get-ListeningProcessInfo -TcpPort $Port
$health = $null
$healthError = $null
$failures = @()

if ($owner) {
  if (-not (Test-SamePath -Left $owner.path -Right $InstalledDaemonPath)) {
    $failures += "Default runtime port $Port is owned by '$($owner.path)' (PID $($owner.id)), not the installed daemon '$InstalledDaemonPath'."
  } else {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/healthz" -TimeoutSec 3
    } catch {
      $healthError = $_.Exception.Message
    }

    if (-not $health) {
      $failures += "Default runtime port $Port is owned by the installed daemon, but /healthz failed: $healthError"
    } elseif ($health.version -ne $ExpectedVersion) {
      $failures += "Default runtime daemon version is '$($health.version)', expected '$ExpectedVersion'."
    }

    if ($RequireDesktopSidecarMode -and $health -and $health.runtimeMode -ne "desktop-sidecar") {
      $failures += "Default runtime daemon mode is '$($health.runtimeMode)', expected 'desktop-sidecar'."
    }
    if ($RequireDesktopSidecarMode -and $health -and $health.desktopVersion -ne $ExpectedVersion) {
      $failures += "Default runtime daemon desktop version is '$($health.desktopVersion)', expected '$ExpectedVersion'."
    }
  }
} elseif ($RequireRuntime) {
  $failures += "Default runtime port $Port is not occupied. The installed desktop runtime is expected to be running."
}

$result = [pscustomobject]@{
  ok = $failures.Count -eq 0
  expectedVersion = $ExpectedVersion
  port = $Port
  installedDaemonPath = $InstalledDaemonPath
  occupied = $null -ne $owner
  owner = $owner
  health = $health
  healthError = $healthError
  failures = $failures
}

$result | ConvertTo-Json -Depth 10
if ($failures.Count -gt 0) {
  exit 1
}
exit 0
