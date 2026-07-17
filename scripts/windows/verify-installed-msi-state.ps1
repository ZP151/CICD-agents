param(
  [string]$ExpectedVersion = "",
  [switch]$RequireLegacyCleanup,
  [switch]$ProbeDaemon,
  [switch]$ProbeAuth,
  [switch]$RequireAvatar,
  [switch]$RequireMsiPayloadMatch,
  [string]$MsiPath = "",
  [int]$Port = 8787
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
  $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "packages\daemon\package.json") -Raw | ConvertFrom-Json).version
}

function Get-UninstallEntries {
  $roots = @(
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
  )
  $items = @()
  foreach ($root in $roots) {
    Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
      $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
      if ($props.DisplayName -like "*MergePilot*" -or $props.DisplayName -like "*CICD*") {
        $items += [pscustomobject]@{
          root = $root
          key = $_.PSChildName
          displayName = $props.DisplayName
          displayVersion = $props.DisplayVersion
          installLocation = $props.InstallLocation
          uninstallString = $props.UninstallString
        }
      }
    }
  }
  return $items
}

function Test-PathExists([string]$Path) {
  return Test-Path -LiteralPath $Path
}

$installDir = "C:\Program Files\MergePilot"
$legacyInstallDir = "C:\Program Files\CICD-Agent"
$legacyPublisherShortcutDir = "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Total eBiz Solutions"
$currentShortcutDir = "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\MergePilot"
$installedDesktopPath = Join-Path $installDir "mergepilot-desktop.exe"
$installedDaemonPath = Join-Path $installDir "mergepilot-daemon.exe"

if ([string]::IsNullOrWhiteSpace($MsiPath)) {
  $MsiPath = Join-Path $repoRoot "apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_$($ExpectedVersion)_x64_en-US.msi"
}

