<#
.SYNOPSIS
Smoke-tests the current release readiness aggregator.

.DESCRIPTION
Verifies that verify-current-release-readiness.ps1 returns structured JSON for
both the normal current-artifact path and a missing-MSI path. The readiness
aggregator is expected to fail while release blockers remain; this smoke checks
that those blockers are grouped and machine-readable.
#>

param(
  [Alias("ExpectedVersion")]
  [string]$Version = "",
  [string]$MsiPath = "",
  [string]$NsisPath = "",
  [int]$FreshConfigPort = 19121,
  [int]$MsiPayloadPort = 19122,
  [int]$StaleScanExtractionTimeoutSec = 120,
  [switch]$SkipPackageSmokes
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$packageJsonPath = Join-Path $repoRoot "package.json"
$readinessPath = Join-Path $PSScriptRoot "verify-current-release-readiness.ps1"

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = (Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json).version
}
if ([string]::IsNullOrWhiteSpace($MsiPath)) {
  $MsiPath = Join-Path $repoRoot "apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_$($Version)_x64_en-US.msi"
}

$checks = @()
$failures = @()

function Get-FullPathForReport {
  param([string]$Path)

  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $repoRoot $Path))
}

function Get-SiblingNsisPath {
  param([string]$MsiPath)

  $fullMsiPath = Get-FullPathForReport -Path $MsiPath
  $msiDir = Split-Path -Parent $fullMsiPath
  $bundleDir = Split-Path -Parent $msiDir
  return Join-Path $bundleDir "nsis\MergePilot_$($Version)_x64-setup.exe"
}

