param(
  [string]$ExpectedVersion = "",
  [string]$MsiPath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$scriptPath = Join-Path $PSScriptRoot "install-and-verify-msi-state.ps1"
$packageJsonPath = Join-Path $repoRoot "package.json"
$tauriConfigPath = Join-Path $repoRoot "apps\desktop\src-tauri\tauri.conf.json"

if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
  $ExpectedVersion = (Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json).version
}
if ([string]::IsNullOrWhiteSpace($MsiPath)) {
  $MsiPath = Join-Path $repoRoot "apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_$($ExpectedVersion)_x64_en-US.msi"
}

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Add-Check {
  param(
    [string]$Name,
    [bool]$Passed,
    [object]$Details
  )

  $script:checks += [pscustomobject]@{
    name = $Name
    passed = $Passed
    details = $Details
  }
  if (-not $Passed) {
    $script:failures += $Name
  }
}

$checks = @()
$failures = @()
$isAdmin = Test-IsAdministrator

if ($isAdmin) {
  [pscustomobject]@{
    ok = $true
    skipped = $true
    skippedReason = "Skipped because the current PowerShell process is already elevated; non-admin preflight cannot be observed without risking an install."
    expectedVersion = $ExpectedVersion
    msiPath = (Resolve-Path $MsiPath).Path
    checks = @()
    failures = @()
  } | ConvertTo-Json -Depth 8
  exit 0
}

$tauriConfig = Get-Content -LiteralPath $tauriConfigPath -Raw | ConvertFrom-Json
$expectedProductName = $tauriConfig.productName
$expectedManufacturer = $tauriConfig.bundle.publisher

$output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath `
  -ExpectedVersion $ExpectedVersion `
  -MsiPath (Resolve-Path $MsiPath).Path `
  -SkipVision 2>&1
$exitCode = $LASTEXITCODE
$text = ($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine

$json = $null
try {
  $json = $text | ConvertFrom-Json
} catch {
  $json = $null
}

Add-Check -Name "preflight exits with expected non-admin code" -Passed ($exitCode -eq 1) -Details ([pscustomobject]@{
  exitCode = $exitCode
})
Add-Check -Name "preflight returns parseable JSON" -Passed ($null -ne $json) -Details ([pscustomobject]@{
  outputPrefix = if ($text.Length -gt 500) { $text.Substring(0, 500) } else { $text }
})
Add-Check -Name "preflight requires elevation" -Passed ($json.requiresElevation -eq $true) -Details $json
Add-Check -Name "preflight reports MSI identity" -Passed (
  $json.msi.productName -eq $expectedProductName -and
  $json.msi.productVersion -eq $ExpectedVersion -and
  $json.msi.manufacturer -eq $expectedManufacturer -and
  $json.msi.allUsers -eq "1" -and
  [string]::IsNullOrWhiteSpace([string]$json.msi.metadataError)
) -Details $json.msi
Add-Check -Name "preflight emits elevated command" -Passed (
  -not [string]::IsNullOrWhiteSpace([string]$json.recommendedElevatedCommand) -and
  $json.recommendedElevatedCommand.Contains("install-and-verify-msi-state.ps1") -and
  $json.recommendedElevatedCommand.Contains((Resolve-Path $MsiPath).Path)
) -Details ([pscustomobject]@{
  recommendedElevatedCommand = $json.recommendedElevatedCommand
})

$result = [pscustomobject]@{
  ok = $failures.Count -eq 0
  skipped = $false
  expectedVersion = $ExpectedVersion
  msiPath = (Resolve-Path $MsiPath).Path
  checks = $checks
  failures = $failures
}

$result | ConvertTo-Json -Depth 10
if ($failures.Count -gt 0) {
  exit 1
}
