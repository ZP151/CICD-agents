<#
.SYNOPSIS
Runs live-app Playwright tests against a source daemon that matches this
workspace.

.DESCRIPTION
This wrapper prevents misleading live-app failures caused by a missing or stale
daemon on 127.0.0.1:8787. It starts the source @mergepilot/daemon when needed,
requires the daemon version to match packages/daemon/package.json by default,
writes Playwright and daemon logs under output/live-e2e, and cleans up the
daemon port if it started the daemon.

Vite dev compiles route chunks on demand and a cold compile is probabilistic
(see scripts/prewarm-vite.mjs). Unless -SkipPrewarm is given, the wrapper
starts Vite on 127.0.0.1:1420 (Playwright's webServer reuses it via
reuseExistingServer:true), runs scripts/prewarm-vite.mjs to compile the full
module graph, and aborts the run if the app is not interactive, so the suite's
beforeAll never pays first-load compilation.

.EXAMPLE
.\scripts\windows\run-live-app-e2e.ps1 -LiveAdo -Grep "ClaimBot_API pipeline #117"

.EXAMPLE
.\scripts\windows\run-live-app-e2e.ps1 -LiveAdo -Destructive -Grep "rerun approval"

.EXAMPLE
.\scripts\windows\run-live-app-e2e.ps1 -RestartMismatchedDaemon
#>

param(
  [string]$TestPath = "tests/e2e/live-app-business.spec.ts",
  [string]$Project = "chromium",
  [string]$Grep = "",
  [int]$Workers = 1,
  [string]$LogDir = "",
  [switch]$LiveAdo,
  [switch]$Destructive,
  [switch]$AllowExistingMismatchedDaemon,
  [switch]$RestartMismatchedDaemon,
  [switch]$SkipPrewarm
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$pnpmProject = Join-Path $PSScriptRoot "pnpm-project.ps1"
$daemonPackageJson = Join-Path $repoRoot "packages\daemon\package.json"
$expectedVersion = (Get-Content -LiteralPath $daemonPackageJson -Raw | ConvertFrom-Json).version
$expectedBuildSha = (& git -C $repoRoot rev-parse HEAD 2>$null).Trim()
if ([string]::IsNullOrWhiteSpace($expectedBuildSha)) {
  throw "Unable to resolve the workspace Git HEAD for source-live provenance."
}
$daemonUrl = "http://127.0.0.1:8787"

if ([string]::IsNullOrWhiteSpace($LogDir)) {
  $LogDir = Join-Path $repoRoot "output\live-e2e"
}
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$daemonOut = Join-Path $LogDir "live-app-source-daemon-$stamp.log"
$daemonErr = Join-Path $LogDir "live-app-source-daemon-$stamp.err.log"
$playwrightLog = Join-Path $LogDir "live-app-e2e-$stamp.log"
$runnerJson = Join-Path $LogDir "runner-$stamp.json"

function Get-DaemonHealth {
  try {
    return Invoke-RestMethod -Uri "$daemonUrl/healthz" -Method Get -TimeoutSec 2
  } catch {
    return $null
  }
}

function Stop-PortOwner {
  param(
    [int]$Port,
    [switch]$OnlyRepoOwned
  )

  $owners = @(
    Get-NetTCPConnection -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalAddress -in @("127.0.0.1", "0.0.0.0", "::", "::1") -and $_.LocalPort -eq $Port } |
    Select-Object -ExpandProperty OwningProcess -Unique
  )
  foreach ($owner in $owners) {
    if ($owner -and $owner -ne $PID) {
      $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $owner" -ErrorAction SilentlyContinue
      $commandLine = [string]$processInfo.CommandLine
      $executablePath = [string]$processInfo.ExecutablePath
      $processName = [string]$processInfo.Name
      $isRepoOwned = $commandLine.Contains([string]$repoRoot) -or $executablePath.Contains([string]$repoRoot)
      $isMergePilotDaemon = $processName -eq "mergepilot-daemon.exe" -or $executablePath.EndsWith("\mergepilot-daemon.exe")

      if ($OnlyRepoOwned -and -not $isRepoOwned) {
        continue
      }
      if (-not $OnlyRepoOwned -and -not $isRepoOwned -and -not $isMergePilotDaemon) {
        throw "Refusing to stop unexpected process on port $Port. PID $owner, path '$executablePath', command '$commandLine'."
      }
      Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
    }
  }
}

