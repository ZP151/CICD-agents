# Windows Code Signing

## Goal

MergePilot Windows release artifacts must be Authenticode-signed before they are uploaded to GitHub Releases. Unsigned `*.exe` and `*.msi` assets produce Windows unknown-publisher prompts.

## Required Release Secrets

Configure these GitHub repository secrets before pushing a release tag:

| Secret | Purpose |
|---|---|
| `WINDOWS_CODESIGN_CERT_PFX_BASE64` | Base64-encoded public code-signing certificate PFX. |
| `WINDOWS_CODESIGN_CERT_PASSWORD` | Password for the PFX. |

The release workflow imports the PFX into the Windows runner's current-user certificate store, signs the Windows installer artifacts, and then verifies the signatures.

The same secrets are also checked by a readiness preflight before signing. The preflight loads the certificate from the configured PFX in memory only, validates that it has a private key and Code Signing EKU, checks artifact presence, and confirms `signtool.exe` and the timestamp server are available.

## Local Preparation

Use a publicly trusted OV or EV code-signing certificate for release builds. The development helper certificate created by `scripts/windows/create-dev-code-signing-cert.ps1` is only trusted on the local Windows profile and is not sufficient for public releases.

To create the base64 secret value from a PFX on Windows:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\codesign.pfx")) |
  Set-Content -NoNewline -Path .\codesign.pfx.base64.txt
```

Store the text output as `WINDOWS_CODESIGN_CERT_PFX_BASE64`, and store the PFX password as `WINDOWS_CODESIGN_CERT_PASSWORD`.

## CI Gate

The release workflow runs:

```powershell
.\scripts\windows\verify-windows-installer-metadata.ps1
.\scripts\windows\verify-windows-signing-readiness.ps1
.\scripts\windows\sign-windows-release-artifacts.ps1
.\scripts\windows\verify-windows-artifact-signatures.ps1
```

If installer metadata is inconsistent, signing secrets are missing, or any Windows installer remains unsigned, the Windows release job fails before assets are uploaded.

To check readiness locally without signing files:

```powershell
.\scripts\windows\verify-windows-signing-readiness.ps1
```

If the certificate is stored as a local PFX instead of GitHub secrets:

```powershell
.\scripts\windows\verify-windows-signing-readiness.ps1 `
  -PfxPath "C:\path\to\codesign.pfx" `
  -PfxPassword "<password>"
```

The readiness output intentionally does not print secret material.

When checking or signing artifacts outside the default local Tauri output
directory, pass the exact MSI and NSIS paths with `-Paths`:

```powershell
$artifacts = @(
  "C:\path\to\MergePilot_0.5.22_x64_en-US.msi",
  "C:\path\to\MergePilot_0.5.22_x64-setup.exe"
)

.\scripts\windows\verify-windows-signing-readiness.ps1 -Version 0.5.22 -Paths $artifacts
.\scripts\windows\sign-windows-release-artifacts.ps1 -Version 0.5.22 -Paths $artifacts
.\scripts\windows\verify-windows-artifact-signatures.ps1 -Version 0.5.22 -Paths $artifacts
```

Before running a real signing command, use the non-destructive smoke to verify
the signing command path-list boundary:

```powershell
.\scripts\windows\sign-windows-release-artifacts-smoke.ps1
```

This smoke passes deliberately missing artifact paths and must fail before
certificate import or signing, while reporting both supplied paths.

## Manual Verification

After downloading release assets:

```powershell
.\scripts\windows\verify-windows-artifact-signatures.ps1 `
  -Version 0.5.20 `
  -Paths @(
    "output\live-e2e\release-v0.5.20\MergePilot_0.5.20_x64-setup.exe",
    "output\live-e2e\release-v0.5.20\MergePilot_0.5.20_x64_en-US.msi"
  )
```

Expected release result: `ok: true` and every artifact has `status: Valid`.
