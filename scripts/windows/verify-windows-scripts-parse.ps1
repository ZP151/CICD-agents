<#
.SYNOPSIS
Checks PowerShell parser validity for Windows helper scripts.

.DESCRIPTION
Parses each requested PowerShell script with the PowerShell AST parser and
returns structured JSON. This is a non-mutating guard for release/install
helper scripts that may not be covered by TypeScript or Playwright tests.
#>

param(
  [string[]]$Paths = @()
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if (-not $Paths -or $Paths.Count -eq 0) {
  $Paths = Get-ChildItem -LiteralPath $PSScriptRoot -Filter *.ps1 |
    Sort-Object Name |
    ForEach-Object { $_.FullName }
}

$rows = foreach ($path in $Paths) {
  $resolvedPath = $null
  if (Test-Path -LiteralPath $path) {
    $resolvedPath = (Resolve-Path $path).Path
  } else {
    $candidate = Join-Path $repoRoot $path
    if (Test-Path -LiteralPath $candidate) {
      $resolvedPath = (Resolve-Path $candidate).Path
    }
  }

  if ([string]::IsNullOrWhiteSpace($resolvedPath)) {
    [pscustomobject]@{
      path = $path
      exists = $false
      parsed = $false
      errors = @("File does not exist.")
    }
    continue
  }

  $tokens = $null
  $parseErrors = $null
  $null = [System.Management.Automation.Language.Parser]::ParseFile($resolvedPath, [ref]$tokens, [ref]$parseErrors)
  $relativePath = $resolvedPath
  if ($resolvedPath.StartsWith($repoRoot.Path, [System.StringComparison]::OrdinalIgnoreCase)) {
    $relativePath = $resolvedPath.Substring($repoRoot.Path.Length).TrimStart("\", "/")
  }

  [pscustomobject]@{
    path = $relativePath
    exists = $true
    parsed = @($parseErrors).Count -eq 0
    errors = @($parseErrors | ForEach-Object { $_.Message })
  }
}

$failures = @($rows | Where-Object { -not $_.parsed })
$result = [pscustomobject]@{
  ok = $failures.Count -eq 0
  count = @($rows).Count
  rows = @($rows)
  failures = $failures
}

$result | ConvertTo-Json -Depth 8
if ($failures.Count -gt 0) {
  exit 1
}