function Start-SourceDaemon {
  # The daemon imports @mergepilot/core from its compiled dist/ (package main).
  # Rebuild core from the current source first so a stale dist build can never
  # make the live daemon miss newly registered tools (observed 2026-08-07:
  # read_text_file was registered in source but absent from a 2-day-old dist,
  # so the planner's tool set silently lacked it).
  & $pnpmProject --filter "@mergepilot/core" build | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Rebuild of @mergepilot/core failed with exit code $LASTEXITCODE"
  }

  $previousBuildSha = $env:MERGEPILOT_BUILD_SHA
  try {
    # The source daemon must identify the exact Git revision under test. Version
    # equality is insufficient because an installed sidecar can share the same
    # package version while containing older code.
    $env:MERGEPILOT_BUILD_SHA = $expectedBuildSha
    $process = Start-Process -FilePath "powershell.exe" -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      $pnpmProject,
      "--filter",
      "@mergepilot/daemon",
      "dev"
    ) -WorkingDirectory $repoRoot -RedirectStandardOutput $daemonOut -RedirectStandardError $daemonErr -WindowStyle Hidden -PassThru
  } finally {
    if ($null -eq $previousBuildSha) {
      Remove-Item Env:\MERGEPILOT_BUILD_SHA -ErrorAction SilentlyContinue
    } else {
      $env:MERGEPILOT_BUILD_SHA = $previousBuildSha
    }
  }

  for ($i = 0; $i -lt 60; $i++) {
    $health = Get-DaemonHealth
    if ($health) {
      return [pscustomobject]@{
        process = $process
        health = $health
      }
    }
    if ($process.HasExited) {
      break
    }
    Start-Sleep -Milliseconds 500
  }

  $stdoutTail = @(Get-Content -LiteralPath $daemonOut -Tail 80 -ErrorAction SilentlyContinue)
  $stderrTail = @(Get-Content -LiteralPath $daemonErr -Tail 80 -ErrorAction SilentlyContinue)
  throw "Source daemon did not become healthy on $daemonUrl. stdout: $($stdoutTail -join ' ') stderr: $($stderrTail -join ' ')"
}

$startedDaemon = $null
$existingHealth = $null
$startedVite = $null

try {
  $existingHealth = Get-DaemonHealth

  if ($existingHealth) {
    $versionMatches = $existingHealth.version -eq $expectedVersion
    $buildShaMatches = $existingHealth.buildSha -eq $expectedBuildSha
    if (-not $versionMatches -or -not $buildShaMatches) {
      if ($RestartMismatchedDaemon) {
        Stop-PortOwner -Port 8787
        Start-Sleep -Milliseconds 500
        $startedDaemon = Start-SourceDaemon
        $existingHealth = $startedDaemon.health
      } elseif (-not $AllowExistingMismatchedDaemon) {
        throw "Daemon on $daemonUrl is version $($existingHealth.version) at build $($existingHealth.buildSha), but this workspace expects version $expectedVersion at build $expectedBuildSha. Rerun with -RestartMismatchedDaemon to replace it for this test, or -AllowExistingMismatchedDaemon if that is intentional."
      }
    }
  } else {
    $startedDaemon = Start-SourceDaemon
    $existingHealth = $startedDaemon.health
  }

  if (-not $existingHealth) {
    throw "Daemon health check failed on $daemonUrl."
  }

  if (($existingHealth.version -ne $expectedVersion -or $existingHealth.buildSha -ne $expectedBuildSha) -and -not $AllowExistingMismatchedDaemon) {
    throw "Daemon on $daemonUrl is version $($existingHealth.version) at build $($existingHealth.buildSha), but this workspace expects version $expectedVersion at build $expectedBuildSha."
  }
} catch {
  $setupError = $_.Exception.Message
  if ($startedDaemon -and $startedDaemon.process -and -not $startedDaemon.process.HasExited) {
    Stop-Process -Id $startedDaemon.process.Id -Force -ErrorAction SilentlyContinue
  }
  if ($startedDaemon) {
    Stop-PortOwner -Port 8787 -OnlyRepoOwned
  }
  [pscustomobject]@{
    ok = $false
    setupFailed = $true
    error = $setupError
    daemonUrl = $daemonUrl
    daemonVersion = if ($existingHealth) { $existingHealth.version } else { $null }
    daemonBuildSha = if ($existingHealth) { $existingHealth.buildSha } else { $null }
    expectedVersion = $expectedVersion
    expectedBuildSha = $expectedBuildSha
    startedDaemon = ($null -ne $startedDaemon)
    liveAdo = [bool]$LiveAdo
    destructive = [bool]$Destructive
    testPath = $TestPath
    project = $Project
    grep = $Grep
    playwrightLog = $playwrightLog
    daemonLog = $daemonOut
    daemonErrorLog = $daemonErr
  } | ConvertTo-Json -Depth 6
  exit 1
}

