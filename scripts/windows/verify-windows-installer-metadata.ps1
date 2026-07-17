<#
.SYNOPSIS
Verifies MergePilot Windows installer metadata.

.DESCRIPTION
Default/active-build mode checks the current local MSI, sibling NSIS setup, and
desktop executable from the Tauri release output. This is the strict release
gate path.

Historical-artifact mode is enabled by passing an MSI path outside the active
Tauri release output. In that mode the script checks the MSI and sibling NSIS
artifact next to it, and only validates a desktop executable when
-DesktopExePath is supplied.
#>

param(
  [Alias("ExpectedVersion")]
  [string]$Version = "",
  [string]$MsiPath = "",
  [string]$NsisSetupPath = "",
  [string]$DesktopExePath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$packageJsonPath = Join-Path $repoRoot "package.json"
$tauriConfigPath = Join-Path $repoRoot "apps\desktop\src-tauri\tauri.conf.json"
$explicitMsiPath = -not [string]::IsNullOrWhiteSpace($MsiPath)
$activeMsiDir = Join-Path $repoRoot "apps\desktop\src-tauri\target\release\bundle\msi"
$activeNsisDir = Join-Path $repoRoot "apps\desktop\src-tauri\target\release\bundle\nsis"
$activeDesktopExePath = Join-Path $repoRoot "apps\desktop\src-tauri\target\release\mergepilot-desktop.exe"

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = (Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json).version
}

if ([string]::IsNullOrWhiteSpace($MsiPath)) {
  $MsiPath = Join-Path $activeMsiDir "MergePilot_$($Version)_x64_en-US.msi"
}

$msiFullPath = [System.IO.Path]::GetFullPath($MsiPath)
$activeMsiDirFullPath = [System.IO.Path]::GetFullPath($activeMsiDir).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
$explicitMsiPathOutsideActiveBuild = $explicitMsiPath -and -not $msiFullPath.StartsWith(
  "$activeMsiDirFullPath$([System.IO.Path]::DirectorySeparatorChar)",
  [System.StringComparison]::OrdinalIgnoreCase
)

if ([string]::IsNullOrWhiteSpace($NsisSetupPath)) {
  if ($explicitMsiPathOutsideActiveBuild) {
    $msiDir = Split-Path -Parent $MsiPath
    $bundleDir = Split-Path -Parent $msiDir
    $siblingNsisSetupPath = Join-Path $bundleDir "nsis\MergePilot_$($Version)_x64-setup.exe"
    $NsisSetupPath = $siblingNsisSetupPath
  } else {
    $NsisSetupPath = Join-Path $activeNsisDir "MergePilot_$($Version)_x64-setup.exe"
  }
}

if ([string]::IsNullOrWhiteSpace($DesktopExePath)) {
  if (-not $explicitMsiPathOutsideActiveBuild) {
    $DesktopExePath = $activeDesktopExePath
  }
}

$tauriConfig = Get-Content -LiteralPath $tauriConfigPath -Raw | ConvertFrom-Json
$expectedProductName = $tauriConfig.productName
$expectedManufacturer = $tauriConfig.bundle.publisher
$expectedUpgradeCode = $tauriConfig.bundle.windows.wix.upgradeCode
if (-not [string]::IsNullOrWhiteSpace($expectedUpgradeCode) -and -not $expectedUpgradeCode.StartsWith("{")) {
  $expectedUpgradeCode = "{{{0}}}" -f $expectedUpgradeCode
}
$expectedUpgradeCode = $expectedUpgradeCode.ToUpperInvariant()

function Get-FileMetadataOrNull {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return $null
  }
  if (-not (Test-Path -LiteralPath $Path)) {
    return [pscustomobject]@{
      path = $Path
      exists = $false
    }
  }

  $item = Get-Item -LiteralPath $Path
  return [pscustomobject]@{
    path = $item.FullName
    exists = $true
    length = $item.Length
    productVersion = $item.VersionInfo.ProductVersion
    fileVersion = $item.VersionInfo.FileVersion
    sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $item.FullName).Hash
  }
}

