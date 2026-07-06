param(
  [int]$Port = 8787,
  [string]$InstalledDaemonPath = "C:\Program Files\MergePilot\mergepilot-daemon.exe",
  [string]$ExpectedVersion = "",
  [switch]$SkipAssistantCompletion,
  [int]$ChatTimeoutSec = 120
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) {
  $ExpectedVersion = (Get-Content -LiteralPath (Join-Path $repoRoot "packages\daemon\package.json") -Raw | ConvertFrom-Json).version
}

$baseUrl = "http://127.0.0.1:$Port"
$runId = "mp-installed-persist-" + (Get-Date -Format "yyyyMMdd-HHmmss")
$tempRepo = Join-Path $env:TEMP $runId
$projectLinkId = $null
$sessionId = $null
$cleanup = [ordered]@{
  chatDeleted = $null
  projectLinkDeleted = $null
  tempRepoDeleted = $null
}

function Invoke-Json {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [object]$Body = $null,
    [int]$TimeoutSec = 30
  )

  $uri = "$baseUrl$Path"
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -TimeoutSec $TimeoutSec
  }
  $json = $Body | ConvertTo-Json -Depth 20
  return Invoke-RestMethod -Method $Method -Uri $uri -Body $json -ContentType "application/json" -TimeoutSec $TimeoutSec
}

