<#
.SYNOPSIS
Verifies the repository-local pnpm wrapper rejects typoed package filters.

.DESCRIPTION
pnpm can print "No projects matched" while returning exit code 0 for a typoed
filter. This smoke keeps pnpm-project.ps1 from producing a false green when a
package name uses a backslash or otherwise fails wrapper preflight.
#>

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$pnpmProject = Join-Path $PSScriptRoot "pnpm-project.ps1"
$desktopPackageJson = Get-Content -LiteralPath (Join-Path $repoRoot "apps\desktop\package.json") -Raw | ConvertFrom-Json
$expectedDesktopScriptLine = "$($desktopPackageJson.name)@$($desktopPackageJson.version) typecheck"

function Invoke-Wrapper {
  param([string[]] $CliArgs)

  $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $pnpmProject @CliArgs 2>&1
  [pscustomobject]@{
    exitCode = $LASTEXITCODE
    output = ($output | ForEach-Object { [string]$_ }) -join "`n"
  }
}

$failures = @()

$badFilter = Invoke-Wrapper -CliArgs @("--filter", "@mergepilot\desktop", "typecheck")
if ($badFilter.exitCode -eq 0) {
  $failures += "Backslash package filter unexpectedly exited 0."
}
if ($badFilter.output -notmatch "Use forward slashes") {
  $failures += "Backslash package filter did not explain the forward-slash package-name requirement."
}
if ($badFilter.output -match "No projects matched") {
  $failures += "Backslash package filter reached pnpm instead of failing in wrapper preflight."
}

$missingPackage = Invoke-Wrapper -CliArgs @("--filter", "@mergepilot/not-a-package", "typecheck")
if ($missingPackage.exitCode -eq 0) {
  $failures += "Missing package filter unexpectedly exited 0."
}
if ($missingPackage.output -notmatch "No workspace package matches") {
  $failures += "Missing package filter did not explain that no workspace package matched."
}

$validFilter = Invoke-Wrapper -CliArgs @("--filter", "@mergepilot/desktop", "typecheck")
if ($validFilter.exitCode -ne 0) {
  $failures += "Valid package filter failed: $($validFilter.output)"
}
if (-not $validFilter.output.Contains($expectedDesktopScriptLine)) {
  $failures += "Valid package filter did not run the expected desktop typecheck."
}

[pscustomobject]@{
  ok = $failures.Count -eq 0
  repoRoot = [string]$repoRoot
  badFilterExitCode = $badFilter.exitCode
  missingPackageExitCode = $missingPackage.exitCode
  validFilterExitCode = $validFilter.exitCode
  failures = $failures
} | ConvertTo-Json -Depth 6

if ($failures.Count -gt 0) {
  exit 1
}
exit 0
