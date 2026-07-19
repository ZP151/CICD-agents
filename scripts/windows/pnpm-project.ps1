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

function Get-PnpmFilterValues {
  param([string[]] $CliArgs)

  $values = @()
  for ($index = 0; $index -lt $CliArgs.Count; $index++) {
    $arg = $CliArgs[$index]
    if ($arg -eq "--filter" -or $arg -eq "-F") {
      if ($index + 1 -lt $CliArgs.Count) {
        $values += $CliArgs[$index + 1]
        $index++
      }
      continue
    }
    if ($arg.StartsWith("--filter=")) {
      $values += $arg.Substring("--filter=".Length)
    }
  }
  return $values
}

function Get-WorkspacePackageNames {
  param([string] $Root)

  $packageNames = New-Object System.Collections.Generic.HashSet[string]
  foreach ($base in @("apps", "packages")) {
    $basePath = Join-Path $Root $base
    if (-not (Test-Path -LiteralPath $basePath)) {
      continue
    }
    Get-ChildItem -LiteralPath $basePath -Filter package.json -Recurse |
      Where-Object { $_.FullName -notmatch "\\node_modules\\" } |
      ForEach-Object {
        try {
          $package = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
          if (-not [string]::IsNullOrWhiteSpace([string]$package.name)) {
            $null = $packageNames.Add([string]$package.name)
          }
        } catch {
          throw "Failed to parse package manifest: $($_.FullName). $($_.Exception.Message)"
        }
      }
  }
  return $packageNames
}

function Assert-PnpmPackageFilters {
  param(
    [string] $Root,
    [string[]] $CliArgs
  )

  $filters = Get-PnpmFilterValues -CliArgs $CliArgs
  if ($filters.Count -eq 0) {
    return
  }

  $packageNames = Get-WorkspacePackageNames -Root $Root
  foreach ($filter in $filters) {
    if ($filter -match "\\") {
      throw "Invalid pnpm package filter '$filter'. Use forward slashes in package names, for example '@mergepilot/desktop'."
    }
    if ($filter -match "^@[^/\s]+/[^/\s]+$" -and -not $packageNames.Contains($filter)) {
      throw "No workspace package matches pnpm filter '$filter'. Known packages: $(([string[]]$packageNames) -join ', ')"
    }
  }
}

Assert-PnpmPackageFilters -Root $repoRoot -CliArgs $PnpmArgs

$env:PATH = "$nodeDir;$($repoRoot)\.tools;$env:PATH"

& $pnpmExe @PnpmArgs
exit $LASTEXITCODE