function Wait-Health {
  param([int]$Seconds = 30)

  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    try {
      $health = Invoke-RestMethod -Uri "$baseUrl/healthz" -TimeoutSec 2
      if ($health.ok) {
        return $health
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  } while ((Get-Date) -lt $deadline)
  throw "Daemon did not become healthy on $baseUrl within $Seconds seconds."
}

function Get-ListeningDaemonProcess {
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
    Select-Object -First 1
  if (-not $connection) {
    throw "No process is listening on port $Port."
  }
  $process = Get-Process -Id $connection.OwningProcess -ErrorAction Stop
  $path = [string]$process.Path
  if ($path -ne $InstalledDaemonPath) {
    throw "Refusing to restart unexpected process on port $Port. Expected '$InstalledDaemonPath', got '$path'."
  }
  return [pscustomobject]@{
    Id = $process.Id
    Path = $path
    StartTime = $process.StartTime
  }
}

function Restart-InstalledDaemon {
  $processInfo = Get-ListeningDaemonProcess
  Stop-Process -Id $processInfo.Id -Force
  Start-Sleep -Seconds 1
  Start-Process -FilePath $InstalledDaemonPath -ArgumentList "--port", "$Port" -WindowStyle Hidden | Out-Null
  $health = Wait-Health 30
  return [pscustomobject]@{
    process = $processInfo
    health = $health
  }
}

function Get-HeaderValue {
  param(
    [object]$Headers,
    [string]$Name
  )
  $value = $Headers[$Name]
  if ($value -is [array]) {
    return [string]$value[0]
  }
  return [string]$value
}

function Get-SessionIdFromChatResponse {
  param([object]$Response)

  $header = Get-HeaderValue $Response.Headers "X-Chat-Session-Id"
  if (-not [string]::IsNullOrWhiteSpace($header)) {
    return $header
  }
  $match = [regex]::Match([string]$Response.Content, '"sessionId"\s*:\s*"([^"]+)"')
  if ($match.Success) {
    return $match.Groups[1].Value
  }
  throw "Chat session id was not found in response header or SSE body."
}

function Test-CollectionContainsId {
  param(
    [object[]]$Collection,
    [string]$Property,
    [string]$Id
  )
  return [bool]($Collection | Where-Object { $_.$Property -eq $Id })
}

function Get-AssistantCompletion {
  param(
    [object[]]$Messages,
    [string]$ExpectedText
  )
  return $Messages |
    Where-Object { $_.role -eq "assistant" -and ([string]$_.content).Contains($ExpectedText) } |
    Select-Object -First 1
}

try {
  if (-not (Test-Path -LiteralPath $InstalledDaemonPath)) {
    throw "Installed daemon not found: $InstalledDaemonPath"
  }

  New-Item -ItemType Directory -Path $tempRepo -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $tempRepo "README.md") -Value "# $runId`nInstalled restart persistence smoke." -Encoding UTF8
  & git -C $tempRepo init -b main | Out-Null

  $healthBefore = Wait-Health 10
  if ($healthBefore.version -ne $ExpectedVersion) {
    throw "Daemon version mismatch before restart. Expected $ExpectedVersion; got $($healthBefore.version)."
  }

  $projectLink = Invoke-Json POST "/project-links" @{
    name = "$runId Project Link"
    repoPath = $tempRepo
    defaultBranch = "main"
    targetBranch = "main"
    adoOrgUrl = "https://tebssg.visualstudio.com/"
    adoProject = "TeBS-ClaimBot"
    adoRepoName = "ClaimBot_API"
    adoPipelineName = "ClaimBot_API"
  }
  $projectLinkId = [string]$projectLink.id
  if ([string]::IsNullOrWhiteSpace($projectLinkId)) {
    throw "Project Link create response did not include an id."
  }

  $linksBefore = @(Invoke-Json GET "/project-links")
  $projectLinkBeforeRestart = Test-CollectionContainsId $linksBefore "id" $projectLinkId
  if (-not $projectLinkBeforeRestart) {
    throw "Created Project Link $projectLinkId was not visible before restart."
  }

  $chatBeforeRestartHasSession = $false
  $chatAfterRestartHasSession = $false
  $assistantBeforeRestart = $null
  $assistantAfterRestart = $null
  $chatTerminalDone = $null
  $chatHttpStatus = $null
  $expectedCompletion = "persistence-ok-$runId"
  if (-not $SkipAssistantCompletion) {
    $chatPayload = @{
      message = "Reply exactly: $expectedCompletion. Do not run tools."
      repoPath = $tempRepo
      projectLinkId = $projectLinkId
      projectLink = $projectLink
    } | ConvertTo-Json -Depth 20

    $chatResponse = Invoke-WebRequest -UseBasicParsing -Method POST -Uri "$baseUrl/chat" -Body $chatPayload -ContentType "application/json" -TimeoutSec $ChatTimeoutSec
    $chatHttpStatus = [int]$chatResponse.StatusCode
    $sessionId = Get-SessionIdFromChatResponse $chatResponse
    $chatTerminalDone = ([string]$chatResponse.Content).Contains("event: done")
    if (-not $chatTerminalDone) {
      throw "Chat response for $sessionId did not include a terminal done event."
    }

    $messagesBefore = @(Invoke-Json GET "/chat/$sessionId/messages")
    $assistantBeforeRestart = Get-AssistantCompletion $messagesBefore $expectedCompletion
    if (-not $assistantBeforeRestart) {
      throw "Assistant completion containing '$expectedCompletion' was not persisted before restart."
    }
    $historyBefore = @(Invoke-Json GET "/chat/history")
    $chatBeforeRestartHasSession = Test-CollectionContainsId $historyBefore "sessionId" $sessionId
    if (-not $chatBeforeRestartHasSession) {
      throw "Chat session $sessionId was not visible in history before restart."
    }
  }

  $restart = Restart-InstalledDaemon
  $healthAfter = $restart.health
  if ($healthAfter.version -ne $ExpectedVersion) {
    throw "Daemon version mismatch after restart. Expected $ExpectedVersion; got $($healthAfter.version)."
  }

  $linksAfter = @(Invoke-Json GET "/project-links")
  $projectLinkAfterRestart = Test-CollectionContainsId $linksAfter "id" $projectLinkId
  if (-not $projectLinkAfterRestart) {
    throw "Project Link $projectLinkId was not visible after restart."
  }

  if (-not $SkipAssistantCompletion) {
    $historyAfter = @(Invoke-Json GET "/chat/history")
    $chatAfterRestartHasSession = Test-CollectionContainsId $historyAfter "sessionId" $sessionId
    if (-not $chatAfterRestartHasSession) {
      throw "Chat session $sessionId was not visible in history after restart."
    }
    $messagesAfter = @(Invoke-Json GET "/chat/$sessionId/messages")
    $assistantAfterRestart = Get-AssistantCompletion $messagesAfter $expectedCompletion
    if (-not $assistantAfterRestart) {
      throw "Assistant completion containing '$expectedCompletion' was not persisted after restart."
    }
  }

  if ($sessionId) {
    try {
      $cleanup.chatDeleted = (Invoke-Json DELETE "/chat/$sessionId").ok
    } catch {
      $cleanup.chatDeleted = "error: $($_.Exception.Message)"
    }
  }
  if ($projectLinkId) {
    try {
      $cleanup.projectLinkDeleted = (Invoke-Json DELETE "/project-links/$projectLinkId").ok
    } catch {
      $cleanup.projectLinkDeleted = "error: $($_.Exception.Message)"
    }
  }
  if (Test-Path -LiteralPath $tempRepo) {
    try {
      Remove-Item -LiteralPath $tempRepo -Recurse -Force
      $cleanup.tempRepoDeleted = $true
    } catch {
      $cleanup.tempRepoDeleted = "error: $($_.Exception.Message)"
    }
  }

  [pscustomobject]@{
    ok = $true
    runId = $runId
    port = $Port
    daemonPath = $InstalledDaemonPath
    projectLinkId = $projectLinkId
    sessionId = $sessionId
    expectedCompletion = if ($SkipAssistantCompletion) { $null } else { $expectedCompletion }
    healthBefore = [pscustomobject]@{
      version = $healthBefore.version
      envSource = $healthBefore.envSource
      llmProvider = $healthBefore.llmProvider
      azureDeployment = $healthBefore.azureDeployment
      cloudProjectLinkStore = $healthBefore.cloudProjectLinkStore
      cloudSessions = $healthBefore.cloudSessions
    }
    healthAfter = [pscustomobject]@{
      version = $healthAfter.version
      envSource = $healthAfter.envSource
      llmProvider = $healthAfter.llmProvider
      azureDeployment = $healthAfter.azureDeployment
      cloudProjectLinkStore = $healthAfter.cloudProjectLinkStore
      cloudSessions = $healthAfter.cloudSessions
    }
    restartedProcess = $restart.process
    projectLinkBeforeRestart = $projectLinkBeforeRestart
    projectLinkAfterRestart = $projectLinkAfterRestart
    chatHttpStatus = $chatHttpStatus
    chatTerminalDone = $chatTerminalDone
    chatBeforeRestartHasSession = $chatBeforeRestartHasSession
    chatAfterRestartHasSession = $chatAfterRestartHasSession
    assistantBeforeRestart = -not ($null -eq $assistantBeforeRestart)
    assistantAfterRestart = -not ($null -eq $assistantAfterRestart)
    cleanup = [pscustomobject]$cleanup
  } | ConvertTo-Json -Depth 12
} finally {
  if ($sessionId) {
    try {
      Invoke-Json DELETE "/chat/$sessionId" | Out-Null
    } catch {}
  }
  if ($projectLinkId) {
    try {
      Invoke-Json DELETE "/project-links/$projectLinkId" | Out-Null
    } catch {}
  }
  if (Test-Path -LiteralPath $tempRepo) {
    try {
      Remove-Item -LiteralPath $tempRepo -Recurse -Force
      $cleanup.tempRepoDeleted = $true
    } catch {
      $cleanup.tempRepoDeleted = "error: $($_.Exception.Message)"
    }
  }
}
