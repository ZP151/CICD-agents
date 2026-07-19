<#
.SYNOPSIS
Summarizes local release and installed-app readiness without mutating state.

.DESCRIPTION
Runs the non-destructive gates that answer whether the current local Windows
package is ready to install, release, and trust. The script intentionally does
not install MSI packages, sign artifacts, create tags, push, or call Azure
DevOps. Failed checks are reported as structured blockers in JSON.
#>

param(
  [Alias("ExpectedVersion")]
  [string]$Version = "",
  [string]$MsiPath = "",
  [string]$NsisPath = "",
  [switch]$IncludePackageSmokes,
  [int]$FreshConfigPort = 19111,
  [int]$MsiPayloadPort = 19112,
  [int]$StaleScanExtractionTimeoutSec = 180,
  [switch]$SkipTimestampProbe
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$packageJsonPath = Join-Path $repoRoot "package.json"
if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = (Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json).version
}
if ([string]::IsNullOrWhiteSpace($MsiPath)) {
  $MsiPath = Join-Path $repoRoot "apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_$($Version)_x64_en-US.msi"
}

function Get-FullPathForReport {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return $Path
  }
  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $repoRoot $Path))
}

function Get-WindowsArtifactSignaturePaths {
  param(
    [string]$MsiPath,
    [string]$NsisPath,
    [string]$Version
  )

  $paths = @()
  if (-not [string]::IsNullOrWhiteSpace($MsiPath)) {
    $paths += $MsiPath
    $msiDir = Split-Path -Parent $MsiPath
    $bundleDir = Split-Path -Parent $msiDir
    $siblingNsisPath = Join-Path $bundleDir "nsis\MergePilot_$($Version)_x64-setup.exe"
    if ($siblingNsisPath -notin $paths) {
      $paths += $siblingNsisPath
    }
  }
  if (-not [string]::IsNullOrWhiteSpace($NsisPath)) {
    $fullNsisPath = Get-FullPathForReport -Path $NsisPath
    $paths = @($paths | Where-Object { $_ -ne $fullNsisPath })
    $paths += $fullNsisPath
  }
  return $paths
}

function Quote-PowerShellLiteral {
  param([string]$Value)

  return "'$($Value.Replace("'", "''"))'"
}

function Get-RecommendedElevatedInstallCommand {
  param(
    [string]$Version,
    [string]$MsiPath,
    [switch]$SkipInstall,
    [switch]$SkipVision
  )

  $installScriptPath = Join-Path $PSScriptRoot "install-and-verify-msi-state.ps1"
  $command = "Set-Location -LiteralPath $(Quote-PowerShellLiteral -Value $repoRoot.Path); & $(Quote-PowerShellLiteral -Value $installScriptPath) -ExpectedVersion $Version -MsiPath $(Quote-PowerShellLiteral -Value $MsiPath)"
  if ($SkipInstall) {
    $command += " -SkipInstall"
  }
  if ($SkipVision) {
    $command += " -SkipVision"
  }
  return $command
}

function Get-RepoPowerShellCommand {
  param(
    [string]$ScriptRelativePath,
    [string[]]$Arguments = @()
  )

  $scriptPath = Join-Path $repoRoot $ScriptRelativePath
  $command = "Set-Location -LiteralPath $(Quote-PowerShellLiteral -Value $repoRoot.Path); & $(Quote-PowerShellLiteral -Value $scriptPath)"
  if ($Arguments.Count -gt 0) {
    $command += " " + (($Arguments | ForEach-Object {
      $value = [string]$_
      if ($value -match "\s" -or $value.Contains(";") -or $value.Contains("'")) {
        Quote-PowerShellLiteral -Value $value
      } else {
        $value
      }
    }) -join " ")
  }
  return $command
}

function Get-UntrackedReleaseWorkflowScripts {
  param([object[]]$Blockers)

  $trackingBlocker = $Blockers | Where-Object { $_.name -eq "release workflow strict tracking" } | Select-Object -First 1
  if ($null -eq $trackingBlocker) {
    return @()
  }

  return @($trackingBlocker.failures |
    ForEach-Object {
      $text = [string]$_
      $match = [regex]::Match($text, "Release workflow script is not tracked by Git:\s*(.+)$")
      if ($match.Success) {
        $match.Groups[1].Value.Trim()
      }
    } |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    Select-Object -Unique)
}

