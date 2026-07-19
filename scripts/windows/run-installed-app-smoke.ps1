<#
.SYNOPSIS
Runs the installed MergePilot smoke gate against the current Program Files app.

.DESCRIPTION
This wrapper verifies the already-installed Windows app without installing a
new package. It covers package shape, legacy cleanup, daemon health, auth/avatar
state, restart persistence, fresh-user first-run config, and the safety boundary
that prevents lifecycle tests from controlling unrelated port owners. When the
expected install shape is MSI, the package-state gate also verifies the
installed desktop and daemon hashes against the local MSI payload.

.EXAMPLE
.\scripts\windows\run-installed-app-smoke.ps1 -ExpectedVersion 0.5.22 -ExpectedDesktopBundleKind nsis
#>

param(
  [string]$ExpectedVersion = "",
  [ValidateSet("any", "msi", "nsis")]
  [string]$ExpectedDesktopBundleKind = "any",
  [int]$PackageProbePort = 8798,
  [int]$PersistencePort = 8799,
  [int]$SafetyPort = 8800,
  [int]$VerifierSafetyPort = 8801,
  [int]$FreshUserPort = 8802,
  [int]$DefaultRuntimePort = 8787,
  [string]$InstalledDaemonPath = "C:\Program Files\MergePilot\mergepilot-daemon.exe",
  [string]$InstalledDesktopPath = "C:\Program Files\MergePilot\mergepilot-desktop.exe",
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
$freshUserLog = Join-Path $LogDir "installed-app-fresh-user-$stamp.log"
$desktopRuntimeLog = Join-Path $LogDir "installed-app-desktop-runtime-$stamp.log"

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
  $cimProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue
  return [pscustomobject]@{
    id = $process.Id
    path = [string]$process.Path
    commandLine = if ($cimProcess) { [string]$cimProcess.CommandLine } else { $null }
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

function Get-JsonLogOrNull {
  param([string]$LogPath)

  if ([string]::IsNullOrWhiteSpace($LogPath) -or -not (Test-Path -LiteralPath $LogPath)) {
    return $null
  }

  $text = (Get-Content -LiteralPath $LogPath -Raw -ErrorAction SilentlyContinue).Trim()
  if ([string]::IsNullOrWhiteSpace($text)) {
    return $null
  }

  $jsonStart = $text.IndexOf("{")
  $jsonEnd = $text.LastIndexOf("}")
  if ($jsonStart -lt 0 -or $jsonEnd -lt $jsonStart) {
    return $null
  }

  try {
    return $text.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json
  } catch {
    return $null
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

function Test-HealthMetadata {
  param([object]$Health)

  $names = @($Health.PSObject.Properties | ForEach-Object { $_.Name })
  $missing = @()
  foreach ($name in @("runtimeMode", "desktopVersion", "pid", "execPath")) {
    if ($names -notcontains $name) {
      $missing += $name
    }
  }
  return $missing
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
$freshUserResult = $null
$desktopRuntimeResult = $null
$desktopRuntimeSummary = $null
$defaultRuntimeOwner = $null
$failures = @()

try {
  $defaultRuntimeOwner = Get-PortOwnerPath -Port $DefaultRuntimePort
  if (
    $defaultRuntimeOwner -and
    -not (Test-SamePath -Left $defaultRuntimeOwner.path -Right $InstalledDaemonPath) -and
    -not (Test-RecoverableMergePilotRuntimeOwner -Owner $defaultRuntimeOwner)
  ) {
    $failures += "Default runtime port $DefaultRuntimePort is owned by an unexpected process '$($defaultRuntimeOwner.path)' (PID $($defaultRuntimeOwner.id)). The installed desktop would connect to the wrong daemon."
  }

  $packageProbe = Start-OwnedInstalledDaemon -Port $PackageProbePort
  if ($packageProbe.health.version -ne $ExpectedVersion) {
    $failures += "Package probe daemon version is '$($packageProbe.health.version)', expected '$ExpectedVersion'."
  }
  $missingHealthMetadata = @(Test-HealthMetadata -Health $packageProbe.health)
  if ($missingHealthMetadata.Count -gt 0) {
    $failures += "Package probe daemon /healthz is missing runtime metadata fields: $($missingHealthMetadata -join ', ')."
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

$freshUserArgs = @(
  "-ExpectedVersion", $ExpectedVersion,
  "-Port", [string]$FreshUserPort,
  "-InstalledDaemonPath", $InstalledDaemonPath
)
$freshUserResult = Invoke-Script -ScriptPath (Join-Path $PSScriptRoot "installed-fresh-user-smoke.ps1") -Arguments $freshUserArgs -LogPath $freshUserLog
if ($freshUserResult.exitCode -ne 0) {
  $failures += "Installed fresh-user smoke failed. See $freshUserLog."
}

$desktopRuntimeArgs = @(
  "-ExpectedVersion", $ExpectedVersion,
  "-Port", [string]$DefaultRuntimePort,
  "-InstalledDesktopPath", $InstalledDesktopPath,
  "-InstalledDaemonPath", $InstalledDaemonPath,
  "-StopExistingMergePilotBeforeLaunch"
)
$desktopRuntimeResult = Invoke-Script -ScriptPath (Join-Path $PSScriptRoot "verify-installed-desktop-runtime-takeover.ps1") -Arguments $desktopRuntimeArgs -LogPath $desktopRuntimeLog
$desktopRuntimeSummary = Get-JsonLogOrNull -LogPath $desktopRuntimeLog
if ($desktopRuntimeResult.exitCode -ne 0) {
  $failures += "Installed desktop runtime takeover smoke failed. See $desktopRuntimeLog."
}

$openPorts = @()
foreach ($port in @($PackageProbePort, $PersistencePort, $SafetyPort, $VerifierSafetyPort, $FreshUserPort)) {
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
    freshUser = $FreshUserPort
    defaultRuntime = $DefaultRuntimePort
    openAfterRun = $openPorts
  }
  defaultRuntimeOwner = $defaultRuntimeOwner
  packageProbe = [pscustomobject]@{
    started = $null -ne $packageProbe
    daemonVersion = if ($packageProbe) { $packageProbe.health.version } else { $null }
    runtimeMode = if ($packageProbe) { $packageProbe.health.runtimeMode } else { $null }
    runtimeModeContext = "direct daemon probe; desktop-sidecar ownership is verified by desktopRuntime"
    desktopVersion = if ($packageProbe) { $packageProbe.health.desktopVersion } else { $null }
    pid = if ($packageProbe) { $packageProbe.health.pid } else { $null }
    execPath = if ($packageProbe) { $packageProbe.health.execPath } else { $null }
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
  freshUser = [pscustomobject]@{
    exitCode = $freshUserResult.exitCode
    logPath = $freshUserLog
  }
  desktopRuntime = [pscustomobject]@{
    exitCode = $desktopRuntimeResult.exitCode
    logPath = $desktopRuntimeLog
    trustedVersion = if ($desktopRuntimeSummary -and $desktopRuntimeSummary.trustedHealth) { $desktopRuntimeSummary.trustedHealth.version } else { $null }
    runtimeMode = if ($desktopRuntimeSummary -and $desktopRuntimeSummary.trustedHealth) { $desktopRuntimeSummary.trustedHealth.runtimeMode } else { $null }
    desktopVersion = if ($desktopRuntimeSummary -and $desktopRuntimeSummary.trustedHealth) { $desktopRuntimeSummary.trustedHealth.desktopVersion } else { $null }
    ownerAfterPath = if ($desktopRuntimeSummary -and $desktopRuntimeSummary.ownerAfter) { $desktopRuntimeSummary.ownerAfter.path } else { $null }
    ownerBeforeRecoverable = if ($desktopRuntimeSummary) { $desktopRuntimeSummary.ownerBeforeRecoverable } else { $null }
  }
  failures = $failures
}

$result | ConvertTo-Json -Depth 8
if ($failures.Count -gt 0) {
  exit 1
}
exit 0
