# Desktop GUI (Phase 4)

Tauri 2 shell + React + TanStack Query + Tailwind. Talks to the local
Dev Agent daemon at `http://127.0.0.1:8787` via HTTP + SSE; no business
logic is duplicated.

## Develop

```bash
pnpm install
pnpm --filter @cicd-agent/desktop dev
```

The Tauri dev shell will launch once you have the Rust toolchain
installed (`rustup`).

## Build installers (owner-driven)

```bash
pnpm --filter @cicd-agent/desktop tauri:build
```

Signing certificates and updater keys are NOT checked in; they are stored
in CI secrets and Key Vault. See the Phase 4 release runbook (TODO) for:

- Windows: Authenticode certificate referenced by `WINDOWS_SIGN_CERT` and
  `WINDOWS_SIGN_PASSWORD` repo secrets.
- macOS: Apple Developer ID + notarization credentials in
  `APPLE_API_KEY_*` secrets.
- Auto-updater: `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

The CI workflow at `.github/workflows/ci.yml` includes a Tauri matrix that
runs `tauri build` on Windows and macOS, but signing requires the owner to
add the secrets before the matrix produces shippable artifacts.
