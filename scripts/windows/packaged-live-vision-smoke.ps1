param(
  [int]$Port = 18940,
  [string]$SidecarPath = "",
  [string]$MsiPath = "",
  [string]$ExpectedText = "MP VISION TEST"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "msi-extract-helpers.ps1")
if ([string]::IsNullOrWhiteSpace($SidecarPath) -and [string]::IsNullOrWhiteSpace($MsiPath)) {
  $SidecarPath = Join-Path $repoRoot "apps\desktop\src-tauri\binaries\mergepilot-daemon-x86_64-pc-windows-msvc.exe"
}

$extractDir = $null
if (-not [string]::IsNullOrWhiteSpace($MsiPath)) {
  if (-not (Test-Path -LiteralPath $MsiPath)) {
    throw "MSI not found: $MsiPath. Run .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run tauri:build first."
  }
  $extractDir = Join-Path $env:TEMP ("mergepilot-vision-msi-extract-" + [guid]::NewGuid().ToString("N"))
  $logPath = Join-Path $extractDir "msiexec.log"
  $extractMethod = Invoke-MergePilotMsiExtraction -PackagePath $MsiPath -Destination $extractDir -InstallerLogPath $logPath -RetryOnInstallerBusy
  $daemon = Find-MergePilotExtractedDaemon -Root $extractDir
  if (-not $daemon) {
    throw "Extracted MSI did not contain mergepilot-daemon.exe under $extractDir."
  }
  $SidecarPath = $daemon.FullName
}

if (-not (Test-Path -LiteralPath $SidecarPath)) {
  throw "Sidecar binary not found: $SidecarPath. Run .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run build:sidecar first."
}

$dataDir = Join-Path $env:TEMP ("mergepilot-packaged-vision-data-" + [guid]::NewGuid().ToString("N"))
$fixtureRepo = Join-Path $env:TEMP ("mergepilot-packaged-vision-repo-" + [guid]::NewGuid().ToString("N"))
$imagePath = Join-Path $env:TEMP ("mergepilot-vision-fixture-" + [guid]::NewGuid().ToString("N") + ".png")
$ssePath = Join-Path $repoRoot "output\live-e2e\packaged-live-vision-sse-$Port.log"
$sessionId = $null
$process = $null

function New-VisionFixturePng {
  param([string]$Path, [string]$Text)

  Add-Type -AssemblyName System.Drawing
  $bitmap = [System.Drawing.Bitmap]::new(900, 480)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::White)

  $titleFont = [System.Drawing.Font]::new("Arial", 64, [System.Drawing.FontStyle]::Bold)
  $labelFont = [System.Drawing.Font]::new("Arial", 28, [System.Drawing.FontStyle]::Regular)
  $black = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::Black)
  $blue = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::RoyalBlue)
  $red = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::Crimson)

  $graphics.DrawString($Text, $titleFont, $black, 70, 55)
  $graphics.FillRectangle($blue, 150, 220, 140, 140)
  $graphics.FillEllipse($red, 500, 215, 150, 150)
  $graphics.DrawString("blue square", $labelFont, $black, 125, 375)
  $graphics.DrawString("red circle", $labelFont, $black, 495, 375)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

function Convert-SseLineToJson {
  param([string]$DataLine)
  if (-not $DataLine.StartsWith("data:")) {
    return $null
  }
  $jsonText = $DataLine.Substring(5).Trim()
  if ([string]::IsNullOrWhiteSpace($jsonText)) {
    return $null
  }
  return $jsonText | ConvertFrom-Json
}