# ---- Vite start + pre-warm ----
# Vite dev compiles route chunks on demand; on this machine a cold compile is
# probabilistic (observed 24-88s document, 15-98s per module group, and one
# run where the final chat-runtime module wave hung server-side until
# teardown). Playwright's webServer (reuseExistingServer:true) reuses the Vite
# started here; scripts/prewarm-vite.mjs compiles the full module graph once so
# every test navigation hits the warm transform cache and the suite's beforeAll
# budget is not spent on first-load compilation.
$viteUrl = "http://127.0.0.1:1420"
$viteLog = Join-Path $LogDir "live-app-vite-$stamp.log"
$viteErrLog = Join-Path $LogDir "live-app-vite-$stamp.err.log"
$prewarmLog = Join-Path $LogDir "live-app-prewarm-$stamp.log"

try {
  if (-not $SkipPrewarm) {
    $viteListening = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $_.LocalAddress -in @("127.0.0.1", "0.0.0.0", "::", "::1") -and $_.LocalPort -eq 1420 }
    if ($viteListening) {
      # Reuse an existing listener (a developer's own Vite) — never kill it.
      $startedVite = $null
    } else {
      $viteProcess = Start-Process -FilePath "powershell.exe" -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        $pnpmProject,
        "--dir",
        "apps/desktop",
        "exec",
        "vite",
        "--host",
        "127.0.0.1",
        "--port",
        "1420"
      ) -WorkingDirectory $repoRoot -RedirectStandardOutput $viteLog -RedirectStandardError $viteErrLog -WindowStyle Hidden -PassThru
      $startedVite = $viteProcess

      $viteReady = $false
      # Port-open is the signal here; an HTTP GET against a cold Vite can take
      # >3s per request (observed 3.8s), so a TCP connect avoids false timeout
      # failures. scripts/prewarm-vite.mjs performs the real HTTP readiness.
      for ($i = 0; $i -lt 90; $i++) {
        try {
          $tcp = New-Object System.Net.Sockets.TcpClient
          $tcp.Connect("127.0.0.1", 1420)
          $viteReady = $true
          $tcp.Dispose()
          break
        } catch {
          if ($viteProcess.HasExited) { break }
          Start-Sleep -Milliseconds 1000
        }
      }
      if (-not $viteReady) {
        throw "Vite did not become reachable on $viteUrl. Log: $viteLog"
      }
    }

    $prewarmOut = & $pnpmProject --dir $repoRoot exec node scripts/prewarm-vite.mjs 2>&1 | Out-String
    $prewarmExit = $LASTEXITCODE
    $prewarmOut | Set-Content -LiteralPath $prewarmLog -Encoding utf8
    if ($prewarmExit -ne 0) {
      throw "Vite pre-warm failed (exit $prewarmExit); not starting the suite against a cold server.`n$prewarmOut"
    }
  }
} catch {
  $prewarmError = $_.Exception.Message
  if ($startedVite -and -not $startedVite.HasExited) {
    Stop-Process -Id $startedVite.Id -Force -ErrorAction SilentlyContinue
  }
  if ($startedVite) {
    Stop-PortOwner -Port 1420 -OnlyRepoOwned
  }
  $startedVite = $null
  if ($startedDaemon -and $startedDaemon.process -and -not $startedDaemon.process.HasExited) {
    Stop-Process -Id $startedDaemon.process.Id -Force -ErrorAction SilentlyContinue
  }
  if ($startedDaemon) {
    Stop-PortOwner -Port 8787 -OnlyRepoOwned
  }
  $startedDaemon = $null
  [pscustomobject]@{
    ok = $false
    prewarmFailed = $true
    error = $prewarmError
    daemonUrl = $daemonUrl
    daemonVersion = if ($existingHealth) { $existingHealth.version } else { $null }
    daemonBuildSha = if ($existingHealth) { $existingHealth.buildSha } else { $null }
    expectedVersion = $expectedVersion
    expectedBuildSha = $expectedBuildSha
    startedDaemon = ($null -ne $startedDaemon)
    liveAdo = [bool]$LiveAdo
    destructive = [bool]$Destructive
    testPath = $TestPath
    project = $Project
    grep = $Grep
    playwrightLog = $playwrightLog
    daemonLog = $daemonOut
    daemonErrorLog = $daemonErr
    viteLog = $viteLog
    viteErrorLog = $viteErrLog
    prewarmLog = $prewarmLog
  } | ConvertTo-Json -Depth 6
  exit 1
}

