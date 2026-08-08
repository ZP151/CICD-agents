<#
.SYNOPSIS
Installed provenance gate (Phase 4 4a-3): binds source HEAD -> build
artifacts (MSI/sidecar) -> installation -> Program Files hashes -> installed
E2E in one evidence record.

.DESCRIPTION
The gate runs in up to two phases:

Phase A (no elevation required):
  1. Records the source HEAD SHA and tree-clean state.
  2. Builds the desktop bundle from HEAD (tauri build: icons + daemon
     sidecar + MSI/NSIS) unless -SkipBuild.
  3. Records artifact hashes: MSI, sidecar, and release binaries.
  4. Compares the installed package against the fresh artifacts. If the
     installed version differs (or -ForceInstall), it emits the elevation
     handoff command (msiexec install needs an elevated process) and exits
     with code 2 carrying a partial evidence record. Run the printed command
     once from an elevated PowerShell, then re-run this script.

Phase B (after the installed package matches the expected artifacts, or with
-SkipInstall):
  5. Verifies Program Files hashes against the MSI payload
     (verify-installed-windows-package-state.ps1 -RequireMsiPayloadMatch via
     run-installed-app-smoke.ps1 with -ExpectedDesktopBundleKind msi).
  6. Runs the installed E2E smoke: package shape, daemon health, auth/avatar,
     restart persistence, safety boundary, fresh-user first run, desktop
     runtime takeover.
  7. Runs the packaged vision smoke unless -SkipVision.
  8. Merges build + install + verify + smoke results into one evidence JSON:
     output/installed-provenance-<stamp>.json.

Exit codes: 0 = evidence record complete and all gates PASS; 1 = failure;
2 = build complete but the elevated install handoff is required (Phase A).

.EXAMPLE
.\scripts\windows\verify-installed-provenance.ps1
#>

param(
  [string]$ExpectedVersion = "",
  [string]$MsiPath = "",
  [string]$LogDir = "",
  [int]$PackageProbePort = 8798,
  [int]$PersistencePort = 8799,
  [int]$SafetyPort = 8800,
  [int]$VerifierSafetyPort = 8801,
  [int]$FreshUserPort = 8802,
  [int]$DefaultRuntimePort = 8787,
  [int]$VisionPort = 18945,
  [string]$InstalledDaemonPath = "C:\Program Files\MergePilot\mergepilot-daemon.exe",
  [string]$InstalledDesktopPath = "C:\Program Files\MergePilot\mergepilot-desktop.exe",
  [switch]$SkipBuild,
  [switch]$SkipInstall,
  [switch]$SkipVision,
  [switch]$ForceInstall
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location -LiteralPath $repoRoot.Path
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

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$buildLog = Join-Path $LogDir "installed-provenance-build-$stamp.log"
$smokeLog = Join-Path $LogDir "installed-provenance-smoke-$stamp.log"
$visionLog = Join-Path $LogDir "installed-provenance-vision-$stamp.log"
$evidencePath = Join-Path $LogDir "installed-provenance-$stamp.json"

function Get-Sha256 {
  param([string]$Path)

  # .NET directly, not Get-FileHash: on this machine the PSModulePath carries
  # a pwsh-7 Modules entry that breaks Windows PowerShell 5.1 module
  # autoloading for Microsoft.PowerShell.Utility (Get-FileHash fails with
  # CommandNotFoundException). .NET hashing is version-proof.
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join "")
  } finally {
    $sha.Dispose()
  }
}

function Get-FileSummary {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  $item = Get-Item -LiteralPath $Path
  return [pscustomobject]@{
    path = $item.FullName
    length = $item.Length
    lastWriteTime = $item.LastWriteTime.ToString("o")
    sha256 = Get-Sha256 -Path $item.FullName
  }
}

function Get-GitHead {
  $sha = (& git rev-parse HEAD 2>$null).Trim()
  $branch = (& git rev-parse --abbrev-ref HEAD 2>$null).Trim()
  $porcelain = (& git status --porcelain 2>$null)
  return [pscustomobject]@{
    sha = $sha
    branch = $branch
    treeClean = ($null -eq $porcelain -or $porcelain.Count -eq 0)
    dirtyFiles = @($porcelain)
  }
}

function Get-InstalledSummary {
  $entries = @()
  foreach ($root in @(
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
  )) {
    foreach ($item in Get-ChildItem $root -ErrorAction SilentlyContinue) {
      $props = Get-ItemProperty -LiteralPath $item.PSPath -ErrorAction SilentlyContinue
      if ($props.DisplayName -like "*MergePilot*" -or $props.DisplayName -like "*CICD*") {
        $entries += [pscustomobject]@{
          displayName = $props.DisplayName
          displayVersion = $props.DisplayVersion
          installLocation = $props.InstallLocation
          windowsInstaller = $props.WindowsInstaller
        }
      }
    }
  }
  $installedVersions = @($entries | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.displayVersion) } | Select-Object -ExpandProperty displayVersion -Unique)
  return [pscustomobject]@{
    entries = $entries
    installedVersions = $installedVersions
    matchesExpected = $installedVersions.Count -eq 1 -and $installedVersions[0] -eq $ExpectedVersion
    installedDaemon = Get-FileSummary -Path $InstalledDaemonPath
    installedDesktop = Get-FileSummary -Path $InstalledDesktopPath
  }
}

