param(
  [string]$MsiPath = "",
  [string]$ExpectedVersion = "",
  [int]$Port = 8787,
  [int]$VisionPort = 18945,
  [switch]$SkipInstall,
  [switch]$SkipVision,
  [string]$LogDir = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
  $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "apps\desktop\package.json") -Raw | ConvertFrom-Json).version
}
if ([string]::IsNullOrWhiteSpace($MsiPath)) {
  $MsiPath = Join-Path $repoRoot "apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_$($ExpectedVersion)_x64_en-US.msi"
}
if ([string]::IsNullOrWhiteSpace($LogDir)) {
  $LogDir = Join-Path $repoRoot "output\live-e2e"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Stop-MergePilotProcesses {
  Get-Process mergepilot-desktop, mergepilot-daemon -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
}

function Wait-Health {
  param([int]$RuntimePort)

  $baseUrl = "http://127.0.0.1:$RuntimePort"
  for ($i = 0; $i -lt 60; $i++) {
    try {
      return Invoke-RestMethod -Uri "$baseUrl/healthz" -Method Get -TimeoutSec 2
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  throw "Installed daemon did not become healthy on $baseUrl."
}

function Invoke-PowerShellFile {
  param(
    [string]$ScriptPath,
    [string[]]$ScriptArguments
  )

  $command = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $ScriptPath
  ) + $ScriptArguments

  $shell = Get-Command pwsh -ErrorAction SilentlyContinue
  if (-not $shell) {
    $shell = Get-Command powershell.exe
  }
  $output = & $shell.Source @command 2>&1
  return [pscustomobject]@{
    exitCode = $LASTEXITCODE
    output = @($output)
  }
}

$isAdmin = Test-IsAdministrator
$installLog = Join-Path $LogDir "install-mergepilot-$ExpectedVersion-msi.log"
$verifyLog = Join-Path $LogDir "install-verify-mergepilot-$ExpectedVersion.json"
$visionLog = Join-Path $LogDir "install-vision-mergepilot-$ExpectedVersion.json"
$daemonPath = "C:\Program Files\MergePilot\mergepilot-daemon.exe"

if (-not (Test-Path -LiteralPath $MsiPath)) {
  throw "MSI not found: $MsiPath. Run .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run tauri:build first."
}

if (-not $SkipInstall -and -not $isAdmin) {
  [pscustomobject]@{
    ok = $false
    requiresElevation = $true
    expectedVersion = $ExpectedVersion
    msiPath = (Resolve-Path $MsiPath).Path
    message = "Run this script from an elevated PowerShell, or install the MSI as administrator and rerun with -SkipInstall."
  } | ConvertTo-Json -Depth 6
  exit 1
}

$installResult = $null
if (-not $SkipInstall) {
  Stop-MergePilotProcesses
  $process = Start-Process -FilePath msiexec.exe -ArgumentList @(
    "/i",
    (Resolve-Path $MsiPath).Path,
    "/qn",
    "/norestart",
    "/L*v",
    $installLog
  ) -Wait -PassThru

  $installResult = [pscustomobject]@{
    exitCode = $process.ExitCode
    logPath = $installLog
  }
  if ($process.ExitCode -ne 0) {
    throw "MSI install failed with exit code $($process.ExitCode). See $installLog."
  }
}

if (-not (Test-Path -LiteralPath $daemonPath)) {
  throw "Installed daemon was not found after install: $daemonPath"
}

Stop-Process -Id @(
  Get-NetTCPConnection -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -eq $Port } |
    Select-Object -ExpandProperty OwningProcess -Unique
) -Force -ErrorAction SilentlyContinue

Start-Process -FilePath $daemonPath -ArgumentList @("--port", [string]$Port) -WindowStyle Hidden | Out-Null
$health = Wait-Health -RuntimePort $Port

$verifyArgs = @(
  "-ExpectedVersion", $ExpectedVersion,
  "-MsiPath", (Resolve-Path $MsiPath).Path,
  "-Port", [string]$Port,
  "-ProbeDaemon",
  "-ProbeAuth",
  "-RequireAvatar",
  "-RequireMsiPayloadMatch",
  "-RequireLegacyCleanup"
)
$verifyResult = Invoke-PowerShellFile -ScriptPath (Join-Path $PSScriptRoot "verify-installed-msi-state.ps1") -ScriptArguments $verifyArgs
$verifyExitCode = $verifyResult.exitCode
Set-Content -LiteralPath $verifyLog -Value ($verifyResult.output -join [Environment]::NewLine) -Encoding UTF8

$visionExitCode = 0
if (-not $SkipVision) {
  $visionArgs = @(
    "-Port", [string]$VisionPort,
    "-SidecarPath", $daemonPath
  )
  $visionResult = Invoke-PowerShellFile -ScriptPath (Join-Path $PSScriptRoot "packaged-live-vision-smoke.ps1") -ScriptArguments $visionArgs
  $visionExitCode = $visionResult.exitCode
  Set-Content -LiteralPath $visionLog -Value ($visionResult.output -join [Environment]::NewLine) -Encoding UTF8
}

$ok = $verifyExitCode -eq 0 -and ($SkipVision -or $visionExitCode -eq 0)
$result = [pscustomobject]@{
  ok = $ok
  expectedVersion = $ExpectedVersion
  isAdministrator = $isAdmin
  skippedInstall = [bool]$SkipInstall
  skippedVision = [bool]$SkipVision
  msiPath = (Resolve-Path $MsiPath).Path
  install = $installResult
  health = $health
  verifyExitCode = $verifyExitCode
  verifyLog = $verifyLog
  visionExitCode = if ($SkipVision) { $null } else { $visionExitCode }
  visionLog = if ($SkipVision) { $null } else { $visionLog }
}

$result | ConvertTo-Json -Depth 8
if (-not $ok) {
  exit 1
}
