param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$Version = "",
  [string[]]$Paths = @(),
  [switch]$AllowSelfSigned
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

$results = @()
$failures = @()

foreach ($path in $Paths) {
  if (-not (Test-Path -LiteralPath $path)) {
    $failures += "Signed artifact was not found: $path"
    $results += [pscustomobject]@{
      path = $path
      exists = $false
      status = "Missing"
    }
    continue
  }

  $item = Get-Item -LiteralPath $path
  $signature = Get-AuthenticodeSignature -FilePath $item.FullName
  $signerSubject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
  $status = [string]$signature.Status
  $isValid = $status -eq "Valid"
  $isSelfSignedAllowed = $AllowSelfSigned -and $status -eq "UnknownError" -and $null -ne $signature.SignerCertificate

  if (-not $isValid -and -not $isSelfSignedAllowed) {
    $failures += "Artifact is not Authenticode-signed with a trusted certificate: $($item.FullName) ($status)"
  }

  $results += [pscustomobject]@{
    path = $item.FullName
    exists = $true
    length = $item.Length
    productVersion = $item.VersionInfo.ProductVersion
    fileVersion = $item.VersionInfo.FileVersion
    status = $status
    statusMessage = $signature.StatusMessage
    signerSubject = $signerSubject
    thumbprint = if ($signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { $null }
  }
}

$result = [pscustomobject]@{
  ok = $failures.Count -eq 0
  version = $Version
  allowSelfSigned = [bool]$AllowSelfSigned
  artifacts = $results
  failures = $failures
}

$result | ConvertTo-Json -Depth 8
if ($failures.Count -gt 0) {
  exit 1
}