$previousLiveApp = $env:MERGEPILOT_E2E_LIVE_APP
$previousLiveAdo = $env:MERGEPILOT_E2E_LIVE_ADO
$previousDestructive = $env:MERGEPILOT_E2E_DESTRUCTIVE

try {
  $env:MERGEPILOT_E2E_LIVE_APP = "1"
  if ($LiveAdo) {
    $env:MERGEPILOT_E2E_LIVE_ADO = "1"
  } else {
    Remove-Item Env:\MERGEPILOT_E2E_LIVE_ADO -ErrorAction SilentlyContinue
  }
  if ($Destructive) {
    $env:MERGEPILOT_E2E_DESTRUCTIVE = "1"
  } else {
    Remove-Item Env:\MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
  }

  $args = @(
    "exec",
    "playwright",
    "test",
    $TestPath,
    "--project=$Project",
    "--workers=$Workers"
  )
  if (-not [string]::IsNullOrWhiteSpace($Grep)) {
    $args += @("--grep", $Grep)
  }

  & $pnpmProject @args *> $playwrightLog
  $exitCode = $LASTEXITCODE

  $resultJson = [pscustomobject]@{
    ok = ($exitCode -eq 0)
    exitCode = $exitCode
    daemonUrl = $daemonUrl
    daemonVersion = $existingHealth.version
    daemonBuildSha = $existingHealth.buildSha
    expectedVersion = $expectedVersion
    expectedBuildSha = $expectedBuildSha
    startedDaemon = ($null -ne $startedDaemon)
    liveAdo = [bool]$LiveAdo
    destructive = [bool]$Destructive
    testPath = $TestPath
    project = $Project
    grep = $Grep
    playwrightLog = $playwrightLog
    daemonLog = $daemonOut
    daemonErrorLog = $daemonErr
    viteLog = $viteLog
    viteErrorLog = $viteErrLog
    prewarmLog = $prewarmLog
    runnerPath = $runnerJson
  } | ConvertTo-Json -Depth 6
  $resultJson | Set-Content -LiteralPath $runnerJson -Encoding utf8
  Write-Output $resultJson

  exit $exitCode
} finally {
  if ($null -eq $previousLiveApp) {
    Remove-Item Env:\MERGEPILOT_E2E_LIVE_APP -ErrorAction SilentlyContinue
  } else {
    $env:MERGEPILOT_E2E_LIVE_APP = $previousLiveApp
  }
  if ($null -eq $previousLiveAdo) {
    Remove-Item Env:\MERGEPILOT_E2E_LIVE_ADO -ErrorAction SilentlyContinue
  } else {
    $env:MERGEPILOT_E2E_LIVE_ADO = $previousLiveAdo
  }
  if ($null -eq $previousDestructive) {
    Remove-Item Env:\MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
  } else {
    $env:MERGEPILOT_E2E_DESTRUCTIVE = $previousDestructive
  }

  if ($startedDaemon -and $startedDaemon.process -and -not $startedDaemon.process.HasExited) {
    Stop-Process -Id $startedDaemon.process.Id -Force -ErrorAction SilentlyContinue
  }
  if ($startedDaemon) {
    Stop-PortOwner -Port 8787 -OnlyRepoOwned
  }

  if ($startedVite -and -not $startedVite.HasExited) {
    Stop-Process -Id $startedVite.Id -Force -ErrorAction SilentlyContinue
  }
  if ($startedVite) {
    # The wrapper may orphan its node child; clear any repo-owned listener left
    # on 1420. Never touch the port when we reused an existing server.
    Stop-PortOwner -Port 1420 -OnlyRepoOwned
  }
  $startedVite = $null
}
