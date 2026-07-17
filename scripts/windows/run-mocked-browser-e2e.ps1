<#
.SYNOPSIS
Runs mocked Playwright browser tests with a local Vite server lock.

.DESCRIPTION
The default Playwright config owns a Vite web server on 127.0.0.1:1420.
Starting two Playwright commands at the same time can make one run see
connection refused errors when the other run starts or stops that server.

This wrapper serializes browser runs that use the default port and then
delegates to the repository-local pnpm-project.ps1 runner. It does not change
test behavior; it only prevents misleading local harness failures.

.EXAMPLE
.\scripts\windows\run-mocked-browser-e2e.ps1 -Grep "@smoke @mocked"

.EXAMPLE
.\scripts\windows\run-mocked-browser-e2e.ps1 -TestPath tests/e2e/review-queue.spec.ts -Grep "selected queue lane"

.EXAMPLE
.\scripts\windows\run-mocked-browser-e2e.ps1 -Spec tests/e2e/route-cache.spec.ts -Grep "pipeline rows"
#>

[CmdletBinding()]
param(
  [Alias("Spec", "Path")]
  [string]$TestPath = "",
  [string]$Project = "chromium",
  [string]$Grep = "",
  [int]$Workers = 0,
  [int]$LockTimeoutSeconds = 600
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$pnpmProject = Join-Path $PSScriptRoot "pnpm-project.ps1"
$mutexName = "Global\MergePilotPlaywrightVite1420"
$mutex = [System.Threading.Mutex]::new($false, $mutexName)
$hasLock = $false

try {
  $hasLock = $mutex.WaitOne([TimeSpan]::FromSeconds($LockTimeoutSeconds))
  if (-not $hasLock) {
    throw "Timed out waiting for mocked browser E2E lock '$mutexName' after $LockTimeoutSeconds seconds. Another Playwright/Vite run may still be using 127.0.0.1:1420."
  }

  $args = @("exec", "playwright", "test")
  if (-not [string]::IsNullOrWhiteSpace($TestPath)) {
    $args += $TestPath.Replace("\", "/")
  }
  $args += "--project=$Project"
  if ($Workers -gt 0) {
    $args += "--workers=$Workers"
  }
  if (-not [string]::IsNullOrWhiteSpace($Grep)) {
    $args += @("--grep", $Grep)
  }

  & $pnpmProject @args
  exit $LASTEXITCODE
} finally {
  if ($hasLock) {
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}
