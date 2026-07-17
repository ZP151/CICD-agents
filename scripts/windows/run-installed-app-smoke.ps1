<#
.SYNOPSIS
Runs the installed MergePilot smoke gate against the current Program Files app.

.DESCRIPTION
This wrapper verifies the already-installed Windows app without installing a
new package. It covers package shape, legacy cleanup, daemon health, auth/avatar
state, restart persistence, and the safety boundary that prevents lifecycle
tests from controlling unrelated port owners. When the expected install shape is
MSI, the package-state gate also verifies the installed desktop and daemon
hashes against the local MSI payload.

.EXAMPLE
.\scripts\windows\run-installed-app-smoke.ps1 -ExpectedVersion 0.5.20 -ExpectedDesktopBundleKind nsis
#>

param(
  [string]$ExpectedVersion = "",
  [ValidateSet("any", "msi", "nsis")]
  [string]$ExpectedDesktopBundleKind = "any",
  [int]$PackageProbePort = 8798,
  [int]$PersistencePort = 8799,
  [int]$SafetyPort = 8800,
  [int]$VerifierSafetyPort = 8801,
  [string]$InstalledDaemonPath = "C:\Program Files\MergePilot\mergepilot-daemon.exe",
  [string]$MsiPath = "",
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
$packageLog = Join-Path $LogDir "installed-app-package-state-$stamp.log"
$persistenceLog = Join-Path $LogDir "installed-app-persistence-$stamp.log"
$safetyLog = Join-Path $LogDir "installed-app-safety-$stamp.log"
$verifierSafetyLog = Join-Path $LogDir "installed-app-verifier-safety-$stamp.log"

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

function Wait-Health {
  param(
    [int]$Port,
    [int]$Seconds = 30
  )

  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/healthz" -TimeoutSec 2
      if ($health.ok) {
        return $health
      }
    } catch {}
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  throw "Installed daemon did not become healthy on port $Port."
}

function Get-PortOwnerPath {
  param([int]$Port)

  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $connection) {
    return $null
  }
  $process = Get-Process -Id $connection.OwningProcess -ErrorAction Stop
  return [pscustomobject]@{
    id = $process.Id
    path = [string]$process.Path
  }
}

function Start-OwnedInstalledDaemon {
  param([int]$Port)

  $owner = Get-PortOwnerPath -Port $Port
  if ($owner) {
    throw "Port $Port is already in use by '$($owner.path)' (PID $($owner.id))."
  }
  $process = Start-Process -FilePath $InstalledDaemonPath -ArgumentList "--port", "$Port" -WindowStyle Hidden -PassThru
  $health = Wait-Health -Port $Port -Seconds 30
  return [pscustomobject]@{
    process = $process
    health = $health
  }
}

function Stop-OwnedInstalledDaemon {
  param(
    [int]$Port,
    [int]$ProcessId
  )

  try {
    $owner = Get-PortOwnerPath -Port $Port
    if ($owner -and $owner.id -eq $ProcessId -and $owner.path -eq $InstalledDaemonPath) {
      Stop-Process -Id $ProcessId -Force -ErrorAction Stop
      return $true
    }
    return $null -eq $owner
  } catch {
    return "error: $($_.Exception.Message)"
  }
}

function Invoke-Script {
  param(
    [string]$ScriptPath,
    [string[]]$Arguments,
    [string]$LogPath
  )

  powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments *> $LogPath
  return [pscustomobject]@{
    exitCode = $LASTEXITCODE
    logPath = $LogPath
  }
}

function Test-VersionLessThan {
  param(
    [string]$Left,
    [string]$Right
  )

  try {
    return ([version]$Left) -lt ([version]$Right)
  } catch {
    return $false
  }
}

if (-not (Test-Path -LiteralPath $InstalledDaemonPath)) {
  throw "Installed daemon not found: $InstalledDaemonPath"
}

$packageProbe = $null
$packageDaemonStopped = $null
$packageResult = $null
$persistenceResult = $null
$safetyResult = $null
$verifierSafetyResult = $null
$failures = @()

