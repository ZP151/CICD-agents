<#
.SYNOPSIS
Runs the repository-local pnpm with the repository-local Node.js runtime first
on PATH.

.DESCRIPTION
Use this wrapper for tests, typechecks, builds, and other pnpm commands in this
workspace. It avoids accidentally using a Codex, system, nvm, or globally
installed Node.js runtime.

Examples:
  .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
  .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/checkpointHandoff.test.ts
#>

[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $PnpmArgs
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$nodeDir = Join-Path $repoRoot ".tools\node-v22.11.0-win-x64"
$pnpmExe = Join-Path $repoRoot ".tools\pnpm.exe"

if (-not (Test-Path -LiteralPath $nodeDir)) {
  throw "Repository-local Node.js runtime not found: $nodeDir"
}

if (-not (Test-Path -LiteralPath $pnpmExe)) {
  throw "Repository-local pnpm executable not found: $pnpmExe"
}

$env:PATH = "$nodeDir;$($repoRoot)\.tools;$env:PATH"

& $pnpmExe @PnpmArgs
exit $LASTEXITCODE