function Get-Sha256OrNull([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
}

function Get-FileVersionInfoOrNull([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  $item = Get-Item -LiteralPath $Path
  return [pscustomobject]@{
    path = $item.FullName
    length = $item.Length
    lastWriteTime = $item.LastWriteTime
    productVersion = $item.VersionInfo.ProductVersion
    fileVersion = $item.VersionInfo.FileVersion
  }
}

function Get-TauriBundleKind([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $text = [System.Text.Encoding]::ASCII.GetString($bytes)
  if ($text.Contains("__TAURI_BUNDLE_TYPE_VAR_MSI")) {
    return "msi"
  }
  if ($text.Contains("__TAURI_BUNDLE_TYPE_VAR_NSS")) {
    return "nsis"
  }
  return "unknown"
}

function Get-ListeningProcessInfo([int]$TcpPort) {
  $connection = Get-NetTCPConnection -LocalPort $TcpPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $connection) {
    return $null
  }

  $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
  return [pscustomobject]@{
    id = $connection.OwningProcess
    path = if ($process) { [string]$process.Path } else { $null }
  }
}

function Wait-DaemonHealth([int]$TcpPort, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  $lastError = $null
  while ((Get-Date) -lt $deadline) {
    try {
      return Invoke-RestMethod -Uri "http://127.0.0.1:$TcpPort/healthz" -Method Get -TimeoutSec 2
    } catch {
      $lastError = $_.Exception.Message
      Start-Sleep -Milliseconds 500
    }
  }

  throw "Daemon health probe failed after $Seconds seconds: $lastError"
}

function Test-SamePath([string]$Left, [string]$Right) {
  if ([string]::IsNullOrWhiteSpace($Left) -or [string]::IsNullOrWhiteSpace($Right)) {
    return $false
  }
  return [StringComparer]::OrdinalIgnoreCase.Equals($Left, $Right)
}

$uninstallEntries = @(Get-UninstallEntries)
$mergePilotEntries = @($uninstallEntries | Where-Object { $_.displayName -eq "MergePilot" })
$legacyEntries = @($uninstallEntries | Where-Object { $_.displayName -eq "CICD-Agent" -or ($_.displayName -eq "MergePilot" -and $_.displayVersion -ne $ExpectedVersion) })

$installDirChildren = @()
if (Test-PathExists $installDir) {
  $installDirChildren = @(Get-ChildItem -LiteralPath $installDir -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
}
$legacyDirChildren = @()
if (Test-PathExists $legacyInstallDir) {
  $legacyDirChildren = @(Get-ChildItem -LiteralPath $legacyInstallDir -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
}

$daemonProbeAutoStarted = $false
$daemonProbeStartedProcess = $null
$daemonProbeStopped = $null
$daemonProbePortOwnerBefore = $null
$daemonProbePortOwnerAfter = $null
$daemonHealth = $null
$daemonError = $null

if ($ProbeDaemon -or $ProbeAuth -or $RequireAvatar) {
  try {
    $daemonProbePortOwnerBefore = Get-ListeningProcessInfo $Port
    if (-not $daemonProbePortOwnerBefore) {
      if (-not (Test-Path -LiteralPath $installedDaemonPath)) {
        throw "Installed daemon not found: $installedDaemonPath"
      }
      $started = Start-Process -FilePath $installedDaemonPath -ArgumentList "--port", "$Port" -WindowStyle Hidden -PassThru
      $daemonProbeAutoStarted = $true
      $daemonProbeStartedProcess = [pscustomobject]@{
        id = $started.Id
        path = if ([string]::IsNullOrWhiteSpace([string]$started.Path)) { $installedDaemonPath } else { [string]$started.Path }
      }
    } elseif (-not (Test-SamePath $daemonProbePortOwnerBefore.path $installedDaemonPath)) {
      throw "Refusing to probe unexpected process on port $Port. Expected '$installedDaemonPath', got '$($daemonProbePortOwnerBefore.path)'."
    }

    $daemonHealth = Wait-DaemonHealth $Port 30
  } catch {
    $daemonError = $_.Exception.Message
  }
}

$authStatus = $null
$authError = $null
if ($ProbeAuth -or $RequireAvatar) {
  try {
    $rawAuth = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/auth/status" -Method Get -TimeoutSec 10
    $avatar = ""
    if ($null -ne $rawAuth.avatarDataUrl) {
      $avatar = [string]$rawAuth.avatarDataUrl
    }
    if ((-not [bool]$rawAuth.authenticated) -or ($RequireAvatar -and [string]::IsNullOrWhiteSpace($avatar))) {
      $null = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/auth/me" -Method Get -TimeoutSec 30
      $rawAuth = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/auth/status" -Method Get -TimeoutSec 10
    }
    $avatar = ""
    if ($null -ne $rawAuth.avatarDataUrl) {
      $avatar = [string]$rawAuth.avatarDataUrl
    }
    $authStatus = [pscustomobject]@{
      authenticated = [bool]$rawAuth.authenticated
      name = $rawAuth.name
      upn = $rawAuth.upn
      hasAvatar = -not [string]::IsNullOrWhiteSpace($avatar)
      avatarLength = $avatar.Length
      avatarPrefix = if ($avatar.Length -gt 32) { $avatar.Substring(0, 32) } else { $avatar }
    }
  } catch {
    $authError = $_.Exception.Message
  }
}

if ($daemonProbeAutoStarted -and $daemonProbeStartedProcess) {
  try {
    $daemonProbePortOwnerAfter = Get-ListeningProcessInfo $Port
    if ($daemonProbePortOwnerAfter -and $daemonProbePortOwnerAfter.id -eq $daemonProbeStartedProcess.id) {
      Stop-Process -Id $daemonProbeStartedProcess.id -Force -ErrorAction Stop
      $daemonProbeStopped = $true
    } else {
      $daemonProbeStopped = "not stopped: port owner changed"
    }
  } catch {
    $daemonProbeStopped = "error: $($_.Exception.Message)"
  }
}

$msiPayload = $null
$msiPayloadError = $null
if ($RequireMsiPayloadMatch) {
  $extractDir = Join-Path $env:TEMP ("mergepilot-msi-verify-" + [guid]::NewGuid().ToString("N"))
  $logPath = Join-Path $extractDir "msiexec.log"
  try {
    if (-not (Test-Path -LiteralPath $MsiPath)) {
      throw "MSI not found: $MsiPath"
    }
    New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
    $process = Start-Process -FilePath msiexec.exe -ArgumentList @(
      "/a",
      (Resolve-Path $MsiPath).Path,
      "/qn",
      "TARGETDIR=$extractDir",
      "/L*v",
      $logPath
    ) -Wait -PassThru
    if ($process.ExitCode -ne 0) {
      throw "MSI administrative extraction failed with exit code $($process.ExitCode)."
    }

    $payloadDesktop = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter mergepilot-desktop.exe |
      Select-Object -First 1
    $payloadDaemon = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter mergepilot-daemon.exe |
      Select-Object -First 1
    if (-not $payloadDesktop) {
      throw "Extracted MSI did not contain mergepilot-desktop.exe."
    }
    if (-not $payloadDaemon) {
      throw "Extracted MSI did not contain mergepilot-daemon.exe."
    }

    $msiPayload = [pscustomobject]@{
      msiPath = (Resolve-Path $MsiPath).Path
      desktopHash = Get-Sha256OrNull $payloadDesktop.FullName
      daemonHash = Get-Sha256OrNull $payloadDaemon.FullName
      desktopBundleKind = Get-TauriBundleKind $payloadDesktop.FullName
      daemonBundleKind = Get-TauriBundleKind $payloadDaemon.FullName
    }
  } catch {
    $msiPayloadError = $_.Exception.Message
  } finally {
    Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$installedHashes = [pscustomobject]@{
  desktopHash = Get-Sha256OrNull $installedDesktopPath
  daemonHash = Get-Sha256OrNull $installedDaemonPath
}
$installedFiles = [pscustomobject]@{
  desktop = Get-FileVersionInfoOrNull $installedDesktopPath
  daemon = Get-FileVersionInfoOrNull $installedDaemonPath
  uninstall = Get-FileVersionInfoOrNull (Join-Path $installDir "uninstall.exe")
}
$installedBundleKind = [pscustomobject]@{
  desktop = Get-TauriBundleKind $installedDesktopPath
  daemon = Get-TauriBundleKind $installedDaemonPath
}

$failures = @()
if ($mergePilotEntries.Count -ne 1) {
  $failures += "Expected exactly one MergePilot uninstall entry; found $($mergePilotEntries.Count)."
}
if ($mergePilotEntries.Count -eq 1 -and $mergePilotEntries[0].displayVersion -ne $ExpectedVersion) {
  $failures += "Expected MergePilot version $ExpectedVersion; found $($mergePilotEntries[0].displayVersion)."
}
if (-not (Test-PathExists $installedDesktopPath)) {
  $failures += "Installed mergepilot-desktop.exe was not found."
}
if (-not (Test-PathExists $installedDaemonPath)) {
  $failures += "Installed mergepilot-daemon.exe was not found."
}
foreach ($legacyFile in @("cicd-agent-desktop.exe", "cicd-daemon.exe")) {
  if (Test-PathExists (Join-Path $installDir $legacyFile)) {
    $failures += "Legacy file remains in MergePilot install directory: $legacyFile."
  }
}
if ($RequireMsiPayloadMatch -and (Test-PathExists (Join-Path $installDir "uninstall.exe"))) {
  $failures += "NSIS uninstall.exe is present while MSI payload parity was required."
}
if ($RequireLegacyCleanup -and $legacyEntries.Count -gt 0) {
  $failures += "Legacy uninstall entries remain: $($legacyEntries.displayName -join ', ')."
}
if ($RequireLegacyCleanup -and (Test-PathExists $legacyInstallDir)) {
  $failures += "Legacy install directory remains: $legacyInstallDir."
}
if ($RequireLegacyCleanup -and (Test-PathExists $legacyPublisherShortcutDir)) {
  $failures += "Legacy publisher Start Menu folder remains: $legacyPublisherShortcutDir."
}
if (-not (Test-PathExists (Join-Path $currentShortcutDir "MergePilot.lnk"))) {
  $failures += "Current Start Menu shortcut was not found."
}
if ($ProbeDaemon -and -not $daemonHealth) {
  $failures += "Daemon health probe failed: $daemonError"
}
if ($ProbeDaemon -and $daemonHealth -and $daemonHealth.version -ne $ExpectedVersion) {
  $failures += "Daemon health version mismatch. Expected $ExpectedVersion; got $($daemonHealth.version)."
}
if (($ProbeAuth -or $RequireAvatar) -and -not $authStatus) {
  $failures += "Auth status probe failed: $authError"
}
if ($RequireAvatar -and $authStatus -and -not $authStatus.hasAvatar) {
  $failures += "Auth status did not include an avatar data URL."
}
if ($RequireMsiPayloadMatch -and -not $msiPayload) {
  $failures += "MSI payload extraction failed: $msiPayloadError"
}
if ($RequireMsiPayloadMatch -and $msiPayload) {
  if ($installedBundleKind.desktop -ne "msi") {
    $failures += "Installed mergepilot-desktop.exe bundle kind is '$($installedBundleKind.desktop)', expected 'msi'."
  }
  if ($installedHashes.desktopHash -ne $msiPayload.desktopHash) {
    $failures += "Installed mergepilot-desktop.exe does not match the MSI payload hash."
  }
  if ($installedHashes.daemonHash -ne $msiPayload.daemonHash) {
    $failures += "Installed mergepilot-daemon.exe does not match the MSI payload hash."
  }
}

$result = [pscustomobject]@{
  ok = $failures.Count -eq 0
  expectedVersion = $ExpectedVersion
  requireLegacyCleanup = [bool]$RequireLegacyCleanup
  installDir = $installDir
  installDirChildren = $installDirChildren
  legacyInstallDirExists = Test-PathExists $legacyInstallDir
  legacyInstallDirChildren = $legacyDirChildren
  legacyPublisherShortcutDirExists = Test-PathExists $legacyPublisherShortcutDir
  currentShortcutExists = Test-PathExists (Join-Path $currentShortcutDir "MergePilot.lnk")
  uninstallEntries = $uninstallEntries
  legacyEntries = $legacyEntries
  installedFiles = $installedFiles
  installedBundleKind = $installedBundleKind
  installedHashes = $installedHashes
  msiPayload = $msiPayload
  daemonProbe = [pscustomobject]@{
    port = $Port
    autoStarted = $daemonProbeAutoStarted
    startedProcess = $daemonProbeStartedProcess
    portOwnerBefore = $daemonProbePortOwnerBefore
    portOwnerAfter = $daemonProbePortOwnerAfter
    stopped = $daemonProbeStopped
  }
  daemonHealth = $daemonHealth
  authStatus = $authStatus
  failures = $failures
}

$result | ConvertTo-Json -Depth 12
if ($failures.Count -gt 0) {
  exit 1
}
