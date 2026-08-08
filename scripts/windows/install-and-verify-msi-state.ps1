param(
  [string]$MsiPath = "",
  [string]$ExpectedVersion = "",
  [int]$Port = 8787,
  [int]$PersistencePort = 8799,
  [int]$SafetyPort = 8800,
  [int]$VerifierSafetyPort = 8801,
  [int]$VisionPort = 18945,
  [switch]$SkipInstall,
  [switch]$SkipVision,
  [string]$LogDir = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
  $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "apps\desktop\package.json") -Raw | ConvertFrom-Json).version
}
if ([string]::IsNullOrWhiteSpace($MsiPath)) {
  $MsiPath = Join-Path $repoRoot "apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_$($ExpectedVersion)_x64_en-US.msi"
}
if ([string]::IsNullOrWhiteSpace($LogDir)) {
  $LogDir = Join-Path $repoRoot "output\live-e2e"
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-Sha256 {
  param([string]$Path)

  # .NET directly, not Get-FileHash: on this machine the PSModulePath carries
  # a pwsh-7 Modules entry that breaks Windows PowerShell 5.1 module
  # autoloading for Microsoft.PowerShell.Utility (Get-FileHash fails with
  # CommandNotFoundException). .NET hashing is version-proof.
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join "")
  } finally {
    $sha.Dispose()
  }
}

function Stop-MergePilotProcesses {
  Get-Process mergepilot-desktop, mergepilot-daemon -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
}

function Get-MergePilotProcessSummary {
  Get-Process mergepilot-desktop, mergepilot-daemon -ErrorAction SilentlyContinue |
    ForEach-Object {
      [pscustomobject]@{
        id = $_.Id
        processName = $_.ProcessName
        path = $_.Path
        productVersion = if ($_.Path -and (Test-Path -LiteralPath $_.Path)) {
          (Get-Item -LiteralPath $_.Path).VersionInfo.ProductVersion
        } else {
          $null
        }
        startTime = try { $_.StartTime.ToString("o") } catch { $null }
      }
    }
}

function Get-MergePilotInstallEntrySummary {
  $roots = @(
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
  )
  foreach ($root in $roots) {
    foreach ($item in Get-ChildItem $root -ErrorAction SilentlyContinue) {
      $props = Get-ItemProperty -LiteralPath $item.PSPath -ErrorAction SilentlyContinue
      if ($props.DisplayName -like "*MergePilot*" -or $props.DisplayName -like "*CICD*") {
        [pscustomobject]@{
          root = $root
          key = $item.PSChildName
          displayName = $props.DisplayName
          displayVersion = $props.DisplayVersion
          installLocation = $props.InstallLocation
          uninstallString = $props.UninstallString
          windowsInstaller = $props.WindowsInstaller
        }
      }
    }
  }
}

function Get-FileSummaryOrNull {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  $item = Get-Item -LiteralPath $Path
  $msiProperties = if ($item.Extension -ieq ".msi") {
    Get-MsiPropertiesOrNull -Path $item.FullName
  } else {
    $null
  }

  return [pscustomobject]@{
    path = $item.FullName
    length = $item.Length
    lastWriteTime = $item.LastWriteTime.ToString("o")
    sha256 = Get-Sha256 -Path $item.FullName
    productName = $msiProperties.productName
    productVersion = if ($msiProperties.productVersion) {
      $msiProperties.productVersion
    } else {
      $item.VersionInfo.ProductVersion
    }
    fileVersion = $item.VersionInfo.FileVersion
    manufacturer = $msiProperties.manufacturer
    productCode = $msiProperties.productCode
    upgradeCode = $msiProperties.upgradeCode
    allUsers = $msiProperties.allUsers
    metadataError = $msiProperties.metadataError
  }
}

