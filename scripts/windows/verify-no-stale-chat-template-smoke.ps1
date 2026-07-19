<#
.SYNOPSIS
Smoke-tests the stale Chat preload verifier.

.DESCRIPTION
Creates temporary clean and intentionally stale runtime payloads, then verifies
that verify-no-stale-chat-template.ps1 accepts clean files and current welcome
copy, rejects removed frontend preload helper names, and ignores source maps
unless explicitly asked to include them.
#>

param()

$ErrorActionPreference = "Stop"

$verifierPath = Join-Path $PSScriptRoot "verify-no-stale-chat-template.ps1"
$tempRoot = Join-Path $env:TEMP ("mergepilot-template-verifier-smoke-" + [guid]::NewGuid().ToString("N"))
$checks = @()
$failures = @()

function Invoke-TemplateVerifier {
  param(
    [string]$Directory,
    [switch]$IncludeSourceMaps
  )

  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $verifierPath,
    "-Directory",
    $Directory
  )
  if ($IncludeSourceMaps) {
    $arguments += "-IncludeSourceMaps"
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

try {
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

  $cleanDir = Join-Path $tempRoot "clean"
  New-Item -ItemType Directory -Force -Path $cleanDir | Out-Null
  Set-Content -LiteralPath (Join-Path $cleanDir "app.js") -Value "const refresh = 'refreshChatIndexStatus';" -Encoding UTF8
  $cleanResult = Invoke-TemplateVerifier -Directory $cleanDir
  Add-Check -Name "accepts clean runtime payload" -Passed (
    $cleanResult.exitCode -eq 0 -and
    $cleanResult.json.ok -eq $true -and
    $cleanResult.json.patterns -contains "fetchChatIndexStatus"
  ) -Details $cleanResult.json

  $welcomeDir = Join-Path $tempRoot "current-welcome"
  New-Item -ItemType Directory -Force -Path $welcomeDir | Out-Null
  Set-Content -LiteralPath (Join-Path $welcomeDir "app.js") -Value "const title = 'Ask MergePilot anything';" -Encoding UTF8
  $welcomeResult = Invoke-TemplateVerifier -Directory $welcomeDir
  Add-Check -Name "accepts current New Chat welcome copy" -Passed (
    $welcomeResult.exitCode -eq 0 -and
    $welcomeResult.json.ok -eq $true -and
    ($welcomeResult.json.matches | Where-Object { $_.pattern -eq "Ask MergePilot anything" }).Count -eq 0
  ) -Details $welcomeResult.json

  $preloadDir = Join-Path $tempRoot "stale-preload"
  New-Item -ItemType Directory -Force -Path $preloadDir | Out-Null
  Set-Content -LiteralPath (Join-Path $preloadDir "app.js") -Value "export function fetchChatIndexStatus() { return null; }" -Encoding UTF8
  $preloadResult = Invoke-TemplateVerifier -Directory $preloadDir
  Add-Check -Name "rejects stale frontend preload helper" -Passed (
    $preloadResult.exitCode -ne 0 -and
    $preloadResult.json.ok -eq $false -and
    ($preloadResult.json.matches | Where-Object { $_.pattern -eq "fetchChatIndexStatus" }).Count -gt 0
  ) -Details $preloadResult.json

  $sourceMapDir = Join-Path $tempRoot "source-map"
  New-Item -ItemType Directory -Force -Path $sourceMapDir | Out-Null
  Set-Content -LiteralPath (Join-Path $sourceMapDir "app.js") -Value "const ok = true;" -Encoding UTF8
  Set-Content -LiteralPath (Join-Path $sourceMapDir "app.js.map") -Value '{"sourcesContent":["function WelcomeSuggestions() {}"]}' -Encoding UTF8
  $sourceMapDefaultResult = Invoke-TemplateVerifier -Directory $sourceMapDir
  Add-Check -Name "ignores source maps by default" -Passed (
    $sourceMapDefaultResult.exitCode -eq 0 -and
    $sourceMapDefaultResult.json.ok -eq $true
  ) -Details $sourceMapDefaultResult.json

  $sourceMapIncludedResult = Invoke-TemplateVerifier -Directory $sourceMapDir -IncludeSourceMaps
  Add-Check -Name "can audit source maps when requested" -Passed (
    $sourceMapIncludedResult.exitCode -ne 0 -and
    $sourceMapIncludedResult.json.ok -eq $false -and
    ($sourceMapIncludedResult.json.matches | Where-Object { $_.pattern -eq "WelcomeSuggestions" }).Count -gt 0
  ) -Details $sourceMapIncludedResult.json

  $result = [pscustomobject]@{
    ok = $failures.Count -eq 0
    checks = $checks
    failures = $failures
  }

  $result | ConvertTo-Json -Depth 12
  if ($failures.Count -gt 0) {
    exit 1
  }
  exit 0
} finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
