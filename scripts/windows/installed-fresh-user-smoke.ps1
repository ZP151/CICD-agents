param(
  [string]$ExpectedVersion = "",
  [int]$Port = 19051,
  [string]$InstalledDaemonPath = "C:\Program Files\MergePilot\mergepilot-daemon.exe"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
  $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "packages\daemon\package.json") -Raw | ConvertFrom-Json).version
}
if (-not (Test-Path -LiteralPath $InstalledDaemonPath)) {
  throw "Installed daemon not found: $InstalledDaemonPath"
}

function Test-TcpPortOpen {
  param([int]$TcpPort)

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $client.Connect("127.0.0.1", $TcpPort)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Wait-DaemonHealth {
  param(
    [string]$BaseUrl,
    [int]$Seconds = 30
  )

  $deadline = (Get-Date).AddSeconds($Seconds)
  $lastError = $null
  while ((Get-Date) -lt $deadline) {
    try {
      return Invoke-RestMethod -Uri "$BaseUrl/healthz" -Method Get -TimeoutSec 2
    } catch {
      $lastError = $_.Exception.Message
      Start-Sleep -Milliseconds 500
    }
  }
  throw "Installed daemon did not become healthy after $Seconds seconds: $lastError"
}

if (Test-TcpPortOpen -TcpPort $Port) {
  throw "Port $Port is already in use."
}

$homeDir = Join-Path $env:TEMP ("mergepilot-installed-fresh-home-" + [guid]::NewGuid().ToString("N"))
$dataDir = Join-Path $env:TEMP ("mergepilot-installed-fresh-data-" + [guid]::NewGuid().ToString("N"))
$repoDir = Join-Path $env:TEMP ("mergepilot-installed-fresh-repo-" + [guid]::NewGuid().ToString("N"))
$process = $null

try {
  New-Item -ItemType Directory -Force -Path $homeDir, $dataDir, $repoDir | Out-Null
  git -C $repoDir init -b main | Out-Null
  git -C $repoDir config core.autocrlf false
  git -C $repoDir config user.email mergepilot-e2e@example.local
  git -C $repoDir config user.name "MergePilot E2E"
  Set-Content -LiteralPath (Join-Path $repoDir "README.md") -Value "# Installed fresh-user fixture`n" -Encoding UTF8
  git -C $repoDir add README.md | Out-Null
  git -C $repoDir commit -m "Initial commit" | Out-Null

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $InstalledDaemonPath
  $startInfo.Arguments = "--port $Port"
  $startInfo.WorkingDirectory = Split-Path $InstalledDaemonPath -Parent
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.Environment["RUNTIME_PORT"] = [string]$Port
  $startInfo.Environment["RUNTIME_HOST"] = "127.0.0.1"
  $startInfo.Environment["RUNTIME_DATA_DIR"] = $dataDir
  $startInfo.Environment["MERGEPILOT_HOME"] = $homeDir
  foreach ($key in @(
      "MERGEPILOT_USER_CONFIG_FILE",
      "MERGEPILOT_LOCAL_ENV_FILE",
      "MERGEPILOT_SECRET_SOURCE",
      "AZURE_OPENAI_API_KEY",
      "OPENAI_API_KEY",
      "AZURE_OPENAI_ENDPOINT",
      "AZURE_OPENAI_CHAT_DEPLOYMENT",
      "AZURE_OPENAI_EMBEDDING_DEPLOYMENT",
      "AZURE_OPENAI_DEPLOYMENT",
      "AZURE_OPENAI_API_VERSION",
      "AZURE_KEYVAULT_URL",
      "AZURE_STORAGE_ACCOUNT",
      "AZURE_COSMOS_ENDPOINT"
    )) {
    $null = $startInfo.Environment.Remove($key)
  }

  $process = [System.Diagnostics.Process]::Start($startInfo)
  $baseUrl = "http://127.0.0.1:$Port"
  $health = Wait-DaemonHealth -BaseUrl $baseUrl
  $config = Invoke-RestMethod -Uri "$baseUrl/daemon/config" -Method Get -TimeoutSec 10

  $configPath = Join-Path $homeDir "config.toml"
  $envPath = Join-Path $homeDir ".env"
  $configContent = if (Test-Path -LiteralPath $configPath) { Get-Content -LiteralPath $configPath -Raw } else { "" }
  $envContent = if (Test-Path -LiteralPath $envPath) { Get-Content -LiteralPath $envPath -Raw } else { "" }

  $workflow = Invoke-RestMethod -Uri "$baseUrl/chat/workflow-action" -Method Post -ContentType "application/json" -Body (@{
      action = "inspect_environment"
      repoPath = $repoDir
      sessionId = $null
      projectLink = $null
    } | ConvertTo-Json -Depth 8) -TimeoutSec 30

  $failures = @()
  if ($health.version -ne $ExpectedVersion) { $failures += "Expected daemon version $ExpectedVersion, got $($health.version)." }
  if (-not (Test-Path -LiteralPath $configPath)) { $failures += "Fresh installed daemon did not create config.toml." }
  if (-not (Test-Path -LiteralPath $envPath)) { $failures += "Fresh installed daemon did not create .env." }
  if ($config.secretSource -ne "local_env") { $failures += "Expected secretSource local_env, got $($config.secretSource)." }
  if ($config.aoaiKeyInVault -ne $false) { $failures += "Expected aoaiKeyInVault false for fresh local_env config." }
  if (-not [string]::IsNullOrWhiteSpace([string]$config.keyVaultSecretError)) { $failures += "Expected no Key Vault secret error, got $($config.keyVaultSecretError)." }
  if ($health.cloudSecrets -eq $true) { $failures += "Expected cloudSecrets to stay disabled for local_env fresh user." }
  if (-not $configContent.Contains('source = "local_env"')) { $failures += "config.toml does not contain source = `"local_env`"." }
  if (-not $configContent.Contains('api_key_ref = ""')) { $failures += "config.toml does not keep api_key_ref empty for local_env." }
  if ($configContent.Contains('kv://secret/mergepilot-aoai-key')) { $failures += "Fresh local_env config still references Key Vault AOAI secret." }
  if (-not $envContent.Contains("AZURE_OPENAI_API_KEY=")) { $failures += ".env does not contain AZURE_OPENAI_API_KEY placeholder." }
  if (-not $envContent.Contains("OPENAI_API_KEY=")) { $failures += ".env does not contain OPENAI_API_KEY placeholder." }
  if ($workflow.workflowState.workflowPhase -ne "inspect_environment") { $failures += "Expected workflow phase inspect_environment, got $($workflow.workflowState.workflowPhase)." }

  [pscustomobject]@{
    ok = $failures.Count -eq 0
    expectedVersion = $ExpectedVersion
    daemonPath = $InstalledDaemonPath
    healthVersion = $health.version
    llmConfigured = $health.llmConfigured
    cloudSecrets = $health.cloudSecrets
    secretSource = $config.secretSource
    aoaiKeyInVault = $config.aoaiKeyInVault
    keyVaultSecretError = $config.keyVaultSecretError
    configPath = $configPath
    envPath = $envPath
    workflowPhase = $workflow.workflowState.workflowPhase
    failures = $failures
  } | ConvertTo-Json -Depth 10

  if ($failures.Count -gt 0) {
    exit 1
  }
  exit 0
} finally {
  if ($process -and -not $process.HasExited) {
    try {
      $process.Kill()
      $process.WaitForExit(5000) | Out-Null
    } catch {}
  }
  Remove-Item -LiteralPath $homeDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $dataDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $repoDir -Recurse -Force -ErrorAction SilentlyContinue
}