function Get-MsiProperties {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "MSI not found: $Path"
  }

  $installer = New-Object -ComObject WindowsInstaller.Installer
  $database = $installer.GetType().InvokeMember(
    "OpenDatabase",
    "InvokeMethod",
    $null,
    $installer,
    @((Resolve-Path $Path).Path, 0)
  )
  $view = $database.GetType().InvokeMember(
    "OpenView",
    "InvokeMethod",
    $null,
    $database,
    @("SELECT ``Property``,``Value`` FROM ``Property``")
  )
  $view.GetType().InvokeMember("Execute", "InvokeMethod", $null, $view, @()) | Out-Null

  $properties = @{}
  while ($true) {
    $record = $view.GetType().InvokeMember("Fetch", "InvokeMethod", $null, $view, @())
    if ($null -eq $record) {
      break
    }
    $name = $record.GetType().InvokeMember("StringData", "GetProperty", $null, $record, @(1))
    $value = $record.GetType().InvokeMember("StringData", "GetProperty", $null, $record, @(2))
    $properties[$name] = $value
  }

  return [pscustomobject]@{
    path = (Resolve-Path $Path).Path
    productName = $properties.ProductName
    productVersion = $properties.ProductVersion
    manufacturer = $properties.Manufacturer
    productCode = $properties.ProductCode
    upgradeCode = $properties.UpgradeCode
    allUsers = $properties.ALLUSERS
  }
}

$failures = @()
$msi = $null
try {
  $msi = Get-MsiProperties -Path $MsiPath
} catch {
  $failures += $_.Exception.Message
}

$nsis = Get-FileMetadataOrNull -Path $NsisSetupPath
$desktop = Get-FileMetadataOrNull -Path $DesktopExePath
$desktopSkippedReason = $null
if ([string]::IsNullOrWhiteSpace($DesktopExePath)) {
  $desktopSkippedReason = "Skipped because a custom MSI path outside the active Tauri build output was supplied without -DesktopExePath."
}

if ($msi) {
  if ($msi.productName -ne $expectedProductName) {
    $failures += "MSI ProductName is '$($msi.productName)', expected '$expectedProductName'."
  }
  if ($msi.productVersion -ne $Version) {
    $failures += "MSI ProductVersion is '$($msi.productVersion)', expected '$Version'."
  }
  if ($msi.manufacturer -ne $expectedManufacturer) {
    $failures += "MSI Manufacturer is '$($msi.manufacturer)', expected '$expectedManufacturer'."
  }
  if ($msi.upgradeCode.ToUpperInvariant() -ne $expectedUpgradeCode) {
    $failures += "MSI UpgradeCode is '$($msi.upgradeCode)', expected '$expectedUpgradeCode'."
  }
  if ($msi.allUsers -ne "1") {
    $failures += "MSI ALLUSERS is '$($msi.allUsers)', expected '1' for per-machine install."
  }
}

if (-not $nsis -or -not $nsis.exists) {
  $failures += "NSIS setup not found: $NsisSetupPath"
} else {
  if ($nsis.productVersion -ne $Version) {
    $failures += "NSIS ProductVersion is '$($nsis.productVersion)', expected '$Version'."
  }
  if ($nsis.fileVersion -ne $Version) {
    $failures += "NSIS FileVersion is '$($nsis.fileVersion)', expected '$Version'."
  }
}

if ($desktopSkippedReason) {
  # Historical/downloaded MSI artifacts can be checked without a matching local desktop build.
} elseif (-not $desktop -or -not $desktop.exists) {
  $failures += "Desktop executable not found: $DesktopExePath"
} else {
  if ($desktop.productVersion -ne $Version) {
    $failures += "Desktop ProductVersion is '$($desktop.productVersion)', expected '$Version'."
  }
  if ($desktop.fileVersion -ne $Version) {
    $failures += "Desktop FileVersion is '$($desktop.fileVersion)', expected '$Version'."
  }
}

$result = [pscustomobject]@{
  ok = $failures.Count -eq 0
  expectedVersion = $Version
  expectedProductName = $expectedProductName
  expectedManufacturer = $expectedManufacturer
  expectedUpgradeCode = $expectedUpgradeCode
  msi = $msi
  nsis = $nsis
  desktop = $desktop
  desktopSkippedReason = $desktopSkippedReason
  failures = $failures
}

$result | ConvertTo-Json -Depth 8
if ($failures.Count -gt 0) {
  exit 1
}
