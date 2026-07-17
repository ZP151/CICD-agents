<#
.SYNOPSIS
Smoke-tests the Windows artifact signature verifier.

.DESCRIPTION
Verifies that verify-windows-artifact-signatures.ps1 accepts a path-list string
from a cross-process powershell.exe -File call and reports every supplied
artifact path. This protects readiness/release checks from silently verifying
only the first Windows artifact.
#>

param()

$ErrorActionPreference = "Stop"

$verifierPath = Join-Path $PSScriptRoot "verify-windows-artifact-signatures.ps1"
$tempRoot = Join-Path $env:TEMP ("mergepilot-signature-verifier-smoke-" + [guid]::NewGuid().ToString("N"))
$checks = @()
$failures = @()

function Invoke-SignatureVerifier {
  param([string[]]$Arguments)

  $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $verifierPath @Arguments 2>&1
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
    output = $text
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

try {
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  $msiPath = Join-Path $tempRoot "MergePilot_0.0.0_x64_en-US.msi"
  $nsisPath = Join-Path $tempRoot "MergePilot_0.0.0_x64-setup.exe"
  Set-Content -LiteralPath $msiPath -Value "unsigned test MSI placeholder" -Encoding UTF8
  Set-Content -LiteralPath $nsisPath -Value "unsigned test NSIS placeholder" -Encoding UTF8

  $pathList = @($msiPath, $nsisPath) -join [System.IO.Path]::PathSeparator
  $pathListResult = Invoke-SignatureVerifier -Arguments @(
    "-Version", "0.0.0",
    "-Paths", $pathList
  )
  $artifactPaths = @($pathListResult.json.artifacts | ForEach-Object { $_.path })
  $failureText = @($pathListResult.json.failures) -join [Environment]::NewLine
  Add-Check -Name "reports every path from path-list string" -Passed (
    $pathListResult.exitCode -ne 0 -and
    $pathListResult.json.ok -eq $false -and
    $artifactPaths.Count -eq 2 -and
    $artifactPaths -contains (Resolve-Path $msiPath).Path -and
    $artifactPaths -contains (Resolve-Path $nsisPath).Path -and
    $failureText.Contains((Resolve-Path $msiPath).Path) -and
    $failureText.Contains((Resolve-Path $nsisPath).Path)
  ) -Details ([pscustomobject]@{
    exitCode = $pathListResult.exitCode
    artifactPaths = $artifactPaths
    failures = @($pathListResult.json.failures)
  })

  $singleResult = Invoke-SignatureVerifier -Arguments @(
    "-Version", "0.0.0",
    "-Paths", $msiPath
  )
  Add-Check -Name "still accepts a single explicit path" -Passed (
    $singleResult.exitCode -ne 0 -and
    $singleResult.json.ok -eq $false -and
    @($singleResult.json.artifacts).Count -eq 1 -and
    @($singleResult.json.failures).Count -eq 1
  ) -Details $singleResult.json

  $result = [pscustomobject]@{
    ok = $failures.Count -eq 0
    checks = $checks
    failures = $failures
  }

  $result | ConvertTo-Json -Depth 12
  if ($failures.Count -gt 0) {
    exit 1
  }
} finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