function Invoke-ChildPowershell {
  param(
    [string]$ScriptPath,
    [string[]]$Arguments,
    [string]$LogPath
  )

  # Native stderr lines (cargo/vite warnings) must not become terminating
  # errors under $ErrorActionPreference = "Stop"; rely on $LASTEXITCODE.
  try {
    $ErrorActionPreference = "Continue"
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments *> $LogPath
  } finally {
    $ErrorActionPreference = "Stop"
  }
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

# ---------------------------------------------------------------------------
# Phase A: source HEAD + build + artifact hashes
# ---------------------------------------------------------------------------
$head = Get-GitHead

$build = $null
if (-not $SkipBuild) {
  Write-Host "[provenance] building desktop bundle from HEAD $($head.sha) ..."
  $build = Invoke-ChildPowershell -ScriptPath (Join-Path $PSScriptRoot "pnpm-project.ps1") `
    -Arguments @("--filter", "@mergepilot/desktop", "run", "tauri:build") -LogPath $buildLog
  if ($build.exitCode -ne 0) {
    $record = [pscustomobject]@{
      ok = $false
      phase = "build"
      head = $head
      expectedVersion = $ExpectedVersion
      msiPath = $MsiPath
      failures = @("tauri build failed (exit $($build.exitCode)). See $buildLog.")
    }
    $record | ConvertTo-Json -Depth 6
    exit 1
  }
}

$msiSummary = Get-FileSummary -Path $MsiPath
if (-not $msiSummary) {
  $record = [pscustomobject]@{
    ok = $false
    phase = "build"
    head = $head
    expectedVersion = $ExpectedVersion
    failures = @("MSI not found after build: $MsiPath. Run '.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run tauri:build' first, or pass -SkipBuild.")
  }
  $record | ConvertTo-Json -Depth 6
  exit 1
}

$sidecar = Get-ChildItem -LiteralPath (Join-Path $repoRoot "apps\desktop\src-tauri\binaries") -Filter "mergepilot-daemon-*" -ErrorAction SilentlyContinue | Select-Object -First 1
$releaseDaemon = Get-FileSummary -Path (Join-Path $repoRoot "apps\desktop\src-tauri\target\release\mergepilot-daemon.exe")
$releaseDesktop = Get-FileSummary -Path (Join-Path $repoRoot "apps\desktop\src-tauri\target\release\mergepilot-desktop.exe")

$artifacts = [pscustomobject]@{
  msi = $msiSummary
  sidecar = if ($sidecar) { Get-FileSummary -Path $sidecar.FullName } else { $null }
  releaseDaemon = $releaseDaemon
  releaseDesktop = $releaseDesktop
}

# ---------------------------------------------------------------------------
# Phase A/B boundary: installed state
# ---------------------------------------------------------------------------
$installed = Get-InstalledSummary

if (-not $SkipInstall -and (-not $installed.matchesExpected -or $ForceInstall)) {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    $resolvedMsiPath = (Resolve-Path $MsiPath).Path
    $installScript = Join-Path $PSScriptRoot "install-and-verify-msi-state.ps1"
    $handoffCommand = "powershell -NoProfile -ExecutionPolicy Bypass -Command `"Set-Location -LiteralPath '$(($repoRoot.Path).Replace("'", "''"))'; & '$(($installScript).Replace("'", "''"))' -ExpectedVersion $ExpectedVersion -MsiPath '$(($resolvedMsiPath).Replace("'", "''"))'`""
    $record = [pscustomobject]@{
      ok = $false
      phase = "install-handoff"
      requiresElevation = $true
      head = $head
      expectedVersion = $ExpectedVersion
      msiPath = $resolvedMsiPath
      build = $build
      artifacts = $artifacts
      installed = $installed
      handoffCommand = $handoffCommand
      message = "Installed package is not the HEAD-built artifact. Run the handoffCommand once from an elevated PowerShell (it closes MergePilot processes, installs the MSI, verifies Program Files hashes against the MSI payload, and runs the installed smoke + vision), then re-run this script to complete the evidence record."
      evidencePath = $evidencePath
    }
    $record | ConvertTo-Json -Depth 8
    exit 2
  }
  # Elevated: install directly (the install script itself closes MergePilot
  # processes, installs, verifies payload match, runs installed smoke + vision).
  $installScript = Join-Path $PSScriptRoot "install-and-verify-msi-state.ps1"
  $installResult = Invoke-ChildPowershell -ScriptPath $installScript `
    -Arguments @("-ExpectedVersion", $ExpectedVersion, "-MsiPath", (Resolve-Path $MsiPath).Path) -LogPath $smokeLog
  $installSummary = Get-JsonLogOrNull -LogPath $smokeLog
  if ($installResult.exitCode -ne 0) {
    $record = [pscustomobject]@{
      ok = $false
      phase = "install"
      head = $head
      expectedVersion = $ExpectedVersion
      msiPath = (Resolve-Path $MsiPath).Path
      failures = @("Elevated install+verify failed (exit $($installResult.exitCode)). See $smokeLog.")
      installSummary = $installSummary
    }
    $record | ConvertTo-Json -Depth 8
    exit 1
  }
  $installed = Get-InstalledSummary
}

# ---------------------------------------------------------------------------
# Phase B: payload match + installed E2E smoke + vision
# ---------------------------------------------------------------------------
if (-not $installed.matchesExpected) {
  $record = [pscustomobject]@{
    ok = $false
    phase = "installed-state"
    head = $head
    expectedVersion = $ExpectedVersion
    installed = $installed
    failures = @("Installed version $($installed.installedVersions -join ',') does not match expected $ExpectedVersion. Run the install handoff first.")
  }
  $record | ConvertTo-Json -Depth 6
  exit 1
}

$smokeArgs = @(
  "-ExpectedVersion", $ExpectedVersion,
  "-ExpectedDesktopBundleKind", "msi",
  "-MsiPath", (Resolve-Path $MsiPath).Path,
  "-PackageProbePort", [string]$PackageProbePort,
  "-PersistencePort", [string]$PersistencePort,
  "-SafetyPort", [string]$SafetyPort,
  "-VerifierSafetyPort", [string]$VerifierSafetyPort,
  "-FreshUserPort", [string]$FreshUserPort,
  "-DefaultRuntimePort", [string]$DefaultRuntimePort,
  "-InstalledDaemonPath", $InstalledDaemonPath,
  "-InstalledDesktopPath", $InstalledDesktopPath
)
$smoke = Invoke-ChildPowershell -ScriptPath (Join-Path $PSScriptRoot "run-installed-app-smoke.ps1") -Arguments $smokeArgs -LogPath $smokeLog
$smokeSummary = Get-JsonLogOrNull -LogPath $smokeLog

$vision = $null
$visionSummary = $null
$visionSkippedReason = $null
if ($SkipVision) {
  $visionSkippedReason = "Skipped by -SkipVision."
} elseif ($smoke.exitCode -ne 0) {
  $visionSkippedReason = "Skipped because the installed smoke failed."
} else {
  $vision = Invoke-ChildPowershell -ScriptPath (Join-Path $PSScriptRoot "packaged-live-vision-smoke.ps1") `
    -Arguments @("-Port", [string]$VisionPort, "-SidecarPath", $InstalledDaemonPath) -LogPath $visionLog
  $visionSummary = Get-JsonLogOrNull -LogPath $visionLog
}

# Supplementary: if the elevation handoff ran install-and-verify-msi-state.ps1
# (non-elevated runs of this script cannot see that run), merge its evidence
# record for the chain build -> install -> verify -> smoke.
$elevatedInstallVerify = Get-JsonLogOrNull -LogPath (Join-Path $LogDir "install-verify-mergepilot-$ExpectedVersion.json")

# ---------------------------------------------------------------------------
# Evidence record
# ---------------------------------------------------------------------------
$failures = @()
if (-not $installed.matchesExpected) {
  $failures += "Installed version does not match expected $ExpectedVersion."
}
if ($smoke.exitCode -ne 0) {
  $failures += "Installed E2E smoke failed (exit $($smoke.exitCode)). See $smokeLog."
}
if ($vision -and $vision.exitCode -ne 0) {
  $failures += "Vision smoke failed (exit $($vision.exitCode)). See $visionLog."
}

$record = [pscustomobject]@{
  ok = $failures.Count -eq 0
  gate = "installed-desktop-provenance"
  phase = "complete"
  head = $head
  expectedVersion = $ExpectedVersion
  msiPath = (Resolve-Path $MsiPath).Path
  build = $build
  artifacts = $artifacts
  installed = $installed
  payloadMatchRequired = $true
  smoke = [pscustomobject]@{
    exitCode = $smoke.exitCode
    logPath = $smokeLog
    summary = $smokeSummary
  }
  elevatedInstallVerify = $elevatedInstallVerify
  vision = [pscustomobject]@{
    exitCode = if ($vision) { $vision.exitCode } else { $null }
    logPath = if ($vision) { $visionLog } else { $null }
    skippedReason = $visionSkippedReason
    summary = $visionSummary
  }
  failures = $failures
  evidencePath = $evidencePath
}
$record | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $evidencePath -Encoding UTF8
$record | ConvertTo-Json -Depth 10

if ($failures.Count -gt 0) {
  exit 1
}
exit 0
