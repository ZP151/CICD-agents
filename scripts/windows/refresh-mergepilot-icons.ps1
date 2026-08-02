param(
  [string]$SourceImage = ""
)

<#!
.SYNOPSIS
  Removes the legacy outer tile from the existing MergePilot artwork while
  preserving the blue cloud and the white cloud interior.

.DESCRIPTION
  The old artwork has a rounded-square field surrounding the actual cloud mark.
  This script flood-fills only pale pixels connected to the canvas edge. The
  cloud outline encloses its white interior, so the interior never becomes part
  of the transparent region. It keeps web and native Windows icon assets aligned.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies @(
  [System.Drawing.Bitmap].Assembly.Location,
  (Join-Path $PSHOME "System.Private.Windows.GdiPlus.dll"),
  (Join-Path $PSHOME "System.Private.Windows.Core.dll"),
  (Join-Path $PSHOME "System.Drawing.Primitives.dll"),
  (Join-Path $PSHOME "System.Runtime.dll"),
  (Join-Path $PSHOME "System.Private.CoreLib.dll")
) -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class MergePilotIconSurface
{
    private static bool IsTransparentOrOuterSurface(int argb)
    {
        var alpha = (argb >> 24) & 0xff;
        if (alpha == 0) return true;

        var red = (argb >> 16) & 0xff;
        var green = (argb >> 8) & 0xff;
        var blue = argb & 0xff;
        var minimum = Math.Min(red, Math.Min(green, blue));
        var maximum = Math.Max(red, Math.Max(green, blue));
        // The original rounded tile leaves a neutral drop shadow underneath.
        // It is outside the cloud contour and must go too; the blue cloud always
        // has a much wider channel spread than this neutral threshold.
        return maximum >= 60 && maximum - minimum <= 40;
    }

    public static void RemoveOuterSurface(string path)
    {
        Bitmap bitmap;
        using (var source = new Bitmap(path))
        {
            bitmap = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
            using (var graphics = Graphics.FromImage(bitmap))
            {
                graphics.DrawImage(source, 0, 0, source.Width, source.Height);
            }
        }

        try
        {
            var rectangle = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
            var data = bitmap.LockBits(rectangle, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            try
            {
                var stride = data.Stride / sizeof(int);
                var pixels = new int[stride * bitmap.Height];
                Marshal.Copy(data.Scan0, pixels, 0, pixels.Length);
                var visited = new bool[bitmap.Width * bitmap.Height];
                // A fixed primitive queue avoids per-pixel allocations and keeps
                // the 1024px installer asset fast under Windows PowerShell.
                var queue = new int[bitmap.Width * bitmap.Height * 4];
                var queueHead = 0;
                var queueTail = 0;

                for (var x = 0; x < bitmap.Width; x++)
                {
                    queue[queueTail++] = x;
                    queue[queueTail++] = (bitmap.Height - 1) * bitmap.Width + x;
                }
                for (var y = 1; y < bitmap.Height - 1; y++)
                {
                    queue[queueTail++] = y * bitmap.Width;
                    queue[queueTail++] = y * bitmap.Width + bitmap.Width - 1;
                }

                while (queueHead < queueTail)
                {
                    var index = queue[queueHead++];
                    if (visited[index]) continue;
                    visited[index] = true;

                    var x = index % bitmap.Width;
                    var y = index / bitmap.Width;
                    var pixelIndex = y * stride + x;
                    var pixel = pixels[pixelIndex];
                    if (!IsTransparentOrOuterSurface(pixel)) continue;

                    if (((pixel >> 24) & 0xff) != 0)
                    {
                        pixels[pixelIndex] = pixel & 0x00ffffff;
                    }

                    if (x > 0) queue[queueTail++] = index - 1;
                    if (x + 1 < bitmap.Width) queue[queueTail++] = index + 1;
                    if (y > 0) queue[queueTail++] = index - bitmap.Width;
                    if (y + 1 < bitmap.Height) queue[queueTail++] = index + bitmap.Width;
                }

                Marshal.Copy(pixels, 0, data.Scan0, pixels.Length);
            }
            finally
            {
                bitmap.UnlockBits(data);
            }

            var temporaryPath = path + ".mergepilot-icon-tmp";
            bitmap.Save(temporaryPath, ImageFormat.Png);
            File.Copy(temporaryPath, path, true);
            File.Delete(temporaryPath);
        }
        finally
        {
            bitmap.Dispose();
        }
    }

    public static void ReplaceWithSource(string sourcePath, string targetPath, int outputWidth, int outputHeight)
    {
        if (outputWidth <= 0 || outputHeight <= 0)
        {
            using (var targetTemplate = new Bitmap(targetPath))
            {
                outputWidth = targetTemplate.Width;
                outputHeight = targetTemplate.Height;
            }
        }

        using (var source = new Bitmap(sourcePath))
        using (var target = new Bitmap(outputWidth, outputHeight, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(target))
        {
            // The approved horizontal cloud carries more natural canvas padding
            // than a square mark. Windows adds a second taskbar inset, so native
            // frames use the available canvas without redrawing the artwork.
            var contentScale = outputWidth <= 64 ? 1.16 : 1.08;
            if (outputWidth >= 512) contentScale = 1.00;
            var renderWidth = (int)Math.Ceiling(outputWidth * contentScale);
            var renderHeight = (int)Math.Ceiling(outputHeight * contentScale);
            var offsetX = (outputWidth - renderWidth) / 2;
            var offsetY = (outputHeight - renderHeight) / 2;
            graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
            graphics.CompositingQuality = System.Drawing.Drawing2D.CompositingQuality.HighQuality;
            graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            graphics.DrawImage(source, offsetX, offsetY, renderWidth, renderHeight);

            var temporaryPath = targetPath + ".mergepilot-source-tmp";
            target.Save(temporaryPath, ImageFormat.Png);
            File.Copy(temporaryPath, targetPath, true);
            File.Delete(temporaryPath);
        }
    }

}
'@

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
$desktopRoot = Join-Path $repoRoot "apps\\desktop"
$approvedArtworkPath = Join-Path $desktopRoot "src\\assets\\mergepilot-icon-reference.png"
$masterSourcePath = Join-Path $desktopRoot "src\\assets\\mergepilot-icon-source.png"

if ($SourceImage) {
  if (-not (Test-Path -LiteralPath $SourceImage)) {
    throw "Source image does not exist: $SourceImage"
  }

  # Keep the supplied artwork byte-for-byte as the approved reference. The
  # reference includes a checkerboard presentation surface, so Windows cannot
  # consume it directly; it is intentionally separate from the transparent
  # master below. This prevents a later refresh from silently treating an
  # already-processed 16px/512px derivative as the new source of truth.
  [System.IO.File]::Copy($SourceImage, $approvedArtworkPath, $true)

  # Every runtime asset is rendered from a full-resolution transparent master,
  # never from a previously resized PNG. This preserves the supplied cloud
  # geometry while removing only the outer presentation surface.
  [System.IO.File]::Copy($approvedArtworkPath, $masterSourcePath, $true)
  [MergePilotIconSurface]::RemoveOuterSurface($masterSourcePath)
}

# Even when the caller supplied a new reference image, generate the platform
# variants from the transparent master, not from the opaque presentation copy.
# This makes reruns deterministic and prevents checkerboard pixels becoming
# anti-aliased edge colour in the 16–32px taskbar frames.
$runtimeSourcePath = if (Test-Path -LiteralPath $masterSourcePath) { $masterSourcePath } else { $SourceImage }

$iconPaths = @(
  "src\\assets\\mergepilot-icon.png",
  "src-tauri\\icons\\32x32.png",
  "src-tauri\\icons\\128x128.png",
  "src-tauri\\icons\\128x128@2x.png",
  "src-tauri\\icons\\icon.png",
  "src-tauri\\icons\\Square44x44Logo.png",
  "src-tauri\\icons\\Square89x89Logo.png",
  "src-tauri\\icons\\Square107x107Logo.png",
  "src-tauri\\icons\\Square142x142Logo.png",
  "src-tauri\\icons\\Square284x284Logo.png",
  "src-tauri\\icons\\Square310x310Logo.png",
  "src-tauri\\icons\\StoreLogo.png"
)

foreach ($relativePath in $iconPaths) {
  $path = Join-Path $desktopRoot $relativePath
  if ($runtimeSourcePath) {
    # The React shell renders this source at multiple Windows scale factors.
    # Keep a 512px web source rather than letting the title bar fall back to a
    # 256px raster while the native ICO selects its high-density payload.
    $sourceSize = if ($relativePath -eq "src\\assets\\mergepilot-icon.png") { 512 } else { 0 }
    [MergePilotIconSurface]::ReplaceWithSource($runtimeSourcePath, $path, $sourceSize, $sourceSize)
  }
  # The transparent master is the only geometry source. Do not widen or redraw
  # its blue contour at taskbar size: doing so changes the approved mark and
  # introduces blur in the smallest Windows frames. Only remove any outer
  # presentation pixels that remain connected to the canvas edge.
  [MergePilotIconSurface]::RemoveOuterSurface($path)
}

function Get-PngPayload([string] $sourcePath, [int] $size) {
  $source = [System.Drawing.Bitmap]::FromFile($sourcePath)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        # Windows selects an exact ICO payload before it scales.  Fill more of
        # the small native canvas so this wide cloud has the same optical weight
        # as the square icons beside it on the taskbar.
        $contentScale = if ($size -le 64) { 1.16 } else { 1.08 }
        $renderSize = [int][Math]::Ceiling($size * $contentScale)
        $offset = [int](($size - $renderSize) / 2)
        $graphics.DrawImage($source, $offset, $offset, $renderSize, $renderSize)
      } finally {
        $graphics.Dispose()
      }
      $stream = New-Object System.IO.MemoryStream
      try {
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        Write-Output -NoEnumerate $stream.ToArray()
      } finally {
        $stream.Dispose()
      }
    } finally {
      $bitmap.Dispose()
    }
  } finally {
    $source.Dispose()
  }
}

