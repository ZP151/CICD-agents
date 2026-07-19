param(
  [string]$MsiPath = "",
  [int]$Port = 18899
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "msi-extract-helpers.ps1")
if ([string]::IsNullOrWhiteSpace($MsiPath)) {
  $version = (Get-Content -LiteralPath (Join-Path $repoRoot "apps\desktop\package.json") -Raw | ConvertFrom-Json).version
  $MsiPath = Join-Path $repoRoot "apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_$($version)_x64_en-US.msi"
}
if (-not (Test-Path -LiteralPath $MsiPath)) {
  throw "MSI not found: $MsiPath. Run .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run tauri:build first."
}

$extractDir = Join-Path $env:TEMP ("mergepilot-msi-extract-" + [guid]::NewGuid().ToString("N"))
$logPath = Join-Path $extractDir "msiexec.log"

try {
  New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
  $extractMethod = Invoke-MergePilotMsiExtraction -PackagePath $MsiPath -Destination $extractDir -InstallerLogPath $logPath -RetryOnInstallerBusy

  $daemon = Find-MergePilotExtractedDaemon -Root $extractDir
  $desktop = Find-MergePilotExtractedDesktop -Root $extractDir
  if (-not $daemon) {
    throw "Extracted MSI did not contain mergepilot-daemon.exe under $extractDir."
  }
  if (-not $desktop) {
    throw "Extracted MSI did not contain mergepilot-desktop.exe under $extractDir."
  }

  $wixSource = Join-Path $repoRoot "apps\desktop\src-tauri\target\release\wix\x64\main.wxs"
  $legacyCleanupSource = Join-Path $repoRoot "apps\desktop\src-tauri\installer-assets\legacy-cleanup.wxs"
  if (Test-Path -LiteralPath $wixSource) {
    $wixText = Get-Content -LiteralPath $wixSource -Raw
    $requiredMainWixMarkers = @(
      "ComponentRef Id=`"LegacyInstallCleanup`"",
      "ComponentRef Id=`"LegacyCicdAgentInstallDirCleanup`"",
      "ComponentRef Id=`"LegacyStartMenuCleanup`""
    )
    foreach ($marker in $requiredMainWixMarkers) {
      if (-not $wixText.Contains($marker)) {
        throw "Generated MSI WiX source is missing legacy cleanup marker: $marker"
      }
    }
  }

  if (Test-Path -LiteralPath $legacyCleanupSource) {
    $legacyCleanupText = Get-Content -LiteralPath $legacyCleanupSource -Raw
    $requiredLegacyCleanupMarkers = @(
      "RemoveLegacyDesktopExe",
      "RemoveLegacyDaemonExe",
      "RemoveLegacyNsisUninstaller",
      "RemoveLegacyCicdAgentUninstallShortcut",
      "RemoveEmptyLegacyCicdAgentInstallDir",
      "RemoveLegacyPublisherStartMenuShortcut",
      "RemoveLegacyNsisUninstallKey",
      "OLD_CICD_AGENT_PRODUCTS",
      "FAD92C43-A438-5354-9454-9D75AC5AF4DA"
    )
    foreach ($marker in $requiredLegacyCleanupMarkers) {
      if (-not $legacyCleanupText.Contains($marker)) {
        throw "Legacy cleanup WiX fragment is missing marker: $marker"
      }
    }
  }

  $sidecarSmokeRaw = & (Join-Path $PSScriptRoot "packaged-sidecar-smoke.ps1") `
    -Port $Port `
    -SidecarPath $daemon.FullName
  $sidecarSmokeText = $sidecarSmokeRaw -join "`n"
  $jsonStart = $sidecarSmokeText.IndexOf("{")
  $jsonEnd = $sidecarSmokeText.LastIndexOf("}")
  if ($jsonStart -lt 0 -or $jsonEnd -le $jsonStart) {
    throw "Packaged sidecar smoke did not return a JSON payload."
  }
  $sidecarSmoke = $sidecarSmokeText.Substring($jsonStart, $jsonEnd - $jsonStart + 1) |
    ConvertFrom-Json
  $missingRuntimeMetadata = @()
  foreach ($field in @("runtimeMode", "desktopVersion", "pid", "execPath")) {
    if (-not $sidecarSmoke.PSObject.Properties[$field] -or $null -eq $sidecarSmoke.$field -or $sidecarSmoke.$field -eq "") {
      $missingRuntimeMetadata += $field
    }
  }
  if ($missingRuntimeMetadata.Count -gt 0) {
    throw "Extracted MSI daemon /healthz is missing runtime metadata fields: $($missingRuntimeMetadata -join ', ')."
  }

  [pscustomobject]@{
    ok = $true
    msiPath = (Resolve-Path $MsiPath).Path
    extractMethod = $extractMethod
    extractedDesktop = $desktop.FullName
    extractedDaemon = $daemon.FullName
    legacyCleanupWixValidated = (Test-Path -LiteralPath $wixSource)
    healthVersion = $sidecarSmoke.healthVersion
    runtimeMode = $sidecarSmoke.runtimeMode
    desktopVersion = $sidecarSmoke.desktopVersion
    pid = $sidecarSmoke.pid
    execPath = $sidecarSmoke.execPath
    refreshFilesSeen = $sidecarSmoke.refreshFilesSeen
    refreshFilesIndexed = $sidecarSmoke.refreshFilesIndexed
    workflowPhase = $sidecarSmoke.workflowPhase
    chatStatus = $sidecarSmoke.chatStatus
  } | ConvertTo-Json -Depth 8
} finally {
  Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
}