try {
  $packageProbe = Start-OwnedInstalledDaemon -Port $PackageProbePort
  if ($packageProbe.health.version -ne $ExpectedVersion) {
    $failures += "Package probe daemon version is '$($packageProbe.health.version)', expected '$ExpectedVersion'."
  }

  $packageArgs = @(
    "-ExpectedVersion", $ExpectedVersion,
    "-ExpectedDesktopBundleKind", $ExpectedDesktopBundleKind,
    "-RequireLegacyCleanup",
    "-ProbeDaemon",
    "-ProbeAuth",
    "-RequireAvatar",
    "-Port", [string]$PackageProbePort
  )
  if (-not [string]::IsNullOrWhiteSpace($MsiPath)) {
    $packageArgs += @("-MsiPath", $MsiPath)
  }
  if ($ExpectedDesktopBundleKind -eq "msi") {
    $packageArgs += "-RequireMsiPayloadMatch"
  }
  $packageResult = Invoke-Script -ScriptPath (Join-Path $PSScriptRoot "verify-installed-windows-package-state.ps1") -Arguments $packageArgs -LogPath $packageLog
  if ($packageResult.exitCode -ne 0) {
    $failures += "Installed package-state verifier failed. See $packageLog."
  }
} finally {
  if ($packageProbe) {
    $packageDaemonStopped = Stop-OwnedInstalledDaemon -Port $PackageProbePort -ProcessId $packageProbe.process.Id
  }
}

$persistenceArgs = @(
  "-ExpectedVersion", $ExpectedVersion,
  "-Port", [string]$PersistencePort
)
if (Test-VersionLessThan $ExpectedVersion "0.5.21") {
  $persistenceArgs += "-SkipNullSessionProbe"
}
$persistenceResult = Invoke-Script -ScriptPath (Join-Path $PSScriptRoot "installed-restart-persistence-smoke.ps1") -Arguments $persistenceArgs -LogPath $persistenceLog
if ($persistenceResult.exitCode -ne 0) {
  $failures += "Installed restart persistence smoke failed. See $persistenceLog."
}

$safetyArgs = @(
  "-ExpectedVersion", $ExpectedVersion,
  "-Port", [string]$SafetyPort
)
$safetyResult = Invoke-Script -ScriptPath (Join-Path $PSScriptRoot "installed-restart-persistence-safety-smoke.ps1") -Arguments $safetyArgs -LogPath $safetyLog
if ($safetyResult.exitCode -ne 0) {
  $failures += "Installed restart persistence safety smoke failed. See $safetyLog."
}

$verifierSafetyArgs = @(
  "-ExpectedVersion", $ExpectedVersion,
  "-Port", [string]$VerifierSafetyPort
)
$verifierSafetyResult = Invoke-Script -ScriptPath (Join-Path $PSScriptRoot "verify-installed-msi-state-safety-smoke.ps1") -Arguments $verifierSafetyArgs -LogPath $verifierSafetyLog
if ($verifierSafetyResult.exitCode -ne 0) {
  $failures += "Installed verifier safety smoke failed. See $verifierSafetyLog."
}

$openPorts = @()
foreach ($port in @($PackageProbePort, $PersistencePort, $SafetyPort, $VerifierSafetyPort)) {
  if (Test-TcpPortOpen -TcpPort $port) {
    $openPorts += $port
  }
}
if ($openPorts.Count -gt 0) {
  $failures += "Ports remained open after installed-app smoke: $($openPorts -join ', ')."
}

$result = [pscustomobject]@{
  ok = $failures.Count -eq 0
  expectedVersion = $ExpectedVersion
  expectedDesktopBundleKind = $ExpectedDesktopBundleKind
  installedDaemonPath = $InstalledDaemonPath
  msiPath = if ([string]::IsNullOrWhiteSpace($MsiPath)) { $null } else { $MsiPath }
  requireMsiPayloadMatch = $ExpectedDesktopBundleKind -eq "msi"
  ports = [pscustomobject]@{
    packageProbe = $PackageProbePort
    persistence = $PersistencePort
    safety = $SafetyPort
    verifierSafety = $VerifierSafetyPort
    openAfterRun = $openPorts
  }
  packageProbe = [pscustomobject]@{
    started = $null -ne $packageProbe
    daemonVersion = if ($packageProbe) { $packageProbe.health.version } else { $null }
    daemonStopped = $packageDaemonStopped
    exitCode = if ($packageResult) { $packageResult.exitCode } else { $null }
    logPath = $packageLog
  }
  persistence = [pscustomobject]@{
    exitCode = $persistenceResult.exitCode
    logPath = $persistenceLog
  }
  safety = [pscustomobject]@{
    exitCode = $safetyResult.exitCode
    logPath = $safetyLog
  }
  verifierSafety = [pscustomobject]@{
    exitCode = $verifierSafetyResult.exitCode
    logPath = $verifierSafetyLog
  }
  failures = $failures
}

$result | ConvertTo-Json -Depth 8
if ($failures.Count -gt 0) {
  exit 1
}
exit 0
