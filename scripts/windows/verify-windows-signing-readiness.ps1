<#
.SYNOPSIS
Checks whether Windows Authenticode signing is ready before signing artifacts.

.DESCRIPTION
This preflight validates the local Windows artifacts, signtool availability,
timestamp server reachability, and the configured PFX certificate without
importing it into the certificate store or signing files.

The script intentionally avoids printing secret material. It reports certificate
metadata such as subject, thumbprint, validity dates, private-key presence, and
Code Signing EKU status only.
#>

param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$Version = "",
  [string[]]$Paths = @(),
  [string]$PfxBase64 = $env:WINDOWS_CODESIGN_CERT_PFX_BASE64,
  [string]$PfxPath = "",
  [string]$PfxPassword = $env:WINDOWS_CODESIGN_CERT_PASSWORD,
  [string]$TimestampUrl = "http://timestamp.digicert.com",
  [switch]$SkipTimestampProbe
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = (Get-Content -LiteralPath (Join-Path $Root "apps\desktop\package.json") -Raw | ConvertFrom-Json).version
}

if (-not $Paths -or $Paths.Count -eq 0) {
  $Paths = @(
    "apps\desktop\src-tauri\target\release\bundle\nsis\MergePilot_$($Version)_x64-setup.exe",
    "apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_$($Version)_x64_en-US.msi"
  ) | ForEach-Object { Join-Path $Root $_ }
} else {
  $Paths = @(
    $Paths | ForEach-Object {
      if ($_.Contains([System.IO.Path]::PathSeparator)) {
        $_ -split [regex]::Escape([string][System.IO.Path]::PathSeparator)
      } else {
        $_
      }
    } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )
}

function Get-SignToolPath {
  $signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1

  if (-not $signtool) {
    return $null
  }
  return $signtool.FullName
}

function Get-ArtifactSummary {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return [pscustomobject]@{
      path = $Path
      exists = $false
    }
  }

  $item = Get-Item -LiteralPath $Path
  return [pscustomobject]@{
    path = $item.FullName
    exists = $true
    length = $item.Length
    productVersion = $item.VersionInfo.ProductVersion
    fileVersion = $item.VersionInfo.FileVersion
    sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $item.FullName).Hash
  }
}

function Get-CodeSigningEkuState {
  param([System.Security.Cryptography.X509Certificates.X509Certificate2]$Certificate)

  $ekuExtension = $Certificate.Extensions |
    Where-Object { $_.Oid.Value -eq "2.5.29.37" } |
    Select-Object -First 1

  if (-not $ekuExtension) {
    return [pscustomobject]@{
      hasEnhancedKeyUsage = $false
      hasCodeSigningEku = $false
      usages = @()
    }
  }

  $eku = [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]$ekuExtension
  $usages = @($eku.EnhancedKeyUsages | ForEach-Object {
    [pscustomobject]@{
      oid = $_.Value
      friendlyName = $_.FriendlyName
    }
  })

  return [pscustomobject]@{
    hasEnhancedKeyUsage = $true
    hasCodeSigningEku = [bool]($usages | Where-Object { $_.oid -eq "1.3.6.1.5.5.7.3.3" } | Select-Object -First 1)
    usages = $usages
  }
}

function Resolve-PfxBytes {
  if (-not [string]::IsNullOrWhiteSpace($PfxPath)) {
    if (-not (Test-Path -LiteralPath $PfxPath)) {
      throw "PFX file was not found: $PfxPath"
    }
    return [System.IO.File]::ReadAllBytes((Resolve-Path $PfxPath).Path)
  }

  if ([string]::IsNullOrWhiteSpace($PfxBase64)) {
    throw "Windows code-signing certificate is not configured. Set WINDOWS_CODESIGN_CERT_PFX_BASE64 or pass -PfxPath."
  }

  return [Convert]::FromBase64String($PfxBase64)
}

