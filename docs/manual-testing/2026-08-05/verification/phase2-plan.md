# Phase 2 Plan — Cycle 01–06 high-level acceptance (2026-08-06)

Gate status as of HEAD `e3079fa` (phase-0/1):

| Tier | Status |
| --- | --- |
| unit (core/daemon/desktop + typechecks) | PASS (6/6, first run) — 3x repeats pending on final HEAD |
| real-ado (deterministic driver) | PASS on 68a673a (WI-7916) — rerun on final HEAD |
| mocked-browser-e2e (chat-layout 51, settings-permissions 1) | PASS — route-cache 34 in progress |
| source-live-e2e | NOT_RUN (needs daemon + Vite; run after mocked) |
| installed-desktop | NOT_RUN (rebuild MSI from HEAD required) |

## Phase 2: per-cycle desktop + ADO evidence

The reopen goal requires each cycle's exit evidence via the installed
desktop and local daemon (not daemon-API only). Sequence:

1. **Rebuild the installer from the final HEAD**:
   `pnpm --filter @mergepilot/desktop tauri:build` (icons + build-sidecar +
   tauri build), then `install-and-verify-msi-state.ps1` to install, then
   `run-installed-app-smoke.ps1 -ExpectedVersion <HEAD version>`.
2. **Cycle 01 fixtures via the installed desktop**: create fixture branch
   + WI in ClaimBot_API, drive Work Item → PR → CI → write-back through
   the desktop UI (Playwright against the installed app or a recorded
   session), capture SSE transcript + ADO re-reads. Record commit SHA,
   app version, model config, fixture IDs, start/end, exit codes.
3. **Cycle 02**: Changes workspace PR creation (Create PR view), review
   comment + vote on a fixture PR, your-turn badge — through the desktop.
4. **Cycle 03**: run Inspector on a failing fixture run (classification +
   evidence) and a rerun action — through the desktop.
5. **Cycle 04**: Work page drift + approved write-back on a fixture WI —
   through the desktop.
6. **Cycle 05**: non-production environment deploy/approval loop (needs a
   fixture YAML pipeline with an environment stage) — through the desktop.
7. **Cycle 06**: pilot task set (developer/reviewer/devops roles),
   diagnostics export, cleanup; record observations.

Every run appends to `goal-verification.json` gates (tier
installed-desktop / source-live-e2e) with the full metadata envelope.

## Secret-review slice (2026-08-07) — DONE

Branch `claudecode/optimize-bugfix` (start HEAD `d959169`). Added a safe,
read-only `read_text_file` tool (`packages/core/src/tools/gitReadTools.ts`):
repo-relative paths only (rejects absolute paths, `..` escapes, and
symlinks resolving outside the repo root), text files only (NUL-byte
check), explicit 1024 B–1 MiB size cap, server-side secret redaction before
the result leaves the daemon, classified low risk / read-only / no
approval (`capabilities.ts`). A `git_show` recovery hint steers the planner
to `read_text_file` when a file exists only in the working tree. The e2e
runner rebuilds `@mergepilot/core` before starting the source daemon (the
daemon imports the compiled `dist/` via package `main`).

Recorded in `evidence-matrix.md` (secret-review slice section): toolchain
exit codes/durations, live run 9 verdict (`2 passed (4.2m)`, exit 0, both
scenarios green — test 2 on the first turn, no re-prompt), and the
all-artifacts secret-leak scan (0 occurrences in daemon logs and passing
Playwright logs; the only matches are the test's own source assertions and
a git_diff of the test file, and `git_remote` persists redacted).

**Not done**: the whole source-live tier stays 24/30 — the 4 remaining
failures are the ClaimBot_API Pipeline #117 scenarios.

## Next goal: fix the 4 Pipeline #117 scenarios → 30/30 source-live cold-start

1. `discovers and saves ClaimBot_API pipeline #117 when the Project Link has
   no pipeline ID`
2. `inspects ClaimBot_API pipeline #117 failure evidence through normal Chat
   input`
3. `prepares ClaimBot_API pipeline #117 rerun approval from failure evidence
   suggestions`
4. `prepares ClaimBot_API pipeline #117 approval through the real Chat UI`

Run with `-LiveAdo` so the 4 live-ADO tests execute instead of skipping,
then verify a cold-start 30/30 source-live pass and record it in
`evidence-matrix.md`.
