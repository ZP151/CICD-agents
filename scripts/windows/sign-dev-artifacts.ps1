param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$Thumbprint
)

$ErrorActionPreference = "Stop"

if (-not $Thumbprint) {
  $cert = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object {
      $_.Subject -eq "CN=Total eBiz Solutions Pte Ltd Dev Code Signing" -and
      $_.NotAfter -gt (Get-Date)
    } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1

  if (-not $cert) {
    throw "No dev code-signing certificate found. Run scripts\windows\create-dev-code-signing-cert.ps1 first."
  }
  $Thumbprint = $cert.Thumbprint
}

$signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Recurse -Filter signtool.exe |
  Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
  Sort-Object FullName -Descending |
  Select-Object -First 1

if (-not $signtool) {
  throw "signtool.exe was not found. Install the Windows SDK with Visual Studio Build Tools."
}

$paths = @(
  "apps\desktop\src-tauri\target\release\cicd-agent-desktop.exe",
  "apps\desktop\src-tauri\target\release\bundle\nsis\CICD-Agent_0.3.0_x64-setup.exe",
  "apps\desktop\src-tauri\target\release\bundle\msi\CICD-Agent_0.3.0_x64_en-US.msi"
) | ForEach-Object { Join-Path $Root $_ } | Where-Object { Test-Path $_ }

if (-not $paths) {
  throw "No desktop build artifacts found. Run pnpm --filter @cicd-agent/desktop tauri:build first."
}

foreach ($path in $paths) {
  & $signtool.FullName sign /fd SHA256 /sha1 $Thumbprint /tr "http://timestamp.digicert.com" /td SHA256 $path
  if ($LASTEXITCODE -ne 0) {
    throw "signtool failed for $path"
  }
}

Write-Host "Signed $($paths.Count) artifact(s) with dev certificate $Thumbprint."
