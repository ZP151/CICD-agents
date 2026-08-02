[CmdletBinding()]
param(
  [string]$RepoRoot = (Join-Path $PSScriptRoot "..\\.."),
  [string]$OutputDirectory = (Join-Path ([System.IO.Path]::GetTempPath()) "mergepilot-icon-review")
)

<#
.SYNOPSIS
  Creates a visual review pack for the actual multi-frame Windows icon.

.DESCRIPTION
  The review pack is deliberately generated from the retained full-resolution
  cloud master, the user-approved native 32px mark, and the PNG payloads
  inside icon.ico. It does not render the React image, extract a shell HICON,
  or upscale a low-resolution source.

  It makes the small-frame decision reviewable:
  - original source render: original visual identity at 24px;
  - approved native reduction: the exact 32px user-approved mark reduced to
    24px without changing its geometry;
  - shipped ICO render: the exact 24px payload packaged for Windows.

  The six-frame contact sheet uses the real ICO entries at 8x nearest-neighbour
  magnification so individual pixels can be inspected without inventing blur.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$repoRoot = Resolve-Path $RepoRoot
$desktopRoot = Join-Path $repoRoot "apps\\desktop"
$masterPath = Join-Path $desktopRoot "src\\assets\\mergepilot-icon-source.png"
$approvedTaskbar32Path = Join-Path $desktopRoot "src\\assets\\mergepilot-taskbar-32.png"
$icoPath = Join-Path $desktopRoot "src-tauri\\icons\\icon.ico"

if (-not (Test-Path -LiteralPath $masterPath)) { throw "Missing transparent icon master: $masterPath" }
if (-not (Test-Path -LiteralPath $approvedTaskbar32Path)) { throw "Missing approved taskbar 32px source: $approvedTaskbar32Path" }
if (-not (Test-Path -LiteralPath $icoPath)) { throw "Missing native ICO: $icoPath" }

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

function New-RenderFromSource([string]$sourcePath, [int]$size, [double]$scale = 1.0, [bool]$snapAlpha = $false) {
  $source = [System.Drawing.Bitmap]::FromFile($sourcePath)
  try {
    $target = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($target)
      try {
        $renderSize = [int][Math]::Ceiling($size * $scale)
        $offset = [int](($size - $renderSize) / 2)
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($source, [System.Drawing.Rectangle]::new($offset, $offset, $renderSize, $renderSize))
      } finally {
        $graphics.Dispose()
      }

      if ($snapAlpha) {
        for ($y = 0; $y -lt $target.Height; $y++) {
          for ($x = 0; $x -lt $target.Width; $x++) {
            $pixel = $target.GetPixel($x, $y)
            if ($pixel.A -gt 0) {
              $target.SetPixel($x, $y, $(if ($pixel.A -lt 80) { [System.Drawing.Color]::Transparent } else { [System.Drawing.Color]::FromArgb(255, $pixel.R, $pixel.G, $pixel.B) }))
            }
          }
        }
      }

      return $target
    } catch {
      $target.Dispose()
      throw
    }
  } finally {
    $source.Dispose()
  }
}

function Get-IcoFrame([int]$requestedSize) {
  $bytes = [System.IO.File]::ReadAllBytes($icoPath)
  if ($bytes.Length -lt 6 -or [BitConverter]::ToUInt16($bytes, 0) -ne 0 -or [BitConverter]::ToUInt16($bytes, 2) -ne 1) {
    throw "Invalid ICO header: $icoPath"
  }

  $count = [BitConverter]::ToUInt16($bytes, 4)
  for ($index = 0; $index -lt $count; $index++) {
    $directoryOffset = 6 + 16 * $index
    $size = [int]$bytes[$directoryOffset]
    if ($size -eq 0) { $size = 256 }
    if ($size -ne $requestedSize) { continue }

    $payloadLength = [BitConverter]::ToUInt32($bytes, $directoryOffset + 8)
    $payloadOffset = [BitConverter]::ToUInt32($bytes, $directoryOffset + 12)
    $payload = New-Object byte[] $payloadLength
    [Array]::Copy($bytes, $payloadOffset, $payload, 0, $payloadLength)
    $stream = New-Object System.IO.MemoryStream(,$payload)
    try {
      $decoded = [System.Drawing.Bitmap]::FromStream($stream)
      try {
        return New-Object System.Drawing.Bitmap($decoded)
      } finally {
        $decoded.Dispose()
      }
    } finally {
      $stream.Dispose()
    }
  }

  throw "ICO does not contain ${requestedSize}px: $icoPath"
}

function Save-Png([System.Drawing.Bitmap]$bitmap, [string]$path) {
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function New-Checkerboard([int]$width, [int]$height, [int]$cell = 8) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $light = [System.Drawing.Color]::FromArgb(255, 250, 250, 250)
    $dark = [System.Drawing.Color]::FromArgb(255, 231, 231, 231)
    for ($y = 0; $y -lt $height; $y += $cell) {
      for ($x = 0; $x -lt $width; $x += $cell) {
        $brush = New-Object System.Drawing.SolidBrush($(if ((($x / $cell) + ($y / $cell)) % 2 -eq 0) { $light } else { $dark }))
        try { $graphics.FillRectangle($brush, $x, $y, $cell, $cell) } finally { $brush.Dispose() }
      }
    }
  } finally {
    $graphics.Dispose()
  }
  return $bitmap
}

