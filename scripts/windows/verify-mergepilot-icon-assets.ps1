[CmdletBinding()]
param(
  [string]$RepoRoot = (Join-Path $PSScriptRoot "..\\.."),
  [string]$ExecutablePath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Drawing

function Get-IconAlphaBounds([string]$Path) {
  $bitmap = [System.Drawing.Bitmap]::FromFile($Path)
  try {
    $minX = $bitmap.Width
    $minY = $bitmap.Height
    $maxX = -1
    $maxY = -1

    for ($y = 0; $y -lt $bitmap.Height; $y++) {
      for ($x = 0; $x -lt $bitmap.Width; $x++) {
        if ($bitmap.GetPixel($x, $y).A -eq 0) { continue }
        $minX = [Math]::Min($minX, $x)
        $minY = [Math]::Min($minY, $y)
        $maxX = [Math]::Max($maxX, $x)
        $maxY = [Math]::Max($maxY, $y)
      }
    }

    if ($maxX -lt 0) { throw "Icon has no visible pixels: $Path" }

    [pscustomobject]@{
      Path = $Path
      Width = $bitmap.Width
      Height = $bitmap.Height
      TopLeftAlpha = $bitmap.GetPixel(0, 0).A
      TopRightAlpha = $bitmap.GetPixel($bitmap.Width - 1, 0).A
      BottomLeftAlpha = $bitmap.GetPixel(0, $bitmap.Height - 1).A
      BottomRightAlpha = $bitmap.GetPixel($bitmap.Width - 1, $bitmap.Height - 1).A
      VisibleWidth = $maxX - $minX + 1
      VisibleHeight = $maxY - $minY + 1
    }
  } finally {
    $bitmap.Dispose()
  }
}

function Assert-TransparentCloudFrame([string]$Path, [int]$ExpectedSize, [double]$MinimumVisibleRatio) {
  $frame = Get-IconAlphaBounds $Path
  if ($frame.Width -ne $ExpectedSize -or $frame.Height -ne $ExpectedSize) {
    throw "Expected ${ExpectedSize}x${ExpectedSize} icon frame, got $($frame.Width)x$($frame.Height): $Path"
  }

  if (@($frame.TopLeftAlpha, $frame.TopRightAlpha, $frame.BottomLeftAlpha, $frame.BottomRightAlpha) | Where-Object { $_ -ne 0 }) {
    throw "Icon frame must have a transparent outer canvas, but a corner is opaque: $Path"
  }

  $visibleWidthRatio = $frame.VisibleWidth / $frame.Width
  $visibleHeightRatio = $frame.VisibleHeight / $frame.Height
  $aspectRatio = $frame.VisibleWidth / $frame.VisibleHeight
  if ($visibleWidthRatio -lt $MinimumVisibleRatio -or $visibleHeightRatio -lt $MinimumVisibleRatio -or $aspectRatio -lt 1.15 -or $aspectRatio -gt 1.4) {
    throw "Cloud mark is unexpectedly small or distorted in $Path (visible $($frame.VisibleWidth)x$($frame.VisibleHeight))."
  }

  return $frame
}

function Get-IcoFrameSizes([string]$Path) {
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 6 -or [BitConverter]::ToUInt16($bytes, 0) -ne 0 -or [BitConverter]::ToUInt16($bytes, 2) -ne 1) {
    throw "Invalid ICO header: $Path"
  }

  $count = [BitConverter]::ToUInt16($bytes, 4)
  if ($bytes.Length -lt (6 + 16 * $count)) { throw "Truncated ICO directory: $Path" }

  $sizes = for ($index = 0; $index -lt $count; $index++) {
    $size = $bytes[6 + 16 * $index]
    if ($size -eq 0) { 256 } else { [int]$size }
  }
  return @($sizes | Sort-Object -Unique)
}

$desktopRoot = Join-Path (Resolve-Path $RepoRoot) "apps\\desktop"
$webIcon = Join-Path $desktopRoot "src\\assets\\mergepilot-icon.png"
$nativeIcon32 = Join-Path $desktopRoot "src-tauri\\icons\\32x32.png"
$nativeIcon256 = Join-Path $desktopRoot "src-tauri\\icons\\128x128@2x.png"
$nativeIco = Join-Path $desktopRoot "src-tauri\\icons\\icon.ico"

$webFrame = Assert-TransparentCloudFrame $webIcon 512 0.6
$smallFrame = Assert-TransparentCloudFrame $nativeIcon32 32 0.55
$retinaFrame = Assert-TransparentCloudFrame $nativeIcon256 256 0.6

$expectedIcoFrames = @(16, 20, 24, 32, 48, 64, 128, 256)
$actualIcoFrames = Get-IcoFrameSizes $nativeIco
if (Compare-Object -ReferenceObject $expectedIcoFrames -DifferenceObject $actualIcoFrames) {
  throw "ICO frame set is incomplete. Expected $($expectedIcoFrames -join ', '); got $($actualIcoFrames -join ', ')."
}

if (-not $ExecutablePath) {
  $releaseExecutable = Join-Path $desktopRoot "src-tauri\\target\\release\\mergepilot-desktop.exe"
  if (Test-Path -LiteralPath $releaseExecutable) { $ExecutablePath = $releaseExecutable }
}

if ($ExecutablePath) {
  $icon = [System.Drawing.Icon]::ExtractAssociatedIcon((Resolve-Path $ExecutablePath))
  if (-not $icon) { throw "Could not extract an icon from executable: $ExecutablePath" }

  $temporaryIcon = Join-Path ([System.IO.Path]::GetTempPath()) "mergepilot-icon-verification.png"
  try {
    $bitmap = $icon.ToBitmap()
    try { $bitmap.Save($temporaryIcon, [System.Drawing.Imaging.ImageFormat]::Png) } finally { $bitmap.Dispose() }
    Assert-TransparentCloudFrame $temporaryIcon 32 0.55 | Out-Null
  } finally {
    $icon.Dispose()
    Remove-Item -LiteralPath $temporaryIcon -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Verified approved MergePilot cloud icon assets: 512px web source, native PNG frames, ICO frame set, and executable resource."
Write-Host "Web visible bounds: $($webFrame.VisibleWidth)x$($webFrame.VisibleHeight); taskbar frame: $($smallFrame.VisibleWidth)x$($smallFrame.VisibleHeight)."
