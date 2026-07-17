param(
  [string]$ExpectedVersion = "",
  [ValidateSet("any", "msi", "nsis")]
  [string]$ExpectedDesktopBundleKind = "any",
  [switch]$RequireLegacyCleanup,
  [switch]$ProbeDaemon,
  [switch]$ProbeAuth,
  [switch]$RequireAvatar,
  [switch]$RequireMsiPayloadMatch,
  [string]$MsiPath = "",
  [string]$NsisSetupPath = "",
  [switch]$RequireNsisSetupAsset,
  [int]$Port = 8787
)

$ErrorActionPreference = "Stop"

if ($RequireMsiPayloadMatch -and $ExpectedDesktopBundleKind -eq "nsis") {
  throw "-RequireMsiPayloadMatch cannot be combined with -ExpectedDesktopBundleKind nsis."
}
if ($RequireNsisSetupAsset -and $ExpectedDesktopBundleKind -eq "msi") {
  throw "-RequireNsisSetupAsset cannot be combined with -ExpectedDesktopBundleKind msi."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
  $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "packages\daemon\package.json") -Raw | ConvertFrom-Json).version
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

function Get-Sha256OrNull([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
}

function Test-AsciiContains {
  param(
    [string]$Path,
    [string]$Needle
  )

  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
    return $false
  }
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $text = [System.Text.Encoding]::ASCII.GetString($bytes)
  return $text.Contains($Needle)
}

function Get-SetupMetadataOrNull([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) {
    return $null
  }
  if (-not (Test-Path -LiteralPath $Path)) {
    return [pscustomobject]@{
      path = $Path
      exists = $false
    }
  }

  $item = Get-Item -LiteralPath $Path
  $signature = Get-AuthenticodeSignature -FilePath $item.FullName
  return [pscustomobject]@{
    path = $item.FullName
    exists = $true
    length = $item.Length
    lastWriteTime = $item.LastWriteTime
    sha256 = Get-Sha256OrNull $item.FullName
    productVersion = $item.VersionInfo.ProductVersion
    fileVersion = $item.VersionInfo.FileVersion
    productName = $item.VersionInfo.ProductName
    fileDescription = $item.VersionInfo.FileDescription
    hasNullsoftMarker = Test-AsciiContains -Path $item.FullName -Needle "Nullsoft"
    signatureStatus = [string]$signature.Status
    signatureStatusMessage = $signature.StatusMessage
    signerSubject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
  }
}

$verifyArgs = @(
  "-ExpectedVersion", $ExpectedVersion,
  "-Port", [string]$Port
)
if (-not [string]::IsNullOrWhiteSpace($MsiPath)) {
  $verifyArgs += @("-MsiPath", $MsiPath)
}
if ($RequireLegacyCleanup) {
  $verifyArgs += "-RequireLegacyCleanup"
}
if ($ProbeDaemon) {
  $verifyArgs += "-ProbeDaemon"
}
if ($ProbeAuth) {
  $verifyArgs += "-ProbeAuth"
}
if ($RequireAvatar) {
  $verifyArgs += "-RequireAvatar"
}
if ($RequireMsiPayloadMatch) {
  $verifyArgs += "-RequireMsiPayloadMatch"
}

$verifyResult = Invoke-PowerShellFile -ScriptPath (Join-Path $PSScriptRoot "verify-installed-msi-state.ps1") -ScriptArguments $verifyArgs
$rawOutput = ($verifyResult.output -join [Environment]::NewLine).Trim()
$baseResult = $null
try {
  $baseResult = $rawOutput | ConvertFrom-Json
} catch {
  [pscustomobject]@{
    ok = $false
    expectedVersion = $ExpectedVersion
    expectedDesktopBundleKind = $ExpectedDesktopBundleKind
    verifyExitCode = $verifyResult.exitCode
    failures = @("Could not parse verify-installed-msi-state.ps1 JSON output: $($_.Exception.Message)")
    rawOutput = $rawOutput
  } | ConvertTo-Json -Depth 12
  exit 1
}

$failures = @()
if ($verifyResult.exitCode -ne 0 -and $baseResult.failures) {
  $failures += @($baseResult.failures)
} elseif ($verifyResult.exitCode -ne 0) {
  $failures += "verify-installed-msi-state.ps1 exited with code $($verifyResult.exitCode)."
}

$actualDesktopBundleKind = $baseResult.installedBundleKind.desktop
$uninstallPresent = $null -ne $baseResult.installedFiles.uninstall

if ($ExpectedDesktopBundleKind -ne "any" -and $actualDesktopBundleKind -ne $ExpectedDesktopBundleKind) {
  $failures += "Installed mergepilot-desktop.exe bundle kind is '$actualDesktopBundleKind', expected '$ExpectedDesktopBundleKind'."
}

if ($ExpectedDesktopBundleKind -eq "nsis" -and -not $uninstallPresent) {
  $failures += "Expected NSIS uninstall.exe to be present for an NSIS install shape."
}

if ($ExpectedDesktopBundleKind -eq "msi" -and $uninstallPresent) {
  $failures += "NSIS uninstall.exe is present while MSI install shape was expected."
}

$nsisSetup = Get-SetupMetadataOrNull $NsisSetupPath
if ($RequireNsisSetupAsset -and -not $nsisSetup) {
  $failures += "NSIS setup asset was required but -NsisSetupPath was not provided."
}
if ($RequireNsisSetupAsset -and $nsisSetup -and -not $nsisSetup.exists) {
  $failures += "NSIS setup asset was not found: $($nsisSetup.path)"
}
if ($nsisSetup -and $nsisSetup.exists) {
  if ($nsisSetup.productVersion -ne $ExpectedVersion) {
    $failures += "NSIS setup product version is '$($nsisSetup.productVersion)', expected '$ExpectedVersion'."
  }
  if (-not $nsisSetup.hasNullsoftMarker) {
    $failures += "NSIS setup asset does not contain the expected Nullsoft marker."
  }
}

$failures = @($failures | Select-Object -Unique)

$result = [pscustomobject]@{
  ok = $failures.Count -eq 0
  expectedVersion = $ExpectedVersion
  expectedDesktopBundleKind = $ExpectedDesktopBundleKind
  verifyExitCode = $verifyResult.exitCode
  packageShape = [pscustomobject]@{
    actualDesktopBundleKind = $actualDesktopBundleKind
    actualDaemonBundleKind = $baseResult.installedBundleKind.daemon
    uninstallPresent = $uninstallPresent
    uninstallVersion = if ($uninstallPresent) { $baseResult.installedFiles.uninstall.productVersion } else { $null }
  }
  nsisSetup = $nsisSetup
  baseResult = $baseResult
  failures = $failures
}

$result | ConvertTo-Json -Depth 14
if ($failures.Count -gt 0) {
  exit 1
}
