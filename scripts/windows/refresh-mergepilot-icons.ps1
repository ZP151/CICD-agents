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

    public static void RemoveOuterSurface(string path, bool strengthenBlueContour)
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

            if (strengthenBlueContour)
            {
                StrengthenBlueContour(bitmap);
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
            // The cloud needs enough visual mass at 16–32px to hold up in the
            // Windows title bar and taskbar. This only crops transparent outer
            // canvas; the original blue outline and white cloud interior stay
            // untouched.
            const double contentScale = 1.12;
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

    // Windows renders taskbar icons from 16–32px ICO payloads. At that size the
    // cloud's white interior blends into a light taskbar. Keep the supplied mark,
    // but make its blue pixels opaque/saturated and add one crisp cue into only
    // transparent neighbours. This prevents a second soft scaling pass from
    // turning the contour into a blurred pale line.
    public static void StrengthenBlueContour(Bitmap bitmap)
    {
        // The maximum is four additions per source pixel. Use primitive arrays
        // so this helper remains compatible with the script's explicit runtime
        // references in Windows PowerShell.
        var additionPositions = new int[bitmap.Width * bitmap.Height * 4];
        var additionColors = new int[additionPositions.Length];
        var additionCount = 0;
        var directions = new int[,] { { -1, 0 }, { 1, 0 }, { 0, -1 }, { 0, 1 } };

        for (var y = 0; y < bitmap.Height; y++)
        {
            for (var x = 0; x < bitmap.Width; x++)
            {
                var pixel = bitmap.GetPixel(x, y);
                var isBlueContour = pixel.A > 90 && pixel.B > pixel.R + 35 && pixel.B >= pixel.G - 8;
                if (!isBlueContour) continue;

                pixel = Color.FromArgb(
                    255,
                    Math.Max(0, (int)Math.Round(pixel.R * 0.88)),
                    Math.Max(0, (int)Math.Round(pixel.G * 0.91)),
                    Math.Min(255, (int)Math.Round(pixel.B * 1.02)));
                bitmap.SetPixel(x, y, pixel);

                for (var direction = 0; direction < 4; direction++)
                {
                    var nextX = x + directions[direction, 0];
                    var nextY = y + directions[direction, 1];
                    if (nextX < 0 || nextX >= bitmap.Width || nextY < 0 || nextY >= bitmap.Height) continue;

                    if (bitmap.GetPixel(nextX, nextY).A < 80)
                    {
                        additionPositions[additionCount] = nextY * bitmap.Width + nextX;
                        additionColors[additionCount] = Color.FromArgb(255, pixel.R, pixel.G, pixel.B).ToArgb();
                        additionCount++;
                    }
                }
            }
        }

        for (var addition = 0; addition < additionCount; addition++)
        {
            var x = additionPositions[addition] % bitmap.Width;
            var y = additionPositions[addition] / bitmap.Width;
            if (bitmap.GetPixel(x, y).A < 80)
            {
                bitmap.SetPixel(x, y, Color.FromArgb(additionColors[addition]));
            }
        }
    }

}
'@

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\\..")
$desktopRoot = Join-Path $repoRoot "apps\\desktop"

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
  if ($SourceImage) {
    if (-not (Test-Path -LiteralPath $SourceImage)) {
      throw "Source image does not exist: $SourceImage"
    }
    # The React shell renders this source at multiple Windows scale factors.
    # Keep a 512px web source rather than letting the title bar fall back to a
    # 256px raster while the native ICO selects its high-density payload.
    $sourceSize = if ($relativePath -eq "src\\assets\\mergepilot-icon.png") { 512 } else { 0 }
    [MergePilotIconSurface]::ReplaceWithSource($SourceImage, $path, $sourceSize, $sourceSize)
  }
  # Keep the high-resolution artwork unchanged. Only the smallest native PNG
  # gets a one-pixel contour reinforcement: Windows may select it directly for
  # the title bar or taskbar, where the otherwise soft blue edge is too easily
  # blurred by a second system scaling pass.
  $isSmallNativeIcon = $relativePath -eq "src-tauri\\icons\\32x32.png"
  [MergePilotIconSurface]::RemoveOuterSurface($path, $isSmallNativeIcon)
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
        $graphics.DrawImage($source, 0, 0, $size, $size)
      } finally {
        $graphics.Dispose()
      }
      # These are the payloads Windows selects for the taskbar. Reinforce only
      # the low-density contour after the final resize so the 128px/256px
      # artwork remains a faithful high-resolution copy of the tracked source.
      if ($size -le 48) {
        [MergePilotIconSurface]::StrengthenBlueContour($bitmap)
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

$icoSizes = [int[]](16, 20, 24, 32, 48, 64, 128, 256)
$iconSource = Join-Path $desktopRoot "src-tauri\\icons\\icon.png"
[System.Collections.Generic.List[byte[]]]$icoPayloadList = [System.Collections.Generic.List[byte[]]]::new()
foreach ($icoSize in $icoSizes) {
  $icoPayloadList.Add((Get-PngPayload $iconSource $icoSize))
}
[byte[][]]$icoPayloads = $icoPayloadList.ToArray()
Write-Ico (Join-Path $desktopRoot "src-tauri\\icons\\icon.ico") $icoPayloads $icoSizes

Write-Host "Refreshed MergePilot cloud icon assets from the selected source image."
