$ErrorActionPreference = "Stop"

$subject = "CN=Total eBiz Solutions Pte Ltd Dev Code Signing"
$friendlyName = "Total eBiz Solutions Dev Code Signing"
$certStore = "Cert:\CurrentUser\My"
$rootStore = "Cert:\CurrentUser\Root"

$cert = Get-ChildItem $certStore |
  Where-Object { $_.Subject -eq $subject -and $_.NotAfter -gt (Get-Date) } |
  Sort-Object NotAfter -Descending |
  Select-Object -First 1

if (-not $cert) {
  $cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $subject `
    -FriendlyName $friendlyName `
    -CertStoreLocation $certStore `
    -KeyAlgorithm RSA `
    -KeyLength 3072 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddYears(3)
}

$rootExists = Get-ChildItem $rootStore |
  Where-Object { $_.Thumbprint -eq $cert.Thumbprint } |
  Select-Object -First 1

if (-not $rootExists) {
  $tmp = Join-Path $env:TEMP "tebs-dev-code-signing.cer"
  Export-Certificate -Cert $cert -FilePath $tmp | Out-Null
  certutil -user -addstore Root $tmp | Out-Null
  Remove-Item $tmp -Force
}

Write-Host "Dev code-signing certificate ready."
Write-Host "Subject: $($cert.Subject)"
Write-Host "Thumbprint: $($cert.Thumbprint)"
Write-Host ""
Write-Host "This certificate is trusted only on this Windows user profile. It is not a public Verified Publisher certificate."