try {
  New-Item -ItemType Directory -Force -Path (Split-Path $ssePath -Parent) | Out-Null
  New-Item -ItemType Directory -Path $dataDir, $fixtureRepo | Out-Null
  git -C $fixtureRepo init -b main | Out-Null
  git -C $fixtureRepo config core.autocrlf false
  git -C $fixtureRepo config user.email mergepilot-e2e@example.local
  git -C $fixtureRepo config user.name "MergePilot E2E"
  Set-Content -LiteralPath (Join-Path $fixtureRepo "README.md") -Value "# Packaged live vision fixture`n" -Encoding UTF8
  git -C $fixtureRepo add README.md | Out-Null
  git -C $fixtureRepo commit -m "Initial commit" | Out-Null

  New-VisionFixturePng -Path $imagePath -Text $ExpectedText
  $imageBytes = [System.IO.File]::ReadAllBytes($imagePath)
  $dataUrl = "data:image/png;base64," + [Convert]::ToBase64String($imageBytes)

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $SidecarPath
  $startInfo.Arguments = "--port $Port"
  $startInfo.WorkingDirectory = Split-Path $SidecarPath -Parent
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.Environment["RUNTIME_PORT"] = [string]$Port
  $startInfo.Environment["RUNTIME_HOST"] = "127.0.0.1"
  $startInfo.Environment["RUNTIME_DATA_DIR"] = $dataDir
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = [System.Diagnostics.Process]::Start($startInfo)

  $baseUrl = "http://127.0.0.1:$Port"
  $health = $null
  for ($i = 0; $i -lt 60; $i++) {
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

  $body = @{
    message = "Look only at the attached image. In one short sentence, name the exact large text and the two colored shapes you see."
    repoPath = $fixtureRepo
    projectLink = $null
    imageAttachments = @(
      @{
        name = "mergepilot-vision-fixture.png"
        mimeType = "image/png"
        dataUrl = $dataUrl
      }
    )
  } | ConvertTo-Json -Depth 12

  $response = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/chat" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 180
  Set-Content -LiteralPath $ssePath -Value $response.Content -Encoding UTF8

  $currentEvent = ""
  $assistantDeltas = New-Object System.Collections.Generic.List[string]
  $sseErrors = New-Object System.Collections.Generic.List[string]
  $finalResponse = ""
  $turnFinished = $false
  $turnFailed = $false

  foreach ($line in ($response.Content -split "`r?`n")) {
    if ($line.StartsWith("event:")) {
      $currentEvent = $line.Substring(6).Trim()
      continue
    }
    if (-not $line.StartsWith("data:")) {
      continue
    }
    $payload = Convert-SseLineToJson -DataLine $line
    if ($null -eq $payload) {
      continue
    }
    if ($currentEvent -eq "session" -and $payload.sessionId) {
      $sessionId = [string]$payload.sessionId
    }
    # Canonical SSE terminals (Phase 4 4a-2): the final answer arrives as
    # turn.final.delta (delta) then turn.final.completed (finalText); the
    # success terminal is turn.finished (status "completed"), and
    # turn.failed / turn.cancelled are failure terminals. "assistant_delta"
    # and "done" are obsolete and never emitted by chatSse.ts.
    if ($currentEvent -eq "turn.final.delta" -and $payload.delta) {
      $assistantDeltas.Add([string]$payload.delta)
    }
    if ($currentEvent -eq "turn.final.completed" -and $payload.finalText) {
      $finalResponse = [string]$payload.finalText
    }
    if ($currentEvent -eq "turn.finished") {
      $turnFinished = $true
    }
    if ($currentEvent -eq "turn.failed" -or $currentEvent -eq "turn.cancelled") {
      $turnFailed = $true
    }
    if ($currentEvent -eq "error" -or $payload.type -eq "error") {
      $errorMessage = if ($payload.message) {
        [string]$payload.message
      } elseif ($payload.error) {
        [string]$payload.error
      } else {
        ($payload | ConvertTo-Json -Compress -Depth 6)
      }
      if (-not [string]::IsNullOrWhiteSpace($errorMessage)) {
        $sseErrors.Add($errorMessage)
      }
    }
  }

  $assistantText = ($assistantDeltas -join "")
  if ([string]::IsNullOrWhiteSpace($finalResponse)) {
    $finalResponse = $assistantText
  }

  if ($turnFailed) {
    $sseErrors.Add("Chat turn ended in a failure terminal (turn.failed/turn.cancelled).")
  } elseif (-not $turnFinished) {
    $sseErrors.Add("Chat turn did not emit the canonical success terminal turn.finished.")
  }

  $matchesText = $finalResponse -match [regex]::Escape($ExpectedText)
  $matchesShapes = $finalResponse -match "(?i)blue\s+square" -and $finalResponse -match "(?i)red\s+circle"
  $leaksControlJson = $assistantText -match "\{\\?`"response\\?`"" -or $assistantText -match "risk_level|actions_taken|approval_proposal|responsetext"
  $sentencePattern = [regex]::Escape($ExpectedText)
  $duplicateSentence = ([regex]::Matches($assistantText, $sentencePattern)).Count -gt 1
  $hasSseErrors = $sseErrors.Count -gt 0

  if (-not $matchesText -or -not $matchesShapes -or $leaksControlJson -or $duplicateSentence -or $hasSseErrors) {
    [pscustomobject]@{
      ok = $false
      healthVersion = $health.version
      sidecarPath = $SidecarPath
      msiPath = if ($MsiPath) { (Resolve-Path $MsiPath).Path } else { $null }
      extractMethod = if ($MsiPath) { $extractMethod } else { $null }
      repoPath = $fixtureRepo
      imagePath = $imagePath
      imageBytes = $imageBytes.Length
      sessionId = $sessionId
      assistantDeltaCount = $assistantDeltas.Count
      finalAnswer = $finalResponse
      matchesText = $matchesText
      matchesShapes = $matchesShapes
      leaksControlJson = $leaksControlJson
      duplicateSentence = $duplicateSentence
      hasSseErrors = $hasSseErrors
      sseErrors = @($sseErrors)
      ssePath = $ssePath
    } | ConvertTo-Json -Depth 8
    exit 1
  }

  $deletedSessionStatus = $null
  if ($sessionId) {
    try {
      $deleteResponse = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/chat/$sessionId" -Method Delete -TimeoutSec 30
      $deletedSessionStatus = $deleteResponse.StatusCode
    } catch {
      $deletedSessionStatus = "delete failed: $($_.Exception.Message)"
    }
  }

  [pscustomobject]@{
    ok = $true
    healthVersion = $health.version
    sidecarPath = (Resolve-Path $SidecarPath).Path
    msiPath = if ($MsiPath) { (Resolve-Path $MsiPath).Path } else { $null }
    extractMethod = if ($MsiPath) { $extractMethod } else { $null }
    repoPath = $fixtureRepo
    imagePath = $imagePath
    imageBytes = $imageBytes.Length
    sessionId = $sessionId
    assistantDeltaCount = $assistantDeltas.Count
    finalAnswer = $finalResponse
    matchesText = $matchesText
    matchesShapes = $matchesShapes
    leaksControlJson = $leaksControlJson
    duplicateSentence = $duplicateSentence
    hasSseErrors = $hasSseErrors
    sseErrors = @($sseErrors)
    deletedSessionStatus = $deletedSessionStatus
    ssePath = $ssePath
  } | ConvertTo-Json -Depth 8
} finally {
  if ($process -and -not $process.HasExited) {
    try {
      $process.Kill()
      $process.WaitForExit(5000) | Out-Null
    } catch {}
  }
  Remove-Item -LiteralPath $fixtureRepo -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $dataDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $imagePath -Force -ErrorAction SilentlyContinue
  if ($extractDir) {
    Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
