param(
  [int]$Port = 18887,
  [string]$SidecarPath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if ([string]::IsNullOrWhiteSpace($SidecarPath)) {
  $SidecarPath = Join-Path $repoRoot "apps\desktop\src-tauri\binaries\mergepilot-daemon-x86_64-pc-windows-msvc.exe"
}
$expectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "packages\daemon\package.json") -Raw | ConvertFrom-Json).version

if (-not (Test-Path -LiteralPath $SidecarPath)) {
  throw "Sidecar binary not found: $SidecarPath. Run .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run build:sidecar first."
}

$dataDir = Join-Path $env:TEMP ("mergepilot-packaged-sidecar-data-" + [guid]::NewGuid().ToString("N"))
$fixtureRepo = Join-Path $env:TEMP ("mergepilot-packaged-sidecar-repo-" + [guid]::NewGuid().ToString("N"))

New-Item -ItemType Directory -Path $dataDir, $fixtureRepo | Out-Null
git -C $fixtureRepo init -b main | Out-Null
git -C $fixtureRepo config core.autocrlf false
git -C $fixtureRepo config user.email mergepilot-e2e@example.local
git -C $fixtureRepo config user.name "MergePilot E2E"
Set-Content -LiteralPath (Join-Path $fixtureRepo "README.md") -Value "# Packaged sidecar fixture`n" -Encoding UTF8
Set-Content -LiteralPath (Join-Path $fixtureRepo "index.ts") -Value "export function describeRepository(): string {`n  return 'packaged sidecar fixture';`n}`n" -Encoding UTF8
git -C $fixtureRepo add README.md index.ts | Out-Null
git -C $fixtureRepo commit -m "Initial commit" | Out-Null

$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $SidecarPath
$startInfo.Arguments = "--port $Port"
$startInfo.WorkingDirectory = Split-Path $SidecarPath -Parent
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.Environment["RUNTIME_PORT"] = [string]$Port
$startInfo.Environment["RUNTIME_HOST"] = "127.0.0.1"
$startInfo.Environment["RUNTIME_DATA_DIR"] = $dataDir
$startInfo.Environment["MERGEPILOT_RUNTIME_MODE"] = "desktop-sidecar"
$startInfo.Environment["MERGEPILOT_DESKTOP_VERSION"] = $expectedVersion
$startInfo.Environment["MERGEPILOT_DAEMON_VERSION"] = $expectedVersion
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$process = [System.Diagnostics.Process]::Start($startInfo)

try {
  $baseUrl = "http://127.0.0.1:$Port"
  $health = $null
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $health = Invoke-RestMethod -Uri "$baseUrl/healthz" -Method Get -TimeoutSec 2
      break
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  if ($null -eq $health) {
    throw "Packaged sidecar did not become healthy."
  }
  if ($health.version -ne $expectedVersion) {
    throw "Packaged sidecar version mismatch. Expected $expectedVersion, got $($health.version)."
  }
  $healthFields = @($health.PSObject.Properties | ForEach-Object { $_.Name })
  $missingHealthMetadata = @()
  foreach ($field in @("runtimeMode", "desktopVersion", "pid", "execPath")) {
    if ($healthFields -notcontains $field) {
      $missingHealthMetadata += $field
    }
  }
  if ($missingHealthMetadata.Count -gt 0) {
    throw "Packaged sidecar /healthz is missing runtime metadata fields: $($missingHealthMetadata -join ', ')."
  }
  if ($health.runtimeMode -ne "desktop-sidecar") {
    throw "Packaged sidecar runtime mode mismatch. Expected desktop-sidecar, got $($health.runtimeMode)."
  }
  if ($health.desktopVersion -ne $expectedVersion) {
    throw "Packaged sidecar desktop version mismatch. Expected $expectedVersion, got $($health.desktopVersion)."
  }

  $indexPayload = @{ repoPath = $fixtureRepo; projectLink = $null } | ConvertTo-Json -Depth 8
  $indexBefore = Invoke-RestMethod -Uri "$baseUrl/chat/index-status" -Method Post -ContentType "application/json" -Body $indexPayload -TimeoutSec 10
  $indexRefresh = Invoke-RestMethod -Uri "$baseUrl/chat/index-refresh" -Method Post -ContentType "application/json" -Body $indexPayload -TimeoutSec 30
  $indexAfter = Invoke-RestMethod -Uri "$baseUrl/chat/index-status" -Method Post -ContentType "application/json" -Body $indexPayload -TimeoutSec 10
  $workflow = Invoke-RestMethod -Uri "$baseUrl/chat/workflow-action" -Method Post -ContentType "application/json" -Body (@{
      action = "inspect_environment"
      repoPath = $fixtureRepo
      sessionId = $null
      projectLink = $null
    } | ConvertTo-Json -Depth 8) -TimeoutSec 30

  $chat = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/chat" -Method Post -ContentType "application/json" -Body (@{
      message = "Briefly say what this repository contains. Do not modify anything."
      repoPath = $fixtureRepo
      sessionId = $null
      projectLink = $null
    } | ConvertTo-Json -Depth 8) -TimeoutSec 90

  if ($indexRefresh.refresh.filesSeen -lt 1) {
    throw "Expected packaged sidecar index refresh to see at least one source file, got $($indexRefresh.refresh.filesSeen)."
  }
  if ($chat.Content -match "Expected object|better_sqlite3|bindings file|schema\.sql|Could not locate") {
    throw "Packaged sidecar chat response contains a known packaged-runtime failure marker."
  }

  [pscustomobject]@{
    ok = $true
    healthVersion = $health.version
    runtimeMode = $health.runtimeMode
    desktopVersion = $health.desktopVersion
    pid = $health.pid
    execPath = $health.execPath
    indexBeforeIndexed = $indexBefore.indexed
    refreshFilesSeen = $indexRefresh.refresh.filesSeen
    refreshFilesIndexed = $indexRefresh.refresh.filesIndexed
    indexAfterStats = $indexAfter.stats
    workflowPhase = $workflow.workflowState.workflowPhase
    chatStatus = $chat.StatusCode
  } | ConvertTo-Json -Depth 12
} finally {
  if ($process -and -not $process.HasExited) {
    try {
      $process.Kill()
      $process.WaitForExit(5000) | Out-Null
    } catch {}
  }
  Remove-Item -LiteralPath $fixtureRepo -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $dataDir -Recurse -Force -ErrorAction SilentlyContinue
}
