<#
.SYNOPSIS
Smoke-tests the Release workflow static verifier.

.DESCRIPTION
Verifies that the default Release workflow static gate passes, that strict
script tracking mode agrees with the current Git index, and that the Windows
signing readiness guard cannot regress to HTTP HEAD timestamp probing.
#>

param()

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$verifierPath = Join-Path $PSScriptRoot "verify-release-workflow-static.ps1"
$signingReadinessPath = Join-Path $PSScriptRoot "verify-windows-signing-readiness.ps1"

$releaseScripts = @(
  "scripts/windows/verify-no-stale-chat-template.ps1",
  "scripts/windows/verify-windows-installer-metadata.ps1",
  "scripts/windows/verify-windows-signing-readiness.ps1",
  "scripts/windows/sign-windows-release-artifacts.ps1",
  "scripts/windows/verify-windows-artifact-signatures.ps1"
)

$checks = @()
$failures = @()

function Invoke-ReleaseVerifier {
  param([switch]$RequireTrackedScripts)

  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $verifierPath
  )
  if ($RequireTrackedScripts) {
    $arguments += "-RequireTrackedScripts"
  }

  $output = & powershell.exe @arguments 2>&1
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

$defaultResult = Invoke-ReleaseVerifier
Add-Check -Name "default release verifier passes" -Passed (
  $defaultResult.exitCode -eq 0 -and
  $defaultResult.json.ok -eq $true
) -Details $defaultResult.json

$parserRows = foreach ($script in @($releaseScripts + "scripts/windows/verify-release-workflow-static.ps1")) {
  $absoluteScript = Join-Path $repoRoot $script
  $errors = $null
  $tokens = $null
  if (-not (Test-Path -LiteralPath $absoluteScript)) {
    [pscustomobject]@{
      path = $script
      exists = $false
      parsed = $false
      errors = @("File does not exist.")
    }
    continue
  }
  [System.Management.Automation.Language.Parser]::ParseFile($absoluteScript, [ref]$tokens, [ref]$errors) > $null
  [pscustomobject]@{
    path = $script
    exists = $true
    parsed = $errors.Count -eq 0
    errors = @($errors | ForEach-Object { $_.Message })
  }
}
Add-Check -Name "release workflow scripts parse" -Passed (
  @($parserRows | Where-Object { -not $_.exists -or -not $_.parsed }).Count -eq 0
) -Details $parserRows

$trackedRows = foreach ($script in $releaseScripts) {
  git -C $repoRoot ls-files --error-unmatch $script *> $null
  [pscustomobject]@{
    path = $script
    exists = Test-Path -LiteralPath (Join-Path $repoRoot $script)
    tracked = $LASTEXITCODE -eq 0
  }
}
$untrackedScripts = @($trackedRows | Where-Object { -not $_.tracked } | ForEach-Object { $_.path })

$strictResult = Invoke-ReleaseVerifier -RequireTrackedScripts
$strictFailures = @($strictResult.json.failures)
if ($untrackedScripts.Count -eq 0) {
  Add-Check -Name "strict tracking passes when scripts are tracked" -Passed (
    $strictResult.exitCode -eq 0 -and
    $strictResult.json.ok -eq $true
  ) -Details $strictResult.json
} else {
  $allUntrackedReported = $true
  foreach ($script in $untrackedScripts) {
    $expected = "Release workflow script is not tracked by Git: $($script -replace '/', '\')"
    if (-not ($strictFailures -contains $expected)) {
      $allUntrackedReported = $false
    }
  }
  Add-Check -Name "strict tracking reports current untracked scripts" -Passed (
    $strictResult.exitCode -ne 0 -and
    $strictResult.json.ok -eq $false -and
    $allUntrackedReported
  ) -Details ([pscustomobject]@{
    trackedRows = $trackedRows
    strictFailures = $strictFailures
  })
}

$signingReadinessSource = Get-Content -LiteralPath $signingReadinessPath -Raw
Add-Check -Name "signing readiness uses TCP timestamp probe" -Passed (
  $signingReadinessSource.Contains('probe = "tcp_connect"') -and
  -not $signingReadinessSource.Contains('Invoke-WebRequest -Uri $TimestampUrl -Method Head')
) -Details ([pscustomobject]@{
  containsTcpProbe = $signingReadinessSource.Contains('probe = "tcp_connect"')
  containsHeadProbe = $signingReadinessSource.Contains('Invoke-WebRequest -Uri $TimestampUrl -Method Head')
})

$result = [pscustomobject]@{
  ok = $failures.Count -eq 0
  checks = $checks
  failures = $failures
}

$result | ConvertTo-Json -Depth 12
if ($failures.Count -gt 0) {
  exit 1
}
