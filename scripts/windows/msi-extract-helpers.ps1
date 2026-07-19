$ErrorActionPreference = "Stop"

function Find-MergePilotSevenZip {
  $command = Get-Command 7z.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command) {
    return $command.Source
  }

  foreach ($candidate in @(
    "C:\Program Files\7-Zip\7z.exe",
    "C:\Program Files (x86)\7-Zip\7z.exe"
  )) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  return $null
}

function Get-MergePilotWindowsInstallerProcessSummary {
  $processes = @(Get-CimInstance Win32_Process -Filter "name='msiexec.exe'" -ErrorAction SilentlyContinue)
  if ($processes.Count -eq 0) {
    return ""
  }

  return ($processes | ForEach-Object {
    $command = if ([string]::IsNullOrWhiteSpace([string]$_.CommandLine)) { "<empty command line>" } else { [string]$_.CommandLine }
    "PID $($_.ProcessId) ($command)"
  }) -join "; "
}

function Invoke-MergePilotMsiExtraction {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PackagePath,
    [Parameter(Mandatory = $true)]
    [string]$Destination,
    [Parameter(Mandatory = $true)]
    [string]$InstallerLogPath,
    [int]$ExtractionTimeoutSec = 180,
    [switch]$RetryOnInstallerBusy,
    [switch]$SkipMsiexecWhenInstallerActive
  )

  $resolvedPackagePath = (Resolve-Path $PackagePath).Path
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null

  $sevenZip = Find-MergePilotSevenZip
  if ($sevenZip) {
    $extractOutput = & $sevenZip x "-y" "-o$Destination" $resolvedPackagePath 2>&1
    if ($LASTEXITCODE -ne 0) {
      $extractOutput | Select-Object -Last 80
      throw "7-Zip MSI extraction failed with exit code $LASTEXITCODE."
    }
    return "7zip"
  }

  if ($SkipMsiexecWhenInstallerActive) {
    $installerSummary = Get-MergePilotWindowsInstallerProcessSummary
    if (-not [string]::IsNullOrWhiteSpace($installerSummary)) {
      throw "MSI payload extraction skipped because Windows Installer is already active: $installerSummary"
    }
  }

  $attemptCount = if ($RetryOnInstallerBusy) { 4 } else { 1 }
  $extract = $null
  for ($attempt = 1; $attempt -le $attemptCount; $attempt++) {
    $extract = Start-Process -FilePath msiexec.exe -ArgumentList @(
      "/a",
      $resolvedPackagePath,
      "/qn",
      "TARGETDIR=$Destination",
      "/L*v",
      $InstallerLogPath
    ) -PassThru

    $exited = $extract.WaitForExit([Math]::Max(1, $ExtractionTimeoutSec) * 1000)
    if (-not $exited) {
      Stop-Process -Id $extract.Id -Force -ErrorAction SilentlyContinue
      $tail = (Get-Content -LiteralPath $InstallerLogPath -Tail 40 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
      $detail = if ($tail) { " Log tail: $tail" } else { "" }
      throw "MSI administrative extraction timed out after $ExtractionTimeoutSec second(s).$detail"
    }

    if ($extract.ExitCode -ne 1618) {
      break
    }
    if ($attempt -lt $attemptCount) {
      Start-Sleep -Seconds ([Math]::Min(8, 2 * $attempt))
    }
  }

  if ($extract.ExitCode -ne 0) {
    $tail = (Get-Content -LiteralPath $InstallerLogPath -Tail 80 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
    $detail = if ($tail) { " Log tail: $tail" } else { "" }
    throw "MSI administrative extraction failed with exit code $($extract.ExitCode).$detail"
  }

  return "msiexec"
}

function Find-MergePilotExtractedDaemon {
  param([Parameter(Mandatory = $true)][string]$Root)

  $daemon = Get-ChildItem -LiteralPath $Root -Recurse -File |
    Where-Object { $_.Name -match "daemon.*\.exe$" } |
    Select-Object -First 1
  if ($daemon) {
    return $daemon
  }

  return Get-ChildItem -LiteralPath $Root -Recurse -File -Filter mergepilot-daemon.exe |
    Select-Object -First 1
}

function Find-MergePilotExtractedDesktop {
  param([Parameter(Mandatory = $true)][string]$Root)

  $desktop = Get-ChildItem -LiteralPath $Root -Recurse -File -Filter mergepilot-desktop.exe |
    Select-Object -First 1
  if ($desktop) {
    return $desktop
  }

  return Get-ChildItem -LiteralPath $Root -Recurse -File |
    Where-Object {
      $_.Name -ne "Bin_mergepilot_daemon.exe" -and
      $_.VersionInfo.ProductName -eq "MergePilot"
    } |
    Select-Object -First 1
}
