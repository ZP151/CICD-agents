param(
  [string]$Version = "",
  [string]$MsiPath = "",
  [string]$HistoricalVersion = "",
  [string]$HistoricalMsiPath = "",
  [string]$HistoricalDesktopExePath = "",
  [string]$MismatchedDesktopExePath = "",
  [string]$WrongExpectedVersion = "9.9.9"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$verifierPath = Join-Path $PSScriptRoot "verify-windows-installer-metadata.ps1"
$packageJsonPath = Join-Path $repoRoot "package.json"

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = (Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json).version
}

if ([string]::IsNullOrWhiteSpace($MsiPath)) {
  $MsiPath = Join-Path $repoRoot "apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_$($Version)_x64_en-US.msi"
}

if ([string]::IsNullOrWhiteSpace($MismatchedDesktopExePath)) {
  $MismatchedDesktopExePath = Join-Path $repoRoot "apps\desktop\src-tauri\target\release\mergepilot-desktop.exe"
}

function Invoke-MetadataVerifier {
  param([string[]]$Arguments)

  $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $verifierPath @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $text = ($output | ForEach-Object { $_.ToString() }) -join "`n"
  $json = $null
  try {
    $json = $text | ConvertFrom-Json
  } catch {
    $json = $null
  }

  return [pscustomobject]@{
    exitCode = $exitCode
    json = $json
    output = $text
  }
}

$checks = @()
$failures = @()

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

$defaultResult = Invoke-MetadataVerifier -Arguments @()
Add-Check -Name "active default metadata" -Passed (
  $defaultResult.exitCode -eq 0 -and
  $defaultResult.json.ok -eq $true -and
  $defaultResult.json.desktop.productVersion -eq $Version -and
  $null -eq $defaultResult.json.desktopSkippedReason
) -Details $defaultResult.json

$localExplicitResult = Invoke-MetadataVerifier -Arguments @("-Version", $Version, "-MsiPath", $MsiPath)
Add-Check -Name "active explicit MSI metadata" -Passed (
  $localExplicitResult.exitCode -eq 0 -and
  $localExplicitResult.json.ok -eq $true -and
  $localExplicitResult.json.desktop.productVersion -eq $Version -and
  $null -eq $localExplicitResult.json.desktopSkippedReason
) -Details $localExplicitResult.json

if (-not [string]::IsNullOrWhiteSpace($HistoricalMsiPath)) {
  if ([string]::IsNullOrWhiteSpace($HistoricalVersion)) {
    throw "-HistoricalVersion is required when -HistoricalMsiPath is supplied."
  }

  $historicalSkipResult = Invoke-MetadataVerifier -Arguments @(
    "-ExpectedVersion", $HistoricalVersion,
    "-MsiPath", $HistoricalMsiPath
  )
  Add-Check -Name "historical MSI without desktop" -Passed (
    $historicalSkipResult.exitCode -eq 0 -and
    $historicalSkipResult.json.ok -eq $true -and
    $null -ne $historicalSkipResult.json.desktopSkippedReason
  ) -Details $historicalSkipResult.json

  if (-not [string]::IsNullOrWhiteSpace($HistoricalDesktopExePath)) {
    $historicalFullResult = Invoke-MetadataVerifier -Arguments @(
      "-ExpectedVersion", $HistoricalVersion,
      "-MsiPath", $HistoricalMsiPath,
      "-DesktopExePath", $HistoricalDesktopExePath
    )
    Add-Check -Name "historical MSI with extracted desktop" -Passed (
      $historicalFullResult.exitCode -eq 0 -and
      $historicalFullResult.json.ok -eq $true -and
      $historicalFullResult.json.desktop.productVersion -eq $HistoricalVersion -and
      $null -eq $historicalFullResult.json.desktopSkippedReason
    ) -Details $historicalFullResult.json
  }

  if (-not [string]::IsNullOrWhiteSpace($MismatchedDesktopExePath) -and (Test-Path -LiteralPath $MismatchedDesktopExePath)) {
    $mismatchResult = Invoke-MetadataVerifier -Arguments @(
      "-ExpectedVersion", $HistoricalVersion,
      "-MsiPath", $HistoricalMsiPath,
      "-DesktopExePath", $MismatchedDesktopExePath
    )
    Add-Check -Name "historical MSI rejects mismatched desktop" -Passed (
      $mismatchResult.exitCode -ne 0 -and
      $mismatchResult.output -match "Desktop ProductVersion"
    ) -Details ([pscustomobject]@{
      exitCode = $mismatchResult.exitCode
      containsDesktopVersionFailure = $mismatchResult.output -match "Desktop ProductVersion"
    })
  }

  $wrongExpectedResult = Invoke-MetadataVerifier -Arguments @(
    "-ExpectedVersion", $WrongExpectedVersion,
    "-MsiPath", $HistoricalMsiPath
  )
  Add-Check -Name "historical MSI rejects wrong expected version" -Passed (
    $wrongExpectedResult.exitCode -ne 0 -and
    $wrongExpectedResult.output -match "MSI ProductVersion"
  ) -Details ([pscustomobject]@{
    exitCode = $wrongExpectedResult.exitCode
    containsMsiVersionFailure = $wrongExpectedResult.output -match "MSI ProductVersion"
  })
}

$result = [pscustomobject]@{
  ok = $failures.Count -eq 0
  version = $Version
  msiPath = $MsiPath
  historicalVersion = $HistoricalVersion
  historicalMsiPath = $HistoricalMsiPath
  checks = $checks
  failures = $failures
}

$result | ConvertTo-Json -Depth 12
if ($failures.Count -gt 0) {
  exit 1
}