function Get-MsiPropertiesOrNull {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  try {
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
      productName = $properties.ProductName
      productVersion = $properties.ProductVersion
      manufacturer = $properties.Manufacturer
      productCode = $properties.ProductCode
      upgradeCode = $properties.UpgradeCode
      allUsers = $properties.ALLUSERS
      metadataError = $null
    }
  } catch {
    return [pscustomobject]@{
      productName = $null
      productVersion = $null
      manufacturer = $null
      productCode = $null
      upgradeCode = $null
      allUsers = $null
      metadataError = $_.Exception.Message
    }
  }
}

function Quote-PowerShellLiteral {
  param([string]$Value)

  return "'$($Value.Replace("'", "''"))'"
}

function Invoke-PowerShellFile {
  param(
    [string]$ScriptPath,
    [string[]]$ScriptArguments
  )

  $command = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $ScriptPath
  ) + $ScriptArguments

  $shell = Get-Command pwsh -ErrorAction SilentlyContinue
  if (-not $shell) {
    $shell = Get-Command powershell.exe
  }
  $output = & $shell.Source @command 2>&1
  return [pscustomobject]@{
    exitCode = $LASTEXITCODE
    output = @($output)
  }
}

function Convert-CommandOutputToJsonSummary {
  param(
    [object[]]$Output
  )

  $rawOutput = ($Output -join [Environment]::NewLine).Trim()
  if ([string]::IsNullOrWhiteSpace($rawOutput)) {
    return [pscustomobject]@{
      parsed = $false
      parseError = "Command produced no output."
      rawPrefix = ""
    }
  }

  try {
    $parsed = $rawOutput | ConvertFrom-Json
    if ($null -eq $parsed) {
      throw "Parsed output was null."
    }
    return $parsed
  } catch {
    return [pscustomobject]@{
      parsed = $false
      parseError = $_.Exception.Message
      rawPrefix = if ($rawOutput.Length -gt 500) { $rawOutput.Substring(0, 500) } else { $rawOutput }
    }
  }
}

$isAdmin = Test-IsAdministrator
$installLog = Join-Path $LogDir "install-mergepilot-$ExpectedVersion-msi.log"
$verifyLog = Join-Path $LogDir "install-verify-mergepilot-$ExpectedVersion.json"
$visionLog = Join-Path $LogDir "install-vision-mergepilot-$ExpectedVersion.json"
$daemonPath = "C:\Program Files\MergePilot\mergepilot-daemon.exe"

if (-not (Test-Path -LiteralPath $MsiPath)) {
  throw "MSI not found: $MsiPath. Run .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run tauri:build first."
}

if (-not $SkipInstall -and -not $isAdmin) {
  $resolvedMsiPath = (Resolve-Path $MsiPath).Path
  $scriptPath = Join-Path $PSScriptRoot "install-and-verify-msi-state.ps1"
  $elevatedCommand = "Set-Location -LiteralPath $(Quote-PowerShellLiteral -Value $repoRoot.Path); & $(Quote-PowerShellLiteral -Value $scriptPath) -ExpectedVersion $ExpectedVersion -MsiPath $(Quote-PowerShellLiteral -Value $resolvedMsiPath)"
  if ($SkipVision) {
    $elevatedCommand += " -SkipVision"
  }
  $currentInstallEntries = @(Get-MergePilotInstallEntrySummary)
  $runningMergePilotProcesses = @(Get-MergePilotProcessSummary)
  $currentInstalledVersions = @($currentInstallEntries |
    Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.displayVersion) } |
    Select-Object -ExpandProperty displayVersion -Unique)

  [pscustomobject]@{
    ok = $false
    requiresElevation = $true
    expectedVersion = $ExpectedVersion
    msi = Get-FileSummaryOrNull -Path $resolvedMsiPath
    currentInstalledVersions = $currentInstalledVersions
    installIsCurrent = $currentInstalledVersions.Count -eq 1 -and $currentInstalledVersions[0] -eq $ExpectedVersion
    currentInstallEntries = $currentInstallEntries
    runningMergePilotProcesses = $runningMergePilotProcesses
    recommendedElevatedCommand = $elevatedCommand
    message = "Run the recommended command from an elevated PowerShell. It uses absolute paths, closes running MergePilot processes before installing, then verifies Program Files, persistence, safety gates, and vision unless -SkipVision is present. If you install manually instead, close MergePilot first and rerun this script with -SkipInstall."
  } | ConvertTo-Json -Depth 6
  exit 1
}