function Invoke-Readiness {
  param(
    [string]$CandidateMsiPath,
    [switch]$IncludePackageSmokes
  )

  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $readinessPath,
    "-Version",
    $Version,
    "-MsiPath",
    $CandidateMsiPath,
    "-NsisPath",
    $NsisPath,
    "-StaleScanExtractionTimeoutSec",
    [string]$StaleScanExtractionTimeoutSec,
    "-SkipTimestampProbe"
  )
  if ($IncludePackageSmokes) {
    $arguments += @(
      "-IncludePackageSmokes",
      "-FreshConfigPort",
      [string]$FreshConfigPort,
      "-MsiPayloadPort",
      [string]$MsiPayloadPort
    )
  }

  $output = & powershell.exe @arguments 2>&1
  $exitCode = $LASTEXITCODE
  $text = ($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
  $json = $null
  try {
    $json = $text | ConvertFrom-Json
  } catch {
    $json = $null
  }

  return [pscustomobject]@{
    exitCode = $exitCode
    json = $json
    output = if ($text.Length -gt 1200) { $text.Substring(0, 1200) } else { $text }
  }
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

if ([string]::IsNullOrWhiteSpace($NsisPath)) {
  $NsisPath = Get-SiblingNsisPath -MsiPath $MsiPath
}

$normalResult = Invoke-Readiness -CandidateMsiPath $MsiPath
$aliasResultOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $readinessPath `
  -ExpectedVersion $Version `
  -MsiPath $MsiPath `
  -NsisPath $NsisPath `
  -SkipTimestampProbe 2>&1
$aliasResultText = ($aliasResultOutput | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
$aliasExitCode = $LASTEXITCODE
$aliasResult = $null
try {
  $aliasResult = $aliasResultText | ConvertFrom-Json
} catch {
  $aliasResult = $null
}
Add-Check -Name "readiness accepts ExpectedVersion alias and explicit NSIS path" -Passed (
  $aliasExitCode -ne 0 -and
  $null -ne $aliasResult -and
  $aliasResult.version -eq $Version -and
  $aliasResult.msiPath -eq (Get-FullPathForReport -Path $MsiPath) -and
  $aliasResult.nsisPath -eq (Get-FullPathForReport -Path $NsisPath)
) -Details ([pscustomobject]@{
  exitCode = $aliasExitCode
  version = if ($aliasResult) { $aliasResult.version } else { $null }
  msiPath = if ($aliasResult) { $aliasResult.msiPath } else { $null }
  nsisPath = if ($aliasResult) { $aliasResult.nsisPath } else { $null }
  output = if ($null -eq $aliasResult) { $aliasResultText.Substring(0, [Math]::Min(500, $aliasResultText.Length)) } else { $null }
})
$normalBlockerNames = @($normalResult.json.blockers | ForEach-Object { $_.name })
$normalCheckNames = @($normalResult.json.checks | ForEach-Object { $_.name })
$parserCheck = $normalResult.json.checks | Where-Object { $_.name -eq "windows script parser" } | Select-Object -First 1
$runtimeOwnerCheck = $normalResult.json.checks | Where-Object { $_.name -eq "installed runtime owner" } | Select-Object -First 1
$installedPackageCheck = $normalResult.json.checks | Where-Object { $_.name -eq "installed package state" } | Select-Object -First 1
$trackingCheck = $normalResult.json.checks | Where-Object { $_.name -eq "release workflow strict tracking" } | Select-Object -First 1
Add-Check -Name "normal readiness returns grouped blockers" -Passed (
  $normalResult.exitCode -ne 0 -and
  $normalResult.json.ok -eq $false -and
  $normalBlockerNames -contains "windows signing readiness" -and
  $normalBlockerNames -contains "windows artifact signatures" -and
  $null -ne $installedPackageCheck
) -Details ([pscustomobject]@{
  exitCode = $normalResult.exitCode
  checkNames = $normalCheckNames
  blockerNames = $normalBlockerNames
  installedPackageOk = if ($installedPackageCheck) { $installedPackageCheck.ok } else { $null }
})

$installNextAction = $normalResult.json.nextActions.installCurrentMsi
$installedPackageBlockerPresent = $normalBlockerNames -contains "installed package state"
$installHandoffPassed = $false
if ($installedPackageBlockerPresent) {
  $installHandoffPassed = (
    $normalResult.exitCode -ne 0 -and
    $null -ne $installNextAction -and
    $installNextAction.expectedVersion -eq $Version -and
    $installNextAction.msiPath -eq (Get-FullPathForReport -Path $MsiPath) -and
    ([string]$installNextAction.recommendedElevatedCommand).Contains("install-and-verify-msi-state.ps1") -and
    ([string]$installNextAction.recommendedElevatedCommand).Contains("-ExpectedVersion $Version") -and
    ([string]$installNextAction.recommendedElevatedCommand).Contains([string]$installNextAction.msiPath) -and
    -not ([string]$installNextAction.recommendedElevatedCommand).Contains("-SkipVision") -and
    ([string]$installNextAction.quickElevatedCommand).Contains("-SkipVision") -and
    ([string]$installNextAction.verifyAfterManualInstall).Contains("-SkipInstall")
  )
} else {
  $installHandoffPassed = (
    $null -ne $installedPackageCheck -and
    $installedPackageCheck.ok -eq $true -and
    $null -eq $installNextAction
  )
}
Add-Check -Name "normal readiness handles installed MSI handoff state" -Passed $installHandoffPassed -Details ([pscustomobject]@{
  installedPackageBlockerPresent = $installedPackageBlockerPresent
  installedPackageCheck = $installedPackageCheck
  installNextAction = $installNextAction
})

$trackingNextAction = $normalResult.json.nextActions.trackReleaseWorkflowScripts
$trackingScripts = @($trackingNextAction.scripts)
$trackingBlockerPresent = $normalBlockerNames -contains "release workflow strict tracking"
$trackingStatePassed = $false
if ($trackingBlockerPresent) {
  $trackingStatePassed = (
    $normalResult.exitCode -ne 0 -and
    $null -ne $trackingNextAction -and
    $trackingScripts.Count -gt 0 -and
    $trackingScripts -contains "scripts\windows\verify-no-stale-chat-template.ps1" -and
    ([string]$trackingNextAction.suggestedStageCommand).StartsWith("git add -- ") -and
    ([string]$trackingNextAction.suggestedStageCommand).Contains("scripts/windows/verify-no-stale-chat-template.ps1")
  )
} else {
  $trackingStatePassed = (
    $null -ne $trackingCheck -and
    $trackingCheck.ok -eq $true -and
    $null -eq $trackingNextAction
  )
}
Add-Check -Name "normal readiness handles release script tracking state" -Passed $trackingStatePassed -Details ([pscustomobject]@{
  trackingBlockerPresent = $trackingBlockerPresent
  trackingCheck = $trackingCheck
  trackingNextAction = $trackingNextAction
})

$expectedMsiPath = Get-FullPathForReport -Path $MsiPath
$expectedNsisPath = Get-FullPathForReport -Path $NsisPath
$signingNextAction = $normalResult.json.nextActions.configureWindowsSigning
$signingArtifactPaths = @($signingNextAction.artifactPaths)
Add-Check -Name "normal readiness includes Windows signing handoff" -Passed (
  $normalResult.exitCode -ne 0 -and
  $null -ne $signingNextAction -and
  @($signingNextAction.requiredInputs).Count -ge 2 -and
  $signingArtifactPaths -contains $expectedMsiPath -and
  $signingArtifactPaths -contains $expectedNsisPath -and
  ([string]$signingNextAction.verifyReadinessCommand).Contains("verify-windows-signing-readiness.ps1") -and
  ([string]$signingNextAction.verifyReadinessCommand).StartsWith("Set-Location -LiteralPath") -and
  ([string]$signingNextAction.verifyReadinessCommand).Contains("-Version $Version") -and
  ([string]$signingNextAction.verifyReadinessCommand).Contains("-Paths") -and
  ([string]$signingNextAction.verifyReadinessCommand).Contains($expectedMsiPath) -and
  ([string]$signingNextAction.verifyReadinessCommand).Contains($expectedNsisPath) -and
  ([string]$signingNextAction.verifyReadinessWithoutTimestampCommand).Contains("-SkipTimestampProbe") -and
  ([string]$signingNextAction.signArtifactsCommand).Contains("sign-windows-release-artifacts.ps1") -and
  ([string]$signingNextAction.signArtifactsCommand).StartsWith("Set-Location -LiteralPath") -and
  ([string]$signingNextAction.signArtifactsCommand).Contains("-Paths") -and
  ([string]$signingNextAction.signArtifactsCommand).Contains($expectedMsiPath) -and
  ([string]$signingNextAction.signArtifactsCommand).Contains($expectedNsisPath) -and
  ([string]$signingNextAction.verifySignaturesCommand).Contains("verify-windows-artifact-signatures.ps1") -and
  ([string]$signingNextAction.verifySignaturesCommand).StartsWith("Set-Location -LiteralPath") -and
  ([string]$signingNextAction.verifySignaturesCommand).Contains("-Paths") -and
  ([string]$signingNextAction.verifySignaturesCommand).Contains($expectedMsiPath) -and
  ([string]$signingNextAction.verifySignaturesCommand).Contains($expectedNsisPath) -and
  $signingNextAction.docs -eq "docs/windows-code-signing.md"
) -Details $signingNextAction

Add-Check -Name "normal readiness includes parser gate" -Passed (
  $null -ne $parserCheck -and
  $parserCheck.ok -eq $true
) -Details $parserCheck

Add-Check -Name "normal readiness includes installed runtime owner gate" -Passed (
  $null -ne $runtimeOwnerCheck -and
  (
    $runtimeOwnerCheck.ok -eq $true -or
    (
      $normalBlockerNames -contains "installed runtime owner" -and
      ([string]$normalResult.json.nextActions.fixInstalledRuntimeOwner.inspectCommand).Contains("verify-installed-runtime-owner.ps1") -and
      ([string]$normalResult.json.nextActions.fixInstalledRuntimeOwner.inspectCommand).Contains("-RequireRuntime") -and
      ([string]$normalResult.json.nextActions.fixInstalledRuntimeOwner.inspectCommand).Contains("-RequireDesktopSidecarMode")
    )
  )
) -Details ([pscustomobject]@{
  runtimeOwnerCheck = $runtimeOwnerCheck
  fixInstalledRuntimeOwner = $normalResult.json.nextActions.fixInstalledRuntimeOwner
})

$runtimeMetadataScripts = @(
  "scripts\windows\packaged-sidecar-smoke.ps1",
  "scripts\windows\packaged-msi-payload-smoke.ps1",
  "scripts\windows\verify-installed-windows-package-state.ps1",
  "scripts\windows\verify-installed-runtime-owner.ps1",
  "scripts\windows\verify-installed-desktop-runtime-takeover.ps1",
  "scripts\windows\run-installed-app-smoke.ps1"
)
$runtimeMetadataMissing = @(
  $runtimeMetadataScripts |
    Where-Object {
      -not (Get-Content -LiteralPath (Join-Path $repoRoot $_) -Raw).Contains("desktopVersion")
    }
)
Add-Check -Name "runtime trust gates require desktopVersion metadata" -Passed (
  $runtimeMetadataMissing.Count -eq 0
) -Details ([pscustomobject]@{
  scripts = $runtimeMetadataScripts
  missing = $runtimeMetadataMissing
})

$signatureBlocker = $normalResult.json.blockers | Where-Object { $_.name -eq "windows artifact signatures" } | Select-Object -First 1
$signatureFailureText = @($signatureBlocker.failures) -join [Environment]::NewLine
Add-Check -Name "normal readiness verifies MSI and NSIS signature paths" -Passed (
  $normalResult.exitCode -ne 0 -and
  $null -ne $signatureBlocker -and
  $signatureFailureText.Contains($expectedMsiPath) -and
  $signatureFailureText.Contains($expectedNsisPath)
) -Details ([pscustomobject]@{
  expectedMsiPath = $expectedMsiPath
  expectedNsisPath = $expectedNsisPath
  signatureFailures = @($signatureBlocker.failures)
})

if (-not $SkipPackageSmokes) {
  $packageResult = Invoke-Readiness -CandidateMsiPath $MsiPath -IncludePackageSmokes
  $freshConfigCheck = $packageResult.json.checks | Where-Object { $_.name -eq "packaged fresh config" } | Select-Object -First 1
  $payloadCheck = $packageResult.json.checks | Where-Object { $_.name -eq "packaged MSI payload" } | Select-Object -First 1
  Add-Check -Name "package smoke mode includes package runtime gates" -Passed (
    $packageResult.exitCode -ne 0 -and
    $packageResult.json.ok -eq $false -and
    $freshConfigCheck.ok -eq $true -and
    $payloadCheck.ok -eq $true
  ) -Details ([pscustomobject]@{
    exitCode = $packageResult.exitCode
    freshConfigPort = $FreshConfigPort
    msiPayloadPort = $MsiPayloadPort
    freshConfig = $freshConfigCheck
    payload = $payloadCheck
  })
}

$missingBundleRoot = Join-Path ([System.IO.Path]::GetTempPath()) "mergepilot-readiness-smoke-missing-bundle"
$missingMsiPath = Join-Path $missingBundleRoot "msi\MergePilot_missing_$($Version)_x64_en-US.msi"
$missingResult = Invoke-Readiness -CandidateMsiPath $missingMsiPath
$missingBlockerNames = @($missingResult.json.blockers | ForEach-Object { $_.name })
$metadataBlocker = $missingResult.json.blockers | Where-Object { $_.name -eq "windows installer metadata" } | Select-Object -First 1
$missingSigningBlocker = $missingResult.json.blockers | Where-Object { $_.name -eq "windows signing readiness" } | Select-Object -First 1
$missingSigningFailureText = @($missingSigningBlocker.failures) -join [Environment]::NewLine
$expectedMissingMsiPath = Get-FullPathForReport -Path $missingMsiPath
$expectedMissingNsisPath = Get-SiblingNsisPath -MsiPath $missingMsiPath
Add-Check -Name "missing MSI remains structured JSON" -Passed (
  $missingResult.exitCode -ne 0 -and
  $missingResult.json.ok -eq $false -and
  $missingBlockerNames -contains "windows installer metadata" -and
  (($metadataBlocker.failures -join "`n") -match "MSI not found")
) -Details ([pscustomobject]@{
  exitCode = $missingResult.exitCode
  msiPath = $missingResult.json.msiPath
  blockerNames = $missingBlockerNames
  metadataFailures = $metadataBlocker.failures
})

Add-Check -Name "missing MSI signing readiness uses supplied artifact paths" -Passed (
  $missingResult.exitCode -ne 0 -and
  $null -ne $missingSigningBlocker -and
  $missingSigningFailureText.Contains($expectedMissingMsiPath) -and
  $missingSigningFailureText.Contains($expectedMissingNsisPath)
) -Details ([pscustomobject]@{
  expectedMissingMsiPath = $expectedMissingMsiPath
  expectedMissingNsisPath = $expectedMissingNsisPath
  signingFailures = @($missingSigningBlocker.failures)
})

$result = [pscustomobject]@{
  ok = $failures.Count -eq 0
  version = $Version
  msiPath = $MsiPath
  ports = [pscustomobject]@{
    freshConfig = $FreshConfigPort
    msiPayload = $MsiPayloadPort
  }
  packageSmokesSkipped = [bool]$SkipPackageSmokes
  staleScanExtractionTimeoutSec = $StaleScanExtractionTimeoutSec
  checks = $checks
  failures = $failures
}

$result | ConvertTo-Json -Depth 12
if ($failures.Count -gt 0) {
  exit 1
}
exit 0