function Get-PfxSummary {
  $bytes = Resolve-PfxBytes
  if ([string]::IsNullOrWhiteSpace($PfxPassword)) {
    throw "Windows code-signing certificate password is not configured. Set WINDOWS_CODESIGN_CERT_PASSWORD."
  }

  $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
    $bytes,
    $PfxPassword,
    [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
  )
  $eku = Get-CodeSigningEkuState -Certificate $cert
  $now = Get-Date

  return [pscustomobject]@{
    configured = $true
    source = if (-not [string]::IsNullOrWhiteSpace($PfxPath)) { "pfx_path" } else { "pfx_base64" }
    subject = $cert.Subject
    issuer = $cert.Issuer
    thumbprint = $cert.Thumbprint
    notBefore = $cert.NotBefore.ToString("o")
    notAfter = $cert.NotAfter.ToString("o")
    isTimeValid = $cert.NotBefore -le $now -and $cert.NotAfter -gt $now
    hasPrivateKey = $cert.HasPrivateKey
    hasCodeSigningEku = $eku.hasCodeSigningEku
    enhancedKeyUsage = $eku.usages
  }
}

function Test-TimestampServer {
  if ($SkipTimestampProbe) {
    return [pscustomobject]@{
      skipped = $true
      url = $TimestampUrl
    }
  }

  try {
    $uri = [System.Uri]::new($TimestampUrl)
    if ($uri.Scheme -ne "http" -and $uri.Scheme -ne "https") {
      throw "Timestamp URL must use http or https."
    }
    $port = if ($uri.Port -gt 0) {
      $uri.Port
    } elseif ($uri.Scheme -eq "https") {
      443
    } else {
      80
    }
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
      $async = $client.BeginConnect($uri.Host, $port, $null, $null)
      if (-not $async.AsyncWaitHandle.WaitOne([TimeSpan]::FromSeconds(15))) {
        throw "Timed out connecting to $($uri.Host):$port."
      }
      $client.EndConnect($async)
    } finally {
      $client.Dispose()
    }
    return [pscustomobject]@{
      skipped = $false
      url = $TimestampUrl
      ok = $true
      probe = "tcp_connect"
      host = $uri.Host
      port = $port
    }
  } catch {
    return [pscustomobject]@{
      skipped = $false
      url = $TimestampUrl
      ok = $false
      error = $_.Exception.Message
    }
  }
}

$failures = @()
$artifacts = @($Paths | ForEach-Object { Get-ArtifactSummary -Path $_ })
foreach ($artifact in $artifacts) {
  if (-not $artifact.exists) {
    $failures += "Windows release artifact was not found: $($artifact.path)"
  }
}

$signtool = Get-SignToolPath
if ([string]::IsNullOrWhiteSpace($signtool)) {
  $failures += "signtool.exe was not found. Install the Windows SDK with Visual Studio Build Tools."
}

$certificate = $null
try {
  $certificate = Get-PfxSummary
  if (-not $certificate.hasPrivateKey) {
    $failures += "The configured PFX does not contain a private key."
  }
  if (-not $certificate.isTimeValid) {
    $failures += "The configured code-signing certificate is not currently valid."
  }
  if (-not $certificate.hasCodeSigningEku) {
    $failures += "The configured certificate does not include the Code Signing enhanced key usage (1.3.6.1.5.5.7.3.3)."
  }
} catch {
  $failures += $_.Exception.Message
}

$timestamp = Test-TimestampServer
if (-not $timestamp.skipped -and -not $timestamp.ok) {
  $failures += "Timestamp server is not reachable: $TimestampUrl"
}

$result = [pscustomobject]@{
  ok = $failures.Count -eq 0
  version = $Version
  signtoolPath = $signtool
  artifacts = $artifacts
  certificate = $certificate
  timestamp = $timestamp
  failures = $failures
}

$result | ConvertTo-Json -Depth 10
if ($failures.Count -gt 0) {
  exit 1
}
