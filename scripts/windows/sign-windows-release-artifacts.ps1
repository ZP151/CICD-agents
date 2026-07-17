param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$Version = "",
  [string[]]$Paths = @(),
  [string]$PfxBase64 = $env:WINDOWS_CODESIGN_CERT_PFX_BASE64,
  [string]$PfxPath = "",
  [string]$PfxPassword = $env:WINDOWS_CODESIGN_CERT_PASSWORD,
  [string]$TimestampUrl = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = (Get-Content -LiteralPath (Join-Path $Root "apps\desktop\package.json") -Raw | ConvertFrom-Json).version
}

function Get-SignToolPath {
  $signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1

  if (-not $signtool) {
    throw "signtool.exe was not found. Install the Windows SDK with Visual Studio Build Tools."
  }
  return $signtool.FullName
}

function Resolve-SigningCertificate {
  if ([string]::IsNullOrWhiteSpace($PfxPath) -and [string]::IsNullOrWhiteSpace($PfxBase64)) {
    throw "Windows code-signing certificate is not configured. Set WINDOWS_CODESIGN_CERT_PFX_BASE64 and WINDOWS_CODESIGN_CERT_PASSWORD."
  }
  if ([string]::IsNullOrWhiteSpace($PfxPassword)) {
    throw "Windows code-signing certificate password is not configured. Set WINDOWS_CODESIGN_CERT_PASSWORD."
  }

  $tempPfx = $null
  if ([string]::IsNullOrWhiteSpace($PfxPath)) {
    $tempPfx = Join-Path $env:TEMP ("mergepilot-codesign-" + [guid]::NewGuid().ToString("N") + ".pfx")
    [System.IO.File]::WriteAllBytes($tempPfx, [Convert]::FromBase64String($PfxBase64))
    $PfxPath = $tempPfx
  }

  try {
    if (-not (Test-Path -LiteralPath $PfxPath)) {
      throw "PFX file was not found: $PfxPath"
    }
    $securePassword = ConvertTo-SecureString -String $PfxPassword -AsPlainText -Force
    $cert = Import-PfxCertificate -FilePath $PfxPath -CertStoreLocation Cert:\CurrentUser\My -Password $securePassword
    if (-not $cert) {
      throw "PFX import did not return a certificate."
    }
    return $cert.Thumbprint
  } finally {
    if ($tempPfx -and (Test-Path -LiteralPath $tempPfx)) {
      Remove-Item -LiteralPath $tempPfx -Force -ErrorAction SilentlyContinue
    }
  }
}

if (-not $Paths -or $Paths.Count -eq 0) {
  $targets = @(
    "apps\desktop\src-tauri\target\release\bundle\nsis\MergePilot_$($Version)_x64-setup.exe",
    "apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_$($Version)_x64_en-US.msi"
  ) | ForEach-Object { Join-Path $Root $_ }
} else {
  $targets = @(
    $Paths | ForEach-Object {
      if ($_.Contains([System.IO.Path]::PathSeparator)) {
        $_ -split [regex]::Escape([string][System.IO.Path]::PathSeparator)
      } else {
        $_
      }
    } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  )
}

$missing = @($targets | Where-Object { -not (Test-Path -LiteralPath $_) })
if ($missing.Count -gt 0) {
  throw "Windows release artifact(s) were not found: $($missing -join ', ')"
}

$signtool = Get-SignToolPath
$thumbprint = Resolve-SigningCertificate
$signed = @()

foreach ($target in $targets) {
  & $signtool sign /fd SHA256 /sha1 $thumbprint /tr $TimestampUrl /td SHA256 $target
  if ($LASTEXITCODE -ne 0) {
    throw "signtool failed for $target"
  }
  $signed += $target
}

[pscustomobject]@{
  ok = $true
  version = $Version
  signedCount = $signed.Count
  signed = $signed
} | ConvertTo-Json -Depth 6