function Write-Ico([string] $targetPath, [byte[][]] $payloads, [int[]] $sizes) {
  $stream = [System.IO.File]::Open($targetPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  try {
    $writer = New-Object System.IO.BinaryWriter($stream)
    try {
      $writer.Write([UInt16]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]$payloads.Count)
      $offset = 6 + (16 * $payloads.Count)
      for ($index = 0; $index -lt $payloads.Count; $index++) {
        $dimension = if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] }
        $writer.Write([byte]$dimension)
        $writer.Write([byte]$dimension)
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]32)
        $writer.Write([UInt32]$payloads[$index].Length)
        $writer.Write([UInt32]$offset)
        $offset += $payloads[$index].Length
      }
      foreach ($payload in $payloads) { $writer.Write($payload) }
    } finally {
      $writer.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

# Windows chooses the closest payload for the taskbar at the active display
# scale. 40px and 96px are common 125% / high-DPI requests; without them the
# shell can enlarge a 32px or 64px frame and soften the approved cloud mark.
$icoSizes = [int[]](16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 96, 128, 256)
# Render every ICO payload from the retained full-resolution master, rather
# than from icon.png after it has already been resized. This is especially
# important for the small taskbar frames where a second resize softens the
# blue contour and makes the cloud appear blurry.
$iconSource = $masterSourcePath
[System.Collections.Generic.List[byte[]]]$icoPayloadList = [System.Collections.Generic.List[byte[]]]::new()
foreach ($icoSize in $icoSizes) {
  $icoPayloadList.Add((Get-PngPayload $iconSource $icoSize))
}
[byte[][]]$icoPayloads = $icoPayloadList.ToArray()
Write-Ico (Join-Path $desktopRoot "src-tauri\\icons\\icon.ico") $icoPayloads $icoSizes

Write-Host "Refreshed MergePilot cloud icon assets from the selected source image."
