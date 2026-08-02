[CmdletBinding()]
param(
  [string]$RepoRoot = (Join-Path $PSScriptRoot "..\\.."),
  [string]$ExecutablePath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Drawing

if (-not ("MergePilotExecutableIconProbe" -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class MergePilotExecutableIconProbe
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern uint PrivateExtractIcons(
        string fileName,
        int iconIndex,
        int cxIcon,
        int cyIcon,
        IntPtr[] icons,
        uint[] iconIds,
        uint iconCount,
        uint flags);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool DestroyIcon(IntPtr icon);
}
'@
}

function Get-IconAlphaBounds([string]$Path) {
  $bitmap = [System.Drawing.Bitmap]::FromFile($Path)
  try {
    return Get-AlphaBoundsFromBitmap $bitmap $Path
  } finally {
    $bitmap.Dispose()
  }
}

function Get-AlphaBoundsFromBitmap([System.Drawing.Bitmap]$Bitmap, [string]$Path) {
    $minX = $bitmap.Width
    $minY = $bitmap.Height
    $maxX = -1
    $maxY = -1
    $semiTransparentPixels = 0

    for ($y = 0; $y -lt $bitmap.Height; $y++) {
      for ($x = 0; $x -lt $bitmap.Width; $x++) {
        $alpha = $bitmap.GetPixel($x, $y).A
        if ($alpha -eq 0) { continue }
        if ($alpha -lt 255) { $semiTransparentPixels++ }
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
      SemiTransparentPixels = $semiTransparentPixels
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

function Assert-ApprovedSmallTaskbarDerivative([string]$Path, [int]$ExpectedSize, [string]$Approved32Path) {
  # The taskbar's 16–30px payloads must be direct reductions of the
  # user-approved 32px native mark. This catches the previous regression:
  # the notification-area icon was correct at 32px while Explorer selected a
  # visually different 24px raster from the EXE.
  $source = [System.Drawing.Bitmap]::FromFile($Approved32Path)
  $expected = [System.Drawing.Bitmap]::new($ExpectedSize, $ExpectedSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $actual = [System.Drawing.Bitmap]::FromFile($Path)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($expected)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $graphics.DrawImage($source, [System.Drawing.Rectangle]::new(0, 0, $ExpectedSize, $ExpectedSize))
    } finally {
      $graphics.Dispose()
    }

    if ($actual.Width -ne $ExpectedSize -or $actual.Height -ne $ExpectedSize) {
      throw "Approved taskbar derivative has the wrong dimensions: $Path"
    }

    for ($y = 0; $y -lt $ExpectedSize; $y++) {
      for ($x = 0; $x -lt $ExpectedSize; $x++) {
        if ($expected.GetPixel($x, $y).ToArgb() -ne $actual.GetPixel($x, $y).ToArgb()) {
          throw "Taskbar ${ExpectedSize}px frame no longer matches the approved 32px icon: $Path"
        }
      }
    }
  } finally {
    $actual.Dispose()
    $expected.Dispose()
    $source.Dispose()
  }
}

function Get-ExecutableIconFrame([string]$Path, [int]$RequestedSize) {
  $icons = [IntPtr[]]::new(1)
  $iconIds = [uint32[]]::new(1)
  $extracted = [MergePilotExecutableIconProbe]::PrivateExtractIcons(
    $Path,
    0,
    $RequestedSize,
    $RequestedSize,
    $icons,
    $iconIds,
    1,
    0
  )

  if ($extracted -ne 1 -or $icons[0] -eq [IntPtr]::Zero) {
    throw "Windows could not extract the ${RequestedSize}px icon frame from $Path (error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))."
  }

  try {
    $icon = [System.Drawing.Icon]::FromHandle($icons[0])
    try {
      $bitmap = $icon.ToBitmap()
      $stream = [System.IO.MemoryStream]::new()
      try {
        # Icon.ToBitmap can expose premultiplied channels. Round-trip only in
        # memory so the comparison observes the same straight-alpha pixels
        # Explorer receives from the PNG payload, rather than false one-channel
        # differences introduced by System.Drawing's in-memory representation.
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $stream.Position = 0
        $decoded = [System.Drawing.Bitmap]::FromStream($stream)
        try {
          return [System.Drawing.Bitmap]::new($decoded)
        } finally {
          $decoded.Dispose()
        }
      } finally {
        $stream.Dispose()
        $bitmap.Dispose()
      }
    } finally {
      $icon.Dispose()
    }
  } finally {
    [void][MergePilotExecutableIconProbe]::DestroyIcon($icons[0])
  }
}

function Assert-ExecutableIconFrameMatches([string]$ExecutablePath, [string]$ExpectedPath, [int]$RequestedSize) {
  # Ask Windows for the same physical size Explorer uses rather than checking a
  # fixed 48px HICON. The raw ICO payload is hash-verified above; here we
  # verify that the packaged EXE returns the requested dimensions and the same
  # transparent visual bounds. (user32 can round premultiplied edge channels.)
  $expected = [System.Drawing.Bitmap]::FromFile($ExpectedPath)
  $actual = Get-ExecutableIconFrame $ExecutablePath $RequestedSize
  try {
    if ($actual.Width -ne $RequestedSize -or $actual.Height -ne $RequestedSize) {
      throw "Windows returned $($actual.Width)x$($actual.Height) for a ${RequestedSize}px request from $ExecutablePath."
    }

    $expectedProfile = Get-AlphaBoundsFromBitmap $expected "${ExpectedPath}:${RequestedSize}px"
    $actualProfile = Get-AlphaBoundsFromBitmap $actual "${ExecutablePath}:${RequestedSize}px"
    if (
      $actualProfile.TopLeftAlpha -ne 0 -or
      $actualProfile.TopRightAlpha -ne 0 -or
      $actualProfile.BottomLeftAlpha -ne 0 -or
      $actualProfile.BottomRightAlpha -ne 0 -or
      [Math]::Abs($actualProfile.VisibleWidth - $expectedProfile.VisibleWidth) -gt 1 -or
      [Math]::Abs($actualProfile.VisibleHeight - $expectedProfile.VisibleHeight) -gt 1
    ) {
      throw "Packaged executable ${RequestedSize}px frame has different transparent bounds from the ICO payload: $ExecutablePath"
    }
  } finally {
    $actual.Dispose()
    $expected.Dispose()
  }
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

function Get-IcoFrames([string]$Path) {
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $count = [BitConverter]::ToUInt16($bytes, 4)

  for ($index = 0; $index -lt $count; $index++) {
    $directoryOffset = 6 + 16 * $index
    $size = [int]$bytes[$directoryOffset]
    if ($size -eq 0) { $size = 256 }
    $payloadLength = [BitConverter]::ToUInt32($bytes, $directoryOffset + 8)
    $payloadOffset = [BitConverter]::ToUInt32($bytes, $directoryOffset + 12)
    $payload = New-Object byte[] $payloadLength
    [Array]::Copy($bytes, $payloadOffset, $payload, 0, $payloadLength)
    $stream = New-Object System.IO.MemoryStream(,$payload)
    $bitmap = [System.Drawing.Bitmap]::FromStream($stream)
    try {
      $profile = Get-AlphaBoundsFromBitmap $bitmap "${Path}:${size}x${size}"
      [pscustomobject]@{
        Size = $size
        Width = $bitmap.Width
        Height = $bitmap.Height
        PngPayload = ($payload[0] -eq 137 -and $payload[1] -eq 80 -and $payload[2] -eq 78 -and $payload[3] -eq 71)
        PayloadHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($payload))
        Profile = $profile
      }
    } finally {
      $bitmap.Dispose()
      $stream.Dispose()
    }
  }
}

$desktopRoot = Join-Path (Resolve-Path $RepoRoot) "apps\\desktop"
$approvedReference = Join-Path $desktopRoot "src\\assets\\mergepilot-icon-reference.png"
$approvedTaskbar32 = Join-Path $desktopRoot "src\\assets\\mergepilot-taskbar-32.png"
$webIcon = Join-Path $desktopRoot "src\\assets\\mergepilot-icon.png"
$nativeIcon32 = Join-Path $desktopRoot "src-tauri\\icons\\32x32.png"
$nativeIcon48 = Join-Path $desktopRoot "src-tauri\\icons\\48x48.png"
$nativeIcon256 = Join-Path $desktopRoot "src-tauri\\icons\\128x128@2x.png"
$nativeIco = Join-Path $desktopRoot "src-tauri\\icons\\icon.ico"
$taskbarDirectory = Join-Path $desktopRoot "src-tauri\\icons\\taskbar"
$taskbarSizes = @(16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 96, 128, 256)
$approvedSmallTaskbarSizes = @(16, 20, 24, 30)

# This is the user-approved cloud artwork.  Keep the source itself in the
# repository and fail verification if a later refresh silently replaces it
# with a low-resolution derivative or a different logo.
$approvedReferenceHash = "563CFEFF1DE0472F8DAE310CDD7AAF0CBCD55A8281134C2C0C7832F0388127A8"
$actualReferenceHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([System.IO.File]::ReadAllBytes($approvedReference)))
if ($actualReferenceHash -ne $approvedReferenceHash) {
  throw "Approved cloud artwork changed unexpectedly: $approvedReference"
}

$approvedTaskbar32Hash = "93413291F3F43E9CF4197DCA9F7B382EFA614BE8663F0E44A41F01F73DB3CA6F"
if (-not (Test-Path -LiteralPath $approvedTaskbar32)) {
  throw "Missing approved 32px taskbar frame: $approvedTaskbar32"
}
$actualTaskbar32Hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([System.IO.File]::ReadAllBytes($approvedTaskbar32)))
if ($actualTaskbar32Hash -ne $approvedTaskbar32Hash) {
  throw "Approved 32px taskbar frame changed unexpectedly: $approvedTaskbar32"
}

$webFrame = Assert-TransparentCloudFrame $webIcon 512 0.6
$smallFrame = Assert-TransparentCloudFrame $nativeIcon32 32 0.6
$taskbarFrame = Assert-TransparentCloudFrame $nativeIcon48 48 0.6
# The approved horizontal cloud intentionally carries more vertical breathing
# room than a square app mark. Its 256px source is 209×163 visible pixels,
# so a 0.60 minimum catches accidental shrinkage without rejecting the
# original composition.
$retinaFrame = Assert-TransparentCloudFrame $nativeIcon256 256 0.6

$expectedIcoFrames = @(16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 96, 128, 256)
$actualIcoFrames = Get-IcoFrameSizes $nativeIco
if (Compare-Object -ReferenceObject $expectedIcoFrames -DifferenceObject $actualIcoFrames) {
  throw "ICO frame set is incomplete. Expected $($expectedIcoFrames -join ', '); got $($actualIcoFrames -join ', ')."
}

# The shell must be able to choose an exact per-DPI bitmap. Verify each ICO
# entry is the byte-identical taskbar source file rather than a runtime resize
# of one PNG. The source's own anti-aliasing is retained because removing it
# changes the cloud silhouette; no synthetic shadow or glow is added here.
$icoFrames = @(Get-IcoFrames $nativeIco)
foreach ($size in $taskbarSizes) {
  $taskbarPath = Join-Path $taskbarDirectory "${size}x${size}.png"
  if (-not (Test-Path -LiteralPath $taskbarPath)) {
    throw "Missing exported taskbar frame: $taskbarPath"
  }

  $taskbarFrame = Assert-TransparentCloudFrame $taskbarPath $size 0.6
  $icoFrame = @($icoFrames | Where-Object { $_.Size -eq $size })
  if ($icoFrame.Count -ne 1 -or -not $icoFrame[0].PngPayload -or $icoFrame[0].Width -ne $size -or $icoFrame[0].Height -ne $size) {
    throw "ICO entry is invalid for ${size}px."
  }
  $taskbarHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([System.IO.File]::ReadAllBytes($taskbarPath)))
  if ($icoFrame[0].PayloadHash -ne $taskbarHash) {
    throw "ICO entry is not the exact exported ${size}px taskbar source."
  }

  if ($approvedSmallTaskbarSizes -contains $size) {
    Assert-ApprovedSmallTaskbarDerivative $taskbarPath $size $approvedTaskbar32
  }
}

$trayFrameHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([System.IO.File]::ReadAllBytes($nativeIcon32)))
$taskbar32Hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([System.IO.File]::ReadAllBytes((Join-Path $taskbarDirectory "32x32.png"))))
if ($trayFrameHash -ne $taskbar32Hash) {
  throw "Notification-area icon must use the dedicated crisp 32px frame."
}
if ($taskbar32Hash -ne $approvedTaskbar32Hash) {
  throw "Taskbar 32px frame must remain byte-identical to the approved icon."
}

if (-not $ExecutablePath) {
  $releaseExecutable = Join-Path $desktopRoot "src-tauri\\target\\release\\mergepilot-desktop.exe"
  if (Test-Path -LiteralPath $releaseExecutable) { $ExecutablePath = $releaseExecutable }
}

if ($ExecutablePath) {
  $resolvedExecutable = (Resolve-Path $ExecutablePath).Path
  foreach ($size in @(16, 20, 24, 30, 32)) {
    Assert-ExecutableIconFrameMatches $resolvedExecutable (Join-Path $taskbarDirectory "${size}x${size}.png") $size
  }
}

Write-Host "Verified approved MergePilot cloud icon assets: approved source, 512px web source, exported crisp taskbar frames, matching ICO payloads, and executable resource."
$icoFrameSummary = @($icoFrames | ForEach-Object { "$($_.Size)x$($_.Size)" }) -join ', '
Write-Host "ICO frames: $icoFrameSummary"
Write-Host "Web visible bounds: $($webFrame.VisibleWidth)x$($webFrame.VisibleHeight); native 32px tray source: $($smallFrame.VisibleWidth)x$($smallFrame.VisibleHeight); 256px app source: $($taskbarFrame.VisibleWidth)x$($taskbarFrame.VisibleHeight)."
