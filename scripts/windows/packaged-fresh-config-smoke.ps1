param(
  [string]$MsiPath = "",
  [int]$Port = 19041
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if ([string]::IsNullOrWhiteSpace($MsiPath)) {
  $version = (Get-Content -LiteralPath (Join-Path $repoRoot "apps\desktop\package.json") -Raw | ConvertFrom-Json).version
  $MsiPath = Join-Path $repoRoot "apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_$($version)_x64_en-US.msi"
}
if (-not (Test-Path -LiteralPath $MsiPath)) {
  throw "MSI not found: $MsiPath. Run .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run tauri:build first."
}

$extractDir = Join-Path $env:TEMP ("mergepilot-fresh-config-msi-" + [guid]::NewGuid().ToString("N"))
$homeDir = Join-Path $env:TEMP ("mergepilot-fresh-config-home-" + [guid]::NewGuid().ToString("N"))
$dataDir = Join-Path $env:TEMP ("mergepilot-fresh-config-data-" + [guid]::NewGuid().ToString("N"))
$logPath = Join-Path $extractDir "msiexec.log"
$process = $null

try {
  New-Item -ItemType Directory -Force -Path $extractDir, $homeDir, $dataDir | Out-Null
  $extract = $null
  for ($attempt = 1; $attempt -le 4; $attempt++) {
    $extract = Start-Process -FilePath msiexec.exe -ArgumentList @(
      "/a",
      (Resolve-Path $MsiPath).Path,
      "/qn",
      "TARGETDIR=$extractDir",
      "/L*v",
      $logPath
    ) -Wait -PassThru
    if ($extract.ExitCode -ne 1618) {
      break
    }
    Start-Sleep -Seconds ([Math]::Min(8, 2 * $attempt))
  }
  if ($extract.ExitCode -ne 0) {
    Get-Content -LiteralPath $logPath -Tail 80 -ErrorAction SilentlyContinue
    throw "MSI administrative extraction failed with exit code $($extract.ExitCode)."
  }

  $daemon = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter mergepilot-daemon.exe |
    Select-Object -First 1
  if (-not $daemon) {
    throw "Extracted MSI did not contain mergepilot-daemon.exe under $extractDir."
  }

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $daemon.FullName
  $startInfo.Arguments = "--port $Port"
  $startInfo.WorkingDirectory = Split-Path $daemon.FullName -Parent
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.Environment["RUNTIME_PORT"] = [string]$Port
  $startInfo.Environment["RUNTIME_HOST"] = "127.0.0.1"
  $startInfo.Environment["RUNTIME_DATA_DIR"] = $dataDir
  $startInfo.Environment["MERGEPILOT_HOME"] = $homeDir
  $process = [System.Diagnostics.Process]::Start($startInfo)

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
    throw "Packaged daemon did not become healthy."
  }

  $config = Invoke-RestMethod -Uri "$baseUrl/daemon/config" -Method Get -TimeoutSec 10
  $configPath = Join-Path $homeDir "config.toml"
  $envPath = Join-Path $homeDir ".env"
  if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Fresh packaged daemon did not create config.toml at $configPath."
  }
  if (-not (Test-Path -LiteralPath $envPath)) {
    throw "Fresh packaged daemon did not create .env at $envPath."
  }

  $configContent = Get-Content -LiteralPath $configPath -Raw
  $envContent = Get-Content -LiteralPath $envPath -Raw
  $failures = @()
  if ($config.secretSource -ne "local_env") { $failures += "Expected /daemon/config secretSource local_env, got $($config.secretSource)." }
  if ($config.aoaiKeyInVault -ne $false) { $failures += "Expected aoaiKeyInVault false for fresh local_env config." }
  if (-not [string]::IsNullOrWhiteSpace($config.keyVaultSecretError)) { $failures += "Expected no Key Vault secret error, got $($config.keyVaultSecretError)." }
  if (-not $configContent.Contains('source = "local_env"')) { $failures += "config.toml does not contain source = `"local_env`"." }
  if (-not $configContent.Contains('api_key_ref = ""')) { $failures += "config.toml does not keep api_key_ref empty for local_env." }
  if (-not $envContent.Contains("AZURE_OPENAI_API_KEY=")) { $failures += ".env does not contain AZURE_OPENAI_API_KEY placeholder." }
  if (-not $envContent.Contains("OPENAI_API_KEY=")) { $failures += ".env does not contain OPENAI_API_KEY placeholder." }

  [pscustomobject]@{
    ok = $failures.Count -eq 0
    msiPath = (Resolve-Path $MsiPath).Path
    extractedDaemon = $daemon.FullName
    healthVersion = $health.version
    secretSource = $config.secretSource
    aoaiKeyInVault = $config.aoaiKeyInVault
    keyVaultSecretError = $config.keyVaultSecretError
    configPath = $configPath
    envPath = $envPath
    failures = $failures
  } | ConvertTo-Json -Depth 8

  if ($failures.Count -gt 0) {
    exit 1
  }
} finally {
  if ($process -and -not $process.HasExited) {
    try {
      $process.Kill()
      $process.WaitForExit(5000) | Out-Null
    } catch {}
  }
  Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $homeDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $dataDir -Recurse -Force -ErrorAction SilentlyContinue
}
