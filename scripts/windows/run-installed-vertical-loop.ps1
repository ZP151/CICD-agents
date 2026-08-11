param(
  [switch]$AllowFixtureWrites,
  [int]$WorkItemId = 7919,
  [int]$PullRequestId = 2807,
  [int]$BuildId = 4850
)

$ErrorActionPreference = "Stop"

if (-not $AllowFixtureWrites) {
  throw "Installed vertical-loop verification mutates only the recorded [MergePilot Fixture] target. Re-run with -AllowFixtureWrites after confirming the fixture IDs."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$nodePath = Join-Path $repoRoot ".tools\node-v22.11.0-win-x64\node.exe"
$scriptPath = Join-Path $repoRoot "scripts\verify-installed-vertical-loop.mjs"
$testPath = Join-Path $repoRoot "scripts\verify-installed-vertical-loop.test.mjs"

if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "Repository-local Node runtime not found: $nodePath"
}
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Installed vertical-loop runner not found: $scriptPath"
}
if (-not (Test-Path -LiteralPath $testPath)) {
  throw "Installed vertical-loop contract test not found: $testPath"
}

$previous = @{
  LiveAdo = $env:MERGEPILOT_E2E_LIVE_ADO
  AllowWrites = $env:MERGEPILOT_E2E_ALLOW_WRITES
  WorkItemId = $env:MERGEPILOT_FIXTURE_WORK_ITEM_ID
  PullRequestId = $env:MERGEPILOT_FIXTURE_PULL_REQUEST_ID
  BuildId = $env:MERGEPILOT_FIXTURE_BUILD_ID
}

try {
  & $nodePath --test $testPath
  if ($LASTEXITCODE -ne 0) {
    throw "Installed vertical-loop contract tests failed with exit code $LASTEXITCODE."
  }

  $env:MERGEPILOT_E2E_LIVE_ADO = "1"
  $env:MERGEPILOT_E2E_ALLOW_WRITES = "1"
  $env:MERGEPILOT_FIXTURE_WORK_ITEM_ID = [string]$WorkItemId
  $env:MERGEPILOT_FIXTURE_PULL_REQUEST_ID = [string]$PullRequestId
  $env:MERGEPILOT_FIXTURE_BUILD_ID = [string]$BuildId

  & $nodePath $scriptPath
  $exitCode = $LASTEXITCODE
} finally {
  $env:MERGEPILOT_E2E_LIVE_ADO = $previous.LiveAdo
  $env:MERGEPILOT_E2E_ALLOW_WRITES = $previous.AllowWrites
  $env:MERGEPILOT_FIXTURE_WORK_ITEM_ID = $previous.WorkItemId
  $env:MERGEPILOT_FIXTURE_PULL_REQUEST_ID = $previous.PullRequestId
  $env:MERGEPILOT_FIXTURE_BUILD_ID = $previous.BuildId
}

exit $exitCode