function Draw-ScaledFrame(
  [System.Drawing.Graphics]$graphics,
  [System.Drawing.Bitmap]$frame,
  [int]$x,
  [int]$y,
  [int]$scale,
  [string]$label
) {
  $width = $frame.Width * $scale
  $height = $frame.Height * $scale
  $checker = New-Checkerboard $width $height ([Math]::Max(4, $scale))
  try { $graphics.DrawImageUnscaled($checker, $x, $y + 26) } finally { $checker.Dispose() }
  $previous = $graphics.InterpolationMode
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $graphics.DrawImage($frame, [System.Drawing.Rectangle]::new($x, ($y + 26), $width, $height))
  $graphics.InterpolationMode = $previous
  $font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 32, 37, 48))
  try { $graphics.DrawString($label, $font, $brush, $x, $y + 4) } finally { $font.Dispose(); $brush.Dispose() }
}

$source24 = New-RenderFromSource $masterPath 24 1.0 $false
$approved24 = New-RenderFromSource $approvedTaskbar32Path 24 1.0 $false
$current24 = Get-IcoFrame 24
try {
  Save-Png $source24 (Join-Path $OutputDirectory "original-24x24.png")
  Save-Png $approved24 (Join-Path $OutputDirectory "approved-native-24x24.png")
  Save-Png $current24 (Join-Path $OutputDirectory "packaged-ico-24x24.png")

  $comparison = New-Object System.Drawing.Bitmap(768, 278, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($comparison)
  try {
    $graphics.Clear([System.Drawing.Color]::White)
    Draw-ScaledFrame $graphics $source24 18 20 8 "Original master / 24px"
    Draw-ScaledFrame $graphics $approved24 274 20 8 "Approved 32px reduction / 24px"
    Draw-ScaledFrame $graphics $current24 530 20 8 "Shipped ICO / 24px"
    $font = New-Object System.Drawing.Font("Segoe UI", 9)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 70, 78, 94))
    try {
      $graphics.DrawString("The shipped frame must retain the approved native mark at the size Explorer actually requests.", $font, $brush, 18, 238)
    } finally { $font.Dispose(); $brush.Dispose() }
    Save-Png $comparison (Join-Path $OutputDirectory "original-vs-legacy-vs-shipped-24px-8x.png")
  } finally { $graphics.Dispose(); $comparison.Dispose() }
} finally {
  $source24.Dispose()
  $approved24.Dispose()
  $current24.Dispose()
}

# The approved 32px source is retained byte-for-byte in the ICO, rather than
# asking Windows to derive a small taskbar image from a larger raster. This
# makes the visual identity reviewable against the exact source the user chose.
$approved32 = [System.Drawing.Bitmap]::FromFile($approvedTaskbar32Path)
$current32 = Get-IcoFrame 32
try {
  Save-Png $approved32 (Join-Path $OutputDirectory "approved-taskbar-32x32.png")
  Save-Png $current32 (Join-Path $OutputDirectory "packaged-ico-32x32.png")

  $identityComparison = New-Object System.Drawing.Bitmap(580, 332, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $identityGraphics = [System.Drawing.Graphics]::FromImage($identityComparison)
  try {
    $identityGraphics.Clear([System.Drawing.Color]::White)
    Draw-ScaledFrame $identityGraphics $approved32 24 22 8 "Approved source / 32px"
    Draw-ScaledFrame $identityGraphics $current32 300 22 8 "Packaged ICO / 32px"
    $font = New-Object System.Drawing.Font("Segoe UI", 9)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 70, 78, 94))
    try {
      $identityGraphics.DrawString("These two files are verified byte-identical before packaging.", $font, $brush, 24, 300)
    } finally { $font.Dispose(); $brush.Dispose() }
    Save-Png $identityComparison (Join-Path $OutputDirectory "approved-vs-packaged-32px-8x.png")
  } finally { $identityGraphics.Dispose(); $identityComparison.Dispose() }
} finally {
  $approved32.Dispose()
  $current32.Dispose()
}

$reviewSizes = @(256, 48, 32, 24, 20, 16)
$margin = 18
$gap = 28
$maxWidth = 0
$totalHeight = $margin
foreach ($size in $reviewSizes) {
  $scaled = $size * 8
  $maxWidth = [Math]::Max($maxWidth, $scaled)
  $totalHeight += 26 + $scaled + $gap
}
$sheet = [System.Drawing.Bitmap]::new(($maxWidth + (2 * $margin)), $totalHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$sheetGraphics = [System.Drawing.Graphics]::FromImage($sheet)
try {
  $sheetGraphics.Clear([System.Drawing.Color]::White)
  $cursorY = $margin
  foreach ($size in $reviewSizes) {
    $frame = Get-IcoFrame $size
    try {
      Draw-ScaledFrame $sheetGraphics $frame $margin $cursorY 8 "Actual icon.ico ${size}px payload · 8x"
      $cursorY += 26 + ($size * 8) + $gap
    } finally { $frame.Dispose() }
  }
  Save-Png $sheet (Join-Path $OutputDirectory "ico-frame-identity-8x.png")
} finally { $sheetGraphics.Dispose(); $sheet.Dispose() }

Write-Host "Icon review pack written to: $OutputDirectory"
Write-Host "- original-vs-legacy-vs-shipped-24px-8x.png"
Write-Host "- approved-vs-packaged-32px-8x.png"
Write-Host "- ico-frame-identity-8x.png"
