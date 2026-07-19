<#
.SYNOPSIS
Verifies the installed desktop starts and owns the default daemon runtime.

.DESCRIPTION
This smoke launches the installed MergePilot desktop and waits for the default
runtime port to report the expected daemon version plus desktop-sidecar
ownership metadata. It is intentionally focused on the product path users
exercise: desktop executable -> bundled sidecar -> /healthz trust metadata.
#>

param(
  [string]$ExpectedVersion = "",
  [int]$Port = 8787,
  [string]$InstalledDesktopPath = "C:\Program Files\MergePilot\mergepilot-desktop.exe",
  [string]$InstalledDaemonPath = "C:\Program Files\MergePilot\mergepilot-daemon.exe",
  [int]$TimeoutSec = 35,
  [switch]$StopExistingMergePilotBeforeLaunch,
  [switch]$LeaveRunning
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

function Test-RecoverableMergePilotRuntimeOwner {
  param([object]$Owner)

  if (-not $Owner) {
    return $false
  }

  $combined = "$($Owner.path) $($Owner.commandLine)".ToLowerInvariant().Replace("/", "\")
  return (
    $combined.Contains("mergepilot-daemon") -or
    $combined.Contains("@mergepilot\daemon") -or
    $combined.Contains("packages\daemon") -or
    (($combined.Contains("\cicd-agents\") -or $combined.Contains("\mergepilot\")) -and $combined.Contains("src\bin.ts"))
  )
}

function Get-MergePilotProcesses {
  Get-Process mergepilot-desktop, mergepilot-daemon -ErrorAction SilentlyContinue |
    ForEach-Object {
      [pscustomobject]@{
        id = $_.Id
        processName = $_.ProcessName
        path = $_.Path
        startTime = try { $_.StartTime.ToString("o") } catch { $null }
      }
    }
}

function Stop-InstalledMergePilotProcesses {
  Get-MergePilotProcesses |
    Where-Object {
      (Test-SamePath -Left $_.path -Right $InstalledDesktopPath) -or
      (Test-SamePath -Left $_.path -Right $InstalledDaemonPath)
    } |
    ForEach-Object {
      Stop-Process -Id $_.id -Force -ErrorAction SilentlyContinue
    }
}

function Wait-TrustedHealth {
  param([int]$TcpPort)

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $lastHealth = $null
  $lastError = $null
  do {
    try {
      $lastHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$TcpPort/healthz" -Method Get -TimeoutSec 2
      if (
        $lastHealth.version -eq $ExpectedVersion -and
        $lastHealth.runtimeMode -eq "desktop-sidecar" -and
        $lastHealth.desktopVersion -eq $ExpectedVersion
      ) {
        return [pscustomobject]@{
          ok = $true
          health = $lastHealth
          lastError = $null
        }
      }
    } catch {
      $lastError = $_.Exception.Message
    }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  return [pscustomobject]@{
    ok = $false
    health = $lastHealth
    lastError = $lastError
  }
}

$failures = @()
$desktopFile = if (Test-Path -LiteralPath $InstalledDesktopPath) { Get-Item -LiteralPath $InstalledDesktopPath } else { $null }
$daemonFile = if (Test-Path -LiteralPath $InstalledDaemonPath) { Get-Item -LiteralPath $InstalledDaemonPath } else { $null }

if (-not $desktopFile) {
  $failures += "Installed desktop not found: $InstalledDesktopPath"
}
if (-not $daemonFile) {
  $failures += "Installed daemon not found: $InstalledDaemonPath"
}
if ($desktopFile -and $desktopFile.VersionInfo.ProductVersion -ne $ExpectedVersion) {
  $failures += "Installed desktop product version is '$($desktopFile.VersionInfo.ProductVersion)', expected '$ExpectedVersion'."
}

$ownerBefore = Get-ListeningProcessInfo -TcpPort $Port
if (
  $ownerBefore -and
  -not (Test-SamePath -Left $ownerBefore.path -Right $InstalledDaemonPath) -and
  -not (Test-RecoverableMergePilotRuntimeOwner -Owner $ownerBefore)
) {
  $failures += "Default runtime port $Port is owned by unexpected process '$($ownerBefore.path)' (PID $($ownerBefore.id))."
}

$processesBefore = @(Get-MergePilotProcesses)
$launchedDesktop = $null
$trusted = $null
$ownerAfter = $null
$processesAfter = @()
$stoppedAfterRun = $false
$cleanupOwnedRun = $false

try {
  if ($failures.Count -eq 0) {
    if ($StopExistingMergePilotBeforeLaunch) {
      Stop-InstalledMergePilotProcesses
      $cleanupOwnedRun = $true
      Start-Sleep -Milliseconds 700
    }

    $launchedDesktop = Start-Process -FilePath $InstalledDesktopPath -PassThru
    $cleanupOwnedRun = $true
    $trusted = Wait-TrustedHealth -TcpPort $Port
    $ownerAfter = Get-ListeningProcessInfo -TcpPort $Port
    $processesAfter = @(Get-MergePilotProcesses)

    if (-not $trusted.ok) {
      $health = $trusted.health
      if ($health) {
        $failures += "Desktop runtime did not become trusted. Expected $ExpectedVersion/desktop-sidecar/$ExpectedVersion, got version '$($health.version)', mode '$($health.runtimeMode)', desktop '$($health.desktopVersion)'."
      } else {
        $failures += "Desktop runtime did not become healthy: $($trusted.lastError)"
      }
    }

    if (-not $ownerAfter) {
      $failures += "Default runtime port $Port had no owner after launching desktop."
    } elseif (-not (Test-SamePath -Left $ownerAfter.path -Right $InstalledDaemonPath)) {
      $failures += "Default runtime port $Port owner after launch is '$($ownerAfter.path)', expected '$InstalledDaemonPath'."
    }
  }
} finally {
  if ($cleanupOwnedRun -and -not $LeaveRunning) {
    Stop-InstalledMergePilotProcesses
    $stoppedAfterRun = $true
    Start-Sleep -Milliseconds 500
  }
}

$result = [pscustomobject]@{
  ok = $failures.Count -eq 0
  expectedVersion = $ExpectedVersion
  port = $Port
  installedDesktopPath = $InstalledDesktopPath
  installedDaemonPath = $InstalledDaemonPath
  desktopProductVersion = if ($desktopFile) { $desktopFile.VersionInfo.ProductVersion } else { $null }
  daemonProductVersion = if ($daemonFile) { $daemonFile.VersionInfo.ProductVersion } else { $null }
  ownerBefore = $ownerBefore
  ownerBeforeRecoverable = Test-RecoverableMergePilotRuntimeOwner -Owner $ownerBefore
  launchedDesktopPid = if ($launchedDesktop) { $launchedDesktop.Id } else { $null }
  trustedHealth = if ($trusted) { $trusted.health } else { $null }
  ownerAfter = $ownerAfter
  processesBefore = $processesBefore
  processesAfter = $processesAfter
  stoppedAfterRun = $stoppedAfterRun
  failures = $failures
}

$result | ConvertTo-Json -Depth 12
if ($failures.Count -gt 0) {
  exit 1
}
exit 0
