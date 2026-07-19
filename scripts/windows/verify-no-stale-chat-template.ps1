<#
.SYNOPSIS
Verifies that MergePilot runtime files do not contain removed New Chat preload hooks.

.DESCRIPTION
Scans the current desktop build output, an installed directory, a supplied
directory, or an extracted MSI payload for frontend preload helpers that should
no longer be reachable from the shipped desktop bundle.

Source maps are skipped by default because they can contain historical source
text without shipping it as runtime UI. Pass -IncludeSourceMaps only when
auditing debug payload contents.
#>

param(
  [string]$Directory = "",
  [string]$MsiPath = "",
  [switch]$Installed,
  [switch]$IncludeSourceMaps,
  [int]$ExtractionTimeoutSec = 180
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "msi-extract-helpers.ps1")
$tempExtractDir = $null

$patterns = @(
  "WelcomeSuggestions",
  "useChatIndexStatus",
  "fetchChatIndexStatus"
)

function Should-ScanFile {
  param([System.IO.FileInfo]$File)

  $name = $File.Name
  $extension = $File.Extension.ToLowerInvariant()
  if ($name.Equals("mergepilot-desktop.exe", [System.StringComparison]::OrdinalIgnoreCase)) {
    return $true
  }
  if ($name.Equals("Path", [System.StringComparison]::OrdinalIgnoreCase) -and $File.VersionInfo.ProductName -eq "MergePilot") {
    return $true
  }
  if ($name.Equals("mergepilot-daemon.exe", [System.StringComparison]::OrdinalIgnoreCase)) {
    return $false
  }
  if ($name -match "daemon.*\.exe$") {
    return $false
  }
  if ($name.Equals("uninstall.exe", [System.StringComparison]::OrdinalIgnoreCase)) {
    return $false
  }
  if ($extension -in @(".msi", ".exe", ".dll", ".pdb", ".wixpdb")) {
    return $false
  }
  return $extension -in @(".html", ".js", ".mjs", ".cjs", ".css", ".json", ".txt", ".svg", ".wasm", ".map")
}

function Resolve-ScanRoot {
  if (-not [string]::IsNullOrWhiteSpace($Directory)) {
    return (Resolve-Path $Directory).Path
  }

  if ($Installed) {
    return "C:\Program Files\MergePilot"
  }

  if (-not [string]::IsNullOrWhiteSpace($MsiPath)) {
    if (-not (Test-Path -LiteralPath $MsiPath)) {
      throw "MSI not found: $MsiPath"
    }

    $script:tempExtractDir = Join-Path $env:TEMP ("mergepilot-template-scan-" + [guid]::NewGuid().ToString("N"))
    $logPath = Join-Path $script:tempExtractDir "msiexec.log"
    $script:extractMethod = Invoke-MergePilotMsiExtraction -PackagePath $MsiPath -Destination $script:tempExtractDir -InstallerLogPath $logPath -ExtractionTimeoutSec $ExtractionTimeoutSec -RetryOnInstallerBusy

    return $script:tempExtractDir
  }

  $dist = Join-Path $repoRoot "apps\desktop\dist"
  if (Test-Path -LiteralPath $dist) {
    return (Resolve-Path $dist).Path
  }

  throw "No scan root found. Build the desktop app first or pass -Directory, -Installed, or -MsiPath."
}

function Test-BinaryContains {
  param(
    [byte[]]$Bytes,
    [string]$Needle
  )

  $utf8 = [System.Text.Encoding]::UTF8.GetBytes($Needle)
  $utf16 = [System.Text.Encoding]::Unicode.GetBytes($Needle)
  return (Find-Bytes -Bytes $Bytes -Needle $utf8) -or (Find-Bytes -Bytes $Bytes -Needle $utf16)
}

function Find-Bytes {
  param(
    [byte[]]$Bytes,
    [byte[]]$Needle
  )

  if ($Needle.Length -eq 0 -or $Bytes.Length -lt $Needle.Length) {
    return $false
  }

  $lastStart = $Bytes.Length - $Needle.Length
  for ($i = 0; $i -le $lastStart; $i++) {
    if ($Bytes[$i] -ne $Needle[0]) {
      continue
    }

    $matched = $true
    for ($j = 1; $j -lt $Needle.Length; $j++) {
      if ($Bytes[$i + $j] -ne $Needle[$j]) {
        $matched = $false
        break
      }
    }

    if ($matched) {
      return $true
    }
  }

  return $false
}

try {
  $scanRoot = Resolve-ScanRoot
  if (-not (Test-Path -LiteralPath $scanRoot)) {
    throw "Scan root not found: $scanRoot"
  }

  $matches = @()
  $files = @(Get-ChildItem -LiteralPath $scanRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      (Should-ScanFile -File $_) -and
      ($IncludeSourceMaps -or -not $_.Name.EndsWith(".map", [System.StringComparison]::OrdinalIgnoreCase))
    })

  foreach ($file in $files) {
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    foreach ($pattern in $patterns) {
      if (Test-BinaryContains -Bytes $bytes -Needle $pattern) {
        $matches += [pscustomobject]@{
          path = $file.FullName
          pattern = $pattern
          length = $file.Length
        }
      }
    }
  }

  $result = [pscustomobject]@{
    ok = $matches.Count -eq 0
    scanRoot = $scanRoot
    fileCount = $files.Count
    includeSourceMaps = [bool]$IncludeSourceMaps
    extractMethod = if ($MsiPath) { $script:extractMethod } else { $null }
    patterns = $patterns
    matches = $matches
  }

  $result | ConvertTo-Json -Depth 8
  if ($matches.Count -gt 0) {
    exit 1
  }
} catch {
  $message = $_.Exception.Message
  [pscustomobject]@{
    ok = $false
    scanRoot = if ($tempExtractDir) { $tempExtractDir } else { $null }
    fileCount = 0
    includeSourceMaps = [bool]$IncludeSourceMaps
    extractMethod = if ($MsiPath) { $script:extractMethod } else { $null }
    patterns = $patterns
    matches = @()
    failures = @($message)
  } | ConvertTo-Json -Depth 8
  exit 1
} finally {
  if ($tempExtractDir) {
    Remove-Item -LiteralPath $tempExtractDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