$installResult = $null
if (-not $SkipInstall) {
  Stop-MergePilotProcesses
  $process = Start-Process -FilePath msiexec.exe -ArgumentList @(
    "/i",
    (Resolve-Path $MsiPath).Path,
    "/qn",
    "/norestart",
    "/L*v",
    $installLog
  ) -Wait -PassThru

  $installResult = [pscustomobject]@{
    exitCode = $process.ExitCode
    logPath = $installLog
  }
  if ($process.ExitCode -ne 0) {
    throw "MSI install failed with exit code $($process.ExitCode). See $installLog."
  }
}

if (-not (Test-Path -LiteralPath $daemonPath)) {
  throw "Installed daemon was not found after install: $daemonPath"
}

$verifyArgs = @(
  "-ExpectedVersion", $ExpectedVersion,
  "-ExpectedDesktopBundleKind", "msi",
  "-MsiPath", (Resolve-Path $MsiPath).Path,
  "-PackageProbePort", [string]$Port,
  "-PersistencePort", [string]$PersistencePort,
  "-SafetyPort", [string]$SafetyPort,
  "-VerifierSafetyPort", [string]$VerifierSafetyPort
)
$verifyResult = Invoke-PowerShellFile -ScriptPath (Join-Path $PSScriptRoot "run-installed-app-smoke.ps1") -ScriptArguments $verifyArgs
$verifyExitCode = $verifyResult.exitCode
Set-Content -LiteralPath $verifyLog -Value ($verifyResult.output -join [Environment]::NewLine) -Encoding UTF8
$verifySummary = Convert-CommandOutputToJsonSummary -Output $verifyResult.output

$visionExitCode = $null
$visionSummary = $null
$visionSkippedReason = $null
if ($SkipVision) {
  $visionSkippedReason = "Skipped by -SkipVision."
} elseif ($verifyExitCode -ne 0) {
  $visionSkippedReason = "Skipped because installed wrapper verification failed."
} else {
  $visionArgs = @(
    "-Port", [string]$VisionPort,
    "-SidecarPath", $daemonPath
  )
  $visionResult = Invoke-PowerShellFile -ScriptPath (Join-Path $PSScriptRoot "packaged-live-vision-smoke.ps1") -ScriptArguments $visionArgs
  $visionExitCode = $visionResult.exitCode
  Set-Content -LiteralPath $visionLog -Value ($visionResult.output -join [Environment]::NewLine) -Encoding UTF8
  $visionSummary = Convert-CommandOutputToJsonSummary -Output $visionResult.output
}

$ok = $verifyExitCode -eq 0 -and ($SkipVision -or $visionExitCode -eq 0)
$result = [pscustomobject]@{
  ok = $ok
  expectedVersion = $ExpectedVersion
  isAdministrator = $isAdmin
  skippedInstall = [bool]$SkipInstall
  skippedVision = [bool]$SkipVision
  msiPath = (Resolve-Path $MsiPath).Path
  install = $installResult
  packageProbePort = $Port
  persistencePort = $PersistencePort
  safetyPort = $SafetyPort
  verifierSafetyPort = $VerifierSafetyPort
  verifyExitCode = $verifyExitCode
  verifyLog = $verifyLog
  verifySummary = $verifySummary
  visionExitCode = $visionExitCode
  visionLog = if ($null -eq $visionExitCode) { $null } else { $visionLog }
  visionSkippedReason = $visionSkippedReason
  visionSummary = $visionSummary
}

$result | ConvertTo-Json -Depth 8
if (-not $ok) {
  exit 1
}
