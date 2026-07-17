<#
.SYNOPSIS
Smoke-tests non-destructive path handling for sign-windows-release-artifacts.ps1.

.DESCRIPTION
The real signing script mutates artifacts when valid files and signing secrets
are present. This smoke uses deliberately missing artifact paths so it can
verify -Paths parsing without signing, importing a certificate, or touching
release files.
#>

param(
  [string]$Version = "",
  [string]$TempRoot = (Join-Path ([System.IO.Path]::GetTempPath()) "mergepilot-sign-path-smoke")
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$packageJsonPath = Join-Path $repoRoot "package.json"
$signScriptPath = Join-Path $PSScriptRoot "sign-windows-release-artifacts.ps1"

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = (Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json).version
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

function Invoke-SignScript {
  param([string[]]$Paths)

  $pathList = $Paths -join [System.IO.Path]::PathSeparator
  $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $signScriptPath -Version $Version -Paths $pathList 2>&1
  $exitCode = $LASTEXITCODE
  $text = ($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine

  return [pscustomobject]@{
    exitCode = $exitCode
    pathList = $pathList
    output = $text
  }
}

$missingMsiPath = Join-Path $TempRoot "msi\MergePilot_missing_$($Version)_x64_en-US.msi"
$missingNsisPath = Join-Path $TempRoot "nsis\MergePilot_$($Version)_x64-setup.exe"
$paths = @($missingMsiPath, $missingNsisPath)
$result = Invoke-SignScript -Paths $paths

Add-Check -Name "path-list missing artifacts are reported before signing" -Passed (
  $result.exitCode -ne 0 -and
  $result.output.Contains($missingMsiPath) -and
  $result.output.Contains($missingNsisPath) -and
  -not $result.output.Contains("WINDOWS_CODESIGN_CERT")
) -Details ([pscustomobject]@{
  exitCode = $result.exitCode
  pathList = $result.pathList
  missingMsiPath = $missingMsiPath
  missingNsisPath = $missingNsisPath
  output = if ($result.output.Length -gt 1200) { $result.output.Substring(0, 1200) } else { $result.output }
})

$smokeResult = [pscustomobject]@{
  ok = $failures.Count -eq 0
  version = $Version
  checks = $checks
  failures = $failures
}

$smokeResult | ConvertTo-Json -Depth 8
if ($failures.Count -gt 0) {
  exit 1
}