function Invoke-JsonScript {
  param(
    [string]$Name,
    [string]$ScriptName,
    [string[]]$Arguments = @()
  )

  $scriptPath = Join-Path $PSScriptRoot $ScriptName
  if (-not (Test-Path -LiteralPath $scriptPath)) {
    return [pscustomobject]@{
      name = $Name
      ok = $false
      exitCode = $null
      json = $null
      output = ""
      failures = @("Script was not found: $scriptPath")
    }
  }

  $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  $text = ($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
  $json = $null
  try {
    $json = $text | ConvertFrom-Json
  } catch {
    $json = $null
  }

  $failures = @()
  if ($null -eq $json) {
    $failures += "Could not parse JSON output from $ScriptName."
  } elseif ($json.failures) {
    $failures += @($json.failures)
  }
  if ($exitCode -ne 0 -and $failures.Count -eq 0) {
    $failures += "$ScriptName exited with code $exitCode."
  }

  return [pscustomobject]@{
    name = $Name
    ok = ($exitCode -eq 0 -and $null -ne $json -and $json.ok -eq $true)
    exitCode = $exitCode
    json = $json
    output = if ($text.Length -gt 1200) { $text.Substring(0, 1200) } else { $text }
    failures = $failures
  }
}

$checks = @()
$msiPathForReport = Get-FullPathForReport -Path $MsiPath

$checks += Invoke-JsonScript -Name "release workflow static" -ScriptName "verify-release-workflow-static.ps1"
$checks += Invoke-JsonScript -Name "release workflow strict tracking" -ScriptName "verify-release-workflow-static.ps1" -Arguments @("-RequireTrackedScripts")
$checks += Invoke-JsonScript -Name "windows script parser" -ScriptName "verify-windows-scripts-parse.ps1"
$installerMetadataArgs = @("-Version", $Version, "-MsiPath", $msiPathForReport)
if (-not [string]::IsNullOrWhiteSpace($NsisPath)) {
  $installerMetadataArgs += @("-NsisSetupPath", (Get-FullPathForReport -Path $NsisPath))
}
$checks += Invoke-JsonScript -Name "windows installer metadata" -ScriptName "verify-windows-installer-metadata.ps1" -Arguments $installerMetadataArgs
$checks += Invoke-JsonScript -Name "stale chat template scan" -ScriptName "verify-no-stale-chat-template.ps1" -Arguments @(
  "-MsiPath", $msiPathForReport,
  "-ExtractionTimeoutSec", [string]$StaleScanExtractionTimeoutSec
)
if ($IncludePackageSmokes) {
  $checks += Invoke-JsonScript -Name "packaged fresh config" -ScriptName "packaged-fresh-config-smoke.ps1" -Arguments @("-MsiPath", $msiPathForReport, "-Port", [string]$FreshConfigPort)
  $checks += Invoke-JsonScript -Name "packaged MSI payload" -ScriptName "packaged-msi-payload-smoke.ps1" -Arguments @("-MsiPath", $msiPathForReport, "-Port", [string]$MsiPayloadPort)
}

$signaturePaths = @(Get-WindowsArtifactSignaturePaths -MsiPath $msiPathForReport -NsisPath $NsisPath -Version $Version)
$signaturePathArgs = @()
if ($signaturePaths.Count -gt 0) {
  $signaturePathArgs = @("-Paths", ($signaturePaths -join [System.IO.Path]::PathSeparator))
}
$signingArgs = @("-Version", $Version)
if ($signaturePaths.Count -gt 0) {
  $signingArgs += $signaturePathArgs
}
if ($SkipTimestampProbe) {
  $signingArgs += "-SkipTimestampProbe"
}
$checks += Invoke-JsonScript -Name "windows signing readiness" -ScriptName "verify-windows-signing-readiness.ps1" -Arguments $signingArgs
$signatureArgs = @("-Version", $Version)
if ($signaturePaths.Count -gt 0) {
  $signatureArgs += $signaturePathArgs
}
$checks += Invoke-JsonScript -Name "windows artifact signatures" -ScriptName "verify-windows-artifact-signatures.ps1" -Arguments $signatureArgs
$checks += Invoke-JsonScript -Name "installed runtime owner" -ScriptName "verify-installed-runtime-owner.ps1" -Arguments @(
  "-ExpectedVersion", $Version,
  "-RequireRuntime",
  "-RequireDesktopSidecarMode"
)
$installedPackageCheck = Invoke-JsonScript -Name "installed package state" -ScriptName "verify-installed-windows-package-state.ps1" -Arguments @(
  "-ExpectedVersion", $Version,
  "-ExpectedDesktopBundleKind", "msi",
  "-MsiPath", $msiPathForReport
)
$checks += $installedPackageCheck

$blockers = @(
  $checks |
    Where-Object { -not $_.ok } |
    ForEach-Object {
      [pscustomobject]@{
        name = $_.name
        exitCode = $_.exitCode
        failures = $_.failures
      }
    }
)

$blockerNames = @($blockers | ForEach-Object { $_.name })
$untrackedReleaseScripts = @(Get-UntrackedReleaseWorkflowScripts -Blockers $blockers)
$nextActions = [pscustomobject]@{
  installCurrentMsi = if ($blockerNames -contains "installed package state") {
    [pscustomobject]@{
      reason = "Installed Program Files state does not match the current MSI."
      expectedVersion = $Version
      currentInstalledVersions = @($installedPackageCheck.json.baseResult.uninstallEntries |
        Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.displayVersion) } |
        Select-Object -ExpandProperty displayVersion -Unique)
      msiPath = $msiPathForReport
      recommendedElevatedCommand = Get-RecommendedElevatedInstallCommand -Version $Version -MsiPath $msiPathForReport
      quickElevatedCommand = Get-RecommendedElevatedInstallCommand -Version $Version -MsiPath $msiPathForReport -SkipVision
      verifyAfterManualInstall = Get-RecommendedElevatedInstallCommand -Version $Version -MsiPath $msiPathForReport -SkipInstall
    }
  } else {
    $null
  }
  trackReleaseWorkflowScripts = if ($blockerNames -contains "release workflow strict tracking") {
    [pscustomobject]@{
      reason = "Release workflow references local scripts that are not tracked by Git."
      scripts = $untrackedReleaseScripts
      suggestedStageCommand = if ($untrackedReleaseScripts.Count -gt 0) {
        "git add -- " + (($untrackedReleaseScripts | ForEach-Object { $_.Replace("\", "/") }) -join " ")
      } else {
        $null
      }
      note = "Stage and commit the workflow-referenced scripts before creating a release tag."
    }
  } else {
    $null
  }
  configureWindowsSigning = if (
    $blockerNames -contains "windows signing readiness" -or
    $blockerNames -contains "windows artifact signatures"
  ) {
    [pscustomobject]@{
      reason = "Windows artifacts are not signed with a trusted Authenticode certificate."
      requiredInputs = @("WINDOWS_CODESIGN_CERT_PFX_BASE64 or -PfxPath", "WINDOWS_CODESIGN_CERT_PASSWORD")
      artifactPaths = $signaturePaths
      verifyReadinessCommand = Get-RepoPowerShellCommand -ScriptRelativePath "scripts\windows\verify-windows-signing-readiness.ps1" -Arguments (@("-Version", $Version) + $signaturePathArgs)
      verifyReadinessWithoutTimestampCommand = Get-RepoPowerShellCommand -ScriptRelativePath "scripts\windows\verify-windows-signing-readiness.ps1" -Arguments (@("-Version", $Version) + $signaturePathArgs + @("-SkipTimestampProbe"))
      signArtifactsCommand = Get-RepoPowerShellCommand -ScriptRelativePath "scripts\windows\sign-windows-release-artifacts.ps1" -Arguments (@("-Version", $Version) + $signaturePathArgs)
      verifySignaturesCommand = Get-RepoPowerShellCommand -ScriptRelativePath "scripts\windows\verify-windows-artifact-signatures.ps1" -Arguments (@("-Version", $Version) + $signaturePathArgs)
      docs = "docs/windows-code-signing.md"
    }
  } else {
    $null
  }
  fixInstalledRuntimeOwner = if ($blockerNames -contains "installed runtime owner") {
    [pscustomobject]@{
      reason = "The default runtime port is not owned by the installed MergePilot daemon, so the desktop can connect to the wrong backend."
      inspectCommand = Get-RepoPowerShellCommand -ScriptRelativePath "scripts\windows\verify-installed-runtime-owner.ps1" -Arguments @(
        "-ExpectedVersion", $Version,
        "-RequireRuntime",
        "-RequireDesktopSidecarMode"
      )
      recovery = "Close stale source/dev daemons, then reopen the installed desktop so it can start its bundled daemon."
    }
  } else {
    $null
  }
}

$result = [pscustomobject]@{
  ok = $blockers.Count -eq 0
  version = $Version
  msiPath = $msiPathForReport
  nsisPath = if ([string]::IsNullOrWhiteSpace($NsisPath)) { $null } else { Get-FullPathForReport -Path $NsisPath }
  checkedAt = (Get-Date).ToString("o")
  checks = $checks | ForEach-Object {
    [pscustomobject]@{
      name = $_.name
      ok = $_.ok
      exitCode = $_.exitCode
      failures = $_.failures
    }
  }
  blockers = $blockers
  nextActions = $nextActions
}

$result | ConvertTo-Json -Depth 12
if ($blockers.Count -gt 0) {
  exit 1
}
