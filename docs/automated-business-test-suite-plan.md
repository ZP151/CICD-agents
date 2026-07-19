# Automated Business Test Suite Plan

## Goal

Build an automated test suite for MergePilot that tracks the full business checklist in `docs/agent-business-test-checklist.md`.

The suite must verify the agent as a project maintenance product, not only as a collection of UI components:

- Project Link creation and context selection.
- Git inspection, write proposals, approvals, and recovery.
- Azure DevOps project/repository/PR/pipeline workflows.
- PR insight and review readiness.
- Pipeline failure diagnosis and rerun flow.
- AI-assisted repository understanding and change review.
- Source preview, image attachments, settings, permissions, and persistence.

End-to-end browser execution has now been run against the local app runtime. This document defines the automation suite, records the current automated baseline, and separates mocked app E2E from gated live/destructive tests.

## Recommended Suite

Use a layered suite built around the tools already present in the repository:

| Layer | Tool | Purpose | Why it fits MergePilot |
|---|---|---|---|
| L0 Static checks | TypeScript `tsc` | Prevent type and API contract drift. | Fast, already configured per package. |
| L1 Domain/unit tests | Vitest | Test planner guards, Git tools, ADO clients, pipeline parsers, auth helpers, UI reducers. | Existing repo has strong Vitest coverage and fast feedback. |
| L2 Daemon contract tests | Vitest + Fastify inject | Test `/chat`, `/chat/workflow-action`, Project Link, PR, pipeline, review routes without browser. | Best layer for workflow state, approvals, and API payload contracts. |
| L3 Mocked browser E2E | Playwright Test + route mocks | Test real Chat UI, execution transcript, composer, source preview, approval cards, Project Link UX. | Already installed and already has `tests/e2e/chat-layout.spec.ts`. |
| L4 Live integration probes | Vitest or Playwright gated by env vars | Verify real Azure DevOps, Azure Storage, Cosmos DB, and optional Key Vault access. | Needed because mocks cannot catch consent/RBAC/API-version issues. |
| L5 Packaged app acceptance | Playwright CLI/manual-assisted installed build smoke | Verify installed Tauri app, sidecar, paths, native packaging, and first-run behavior. | Required because packaging issues differ from Vite dev behavior. |

The selected primary E2E suite is **Playwright Test**. Cypress or Selenium would add new dependencies without solving this app's core needs better than Playwright. Tauri driver can be revisited later for native window integration, but the current app exposes the same frontend at Vite/runtime URLs, so Playwright Test is the right first automation spine.

## Can The Current Suite Cover The Full Business Checklist?

Short answer: **not yet**, but the current suite is the right foundation.

The current Vitest + Playwright stack can automate nearly all deterministic behavior in `docs/agent-business-test-checklist.md` after we add the missing fixtures and live gates. It does not need to be replaced by another primary automation suite.

| Checklist area | Can current stack automate it? | Notes |
|---|---|---|
| Onboarding, settings, model selection | Yes | Use Playwright for UI and Vitest for config parsing and runtime contracts. |
| Project Link lifecycle | Yes | Needs more Playwright coverage for no-link onboarding and ADO inference. |
| Chat workflow transcript and approvals | Yes | Already covered heavily; needs suite split and smoke tags. |
| Repository understanding | Mostly | Deterministic repo fixtures can test retrieval and source evidence; live model quality needs eval fixtures. |
| Git read/write/recovery | Yes | Use temp Git repos and local bare remotes. No new test runner needed. |
| Azure DevOps discovery | Yes | Mocked tests plus live gated ADO tests. |
| Real PR create/update/link/comment flows | Yes, with destructive live gates | Allowed when test resources are tagged and cleanup is mandatory. |
| Real pipeline trigger/rerun/inspect | Yes, with destructive live gates | Allowed when runs are test-scoped and recorded. |
| Review Queue and PR insight | Mostly | Mocked browser and daemon gates now pass for queue evidence, review-run persistence, dispositions, ADO write-back retry, and stale rerun refresh. Live PR readiness is covered by ClaimBot_API PR `#2655`; true cloud ReviewHistory persistence still needs Azure Table data-plane permission. |
| AI insight quality | Mostly | Core and daemon golden quality fixtures now pass, and live browser scorers cover secret/config review plus ClaimBot_API pipeline `#117` failure evidence. Broader subjective LLM quality scoring can still be expanded later if the Vitest-based gates become too limited. |
| Packaged installer behavior | Mostly | Packaged sidecar native runtime smoke, release desktop shell first-message API smoke, local MSI payload extraction smoke, packaged live vision smoke, stale-template package scans, installed package-state smoke, installed restart persistence, installed live vision, installed fresh-user first-run config smoke, and activated Computer Use native window/click proof now pass for `0.5.22`. Remaining gaps: the current Program Files desktop is still the NSIS install shape (`__TAURI_BUNDLE_TYPE_VAR_NSS` plus `uninstall.exe`), so strict MSI payload parity is separate; Windows assets remain unsigned until Authenticode secrets are configured; native screenshots must explicitly activate the window before being trusted as pixel evidence. Release workflow has Windows signing and signature verification gates that require `WINDOWS_CODESIGN_CERT_PFX_BASE64` and `WINDOWS_CODESIGN_CERT_PASSWORD`. |
| Permissions and cloud storage | Yes | Use live gated probes for Storage, Cosmos, Key Vault, and ADO consent/RBAC. |

## Additional Suite Decision

Do **not** introduce Cypress, Selenium, WebdriverIO, or a second browser automation suite now.

Recommended stack:

| Need | Tooling decision |
|---|---|
| Browser E2E | Keep Playwright Test. |
| CLI/browser exploration | Use local `playwright-cli` skill for ad hoc inspection, not as the long-term test runner. |
| API and daemon contracts | Keep Vitest + Fastify injection. |
| Git workflow realism | Add temp-repo fixtures inside Vitest/Playwright, not a new framework. |
| ADO live mutation | Add gated Vitest/Playwright live tests with cleanup hooks. |
| AI quality eval | Start with Vitest golden fixtures. Add a dedicated LLM eval harness only after we have stable golden datasets and scoring criteria. |
| Packaged native shell | Keep manual/package smoke initially; later add Tauri-driver only if native window automation becomes a release blocker. |

The only likely future addition is a **small eval harness** for AI quality, not a replacement automation suite. The first version should live inside Vitest so it can reuse project fixtures, prompts, and PR/pipeline artifacts.

## Suite Organization

### Proposed Test Directories

```text
tests/
  e2e/
    smoke/
      fresh-install-chat.spec.ts
      project-link-smoke.spec.ts
      git-workflow-smoke.spec.ts
    chat/
      transcript.spec.ts
      approvals.spec.ts
      composer-attachments.spec.ts
      source-preview.spec.ts
    project-links/
      no-link-onboarding.spec.ts
      ado-discovery.spec.ts
      branch-and-pipeline-fields.spec.ts
    git/
      read-only-inspection.spec.ts
      write-approval-flow.spec.ts
      conflict-recovery.spec.ts
    ado/
      pr-insight.mocked.spec.ts
      pr-update.mocked.spec.ts
      pipeline.mocked.spec.ts
    fixtures/
      runtimeMock.ts
      sseBuilders.ts
      testProjectLinks.ts
      gitRepoFactory.ts
      adoPayloads.ts
  live/
    azure-permissions.live.test.ts
    ado-discovery.live.test.ts
    pr-insight.live.test.ts
    pipeline.live.test.ts
    destructive-pr-flow.live.test.ts
    destructive-pipeline-flow.live.test.ts
  packaged/
    installed-app-smoke.md
```

### Test Tags

Use tags in test titles or `test.describe` names:

| Tag | Meaning |
|---|---|
| `@smoke` | Must pass before every release. |
| `@mocked` | Fully local deterministic browser/API tests. |
| `@live-ado` | Requires real Azure DevOps access. |
| `@live-azure` | Requires real Azure Storage/Cosmos/Key Vault permissions. |
| `@packaged` | Requires installed Tauri package. |
| `@destructive` | Can mutate Git, PRs, pipelines, or cloud state; must be opt-in. |
| `@cleanup-required` | Test creates real remote resources and must record cleanup status. |

## Execution Commands

Use the repository-local toolchain.

### Static And Focused Baseline

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck
```

### Domain And Contract Tests

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/chatPlannerGuards.test.ts test/chatPlannerApproval.test.ts test/gitOptions.test.ts test/adoClientDiscovery.test.ts test/adoPullRequestMutations.test.ts test/adoBuildPipelineInternal.test.ts test/validationTools.test.ts test/azureAuthCredential.test.ts

.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverProjectLinkRoutes.test.ts test/serverPrInsightWorkflowRoutes.test.ts test/serverPrWorkflowRoutes.test.ts test/pipelineWorkflow.test.ts test/workflowActions.test.ts test/chatSessionWorkflow.test.ts test/serverRecoveryWorkflowRoutes.test.ts

.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/components/conversation/ExecutionTimeline.test.tsx src/pages/chat/approval/PendingActionCard.test.tsx src/pages/chat/layout/ChatMessageList.test.tsx src/pages/chat/useComposerImageAttachments.test.ts src/pages/chat/artifacts/ArtifactWorkspace.test.tsx src/pages/chat/artifacts/sourcePreviewLanguage.test.ts src/api.test.ts
```

### Mocked Browser E2E

Discovery command:

```powershell
.\scripts\windows\pnpm-project.ps1 exec playwright test --list
```

App-level E2E execution:

```powershell
.\scripts\windows\pnpm-project.ps1 exec playwright test --grep "@smoke"
.\scripts\windows\pnpm-project.ps1 exec playwright test
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts
```

### Live Integration Gates

Do not run these by default. They require real permissions.

```powershell
$env:MERGEPILOT_E2E_LIVE_AZURE = "1"
$env:MERGEPILOT_E2E_LIVE_ADO = "1"
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/live/*.test.ts
```

For live browser tests against the source app, prefer the wrapper below instead
of manually setting `MERGEPILOT_E2E_LIVE_APP`. It starts and health-checks the
source daemon, rejects stale daemon versions by default, writes logs, and cleans
up the daemon it started.

```powershell
.\scripts\windows\run-live-app-e2e.ps1 -LiveAdo -Grep "inspects ClaimBot_API pipeline #117 failure evidence|prepares ClaimBot_API pipeline #117 rerun approval"
```

### Destructive Live Gates

These are allowed to modify real Azure DevOps and Azure resources, but they must be explicitly enabled and must clean up after themselves.

```powershell
$env:MERGEPILOT_E2E_LIVE_ADO = "1"
$env:MERGEPILOT_E2E_DESTRUCTIVE = "1"
$env:MERGEPILOT_E2E_RUN_ID = "mp-e2e-$(Get-Date -Format yyyyMMdd-HHmmss)"
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDestructive.test.ts
```

For destructive live-app browser tests, use the same source-app wrapper with
`-Destructive`, and keep the run scoped and recorded.

```powershell
.\scripts\windows\run-live-app-e2e.ps1 -LiveAdo -Destructive -Grep "rerun approval"
```

Destructive tests must write a run record to `docs/live-e2e-test-records.md`.

### Packaged Sidecar Acceptance

This does not touch Azure DevOps or Azure resources. It verifies the packaged sidecar executable produced for the desktop app.

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run build:sidecar
.\scripts\windows\packaged-sidecar-smoke.ps1 -Port 18887
```

Before a release package:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run tauri:build
.\scripts\windows\packaged-sidecar-smoke.ps1 -Port 18887
```

For a full local package acceptance gate against the MSI payload:

```powershell
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
.\scripts\windows\verify-active-doc-links.ps1
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop tauri:build
$msi = ".\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_${version}_x64_en-US.msi"
.\scripts\windows\verify-windows-installer-metadata.ps1 -Version $version -MsiPath $msi
.\scripts\windows\packaged-fresh-config-smoke.ps1 -MsiPath $msi -Port 19040
.\scripts\windows\packaged-msi-payload-smoke.ps1 -MsiPath $msi -Port 19041
.\scripts\windows\packaged-live-vision-smoke.ps1 -MsiPath $msi -Port 19042
.\scripts\windows\verify-windows-artifact-signatures.ps1 -Version $version
```

For a read-only release readiness summary that collects the current blockers
without installing, signing, tagging, pushing, or touching Azure DevOps, run:

```powershell
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$msi = ".\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_${version}_x64_en-US.msi"
.\scripts\windows\verify-current-release-readiness.ps1 -Version $version -MsiPath $msi
```

The readiness summary should be used before a release tag or manual admin
install handoff. It reports release workflow static status, strict workflow
script tracking, installer metadata, stale Chat template scan, Windows signing
readiness, Authenticode signature status, and current installed Program Files
parity in one JSON object.

When installed Program Files does not match the current MSI, the readiness JSON
includes `nextActions.installCurrentMsi`. Use its `recommendedElevatedCommand`
for the administrator install handoff with the full installed validation gate.
Use `quickElevatedCommand` only when intentionally skipping the installed vision
gate, and use `verifyAfterManualInstall` after a manual MSI install has already
completed.

When the release workflow references local scripts that are not yet tracked by
Git, the readiness JSON includes `nextActions.trackReleaseWorkflowScripts`.
Review its `scripts` list and use `suggestedStageCommand` only when the user
has explicitly asked to stage/commit release work.

When signing is not ready or Windows artifacts are unsigned, the readiness JSON
includes `nextActions.configureWindowsSigning`. It lists the required signing
inputs and the exact local commands for signing readiness, signing artifacts,
and verifying signatures. Do not run `signArtifactsCommand` until a trusted
certificate is configured and signing is intentionally requested. When a custom
MSI path is supplied, these handoff commands include quoted `-Paths` arguments
for that MSI and its sibling NSIS artifact.

When `-MsiPath` is supplied, the stale Chat template scan, signing readiness
preflight, and Authenticode signature verification use that MSI and its sibling
`nsis` artifact instead of falling back to the current local Tauri output. If
Windows Installer is slow or busy, use `-StaleScanExtractionTimeoutSec` to keep
the readiness command from blocking indefinitely.

When package runtime behavior is part of the readiness question, include the
packaged fresh-config and MSI payload smokes:

```powershell
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$msi = ".\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_${version}_x64_en-US.msi"
.\scripts\windows\verify-current-release-readiness.ps1 `
  -Version $version `
  -MsiPath $msi `
  -IncludePackageSmokes `
  -FreshConfigPort 19121 `
  -MsiPayloadPort 19122
```

To self-test that readiness output stays machine-readable even when blockers
remain or the MSI path is missing:

```powershell
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$msi = ".\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_${version}_x64_en-US.msi"
.\scripts\windows\verify-current-release-readiness-smoke.ps1 `
  -Version $version `
  -MsiPath $msi `
  -FreshConfigPort 19131 `
  -MsiPayloadPort 19132 `
  -StaleScanExtractionTimeoutSec 120
```

For a faster handoff/JSON regression pass that skips packaged runtime checks:

```powershell
.\scripts\windows\verify-current-release-readiness-smoke.ps1 `
  -Version $version `
  -MsiPath $msi `
  -SkipPackageSmokes `
  -StaleScanExtractionTimeoutSec 120
```

The smoke accepts custom package ports so repeated local validation can avoid
ports currently used by another package smoke. It also asserts that the
readiness signing preflight and signature check follow the supplied MSI and
sibling NSIS artifact paths. It also checks that the signing handoff commands
carry those same artifact paths, which prevents a supplied artifact from being
accidentally mixed with a local Tauri output directory.

To self-test the lower-level signature verifier path handling directly:

```powershell
.\scripts\windows\verify-windows-artifact-signatures-smoke.ps1
```

This smoke protects the `powershell.exe -File` invocation path used by wrapper
scripts. It passes MSI and NSIS paths as a path-list string and asserts that
both artifacts are present in the verifier output and failures.

To self-test the signing command handoff without mutating release artifacts:

```powershell
.\scripts\windows\sign-windows-release-artifacts-smoke.ps1
```

This smoke passes deliberately missing MSI and NSIS paths to
`sign-windows-release-artifacts.ps1 -Paths`. It should fail before importing a
certificate or signing files, and the failure must report both supplied paths.

To catch syntax regressions across the Windows helper script surface, run:

```powershell
.\scripts\windows\verify-windows-scripts-parse.ps1
```

For downloaded or historical artifacts, pass the artifact's expected version explicitly:

```powershell
.\scripts\windows\verify-windows-installer-metadata.ps1 `
  -ExpectedVersion 0.5.21 `
  -MsiPath .\output\gh-run-29436222385-artifacts\msi\MergePilot_0.5.21_x64_en-US.msi
```

When `-MsiPath` points outside the active Tauri build output, the verifier checks the MSI and sibling NSIS artifact and skips local desktop executable validation unless `-DesktopExePath` is supplied.

For a repeatable verifier self-check that covers active-build metadata,
historical-artifact metadata, and negative mismatch paths:

```powershell
$historicalDesktop = Get-ChildItem .\output\gh-run-29436222385-artifacts\msi-extracted -Recurse -Filter mergepilot-desktop.exe | Select-Object -First 1
.\scripts\windows\verify-windows-installer-metadata-smoke.ps1 `
  -Version 0.5.22 `
  -MsiPath .\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.22_x64_en-US.msi `
  -HistoricalVersion 0.5.21 `
  -HistoricalMsiPath .\output\gh-run-29436222385-artifacts\msi\MergePilot_0.5.21_x64_en-US.msi `
  -HistoricalDesktopExePath $historicalDesktop.FullName
```

The smoke creates a temporary Git repository with a TypeScript source file, starts `apps\desktop\src-tauri\binaries\mergepilot-daemon-x86_64-pc-windows-msvc.exe`, and verifies:

- `/healthz` responds.
- `/chat/index-refresh` indexes at least one source file.
- `/chat/index-status` reports indexed chunks.
- `/chat/workflow-action` can inspect the Git environment.
- `/chat` returns HTTP 200.
- Known packaged-runtime failure markers such as `better_sqlite3`, `bindings file`, `schema.sql`, `Could not locate`, and `Expected object` are absent.
- Fresh packaged runtime creates user-local `config.toml` and `.env`, defaults secrets to `local_env`, and does not attempt Azure Key Vault unless the user explicitly enables it.

For image attachment and streaming regressions, run the packaged live vision gate:

```powershell
.\scripts\windows\packaged-live-vision-smoke.ps1 -Port 18940
.\scripts\windows\packaged-live-vision-smoke.ps1 -Port 18941 -MsiPath .\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.13_x64_en-US.msi
```

This starts the packaged daemon, sends a deterministic PNG fixture to `/chat`, and requires all of the following: text recognition, shape recognition, no visible control JSON leakage, no duplicate final sentence, and successful temporary session cleanup.

After an MSI is ready for real installation, use the elevated installed-app parity gate. Prefer this script over double-clicking the MSI because it closes running MergePilot processes before installation, installs the expected MSI, and then verifies Program Files parity in one pass:

```powershell
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$msi = ".\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_${version}_x64_en-US.msi"
.\scripts\windows\install-and-verify-msi-state.ps1 -ExpectedVersion $version -MsiPath $msi
```

If the MSI was already installed manually from an elevated UI, run:

```powershell
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$msi = ".\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_${version}_x64_en-US.msi"
.\scripts\windows\install-and-verify-msi-state.ps1 -ExpectedVersion $version -MsiPath $msi -SkipInstall
```

When this script is run without administrator rights, it returns structured preflight JSON with the current MergePilot uninstall entries, running MergePilot processes, the expected MSI path, MSI SHA-256, current installed versions, `installIsCurrent`, and the exact recommended elevated command. The recommended command uses absolute paths and starts with `Set-Location`, so it can be pasted into a new elevated PowerShell without relying on the current working directory. The script installs or verifies the version-bumped MSI, probes installed daemon health/auth/avatar, requires strict installed-vs-MSI hash parity, and runs the installed Program Files daemon through the live vision stream gate.

To make that non-admin handoff repeatable before asking for an elevated install, run the preflight smoke from a normal PowerShell session:

```powershell
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$msi = ".\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_${version}_x64_en-US.msi"
.\scripts\windows\install-and-verify-msi-state-preflight-smoke.ps1 -ExpectedVersion $version -MsiPath $msi
```

This smoke must pass before a manual admin installation is considered ready. It verifies the expected non-admin exit code, parseable JSON, `requiresElevation`, MSI identity from the Windows Installer Property table, and the exact elevated command that should be pasted into the administrator PowerShell.

For installed restart persistence, the smoke can be run directly. It will start
the installed daemon on the requested port if needed, restart that daemon during
the test, and stop the daemon afterward when it was started by the script. If
the requested port is owned by a non-MergePilot process, it must fail without
stopping that process.

```powershell
.\scripts\windows\run-installed-app-smoke.ps1 -ExpectedVersion 0.5.22 -ExpectedDesktopBundleKind nsis
.\scripts\windows\installed-fresh-user-smoke.ps1 -ExpectedVersion 0.5.22 -Port 8802
.\scripts\windows\installed-restart-persistence-smoke.ps1 -ExpectedVersion 0.5.22 -Port 8796
.\scripts\windows\installed-restart-persistence-safety-smoke.ps1 -ExpectedVersion 0.5.22 -Port 8797
```

## Current Automation Inventory

Collected on 2026-07-05.

| Area | Current automated coverage | Assessment |
|---|---|---|
| Total non-third-party test files | 166 | Good base coverage. |
| Desktop test files | 67 | Strong UI reducer/component/API coverage. |
| Daemon test files | 43 | Good workflow and API contract coverage. |
| Core test files | 43 | Good tool/planner/ADO/client coverage. |
| Review agent test files | 10 | Useful but separate from desktop agent flow. |
| Playwright E2E files | 4 | Chat layout coverage, Review Queue coverage, a focused Settings permission regression, plus a gated live-app business workflow spec. |
| Playwright E2E cases | 75+ | Strong Chat UI mock coverage, focused Review Queue and Settings regressions, plus thirty live-app temp Git/ADO regressions gated by `MERGEPILOT_E2E_LIVE_APP=1`. Latest live coverage includes interrupted pending-approval reload/restore, draft commit message safety, secret-like diff redaction during read-only review, behind-branch pull/rebase, pull/rebase conflict recovery, dirty branch-switch approval, fast-forward target merge approval, merge conflict recovery, create-and-switch branch approval, staged-change summary, commit validation failure, credential-redacted remote target inspection, stash push/apply/pop, visible stash-pop conflict recovery, restore/revert, local release tags, safe single-tag publication, missing-pipeline discovery-to-save, ClaimBot_API pipeline `#117` failure inspection, and pipeline approval preparation. |

Broad keyword coverage found in existing tests:

| Area | Matching test files | Notes |
|---|---|---|
| Git / branch / commit / push / diff / status | 118 | Broad coverage, but needs real temp-repo E2E workflow grouping. |
| ADO / PR / policy / work item | 70 | Good mocked/unit coverage; live integration still gated by permissions. |
| Pipeline / build / CI | 71 | Good parser/workflow coverage; needs live failed-run fixture. |
| Chat / workflow / approval / stream / composer | 93 | Strongest area. |
| Project Link / profile | 41 | Good API coverage; needs no-link onboarding E2E. |
| Settings / auth / cloud | 40 | Key Vault permission failure and local `.env` fallback now have focused browser E2E coverage; live Azure data-plane probes still depend on RBAC. |

## Baseline Test Run Record

Collected on 2026-07-05 with the local app runtime started:

- Frontend: `http://127.0.0.1:1420`
- Daemon health: `http://127.0.0.1:8787/healthz`
- Runtime version: `0.5.10`
- LLM provider: Azure OpenAI
- Chat deployment: `gpt-4o`

| Command | Result | Notes |
|---|---|---|
| `@mergepilot/core typecheck` | Pass | TypeScript passed. |
| `@mergepilot/daemon typecheck` | Pass | TypeScript passed. |
| `@mergepilot/desktop typecheck` | Pass | TypeScript passed. |
| Core focused tests | Pass | 8 files, 41 tests passed. |
| Desktop focused tests | Pass | 7 files, 35 tests passed. |
| `@mergepilot/desktop test -- src/pages/chat/workspaceActions.test.ts` | Pass | 1 file, 3 tests passed. |
| `@mergepilot/daemon test -- test/serverPrInsightWorkflowRoutes.test.ts` | Pass | 1 file, 2 tests passed after adding a normal `/chat` SSE regression for explicit read-only PR insight routing. |
| Playwright test discovery | Pass | Current targeted default browser verification at 2026-07-16 10:40 +08:00 passed `@smoke @mocked` 30/30. The broader mocked/default browser suite previously discovered `chat-layout`, `review-queue`, `settings-permissions`, and live-app specs, with live-app cases skipped unless `MERGEPILOT_E2E_LIVE_APP=1` is set. Record: `docs/live-e2e-test-records.md#run-mp-ado-route-cache-smoke-rerun-20260716-1040`. |
| `playwright test tests/e2e/chat-layout.spec.ts` | Pass | Historical full Chat layout run passed 42 app-level browser tests against the running local frontend and mocked daemon routes before later focused coverage was added. |
| `playwright test tests/e2e/settings-permissions.spec.ts --project=chromium` | Pass | 1 focused browser test verifies Key Vault `secrets/get` permission messaging, switching built-in model secrets to local `.env`, clearing cloud warnings in local mode, and surfacing the latest Key Vault `secrets/set` failure after switching back. |
| `@mergepilot/daemon test -- test/serverProjectLinkRoutes.test.ts` | Pass | 8 tests passed, including local fallback for missing Azure Table consent and local-env secret mode. |
| `@mergepilot/core test -- test/liveAzurePermissions.test.ts` | Pass | Default gate skips without `MERGEPILOT_E2E_LIVE_AZURE=1`; live gate passes as a diagnostic and reports Storage Table, Cosmos SQL, and Key Vault readiness separately. |
| Live Azure/ADO read-only probes | Partial | Automated live Azure permission and ADO discovery probes now exist. Latest live ADO read-only gate on 2026-07-06 22:24-22:25 +08:00 passed for ADO discovery, pipeline read-only, and daemon PR insight against `TeBS-ClaimBot` / `ClaimBot_API` / pipeline `#117`; destructive queue remained skipped by design and no business temp directories remained. Latest live Azure permission rerun on 2026-07-06 22:24-22:25 +08:00 still shows partial access: Storage Table entity query, Cosmos SQL data-plane role assignments, and Key Vault secret metadata/list permissions remain missing. |
| Runtime `/project-links` read | Pass with local fallback | With cloud Table consent missing, daemon now returns local Project Links instead of HTTP 500. |
| Playwright CLI app smoke | Pass | Opened `http://127.0.0.1:1420/#/chat`, verified signed-in identity, Project Link selection, right Environment panel, model selector, image attachment menu, and a read-only `What's on this branch?` workflow. |
| Packaged sidecar smoke | Pass | After `@mergepilot/desktop tauri:build`, `.\scripts\windows\packaged-sidecar-smoke.ps1 -Port 18892` returned `ok: true`, `refreshFilesSeen: 1`, `refreshFilesIndexed: 1`, `chunksIndexed: 2`, and `chatStatus: 200`. This fixed and guards the packaged `better_sqlite3.node` native binding regression. |
| Release desktop shell smoke | Pass | Launched `apps\desktop\src-tauri\target\release\mergepilot-desktop.exe`, verified the bundled sidecar owned `127.0.0.1:8787`, then posted index, workflow, and first-message `/chat` requests against a temporary Git repo. `/chat` auto-created a session, returned HTTP 200, and emitted no error events or native-binding markers. |
| MSI installer payload smoke | Pass with installation caveat | Rebuilt MSI was administratively extracted to a temporary directory. Launching the extracted `PFiles\MergePilot\mergepilot-desktop.exe` started the bundled sidecar, read user config, indexed a temp repo, accepted `/chat/workflow-action`, and completed first-message `/chat` without native-binding or session errors. NSIS silent install could not run without elevation. |
| Runtime `/chat/workflow-action` read-only workflow | Pass | Triggered from the live UI; endpoint returned 200 and the transcript summarized branch `developZP`, 6 commands, and changed file `bot_backup2.py`. |
| Live app runtime smoke with browser | Pass for current gated non-destructive suite | Latest gated browser run on 2026-07-16 04:14-04:23 +08:00 passed 30/30 live-app business tests against the running app stack after the ADO auth recovery fix. The first attempt exposed missing-pipeline setup returning raw `/chat/workflow-action HTTP 401`; the workflow now handles missing pipeline configuration before normal ADO auth and can fall back to Azure CLI credentials for live ADO reads. Coverage includes selected-file staging, pending approval reload/restore, approval denial, approval feedback replanning, stage+commit, draft commit message safety, secret-like diff redaction during read-only review, commit validation failure with staged-change preservation, empty commit guard, staged-only commit scope, dirty branch switching, fast-forward target merge approval, merge conflict recovery, create-and-switch branch approval, local bare remote push, pull/rebase from a behind branch, rebase conflict recovery, remote target credential redaction, stash dirty work, apply latest stash without dropping it, pop latest stash and drop it after success, visible stash-pop conflict recovery with stash preservation, restore selected file, revert last commit, local release tag creation, safe single-tag publication, ClaimBot_API pipeline `#117` discovery-to-save, and ClaimBot_API pipeline `#117` read-only/approval preparation. Destructive ADO mutation was not executed. Record: `docs/live-e2e-test-records.md#run-mp-live-app-business-full-ado-recovery-20260716-0423`. |
| Release smoke app business batch | Partial | Ran live browser cases for SMOKE-01, SMOKE-03, SMOKE-09, and SMOKE-10. SMOKE-03 passed; SMOKE-01, SMOKE-09, and SMOKE-10 exposed product behavior gaps. Detailed record: `docs/business-test-execution-report.md`. |
| Structured action app business batch | Partial | `Analyze PR insight for this repo` succeeded through `/chat/workflow-action`. `Open Pipelines workspace` previously failed when Project Link pipeline ID was missing; after the pipeline field persistence fix and transcript candidate-save update, the configured Project Link UI path passes and missing-pipeline setup can persist a discovered candidate without opening the Project Link editor. Detailed record: `docs/business-test-execution-report.md`. |
| Project Link lifecycle smoke | Pass for pipeline persistence | Temporary Project Link create/read/update/delete worked and cleanup succeeded. Retest confirmed `adoPipelineId` and `adoPipelineName` are preserved on create/read/update. Detailed record: `docs/business-test-execution-report.md`. |
| Isolated Git write approval smoke | Pass | Temporary repo stage flow required approval, staged `feature.txt` after approval, did not commit after follow-up denial, and cleaned up all temp state. Detailed record: `docs/business-test-execution-report.md`. |
| Isolated Git stage-and-commit completion smoke | Fixed and retested | Initial run showed the Chat UI staged the temp file after `git add -A` approval, but the follow-up commit approval was ignored because the UI remained busy. Dispatcher fix released busy state on follow-up approval; retest created one new commit and left the temp repo clean. Detailed record: `docs/business-test-execution-report.md`. |
| Isolated Git push approval smoke | Pass | Created a temp working repo with a local bare `origin`, made the branch `ahead 1`, prompted the real Chat UI to push, approved `git push -u origin master`, and verified the bare remote moved to local HEAD. Cleanup succeeded. Detailed record: `docs/business-test-execution-report.md`. |
| Isolated Git selected-file staging smoke | Pass | Created a temp repo with `README.md` and `notes.txt` modified, prompted the real Chat UI to stage only `README.md`, approved `git add -- README.md`, and verified only `README.md` was staged while `notes.txt` stayed unstaged. Cleanup succeeded. Detailed record: `docs/business-test-execution-report.md`. |
| `@mergepilot/core test -- test/liveAdoDestructive.test.ts` default gate | Pass | Test is skipped unless both `MERGEPILOT_E2E_LIVE_ADO=1` and `MERGEPILOT_E2E_DESTRUCTIVE=1` are set. |
| `@mergepilot/core test -- test/liveAdoDestructive.test.ts` destructive ADO smoke | Pass | Created isolated ADO branches, pushed tagged test commits, created draft PRs, updated PR metadata, added/removed PR labels and reviewers, created/linked/unlinked/deleted temporary work items, abandoned the PRs, and deleted source branches. Latest run `mp-e2e-20260706-071800` created PR `2742` and work item `7910`, wrote artifact `output/live-e2e/mp-e2e-20260706-071800-ado-destructive-pr.json`, and independent cleanup verification confirmed PR `2742` is abandoned, branch ref count is `0`, and work item `7910` returns `TF401232`. |
| `@mergepilot/core test -- test/liveAdoPipeline.test.ts` default gate | Pass | All 3 live pipeline tests are skipped by default. |
| `@mergepilot/core test -- test/liveAdoDiscovery.test.ts` default gate | Pass | Live ADO discovery is skipped unless `MERGEPILOT_E2E_LIVE_ADO=1` is set. |
| `@mergepilot/core test -- test/liveAdoDiscovery.test.ts` live discovery | Pass | With `MERGEPILOT_E2E_LIVE_ADO=1`, the current account discovers Azure DevOps project `TeBS-ClaimBot`, repository `ClaimBot_API`, and repository-filtered pipeline `#117 ClaimBot_API`. |
| `@mergepilot/core test -- test/liveAdoPipeline.test.ts` live inspect | Pass | With `MERGEPILOT_E2E_LIVE_ADO=1`, ClaimBot_API pipeline #117 recent runs and latest failed-run timeline/log evidence pass; destructive queue remains skipped unless explicitly enabled. Latest retest passed 2 read-only checks against #117. |
| `@mergepilot/core test -- test/liveAdoPipeline.test.ts` destructive queue smoke | Pass | Historical smoke queued pipeline #108 run `4664`, read it back, and confirmed build record source branch `production-pipelines`. That record belongs to a different repository pipeline. Current ClaimBot_API destructive pipeline tests must use pipeline #117 and record run IDs. |
| `@mergepilot/daemon test -- test/liveAdoPrInsight.test.ts` default gate | Pass | Live PR insight test is skipped by default. |
| `@mergepilot/daemon test -- test/liveAdoPrInsight.test.ts` live inspect | Pass | With `MERGEPILOT_E2E_LIVE_ADO=1`, ClaimBot_API PR #2655 returns PR insight through `/chat/workflow-action`, completes the six read tools, has no pending approval, and reports changed files. The test now removes its run-scoped `RUNTIME_DATA_DIR` in `afterAll`; latest cleanup check reported zero `mergepilot-daemon-live-pr-insight-*` temp directories. |
| Runtime `/chat` natural-language PR insight | Pass | `Analyze PR 2655...Read-only` routes directly to native PR insight, emits no approval events, does not misread PR ID as build ID, and completes PR detail/change tools. |
| Runtime `/chat` natural-language pipeline inspection | Pass | `Inspect pipeline 117...Read-only` routes to ClaimBot_API pipeline #117, emits no approval events, completes run/timeline/log tools, and surfaces the `.DS_Store` failure evidence. |
| Focused browser natural-language read-only routing | Pass | `playwright test tests/e2e/chat-layout.spec.ts --grep "natural-language read-only"` passed 2 browser tests covering PR #2655 and pipeline #117 transcript rendering without approval cards. |
| Focused browser mocked PR insight E2E | Pass | `playwright test tests/e2e/chat-layout.spec.ts --grep "routes PR insight controls"` verifies structured PR insight action routing, and `--grep "loads a saved PR insight artifact source"` verifies PR metadata, build blockers, policy blockers, active threads, and linked work items render together in the artifact workspace. |
| Focused browser mocked pipeline failure E2E | Pass | `playwright test tests/e2e/chat-layout.spec.ts --grep "routes pipeline controls"` verifies a failed pipeline summary with root-cause hypothesis, a visible failure artifact, and a rerun/trigger action that opens an approval card for `ado_trigger_pipeline`. |
| Runtime `/chat` natural-language local Git read-only routing | Pass | `What's on this branch?...Do not fetch` routes to `refresh_branch` without approval or `git_fetch`; `Review my changes...Do not stage, commit, push, or fetch` routes to `inspect_changes` without approval or write tools. |
| `@mergepilot/daemon test -- test/serverReadOnlyGitChatRoutes.test.ts` | Pass | 2 temp-repo tests verify local branch/change read-only prompts do not fetch, stage, commit, or request approval. |
| Focused browser local Git read-only routing | Pass | `playwright test tests/e2e/chat-layout.spec.ts --grep "local Git"` passed 2 browser tests covering current-branch and review-changes transcript rendering without approval, fetch, stage, or commit UI. |
| Focused browser History sanitization | Pass | `playwright test tests/e2e/chat-layout.spec.ts --grep "sanitized chat history titles"` passed 1 browser test covering visible History titles after approved actions. |
| Gated live app selected-file staging | Pass | `MERGEPILOT_E2E_LIVE_APP=1 playwright test tests/e2e/live-app-business.spec.ts --project=chromium` passed against the running frontend and daemon. It created a temp repo and Project Link, approved `git add -- README.md`, verified `notes.txt` remained unstaged, and cleaned up. |
| Gated live app rejected approval | Pass | `MERGEPILOT_E2E_LIVE_APP=1 playwright test tests/e2e/live-app-business.spec.ts --project=chromium` passed against the running frontend and daemon. It created a temp repo and Project Link, rejected a `git add` approval, verified no staged files, verified the changes remained unstaged, and cleaned up. |
| Gated live app approval-feedback revision | Pass | `MERGEPILOT_E2E_LIVE_APP=1 playwright test tests/e2e/live-app-business.spec.ts --project=chromium` passed against the running frontend and daemon. It rejected a stale `git add -- README.md` approval with feedback to stage `notes.txt` instead, verified the stale action did not execute, approved the revised action, verified only `notes.txt` was staged, and cleaned up. |
| Gated live app stage-and-commit | Pass | `MERGEPILOT_E2E_LIVE_APP=1 playwright test tests/e2e/live-app-business.spec.ts --project=chromium` passed against the running frontend and daemon. It created a temp repo and Project Link, approved stage, approved commit, verified one new commit with the requested subject, verified clean status, and cleaned up. |
| Gated live app push to local bare remote | Pass | `MERGEPILOT_E2E_LIVE_APP=1 playwright test tests/e2e/live-app-business.spec.ts --project=chromium` passed against the running frontend and daemon. It created a temp working repo and bare origin, verified the active Project Link remained selected in Composer and pinned summary, used `Commit or push -> Push branch`, approved push, verified the bare remote feature branch moved to local HEAD, verified synchronized branch status, and cleaned up. |
| Gated live app remote target credential redaction | Pass | `MERGEPILOT_E2E_LIVE_APP=1 playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "remote push target"` passed against the running frontend and daemon. It created a temp repo whose `origin` URL contained `https://mergepilot:supersecrettoken@...`, asked Chat where the push would go, verified the workflow stayed read-only, and confirmed the visible transcript did not expose the token. |
| Gated live app pull/rebase from behind branch | Pass | `MERGEPILOT_E2E_LIVE_APP=1 playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "pulls a behind branch"` passed against the running frontend and daemon. It created a local repo behind `origin/main`, showed `Behind remote by 1`, prepared an approval with the concrete command `git pull --rebase origin main`, approved it, verified `HEAD` moved to the remote commit, and cleaned up. |
| Current live app Git/pipeline workflow retest | Pass | 2026-07-16 04:14-04:23 +08:00: running app stack completed `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` with 30/30 real UI workflows passing after the ADO auth recovery fix. Coverage includes temp-repo selected staging, pending approval reload/restore with no premature Git write, denial, denial feedback replanning, stage+commit, draft commit message safety, secret-like diff redaction during read-only review, commit validation failure with staged-change preservation, empty commit guard, staged-only commit scope, dirty branch switching, fast-forward target merge approval, merge conflict recovery, create-and-switch branch approval, local bare remote push, pull/rebase from a behind branch with `git pull --rebase origin main`, rebase conflict recovery, remote target credential redaction, stash dirty work, apply/latest/pop stash flows, visible stash-pop conflict recovery with stash preservation, restore selected file, revert last commit, local release tag creation, safe single-tag publication, ClaimBot_API pipeline `#117` discovery-to-save, and ClaimBot_API pipeline `#117` read-only/approval preparation. Destructive pipeline queue was not enabled and cleanup left no `%TEMP%\mergepilot-live-*` directories. Record: `docs/live-e2e-test-records.md#run-mp-live-app-business-full-ado-recovery-20260716-0423`. |
| ClaimBot_API pipeline source-fix remote validation | Pass | The external ClaimBot_API `.csproj` fix was committed as `18c62b7 fix pipeline content includes`, pushed to `origin/main`, and validated by ClaimBot_API pipeline #117. Latest baseline run `4674 / 20260705.8` succeeded on `main` with repository `ClaimBot_API`; current tests use the pipeline mapped to the active repository. |
| ClaimBot_API pipeline target recheck | Pass with cleanup | Verified the running Project Link is mapped to `ClaimBot_API` pipeline #117. Manual run `4670 / 20260705.4` was queued on commit `18c62b7`, stayed `notStarted`, then was cancelled through the Build REST API and ended `completed/canceled`. Passing baselines remain `4666 / 20260705.2` and `4667 / 20260705.3`. |
| Continuation app functional run | Pass | 2026-07-05 retest: running frontend/daemon were healthy; gated live-app Playwright passed real-UI workflows covering temp Git selected staging, approval denial, denial feedback replanning, stage+commit, local bare remote push, and ClaimBot_API pipeline `#117` approval preparation. Live ClaimBot_API pipeline #117 read-only gate passed; destructive ClaimBot_API pipeline #117 queue gates queued runs `4667`, `4673`, and UI-triggered `4674`, all completed `succeeded`; live ClaimBot_API PR insight gate passed. Latest default Chromium E2E run passed 54 tests with 6 live-app cases skipped by default. |
| No-link packaged-app schema regression | Pass | Reproduced the installed old app rejecting no-link chat payloads; current source daemon now accepts `projectLink: null` for `/chat`, `/chat/workflow-action`, and `/chat/index-status`. Focused daemon tests passed 14/14 and typecheck passed. Sidecar packaging was fixed by using a minimal `pkg.assets` config, full `tauri:build` passed, release desktop app smoke verified `/project-links`, no-link `/chat`, and no-link `/chat/workflow-action`, and rebuilt MSI payload extraction verified first-message `/chat` from the installer contents. |

### Resolved Finding

| Test | Previous failure | Current result |
|---|---|---|
| `packages/daemon/test/serverPrInsightWorkflowRoutes.test.ts` | Expected PR insight summary to include `Blocking builds: #77 20260610.1 CI: failed`, but the actual summary reported `0 failed/canceled build(s)` and omitted the blocking build line. | Fixed. The PR insight workflow now fetches ADO builds for the source branch and includes blocking builds in the readiness summary. |

Previous observed failure summary:

```text
PR #42: Improve agent
Readiness: blocked. 1 changed file(s), 1 active thread(s), 0 failed/canceled build(s), 1 failed/error policy evaluation(s), 0 linked work item(s).
Touched areas: /src/app.ts.
Policy blockers: Minimum reviewers: failed (blocking).
Active threads: #5: Needs tests.
Risk signal: PR description is empty.
Info: no linked work items were found.
```

Interpretation:

- This was a PR insight regression around build blocker extraction.
- The business impact was high because PR readiness must combine build blockers, policy blockers, active threads, and work item state.
- The focused daemon regression now passes.

### App-Level Findings Fixed During This Run

| Area | Fix | Covered by |
|---|---|---|
| PR insight build blockers | PR insight workflow now fetches build results and includes failed/canceled blockers in the summary. | Daemon focused test and PR insight E2E coverage. |
| Natural-language PR insight routing | Explicit read-only PR prompts now bypass the generic planner and use the structured native PR insight workflow. | Daemon focused SSE test, live runtime `/chat` probe against ClaimBot_API PR #2655, and focused browser transcript test. |
| Natural-language pipeline inspection routing | Explicit read-only pipeline prompts now bypass the generic planner and use the structured native pipeline inspection workflow. | Live runtime `/chat` probe against ClaimBot_API pipeline #117 and focused browser transcript test. |
| Natural-language local Git read-only routing | Explicit current-branch and review-changes prompts now bypass the generic planner and use structured local Git read-only workflows. | Daemon temp-repo test, live runtime `/chat` probes, and focused browser transcript tests for `refresh_branch` and `inspect_changes`. |
| Pipeline welcome action | The `Open Pipelines workspace` suggestion now routes to `inspect_pipeline`. | Desktop unit and chat-layout E2E. |
| Pinned summary actions | Branch-aware pinned summary actions now supply the selected/default branch for branch-dependent actions. | Chat-layout E2E. |
| Saved PR insight artifact lookup | React effect cleanup no longer leaves saved PR insight artifacts permanently loading under StrictMode/dev re-renders. | Chat-layout E2E saved artifact tests. |
| Transcript and approval UI regressions | Current chat transcript, approval cards, source references, and composer attachment flows are covered by Chat-layout Playwright tests and focused browser regressions. | Chat-layout E2E. |
| Project Link cloud fallback | Missing Azure Table consent and local-env secret mode no longer break `/project-links`; local Project Links are returned when cloud auth is unavailable. | Daemon Project Link route tests and live runtime probe. |
| Project Link pipeline field persistence | Project Link create/read/update now preserves `adoPipelineId` and `adoPipelineName`; configured pipeline actions can use the stored ID. | Daemon route test, API smoke, and running Chat UI smoke. |
| Stage-and-commit approval continuation | Follow-up approval cards now release busy state so `git_commit` can be confirmed after `git_add`. | Desktop dispatcher test and running Chat UI temp-repo smoke. |
| Isolated push workflow | Pushing an ahead branch to a local bare remote is approval-gated and updates the remote branch after approval. | Running Chat UI temp-repo smoke. |
| Stage-and-commit approval continuation | Approving `git add` followed by approving `git commit` creates one new commit and leaves the working tree clean. | Dispatcher unit test, running Chat UI smoke, and gated live-app Playwright regression in `tests/e2e/live-app-business.spec.ts`. |
| Rejected approval safety | Rejecting an approval does not execute the pending Git write. | Gated live-app Playwright regression in `tests/e2e/live-app-business.spec.ts`. |
| Approval-feedback revision | Denying an approval with feedback cancels the old pending action and uses the feedback as the next instruction. | Confirmation parser regression, daemon pending approval handling, desktop approval fallback tests, and gated live-app Playwright regression. |
| Selected-file staging workflow | Staging a single requested file is approval-gated and preserves unrelated unstaged changes. | Running Chat UI temp-repo smoke plus gated live-app Playwright regression in `tests/e2e/live-app-business.spec.ts`. |
| Push-to-remote workflow | Pushing an ahead branch is approval-gated and updates the configured remote branch. | Running Chat UI smoke plus gated live-app Playwright regression against a local bare remote in `tests/e2e/live-app-business.spec.ts`. |
| Confirmed-action history titles | History title/preview generation skips internal `[confirmed & executed] ...` messages and falls back to the last displayable user/assistant message. The visible History sidebar renders the sanitized title without internal tool labels. | Daemon chat history route regression and focused Chat-layout browser regression. |

### App-Level Findings From Live Runtime Smoke

| Finding | Severity | Follow-up |
|---|---|---|
| The running app can send a real Chat request to the daemon without the previous `/chat/workflow-action HTTP 400` session error. | Info | Keep this as a browser smoke before release, not only a unit test. |
| A read-only branch question can still lead the agent to request approval for `git fetch origin`. | Medium | Fixed for explicit current-branch and review-changes prompts by routing them to local structured read-only workflows; focused browser transcript coverage is now in place. |
| The UI still displays both `No Project Link selected` and a selected Project Link label in some live runtime states. | Medium | Fixed/covered for the current chat shell: Composer and pinned summary Project Link selectors now have stable labels and focused mocked plus gated live-app push regressions verify both retain the active Project Link. |
| Natural-language PR and pipeline read-only prompts can fail to route into the existing structured read-only workflows. | High | Fixed for explicit IDs: daemon SSE regression covers PR routing, live runtime probes cover ClaimBot_API PR #2655 and pipeline #117, and focused browser tests cover the visible transcript. |
| The pipeline action chip can surface an HTTP 500 when Project Link pipeline ID is missing. | High | Fixed: missing pipeline ID returns `pipeline_setup_required` setup guidance, discovers candidate pipelines, does not create a trigger approval, and lets users persist the chosen pipeline directly from the transcript. |
| Project Link create/update drops pipeline fields, so pipeline mappings cannot persist through daemon CRUD. | High | Fixed and retested: `adoPipelineId` and `adoPipelineName` persist through daemon CRUD and configured UI pipeline action. |
| Approved Git stage works safely in an isolated repo, but history title generation can expose raw confirmed-action JSON. | Medium | Fixed: `/chat/history` skips internal confirmed-action messages when deriving title/preview. |
| The `Stage and commit` workflow could stall after the stage approval because the commit approval remained visible while the UI was still busy. | High | Fixed and retested. Keep an isolated temp-repo regression for approve stage -> approve commit -> one new commit before expanding push workflows. |
| The architecture smoke produced repeated React `Maximum update depth exceeded` warnings and may have used stale/mismatched repo context. | High | Live ClaimBot_API retest passed with no console errors, no maximum-depth warnings, and source-grounded `.NET` / `BotToSharePoint` / `README.md` / `Web.config` / `.cs` references. Clickable source-preview assertions pass in focused browser regression. Deterministic golden architecture context fixture now verifies README, pipeline, `Web.config`, controller, model, and view evidence while excluding stale legacy Invoice/Python context. |
| Source evidence can include binary/media or minified vendor files when their filenames match project terms. | Medium | Fixed: quick-scan context filters binary/media and minified vendor paths before heuristic scoring, semantic/indexed hits are filtered before prompt construction, final source metadata rejects binary document sources, and the repo indexer skips binary buffers even with code-like extensions. Focused core regressions and runtime smoke cover `otherClaims.png`, `otherClaims.min.js`, and stale indexed PNG chunks. |

### Live Read-Only Probe Result

Collected on 2026-07-05 without creating or modifying Azure DevOps or Azure resources.

| Area | Result | Evidence |
|---|---|---|
| Azure account | Pass | Signed in as `Zhou.Ping@totalebizsolutions.com`; default CLI subscription is `TeBS-Internal Azure Bot`, probes explicitly used subscription `a99512b0-3dc5-476f-8f43-d7db40fbc923`. |
| Azure Storage ARM | Pass | `devagentstorage001` visible in resource group `developmentagent`; covered by `test/liveAzurePermissions.test.ts`. |
| Azure Storage Table list | Pass | Table names can be listed; latest probe returned `CicdAgentProfiles`. |
| Azure Storage Table entity query | Fail | Current user still needs Storage Table data-plane Reader/Contributor for entity reads/writes. |
| Azure Cosmos ARM/database list | Pass | `devagentcosmos001` and database `cicd-agent` are visible; covered by `test/liveAzurePermissions.test.ts`. |
| Azure Cosmos SQL role assignments | Fail | No Cosmos SQL data-plane role assignments were found. |
| Azure Key Vault ARM | Pass | `devagentkv001` is visible and uses RBAC authorization; covered by `test/liveAzurePermissions.test.ts`. |
| Azure Key Vault secret list | Fail | `ForbiddenByRbac`; current user lacks Key Vault secret data-plane access. |
| Azure DevOps projects/repos | Pass | Org `tebssg`, project `TeBS-ClaimBot`, repos `TeBS-ClaimBot` and `ClaimBot_API` visible. |
| Azure DevOps active PRs | Pass | Active PRs can be listed for `ClaimBot_API`. |
| Azure DevOps pipelines | Pass | Build definitions can be listed for `TeBS-ClaimBot`; `ClaimBot_API` pipeline #117 is configured on the active ClaimBot_API Project Link. |
| App runtime Project Links | Pass with fallback | `/project-links` returns local Project Links when DevCICDAgent lacks cloud Table consent. |

Current permission gap:

- DevCICDAgent still needs delegated API consent for Azure Storage/Cosmos/Key Vault scopes before the app can use cloud persistence directly.
- The signed-in user still needs Storage Table entity data access, Cosmos SQL data access, and Key Vault secret data access for full cloud-backed operation.
- Live destructive PR and pipeline smoke tests have run. ClaimBot_API destructive PR smoke now creates a tagged branch, pushes a test commit, creates a draft PR, updates metadata, collects PR insight input data, writes an auditable artifact, abandons the PR, deletes the branch, and independently verifies cleanup. ClaimBot_API pipeline #117 failed-run inspection returns timeline/log artifacts through the daemon route, and destructive queue/read-back now has both Chat UI approval evidence and a latest core product-code gate: run `4680 / 20260706.1` completed `succeeded`. ClaimBot_API PR #2655 live read-only insight now has a permanent daemon smoke. Remaining live ADO gaps are broader seeded PR/pipeline answer-quality evals and stale-review/cloud-persistence coverage after Azure data-plane permissions are granted.

## Business Checklist Automation Mapping

| Business checklist section | Best automation layer | Current status | Next action |
|---|---|---|---|
| Onboarding, identity, config | L2/L3 mocked E2E + L4 live Azure + L5 installed smoke | Partial | Settings/config gate passes for local `.env` model secrets, Key Vault permission messaging, daemon config loading, Azure auth/session contracts, live runtime config probes, installed first-run runtime/auth/avatar smoke, and activated native installed Settings/New chat click proof. Remaining gaps are Key Vault success-path proof after permissions are granted, full cloud data-plane persistence, and strict MSI payload parity if MSI shape is required. |
| Project Link lifecycle | L2 daemon + L3 mocked E2E + L4 live state probe | Mostly | Latest focused gate passed at 2026-07-06 06:49-06:50 +08:00: daemon Project Link routes passed 10/10, desktop Project Link models passed 13/13, and browser Project Link UX passed 6/6. Coverage includes CRUD, Azure Table fallback, `local_env` mode avoiding Key Vault PAT lookup, ADO/pipeline discovery, pipeline candidate ranking, active-link persistence, no-link onboarding, ADO remote inference, inline Project Link setup, multi-pipeline recommendation for `ClaimBot_API` pipeline `#117`, and source-reference UX. Live `/project-links` confirmed `ClaimBot_API link` maps `C:\Users\15492\Develop\ClaimBot_API` to pipeline `117 / ClaimBot_API`. Next: add broader mocked ADO service failure fixtures. |
| Chat workflow interaction | L1/L2/L3 | Good | Keep as core smoke path; split large E2E file. |
| Repository understanding | L1 + L2 + targeted E2E | Partial | Binary/media and minified-source pollution is covered by deterministic core regressions plus a rebuilt-runtime smoke. Browser source-preview click assertions verify referenced files open the correct right-pane preview with line count and target-line evidence, and the architecture/source-reference transcript now scores visible answer text for concrete file evidence. Golden architecture context fixture verifies concrete README/pipeline/config/controller/model/view evidence and prevents stale legacy Invoice/Python context. Seeded local change-review context now carries controller, validation, exception, config, secret/API-key, build, and test-command evidence. Next: live model batch scoring and installed-app replay after rebuild/reinstall. |
| Git read-only cases | L1/L2 + temp-repo tests | Good but scattered | Natural-language current-branch and review-changes prompts now have daemon temp-repo regressions, live runtime probes, and focused browser transcript coverage. Consolidate temp Git repo factory tests next. |
| Git write workflows | L1/L2 + temp-repo E2E | Good | Isolated stage-all approval, selected-file staging, pending approval reload/restore, stage-and-commit completion, draft commit message safety, commit validation failure with staged-change preservation, staged-only commit scope, push-with-local-remote, pull/rebase from a behind branch, fast-forward target merge, merge conflict recovery, create-and-switch branch, pull/rebase conflict recovery, dirty branch switching, remote target inspection, clean-repo empty commit guard, stash push, stash apply without dropping, stash pop with successful drop, visible stash-pop conflict recovery with stash preservation, selected-file restore, revert commit, local release tag creation, and safe single-tag publication now pass. Next: broader recovery UX coverage. |
| ADO discovery | L1/L2 + L3 mocked UI + L4 live ADO | Mostly | Live discovery gate passes for `tebssg` / `TeBS-ClaimBot` / `ClaimBot_API` / pipeline `#117`. Latest 2026-07-06 06:55-06:56 ADO failure-mode gate passed core ADO client/mutation contracts 54/54, daemon ADO/PR/pipeline workflows 15/15, and browser permission/ADO UX 8/8. Coverage now includes auth behavior, discovery, pull request reads, build/pipeline parsing, health checks, PR mutation contracts, missing-pipeline setup, Key Vault permission UX, PR insight lookup errors, and pipeline controls. Remaining live gap is Azure data-plane RBAC, not mocked ADO behavior. |
| PR insight/review | L1/L2 + L3 + L4 live ADO | Mostly | Latest PR/AI insight quality rerun at 2026-07-06 08:00-08:04 +08:00 passed core quality contracts 19/19, daemon PR/AI quality routes 18/18, browser PR/pipeline/source UX 7/7, and live ADO PR insight 1/1 against real ClaimBot_API PR `#2655`. The focused browser route verifies natural-language read-only PR insight without approval UI, persisted PR insight artifact source loading, lookup errors, and ordinary artifact shell handling. Seeded route-level PR insight quality verifies changed files, failed builds, blocking/pending policies, active threads, and linked work items are preserved. Review-run persists decision, commit, coverage, and disposition baseline into Review Queue. Next: broader seeded AI answer-quality fixtures and optional eval harness. |
| PR updates | L1/L2 + mocked ADO + L4 live ADO | Good | Contract coverage verifies title/description, reviewer, tag/label, and work-item link payloads from registry tools to typed ADO endpoints. Destructive live PR smoke now adds/removes run-scoped PR labels and reviewers, creates a temporary work item, links/unlinks it to the PR, deletes it, then verifies cleanup. Latest run `mp-e2e-20260705-122539` created PR `2738` and work item `7907`, then independently verified PR abandoned, branch deleted, and work item removed. |
| Review Queue | L1/L2 + L3 + L4 live ADO | Partial | Latest focused gate passed at 2026-07-06 07:53-07:56 +08:00: daemon route coverage verifies `review-run` writes a queue item that `/review-queue` can list with PR, commit, coverage, decision reason, and empty disposition state; disposition routes record audit events and ADO write-back success/failure. Browser coverage verifies `/findings` queue evidence, acknowledgement, request-changes write-back retry, and stale rerun refresh. Live runtime coverage reads real ClaimBot_API PR `#2655` from `/review-queue` with `decisionQueue: blocked`, `decisionRiskLevel: high`, and `findingCount: 9`. Next: rerun after Azure Table data-plane permissions are granted to prove true cloud ReviewHistory persistence. |
| Pipeline workflows | L1/L2 + L4 live ADO | Good | Live inspect and queue smoke pass; configured Chat UI pipeline action now passes; missing pipeline ID returns setup guidance and candidate pipelines; transcript candidate-save UX persists `adoPipelineId`/`adoPipelineName`; live Chat discovery-to-save now verifies a Project Link with no pipeline ID can discover and save real ClaimBot_API pipeline `#117` without triggering a run; deterministic failed pipeline artifact golden tests now lock failed-run selection, ClaimBot_API-style VSBuild/`.DS_Store` evidence, recovery actions, secret redaction, and infra-vs-code classification for PIPE-08; ClaimBot_API pipeline #117 timeline/log diagnosis passes through `/chat/workflow-action` and normal `/chat` explicit read-only routing. The running Chat UI prepares/denies ClaimBot_API pipeline #117 by default and, with `MERGEPILOT_E2E_DESTRUCTIVE=1`, verifies real ADO run IDs are queued; latest core product-code destructive queue/read-back created run `4680 / 20260706.1`, which completed `succeeded`. Next: broader real-world classification fixtures. |
| AI insight quality | L1/L2 eval fixtures + live optional eval | Mostly | Latest 2026-07-06 08:00-08:04 rerun confirms seeded PR insight quality, seeded local change-review context, deterministic final-answer scoring, ChatPlanner quality integration, daemon `/chat` SSE scoring, read-only Git routing, and browser transcript scorers remain green. Coverage includes changed files, failed CI/policy/work items, validation removal, exception handling, API-key/config risk, required risk categories, file evidence, pipeline failure evidence, PR insight evidence, architecture/source evidence, source preview behavior, persisted PR insight artifacts, and review-only scope discipline. Next: broaden to more seeded PR/pipeline datasets and installed-app replay after rebuild/reinstall. |
| Security/secrets | L1/L2/L3 | Partial | Remote URL credential redaction is covered in core command execution, daemon Git probes, natural-language Chat routing, and real browser UI. Live Chat UI now also reviews a diff containing `AZURE_OPENAI_API_KEY=...`, reports secret/credential risk, keeps the workflow read-only, verifies the full key value is not visible, and scores the visible browser transcript for `.env.sample`, `security`, `config`, and review-only scope. Core tool execution now redacts common `api_key`, PAT, `access_token`, `client_secret`, `password`, and credential URL values in both streamed output chunks and final stdout/stderr. ADO build log excerpts, pipeline workflow tool stdout, and pipeline failure artifact markdown now redact API keys, bearer tokens, and client secrets before they reach the transcript or artifacts. Next: add model/provider error redaction fixtures and broader ADO auth failure fixtures. |
| UI usability | L3 Playwright | Good | Continue screenshot/overflow checks; add small-screen smoke. |
| Persistence/offline | L1/L2/L3/L5 | Mostly | Latest 2026-07-06 06:59-07:01 focused gate passed core local persistence tests 24/24, daemon persistence/storage route tests 17/17, and desktop history/artifact persistence tests 42/42. Installed daemon `http://127.0.0.1:8787` reported version `0.5.10`, `secretSource: local_env`, two persisted Project Links, and persisted chat history entries. Business temp cleanup was clean for `mergepilot-live-*`, `mergepilot-daemon-live-pr-insight-*`, `mp-installed-persist-*`, `mp-persist-*`, and `mp-projectlink-restart-*`. Remaining gap: true Azure Table/Cosmos cloud data-plane persistence success still needs RBAC. |

## Destructive Live Resource Policy

Real Azure DevOps and Azure resource mutation is allowed for end-to-end confidence, but only under this policy.

### Allowed Real Mutations

| Resource | Allowed operations | Cleanup requirement |
|---|---|---|
| Azure DevOps branch | Create, push commits, update, delete | Delete branch after test unless intentionally retained for debugging. |
| Azure DevOps pull request | Create PR, update title/description, add/remove reviewers, tags, comments, link/unlink work items, abandon PR | Abandon or complete according to test design; remove labels/test comments where API allows. |
| Azure DevOps pipeline | Queue pipeline run, inspect run/timeline/logs | Runs cannot always be deleted; record run ID and link. |
| Azure DevOps work item links | Link/unlink test work items to PRs | Remove link after test where API supports it. |
| Azure Table Storage | Create/update/delete test Project Link/review rows | Delete all entities with the run ID. |
| Cosmos DB | Create/update/delete test chat/session documents | Delete all documents with the run ID. |
| Key Vault | Create/read/delete test secrets only | Delete/purge test secrets where permitted. Never mutate production model keys. |

### Naming And Tagging Rules

Every destructive test must include a run ID in created resource names:

```text
mp-e2e-YYYYMMDD-HHMMSS
```

Examples:

```text
branch: mp-e2e/20260705-153000/pr-flow
PR title: [mp-e2e 20260705-153000] Validate MergePilot PR flow
tag/label: mergepilot-e2e
Key Vault secret: mp-e2e-20260705-153000-secret-check
Cosmos session id: mp-e2e-20260705-153000-session
```

### Cleanup Rules

1. Each destructive test must register cleanup immediately after creating a resource.
2. Cleanup must run in `afterEach` or `afterAll`, even if assertions fail.
3. Cleanup failures must not be hidden. They must be recorded as `cleanup_failed`.
4. If a resource cannot be removed, record its URL/ID and reason.
5. Test code must refuse to run destructive operations unless `MERGEPILOT_E2E_DESTRUCTIVE=1`.
6. Test code must refuse to mutate resources that do not contain the run ID or `mergepilot-e2e` marker.

### Record Requirements

Each destructive run must append an entry to `docs/live-e2e-test-records.md` with:

- Run ID.
- Date/time.
- Operator or account.
- Environment and subscription/org/project.
- Test command.
- Resources created.
- Resources cleaned.
- Resources left behind.
- Pass/fail result.
- Follow-up issues.

## Required Automation Fixtures

| Fixture | Purpose | Priority |
|---|---|---|
| `runtimeMock.ts` | Reusable mocked daemon responses and SSE streams for Playwright. | Critical |
| `sseBuilders.ts` | Create canonical Chat UI chunk streams and legacy compatibility streams. | Critical |
| `gitRepoFactory.ts` | Create temp repos with dirty/staged/branch/conflict states. | Critical |
| `adoPayloads.ts` | Stable PR, policy, thread, work item, pipeline payloads. | Critical |
| `permissionErrors.ts` | Standard AADSTS/RBAC/ADO auth failure payloads. | High |
| `sourceFiles.ts` | Code preview fixtures for TS/CS/MD/YAML/JSON/binary/large files. | High |
| `modelMock.ts` | Deterministic LLM responses for AI insight and streaming tests. | High |
| `packagedAppChecklist.md` | Installed build smoke checklist until native Playwright automation is ready. | Medium |
| `liveResourceTracker.ts` | Records created live resources and performs cleanup in reverse order. | Critical |
| `liveTestRecorder.ts` | Appends destructive/live run records to `docs/live-e2e-test-records.md`. | Critical |
| `adoLiveClient.ts` | Thin test helper for creating/deleting ADO branches, PRs, labels, comments, and pipeline runs. | Critical |

## Optimization Plan

### Phase 1: Stabilize Existing Automated Baseline

| Task | Acceptance |
|---|---|
| Fix PR insight build blocker regression in `serverPrInsightWorkflowRoutes.test.ts`. | Done: focused daemon test passes. |
| Split `tests/e2e/chat-layout.spec.ts` into domain files. | Same Chat layout tests pass after split. |
| Update Playwright `webServer.command` to use the repository-local toolchain or a wrapper script. | Done: `playwright.config.ts` now starts Vite through `scripts/windows/pnpm-project.ps1`, so E2E uses the repository-local Node.js and pnpm toolchain instead of global `pnpm`. |
| Add `@smoke` tags to the release-critical browser cases. | Done for the first mocked browser release smoke: `playwright test --grep @smoke` runs 9 release-critical workflows across Chat shell, PR insight, pipeline, missing-pipeline setup, architecture/source references, Review Queue, and Settings permission handling. |

### Phase 2: Cover Business Checklist With Mocked Automation

| Task | Acceptance |
|---|---|
| Add Project Link no-link onboarding E2E. | Done: when no Project Link exists, Chat shows inline creation, disables the composer/send controls, and does not call `/chat`. |
| Add Project Link ADO discovery E2E. | Done: inline creation can discover project, repository, and pipeline options and persists the selected pipeline ID/name. |
| Add temp Git repo business journeys. | Status/review/stage/commit/push/recovery flows use real Git in isolated repos. Latest additions: commit validation failure with staged-change preservation, stash dirty work, apply/pop stash flows, visible stash-pop conflict recovery, restore a selected file, revert the last commit, create a local release tag, and publish exactly one tag through real Chat UI approval, plus clean-repo empty commit guard and dirty branch switch guard. |
| Add rejected-approval regression. | Done: `tests/e2e/live-app-business.spec.ts` rejects a real `git add` approval and verifies no files are staged. |
| Add approval-feedback revision regression. | Done: `tests/e2e/live-app-business.spec.ts` denies a stale approval with corrective feedback, replans from the feedback, then stages only the revised file. |
| Add stage-and-commit continuation regression. | Done: `tests/e2e/live-app-business.spec.ts` runs a gated live-app temp-repo regression where approving `git add` and then `git commit -m "..."` creates one commit and leaves no staged changes. |
| Add push-with-local-remote regression. | Done: `tests/e2e/live-app-business.spec.ts` runs a gated live-app temp-repo regression where approving `git push` updates a local bare remote and leaves the branch synchronized. |
| Add selected-file staging regression. | Done: `tests/e2e/live-app-business.spec.ts` runs a gated live-app temp-repo regression where approving `git add -- README.md` stages only `README.md` and preserves another unstaged file. |
| Add dirty branch switch recovery regression. | Done: `tests/e2e/live-app-business.spec.ts` runs a gated live-app temp-repo regression where switching from dirty `main` to `feature/live-switch-target` shows a `HIGH risk` approval, does not switch before approval, and preserves the dirty edit after denial. |
| Add ADO mocked PR insight E2E. | Done: focused browser regressions verify structured PR insight action routing plus saved PR insight artifact rendering for PR metadata, build blockers, policy blockers, active threads, and linked work items. |
| Add ADO PR mutation registry contract tests. | Done: `test/adoPullRequestMutationRegistry.test.ts` covers `ado_update_pull_request`, `ado_add_pull_request_reviewer`, `ado_add_pull_request_label`, and `ado_link_work_item` payload mapping without mutating real ADO resources. |
| Add seeded PR insight quality fixture. | Done: daemon route regression verifies PR insight summaries preserve changed-file paths, linked work item details, failed build identity, blocking policy, pending policy, and active thread evidence while avoiding false empty-description/no-work-item warnings. |
| Add Pipeline mocked failure E2E. | Done: focused Chat-layout browser regression verifies a ClaimBot_API pipeline `#117` failed run summary with root-cause hypothesis, a visible pipeline failure artifact, and rerun/trigger approval via `ado_trigger_pipeline`; it also guards that the transcript stays on the pipeline mapped to the active repository. |
| Add live app ClaimBot_API pipeline approval E2E. | Done: `tests/e2e/live-app-business.spec.ts` now has a gated real Chat UI test for `ClaimBot_API` pipeline `#117`. With `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1`, it inspects the real pipeline, prepares the trigger approval, verifies the active Project Link stays on the repository-specific pipeline, denies the approval by default, and deletes the temporary Project Link. |
| Add source evidence binary/minified exclusion regression. | Done: core chat context excludes binary media such as `otherClaims.png` and minified files such as `otherClaims.min.js` while retaining matching text/code files; repo indexing skips binary buffers with code-like extensions; runtime smoke confirms old indexed PNG chunks no longer reach final sources. |
| Add source preview click regression. | Done: focused Playwright browser regression verifies clicking a Chat source reference requests the active Project Link repo path and exact file path, opens only the referenced file tab, shows total line count and target line, supports copy actions, and cleans up tabs. |
| Add golden architecture context fixture. | Done: core test fixture verifies architecture prompts include README, pipeline, `Web.config`, controller, model, and view evidence, exclude stale legacy Invoice/Python context, and avoid duplicate `README.md`/`readme.md` important-file entries on case-insensitive filesystems. |
| Add seeded local change-review risk fixture. | Done: core chat context fixture verifies a dirty ClaimBot-style repo surfaces changed controller/config files, validation removal, `throw ex`, `AzureOpenAIApiKey`, build/test commands, and `secret/configuration risk` evidence without falsely classifying normal diff headers as Git workflow behavior. |
| Add deterministic final-answer quality scoring fixture. | Done: core evaluator accepts grounded review answers that mention required files and correctness/security/config/tests/deployment risks, while rejecting vague summaries or review-only answers that ask to stage, commit, push, or create a PR. |
| Add ChatPlanner final-answer quality gate. | Done: planner-level fixture runs the normal `agent_final` output path, scores the emitted final answer, and verifies review-only guards remove write approvals even when the user says `Do not stage, commit, or push`. |
| Add daemon `/chat` SSE AI insight quality gate. | Done: daemon route fixture posts a seeded dirty ClaimBot-style repo through `/chat`, verifies no approval event is emitted for read-only change review, verifies final answers are scored against required files and risk categories, and verifies vague write-escalating answers are stripped/rejected. |
| Add browser Chat transcript AI quality scorers. | In progress: focused live browser secret-review gate waits for terminal Chat state, scores visible `main` transcript text with `evaluateAiInsightAnswer`, requires `.env.sample`, `security`, `config`, and review-only scope, and verifies temp repo cleanup. Focused live browser pipeline-diagnosis gate scores visible pipeline `#117` failure evidence with `requiredEvidence` for `Pipeline #117`, `#4665`, and `MSBuild`, requires deployment risk, and verifies no rerun approval is prepared. Focused mocked browser PR insight gate scores visible transcript evidence for `PR #2655`, changed files, build status, policy status, deployment category, and review-only scope. Focused mocked browser architecture/source-reference gate scores visible transcript text for `Chat.tsx`, `chatContext.ts`, `desktop UI`, `repository grounding`, and review-only scope while still verifying right-pane source preview behavior. |
| Add permission failure E2E. | Done for Settings Key Vault secret mode: browser regression covers `secrets/get`, local `.env` fallback, and latest `secrets/set` failure display. Remaining permission coverage belongs to the live Azure probe gate. |
| Add Project Link pipeline mapping regression E2E. | Done: Project Link create/edit preserves pipeline ID/name; pure recommendation logic prefers exact repo metadata such as `repo:ClaimBot_API`; browser Project Link onboarding receives multiple discovered pipelines, automatically selects `#117 ClaimBot_API` from repository metadata without manual pipeline selection, and saves that ID/name. Live ADO discovery and live Chat pipeline action also confirm `#117 ClaimBot_API`. |
| Add missing-pipeline setup regression. | Done: daemon returns `pipeline_setup_required`; Playwright verifies `Open Pipelines workspace` shows setup guidance instead of `Pipeline ID is required` or approval UI; the transcript now renders `Use #117 ClaimBot_API`, persists the candidate via Project Link update, and does not trigger another workflow action. |

### Phase 3: Add Live Integration Gates

| Task | Acceptance |
|---|---|
| Add live Azure permission probe test. | Done: `test/liveAzurePermissions.test.ts` is gated by `MERGEPILOT_E2E_LIVE_AZURE=1`, reports Storage Table, Cosmos, and Key Vault readiness separately, and records current RBAC gaps in `docs/live-e2e-test-records.md`. |
| Add live ADO discovery test. | Done: `test/liveAdoDiscovery.test.ts` is gated by `MERGEPILOT_E2E_LIVE_ADO=1` and verifies the current account can discover project `TeBS-ClaimBot`, repo `ClaimBot_API`, and repository-filtered pipeline `#117 ClaimBot_API`. |
| Add live PR insight smoke. | Done for daemon route: `test/liveAdoPrInsight.test.ts` fetches ClaimBot_API PR #2655 and verifies read-only PR insight. Focused browser coverage now verifies the visible natural-language transcript without approval. |
| Add live pipeline inspect smoke. | Done: `test/liveAdoPipeline.test.ts` lists real pipeline runs historically; running Chat UI pipeline workspace action succeeds when the active Project Link has a configured pipeline. Current ClaimBot_API target is pipeline #117, and the live Chat UI approval path is covered without queueing a run unless destructive mode is explicitly enabled. |
| Add destructive PR flow test. | Mostly done: creates test branch, pushes tagged test commit, creates draft PR, updates title/description, adds/removes run-scoped PR label and reviewer, creates a temporary work item, links/unlinks it, deletes it, collects PR insight input data, verifies visibility/change data, abandons PR, deletes branch, writes a run artifact, and records the run. Latest PR: `2742` from run `mp-e2e-20260706-071800`; cleanup independently verified by PR status, branch ref query, and work item lookup. Seeded route-level PR insight quality assertions are now covered; broader LLM answer-quality evals remain a follow-up. |
| Add destructive pipeline flow test. | Done for ClaimBot_API pipeline #117: live core queue/read-back exists, backend direct approval queued run `4673 / 20260705.7`, the live Chat UI approval tests queued successful runs `4678 / 20260705.11` and `4679 / 20260705.12`, and the latest core product-code destructive gate queued run `4680 / 20260706.1`, which completed `succeeded` and is recorded as retained ADO history. |

### Phase 4: Packaged App Acceptance

| Task | Acceptance |
|---|---|
| Add packaged sidecar smoke protocol. | Done: `scripts\windows\packaged-sidecar-smoke.ps1` starts the packaged sidecar exe, indexes a temp TypeScript repo, exercises index/workflow/chat routes, verifies `/healthz.version` matches `packages/daemon/package.json`, and fails on known native binding/schema/JSON-shape markers. |
| Add release-shell first-message smoke protocol. | Done at process/API level: release desktop shell starts the bundled sidecar on `8787`, uses user config, indexes a temp repo, accepts `/chat/workflow-action`, and completes a first `/chat` request with no session or native-binding errors. |
| Add MSI payload smoke protocol. | Done at extracted-payload level: MSI administrative extraction produces `mergepilot-desktop.exe` and `mergepilot-daemon.exe`; launching the extracted app completes health, index, workflow, and first-message chat checks. |
| Add installed-build UI smoke protocol. | Protocol exists and current installed runtime checks pass for Program Files `0.5.22`: installed desktop shell starts the bundled daemon from `C:\Program Files\MergePilot`, installed `/healthz` loads user config and Azure OpenAI `gpt-4o`, auth APIs expose the signed-in user/avatar data, user visual review confirms the footer avatar renders, temp repo/index/chat workflow routes work through the installed daemon, legacy `C:\Program Files\CICD-Agent` cleanup passes, restart persistence passes, installed live vision passes, and the fresh-user first-run smoke creates local `config.toml`/`.env` without entering Key Vault mode. Strict MSI parity remains separate because the installed desktop is currently the NSIS bundle shape (`__TAURI_BUNDLE_TYPE_VAR_NSS`) and `C:\Program Files\MergePilot\uninstall.exe` remains. The Computer Use plugin-cache repair now provides bootstrap, app discovery, accessibility proof, activated screenshot proof, and low-risk Settings/New chat click proof for the installed MergePilot window. Native visual smoke still has one caveat: call `activate_window` before screenshot capture, because pre-activation screenshots can be stale or unrelated. |
| Verify sidecar packaging. | Done for the sidecar exe, release shell, and MSI payload: no missing native bindings, schema, or daemon path failures in packaged sidecar smoke, release-shell first-message smoke, or extracted-MSI first-message smoke. |
| Verify persistence. | Done for installed daemon restart: model config, Project Link, chat history, and assistant completion survive restart. `scripts\windows\installed-restart-persistence-smoke.ps1` performs a completion-level check after terminal `done`, then cleans the temporary Project Link, chat session, and repo. |
| Fix installer upgrade cleanup. | Done for legacy cleanup: the generated MSI includes `legacy-cleanup.wxs`, packaged smoke verifies cleanup markers for old NSIS files/registry/shortcut, old `CICD-Agent` UpgradeCode, and the residual `C:\Program Files\CICD-Agent` install directory, and the installed reprobe confirms the legacy directory and old publisher shortcut folder are absent. Added `scripts\windows\verify-installed-msi-state.ps1` as the repeatable post-install verifier. Remaining release-packaging work is versioning/repair semantics for replacing rebuilt same-version MSI payload files. |

## Latest Gate Status

Most broad live/release gate records below were collected around 2026-07-06 to 2026-07-07. The latest source, mocked/live-app browser, live ADO read-only, installed-window, focused Workspace UX, user-facing API error-formatting, Workspace UX polish, and local packaged payload verification was collected on 2026-07-16 10:38-13:14 +08:00.

| Gate | Status | Evidence |
|---|---|---|
| User-facing API error formatting | Pass | Latest focused rerun at 2026-07-16 11:40-12:16 +08:00 passed 22/22 desktop API/workspace tests for Pull Requests, PR insight artifacts, Chat workflow actions, Project Links CRUD/discovery/migration, Pipeline connections, Settings save/model-test, Activity task reads, Review Queue cloud fallback warning, source preview fallback, daemon health, Azure DevOps OAuth, JSON error bodies, plain-text body, empty-body fallback, whitespace-only body fallback, and nested object error formatting; focused Chromium pipeline-action regression passed; full route-cache Chromium passed 21/21; `@mergepilot/desktop typecheck` passed; the full desktop source suite passed 70/70 files and 358/358 tests; and `@smoke @mocked` Chromium passed 30/30. A transient blank-page failure in one route-cache Project Link switch run did not reproduce in the focused 1/1 rerun or immediate full 21/21 rerun. Covered user-facing paths now preserve actionable failure messages while hiding raw internal route/status fragments such as `/chat/workflow-action`, `/project-links/`, `HTTP 401`, and `HTTP 500`, including newly fixed Project Link migration, Review Queue fallback, source preview fallback, and daemon health fallback paths. Records: `docs/live-e2e-test-records.md#run-mp-user-facing-api-error-hardening-20260716-1154`, `docs/live-e2e-test-records.md#run-mp-user-facing-api-error-formatting-20260716-1148`. |
| Pull Requests credential-error raw-route regression | Pass | Latest focused rerun at 2026-07-16 11:35-11:37 +08:00 passed PR API auth-error formatting 4/4, the focused Pull Requests failure browser regression, route-cache Chromium 21/21, and `@mergepilot/desktop typecheck`. The browser regression now asserts Pull Requests does not render `/project-links/` or `HTTP 401` while preserving the readable Azure credential message. Record: `docs/live-e2e-test-records.md#run-mp-pr-auth-error-no-raw-route-20260716-1137`. |
| Workspace UX regression hardening | Pass | Latest rerun at 2026-07-16 12:45-12:50 +08:00 added permanent route-cache coverage for PR insight side-panel wording and Pipeline AI analysis failure state. Route-cache Chromium passed 22/22, `@smoke @mocked` Chromium passed 31/31, desktop typecheck passed, full desktop source suite passed 70/70 files and 358/358 tests, and `git diff --check` emitted only CRLF warnings. Source scan found no remaining `AI ANALYSIS STREAMING`, `Insight Preview`, `Preview Insight`, page-level `Unknown`, or old route loading copy in covered UI sources. Record: `docs/live-e2e-test-records.md#run-mp-workspace-ux-regression-hardening-20260716-1250`. |
| Workspace UX Project Link cache gate | Pass | Latest rerun at 2026-07-16 12:55-12:59 +08:00 fixed cached Project Links being exposed as blocking `projectLinksLoading` during background daemon sync, then added permanent route-cache browser coverage for cached Project Links plus delayed `/project-links` sync across Pull Requests and Pipelines. Route-cache Chromium passed 23/23, `@smoke @mocked` Chromium passed 32/32, desktop typecheck passed, full desktop source suite passed 70/70 files and 358/358 tests, and `git diff --check` emitted only CRLF warnings. Record: `docs/live-e2e-test-records.md#run-mp-workspace-ux-projectlink-cache-gate-20260716-1259`. |
| Default Chromium browser gate after cache fix | Pass | Latest broad default browser rerun at 2026-07-16 13:07-13:09 +08:00 passed 77/77 non-live Chromium tests with 30 live-app gated tests skipped by design. Coverage includes Chat layout/workflows, Project Link onboarding, image attachments, PR/pipeline/read-only routing, transcript behavior, source preview/artifacts, Review Queue actions, route caching, Activity raw-output folding, and Settings local-env/Key Vault permission handling. Record: `docs/live-e2e-test-records.md#run-mp-default-chromium-after-cache-fix-20260716-1309`. |
| Live ADO and ClaimBot_API pipeline UI after cache fix | Pass | Latest rerun at 2026-07-16 13:12-13:14 +08:00 passed the live ADO source/daemon gates and focused live-app ClaimBot_API pipeline Chat UI gate after starting the source daemon. Core live ADO discovery/pipeline tests passed 3/3 with 1 destructive queue case skipped; daemon live PR insight passed 1/1; focused live-app Chat UI pipeline tests passed 2/2. The first live-app attempt failed before UI execution because `127.0.0.1:8787` was not listening, which is recorded as an environment precondition rather than a product regression. No ADO mutation was performed. Record: `docs/live-e2e-test-records.md#run-mp-live-ado-and-pipeline-ui-after-cache-fix-20260716-1314`. |
| Live-app test wrapper | Pass | Latest run at 2026-07-16 13:18-13:32 +08:00 added and verified `scripts\windows\run-live-app-e2e.ps1`. The wrapper starts the source daemon if needed, rejects mismatched daemon versions by default, runs Playwright with `MERGEPILOT_E2E_LIVE_APP=1`, optionally enables live ADO/destructive flags, writes daemon and Playwright logs, emits a JSON summary, and cleans the daemon port it started. The focused ClaimBot_API pipeline UI gate passed 2/2 through the wrapper, the local Git approval-denial smoke passed 1/1, and the full non-ADO live-app business gate passed 26/26 with 4 ADO tests skipped by design. `127.0.0.1:8787` was closed after wrapper-started daemon runs. Record: `docs/live-e2e-test-records.md#run-mp-live-app-wrapper-after-cache-fix-20260716-1320`. |
| Live-app wrapper cleanup hardening | Pass | Latest rerun at 2026-07-16 13:36-13:37 +08:00 tightened wrapper cleanup so a wrapper-started source daemon run only stops repo-owned `8787` port owners during cleanup. The focused local Git live-app smoke passed 1/1, route-cache Chromium passed 23/23, wrapper parse passed, and the daemon port was closed afterward. Record: `docs/live-e2e-test-records.md#run-mp-live-app-wrapper-cleanup-hardening-20260716-1337`. |
| Live-app wrapper mismatch guard | Pass | Latest negative-path run at 2026-07-16 13:40 +08:00 started a fake daemon on `8787` with version `0.0.0-test`; the wrapper rejected it with a clear mismatch error, returned exit code `1`, and left the unrelated process alive until the test harness cleaned it up. This protects live-app tests from accidentally running against or stopping a stale/non-workspace daemon. Record: `docs/live-e2e-test-records.md#run-mp-live-app-wrapper-mismatch-guard-20260716-1340`. |
| Current dirty-tree source regression rerun | Pass | Latest rerun at 2026-07-16 13:46 +08:00 passed core/daemon/desktop typecheck, focused desktop API/UX regressions 29/29, daemon pipeline workflow 5/5, and route-cache Chromium 23/23. This is the current non-committed workspace baseline after wrapper hardening and test-record updates. Record: `docs/live-e2e-test-records.md#run-mp-current-dirty-tree-regression-20260716-1346`. |
| Current dirty-tree full source and smoke gate | Pass | Latest rerun at 2026-07-16 13:48-13:51 +08:00 passed full core, daemon, and desktop source suites plus `@smoke @mocked` Chromium 32/32. This is the strongest current non-mutating baseline for the dirty workspace before any future staging or release work. Record: `docs/live-e2e-test-records.md#run-mp-current-dirty-tree-full-source-smoke-20260716-1348`. |
| Legacy confirmation card duplicate-body cleanup | Pass | Latest rerun at 2026-07-16 13:52-13:57 +08:00 removed the remaining legacy confirmation-card body duplication path after static scanning. Focused conversation tests passed 16/16, desktop typecheck passed, route-cache Chromium passed 23/23, `@smoke @mocked` passed 32/32, and default non-live Chromium passed 77/77 with 30 live-app tests skipped. Install/signing reprobes remain expected external failures. Record: `docs/live-e2e-test-records.md#run-mp-legacy-confirm-card-cleanup-20260716-1352`. |
| Live-app approval UI after confirmation-card cleanup | Pass | Latest live-app wrapper rerun at 2026-07-16 13:57-13:59 +08:00 passed 2/2 real Chat UI approval paths after the confirmation-card cleanup: approval denial non-mutation and denial-feedback replanning. The source daemon was `0.5.21`, no ADO/destructive flag was used, and the wrapper cleaned up `8787`. Record: `docs/live-e2e-test-records.md#run-mp-live-app-approval-ui-after-confirm-cleanup-20260716-1357`. |
| Current dirty-tree package build gate | Pass | Latest rerun at 2026-07-16 14:00-14:05 +08:00 passed `@mergepilot/core build`, `@mergepilot/daemon build`, and `@mergepilot/desktop build` for the current uncommitted workspace. Desktop Vite production build completed with only the expected large-chunk warning, `git diff --check` returned exit code `0` with CRLF warnings only, and `127.0.0.1:8787` remained closed afterward. This validates current source buildability but does not replace installed-app parity or Windows signing gates. Record: `docs/live-e2e-test-records.md#run-mp-current-dirty-tree-build-gate-20260716-1400`. |
| Workspace UX filter stale-while-revalidate gap | Pass | Latest rerun at 2026-07-16 14:06-14:12 +08:00 closed the remaining filter-level SWR gap in the Workspace UX plan. Pull Requests now keeps cached rows visible while changing status inside the same Project Link, without reusing stale rows after Project Link switches. Pipeline related PR/discovery queries now keep previous data during key refreshes. Focused Chromium checks passed 3/3, desktop typecheck passed, and the expanded route-cache suite passed 24/24. Record: `docs/live-e2e-test-records.md#run-mp-workspace-ux-filter-swr-gap-20260716-1406`. |
| Broader mocked smoke after filter SWR fix | Pass | Latest rerun at 2026-07-16 14:13 +08:00 passed `@smoke @mocked` 33/33 after the filter-level SWR fix. The Pull Requests status-filter cache regression is now part of the standard mocked smoke gate. Record: `docs/live-e2e-test-records.md#run-mp-broader-mocked-smoke-after-filter-swr-20260716-1413`. |
| Review Queue activity panel persistence | Pass | Latest rerun at 2026-07-16 14:18-14:22 +08:00 added mocked Chromium coverage for the Review Queue Recent activity panel persisted collapsed state. Focused Review Queue checks passed 2/2, desktop typecheck passed, and `@smoke @mocked` passed 34/34 with this interaction now included. Record: `docs/live-e2e-test-records.md#run-mp-review-queue-activity-panel-persistence-20260716-1418`. |
| Chat source preview regression | Pass | Latest rerun at 2026-07-16 14:28 +08:00 strengthened the Chat right-side source preview browser regression. Focused Chromium checks passed for project-context source references plus source preview copy/tab cleanup, desktop typecheck passed, and broader `@smoke @mocked` passed 34/34. The regression now proves CodeMirror gutters, visible source line numbers, source type badge, full-file line count, target-line highlighting, and stale-tab suppression. Record: `docs/live-e2e-test-records.md#run-mp-chat-source-preview-regression-20260716-1428`. |
| Activity information architecture regression | Pass | Latest rerun at 2026-07-16 14:42-14:46 +08:00 added mocked Chromium coverage for the Activity page's operational-history layout. The new test seeds Runs, Checkpoints, PR Insights, and Review Operations together, verifies each scoped section has real data, opens a checkpoint detail, and confirms raw tool JSON remains collapsed. Activity-focused checks passed 2/2, desktop typecheck passed, and broader `@smoke @mocked` passed 35/35. Record: `docs/live-e2e-test-records.md#run-mp-activity-information-architecture-regression-20260716-1442`. |
| Pipeline AI analysis success regression | Pass | Latest rerun at 2026-07-16 14:54-14:59 +08:00 added mocked Chromium coverage for successful Pipeline AI analysis. The new test verifies a Markdown analysis renders in the compact card and detail panel, `Ready` replaces transient streaming labels, run evidence remains visible, and `Unknown` does not return. Pipeline-focused checks passed 4/4, desktop typecheck passed, and broader `@smoke @mocked` passed 36/36. Record: `docs/live-e2e-test-records.md#run-mp-pipeline-ai-analysis-success-regression-20260716-1454`. |
| PR insight Markdown summary regression | Pass | Latest rerun at 2026-07-16 14:49-14:51 +08:00 strengthened the Pull Requests PR insight browser regression. The seeded saved insight now includes Markdown emphasis, list content, and inline code; the test verifies the compact card and right-side detail panel render readable Markdown while hiding raw `**Status:**` syntax. Focused PR insight passed 1/1, PR insight duplicate-id subset passed 2/2, desktop typecheck passed, and broader `@smoke @mocked` passed 36/36. Record: `docs/live-e2e-test-records.md#run-mp-pr-insight-markdown-summary-regression-20260716-1451`. |
| Review Queue selected-lane regression | Pass | Latest rerun at 2026-07-16 14:56-14:58 +08:00 added mocked Chromium coverage for Review Queue lane selection. The selected `Needs human review` lane now has browser proof for `aria-pressed`, amber semantic tone, accent selected border, and no gray/slate/zinc selected background. Focused selected-lane passed 1/1, Review Queue smoke passed 3/3, desktop typecheck passed, and a single-process broader `@smoke @mocked` rerun passed 37/37. Record: `docs/live-e2e-test-records.md#run-mp-review-queue-selected-lane-regression-20260716-1458`. |
| Mocked browser wrapper port lock | Pass | Latest rerun at 2026-07-16 18:55 +08:00 keeps `scripts\windows\run-mocked-browser-e2e.ps1` as the preferred mocked browser wrapper when local Playwright gates may overlap. The wrapper serializes shared Vite app-server access with a named mutex, parses successfully, supports `-TestPath` plus `-Spec`/`-Path` aliases for focused runs, and verified both alias and original parameter with 1/1 scoped browser tests. Earlier broader `@smoke @mocked` and default Chromium wrapper gates remain green. Records: `docs/live-e2e-test-records.md#run-mp-mocked-browser-wrapper-spec-alias-20260716-1855`, `docs/live-e2e-test-records.md#run-mp-mocked-browser-wrapper-port-lock-20260716-1505`. |
| Default Chromium through mocked wrapper | Pass | Latest rerun at 2026-07-16 15:09-15:11 +08:00 used `scripts\windows\run-mocked-browser-e2e.ps1` without a grep filter. The default Chromium browser gate passed 82 non-live tests, skipped 30 live-app tests by design, and failed 0. This is the current broader local UI/business browser gate for Chat workflows, PR insight, Pipeline controls/analysis, Review Queue, Activity, source preview/artifacts, image attachments, route caching, and Settings permission behavior. Record: `docs/live-e2e-test-records.md#run-mp-default-chromium-through-mocked-wrapper-20260716-1509`. |
| Live-app non-ADO wrapper gate | Pass | Latest rerun at 2026-07-16 15:15-15:24 +08:00 used `scripts\windows\run-live-app-e2e.ps1` to start source daemon `0.5.21`, run real Chat UI local Git workflows, and clean up the daemon port. The gate passed 26 local workflow tests, skipped 4 Live ADO pipeline tests by design, and failed 0. This is the current real UI/source-daemon gate for approval safety, stage/commit, branch, merge/rebase, stash, restore, revert, tag, and push behavior. Record: `docs/live-e2e-test-records.md#run-mp-live-app-non-ado-wrapper-gate-20260716-1515`. |
| Live-app ADO pipeline read-only wrapper gate | Pass | Latest rerun at 2026-07-16 15:26-15:28 +08:00 used `scripts\windows\run-live-app-e2e.ps1 -LiveAdo -Grep "ClaimBot_API pipeline"`. The gate passed 4/4 real UI tests against ClaimBot_API pipeline `#117`, discovered/saved the pipeline, inspected failed-run evidence, prepared but rejected rerun/trigger approvals with destructive mode disabled, and verified the latest ADO run stayed `4680 / 20260706.1`. Record: `docs/live-e2e-test-records.md#run-mp-live-app-ado-pipeline-readonly-wrapper-gate-20260716-1526`. |
| Live ADO core/daemon read-only gate | Pass | Latest rerun at 2026-07-16 15:30 +08:00 passed core live discovery/pipeline tests 3/3 with 1 destructive queue test skipped and daemon live PR insight 1/1. It verified current product-code access to ClaimBot_API discovery, pipeline failed-run evidence, and real PR insight without mutation; latest pipeline run stayed `4680 / 20260706.1`, no daemon was left on `8787`, and no live temp directories remained. Record: `docs/live-e2e-test-records.md#run-mp-live-ado-core-daemon-readonly-20260716-1530`. |
| Current dirty-tree full source suite | Pass | Latest rerun at 2026-07-16 15:33-15:35 +08:00 passed core/daemon/desktop typecheck plus full local source suites: core 47 files / 250 tests, daemon 45 files / 258 tests, desktop 70 files / 359 tests. This is the current pre-stage source-code stability baseline. Record: `docs/live-e2e-test-records.md#run-mp-current-dirty-tree-full-source-suite-20260716-1533`. |
| Broader mocked smoke after wrapper hardening | Pass | Latest rerun at 2026-07-16 13:38 +08:00 passed `@smoke @mocked` 32/32 after wrapper cleanup hardening. This confirms the current Chat, PR insight, pipeline controls/setup, read-only PR/pipeline routing, Review Queue, route-cache, Activity, and Settings smoke paths remain green. Record: `docs/live-e2e-test-records.md#run-mp-broader-mocked-smoke-after-wrapper-hardening-20260716-1338`. |
| Post-wrapper source stability gate | Pass | Latest rerun at 2026-07-16 13:33 +08:00 passed `@mergepilot/desktop typecheck`, `tests/e2e/route-cache.spec.ts` 23/23 on Chromium, and PowerShell parse validation for `scripts\windows\run-live-app-e2e.ps1`. This keeps the Workspace UX cache fixes green after adding the live-app wrapper and updating records. Record: `docs/live-e2e-test-records.md#run-mp-post-wrapper-source-stability-20260716-1333`. |
| Local `0.5.21` package refresh after cache fix | Partial | Latest package refresh at 2026-07-16 13:00-13:06 +08:00 rebuilt the current working tree with `@mergepilot/desktop build` and `tauri:build`, regenerated `MergePilot_0.5.21_x64_en-US.msi` and `MergePilot_0.5.21_x64-setup.exe`, passed MSI payload smoke with `healthVersion: 0.5.21`, `workflowPhase: inspect_environment`, and `/chat` HTTP 200, and passed packaged live vision smoke with correct text/shape recognition and no control JSON leak. Signature verification still fails because both Windows artifacts are `NotSigned`. Installed-app reprobe still finds Program Files at `0.5.20`, and `install-and-verify-msi-state.ps1` reports `requiresElevation: true` from the current non-admin shell, so installed-app proof for this refreshed package remains pending. Record: `docs/live-e2e-test-records.md#run-mp-local-v0521-package-refresh-20260716-1304`. |
| Workspace UX source and route-cache stabilization | Pass | Latest polish follow-up at 2026-07-16 12:28-12:31 +08:00 passed desktop typecheck, focused affected tests 21/21, `@smoke @mocked` Chromium 30/30, and the full desktop source suite 70/70 files and 358/358 tests after replacing remaining empty Chat error fallbacks with `Something went wrong.` and PR changed-file fallback with `(path not available)`. The 12:20-12:25 polish rerun passed desktop typecheck, focused API/workspace tests 22/22, route-cache Chromium 21/21, and full desktop 358/358 after reducing user-visible unknown placeholders, rendering saved PR insight summaries through Markdown, and folding Activity rollback proposal args under `Raw proposal`. Earlier focused rerun at 11:22-11:24 passed desktop workspace component/model tests 18/18, route-cache Chromium 21/21, and `@mergepilot/desktop typecheck`, confirming New Chat prompt stability, warm route switching, Project Link switch isolation, Pull Requests/Review Queue/Pipelines/Activity cached refresh behavior, pipeline detail panel state, Review Activity rail behavior, Activity raw-output folding, and pipeline/PR view-model formatting. The 11:16-11:17 live ADO source/daemon read-only gates passed 4/4, confirming the current implementation can still discover ClaimBot_API, inspect pipeline evidence, and inspect live PR insight without mutating ADO. The 11:09-11:12 focused live ADO Chat UI pipeline tests passed 2/2 against ClaimBot_API pipeline #117 without queueing a new run. The 11:03-11:08 focused live-app Chat UI business tests passed 3/3 against a temporary source daemon, covering approval denial non-mutation, approval denial feedback, and secret redaction. The 10:59-11:01 default Chromium browser gate passed 75/75 non-live tests with 30 live-app gated tests skipped by design. Records: `docs/live-e2e-test-records.md#run-mp-workspace-ux-polish-followup-20260716-1231`, `docs/live-e2e-test-records.md#run-mp-workspace-ux-polish-rerun-20260716-1225`, `docs/live-e2e-test-records.md#run-mp-workspace-ux-focused-rerun-20260716-1124`, `docs/live-e2e-test-records.md#run-mp-live-ado-source-daemon-readonly-20260716-1117`, `docs/live-e2e-test-records.md#run-mp-live-ado-pipeline-readonly-chat-20260716-1112`, `docs/live-e2e-test-records.md#run-mp-live-app-focused-nondestructive-20260716-1108`, `docs/live-e2e-test-records.md#run-mp-default-chromium-browser-gate-20260716-1101`, `docs/live-e2e-test-records.md#run-mp-workspace-ux-current-audit-20260716-1058`, `docs/live-e2e-test-records.md#run-mp-activity-cache-regression-20260716-1052`, `docs/live-e2e-test-records.md#run-mp-ado-route-cache-smoke-rerun-20260716-1040`, `docs/live-e2e-test-records.md#run-mp-new-chat-warm-route-regression-20260716-0351`, `docs/live-e2e-test-records.md#run-mp-new-chat-warm-route-polish-20260716-0348`, `docs/live-e2e-test-records.md#run-mp-workspace-ux-warm-route-reprobe-20260716-0337`, and `docs/live-e2e-test-records.md#run-mp-workspace-ux-stabilization-closeout-20260716-0326`. |
| Full core source suite | Pass | Latest rerun at 2026-07-06 06:05 +08:00: `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test` passed 47 files with 4 skipped and 242 tests with 6 skipped. This keeps signed-in profile refresh, Graph avatar, Git/ADO tool contracts, chat planning, AI insight scoring, project-link config, and checkpoint behavior covered. Record: `docs/live-e2e-test-records.md#run-mp-full-source-suites-20260706-0605`. |
| Full daemon source suite | Pass | Latest rerun at 2026-07-06 06:05-06:06 +08:00: `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test` passed 45 files with 1 skipped and 258 tests with 1 skipped. This covers HTTP routes, workflow actions, approvals, PR/pipeline insight routes, review queue storage/fallback behavior, Git write/recovery flows, and pipeline failure classification. Record: `docs/live-e2e-test-records.md#run-mp-full-source-suites-20260706-0605`. |
| Full desktop source suite | Pass | Latest rerun at 2026-07-16 12:31 +08:00: `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test` passed 70/70 files and 358/358 tests. This covers the UI/business interaction layer: execution transcript, streaming state, approvals, source preview, Project Link controls, Review Queue, PR artifacts, pipeline model, composer, image attachments, pagination, route-cache support components, API error formatting, and layout state. Record: `docs/live-e2e-test-records.md#run-mp-workspace-ux-polish-followup-20260716-1231`. |
| Default Chromium browser gate | Pass | Latest broad mocked browser rerun at 2026-07-16 10:59-11:01 +08:00 passed 75/75 non-live Chromium tests with 30 live-app gated tests skipped by default. This covers Chat layout, PR insight controls, pipeline controls, missing-pipeline setup, natural-language read-only PR/pipeline/Git routing, source references, Review Queue acknowledgement, route-cache smoke cases, Activity raw-output folding, and Settings Key Vault/local-env behavior. Installed daemon reprobe still reports version `0.5.20`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`; MSI desktop parity remains separate. Records: `docs/live-e2e-test-records.md#run-mp-default-chromium-browser-gate-20260716-1101`, `docs/live-e2e-test-records.md#run-mp-ado-route-cache-smoke-rerun-20260716-1040`, `docs/live-e2e-test-records.md#run-mp-broader-mocked-browser-gate-20260716-0354`, `docs/live-e2e-test-records.md#run-mp-workspace-ux-browser-gate-20260716-0125`, and `docs/live-e2e-test-records.md#run-mp-installed-v0520-reprobe-20260716-0113`. |
| Package typechecks | Pass | Latest rerun at 2026-07-06 06:01 +08:00: `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`, `--filter @mergepilot/daemon typecheck`, and `--filter @mergepilot/desktop typecheck` all passed with `tsc -p tsconfig.json --noEmit`. Record: `docs/live-e2e-test-records.md#run-mp-source-typecheck-gate-20260706-0601`. |
| Live ADO discovery/pipeline/PR insight | Pass | Latest source/daemon rerun at 2026-07-16 13:12 +08:00: `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts test/liveAdoPipeline.test.ts` passed 3/3 with 1 destructive queue case skipped, and `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts` passed 1/1. Focused live Chat UI rerun at 2026-07-16 13:14 +08:00 also passed 2/2 after starting the source daemon `0.5.21`: `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --workers=1 --grep "inspects ClaimBot_API pipeline #117 failure evidence|prepares ClaimBot_API pipeline #117 rerun approval"`. ClaimBot_API pipeline `#117` remains the live pipeline target; no ADO mutation occurred. Records: `docs/live-e2e-test-records.md#run-mp-live-ado-and-pipeline-ui-after-cache-fix-20260716-1314`, `docs/live-e2e-test-records.md#run-mp-live-ado-source-daemon-readonly-20260716-1117`, `docs/live-e2e-test-records.md#run-mp-live-ado-pipeline-readonly-chat-20260716-1112`, `docs/live-e2e-test-records.md#run-mp-post-v0520-readonly-business-gates-20260707-0204`. |
| AI insight quality gates | Pass | Latest focused rerun at 2026-07-06 04:55-04:57 +08:00: `@mergepilot/core` AI quality/context tests passed 13/13 across `aiInsightQuality`, `aiInsightQualityChatPlanner`, and `chatContext`; `@mergepilot/daemon` AI route quality tests passed 5/5 across `serverAiInsightQualityRoutes` and `serverPrInsightWorkflowRoutes`; live browser quality tests passed for secret/config review redaction and normal Chat inspection of ClaimBot_API pipeline `#117` failed-run evidence; live ADO pipeline read-only probe passed 2/2 with the destructive queue case skipped. The gate verified no approval was emitted for read-only review, no secret-like value was rendered, `HEAD` and index stayed clean, pipeline failure evidence included `#117`, failed run `#4665`, and MSBuild/Publishing details, no `Pipeline #108` or `ado_trigger_pipeline` appeared, no temp directories remained, and ADO run history still started at `4679`, proving no new run was queued. Record: `docs/live-e2e-test-records.md#run-mp-ai-insight-quality-gate-20260706-0455`. |
| Mocked browser release smoke | Pass | Latest focused Chromium rerun at 2026-07-16 12:29-12:30 +08:00 passed `@smoke @mocked` 30/30; the latest broad default Chromium browser gate at 10:59-11:01 passed 75/75 non-live tests and skipped 30 live-app gated tests by design. The smoke set is intentionally mocked and non-mutating; it covers Chat shell, PR insight controls, pipeline controls, missing-pipeline setup, natural-language PR/pipeline/Git routing, architecture/source references, Review Queue acknowledgement, route-cache UX, and Settings Key Vault/local-env permission handling. Records: `docs/live-e2e-test-records.md#run-mp-workspace-ux-polish-followup-20260716-1231`, `docs/live-e2e-test-records.md#run-mp-default-chromium-browser-gate-20260716-1101`, `docs/live-e2e-test-records.md#run-mp-ado-route-cache-smoke-rerun-20260716-1040`. |
| GitHub CI and release publication | Pass | Latest publication: commit `68c0f7f` passed GitHub CI run `28810822333` on `main` across Node 22 Ubuntu/Windows and Desktop Tauri macOS/Windows jobs. Tag `v0.5.20` passed Release run `28810856632`, including Windows installer, macOS installer, and GitHub Release jobs. Published assets are `MergePilot_0.5.20_x64_en-US.msi`, `MergePilot_0.5.20_x64-setup.exe`, and `MergePilot_0.5.20_aarch64.dmg`; the MSI digest is `sha256:f4aa67176712aa485ebe7f11f6280aabb1264963a46bcb0c035597a222d3d355`. Record: `docs/live-e2e-test-records.md#run-mp-post-v0520-release-package-gates-20260707-0158`. |
| Focused ClaimBot_API app pipeline smoke | Pass | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "ClaimBot_API pipeline #117"` passed 3/3 against the running app. The real Chat UI inspected pipeline `#117 ClaimBot_API`, prepared rerun/direct trigger approvals for `#117`, denied approvals in non-destructive mode, verified no new ADO run was queued, and stayed on the pipeline mapped to the active `ClaimBot_API` Project Link. Latest observed dedicated pipeline run `4679 / 20260705.12` was already `completed/succeeded` on commit `dffeecd`. |
| Pipeline rerun-from-failure UX | Pass | Latest focused live rerun at 2026-07-06 05:12-05:13 +08:00: `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "rerun approval from failure evidence"` passed 1/1. The real Chat UI followed ClaimBot_API pipeline `#117` failure evidence into a `Rerun pipeline` suggestion and prepared an `ado_trigger_pipeline` approval. Destructive mode was unset, the approval was denied, and ADO run history still started at `4679`, proving no new run was queued. Record: `docs/live-e2e-test-records.md#run-mp-live-pipeline-rerun-suggestion-reprobe-20260706-0513`. |
| Live pipeline discovery-to-save UX | Pass | Latest focused live run at 2026-07-06 05:37-05:38 +08:00: `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "discovers and saves ClaimBot_API pipeline"` passed 1/1. The real Chat UI created a temporary Project Link without `adoPipelineId`, discovered real pipeline `#117 ClaimBot_API`, saved it through the `Use #117 ClaimBot_API` suggestion, verified `/project-links/{id}` persisted `117 / ClaimBot_API`, and asserted no `ado_trigger_pipeline` approval or new pipeline run occurred. Record: `docs/live-e2e-test-records.md#run-mp-live-pipeline-discovery-save-20260706-0538`. |
| Candidate pipeline persistence from transcript | Pass | Latest mocked browser rerun at 2026-07-06 05:21-05:23 +08:00: `.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts --project=chromium --grep "guides pipeline setup"` passed 1/1. The missing-pipeline transcript rendered `Use #117 ClaimBot_API`; clicking it updated the active Project Link with `adoPipelineId: "117"` and `adoPipelineName: "ClaimBot_API"` without a second `/chat/workflow-action` call or approval UI. Unit coverage and desktop typecheck passed. Record: `docs/live-e2e-test-records.md#run-mp-mocked-pipeline-candidate-persist-20260706-0523`. |
| Failed pipeline artifact and classification gate | Pass | Latest focused daemon rerun at 2026-07-06 05:31-05:33 +08:00: `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/pipelineWorkflow.test.ts` passed 5/5 and `@mergepilot/daemon typecheck` passed. The golden coverage verifies failed-run preference over newer canceled runs, ClaimBot_API-style VSBuild/`.DS_Store` artifact evidence, recovery candidate actions, redaction of API keys/tokens/client secrets/bearer tokens/credential URLs, and PIPE-08 infra-vs-code classification. Source/config failures recommend focused local validation; hosted-agent/network/package-feed failures recommend service-health inspection and rerun approval before code changes. Records: `docs/live-e2e-test-records.md#run-mp-pipeline-failure-artifact-golden-20260706-0529` and `docs/live-e2e-test-records.md#run-mp-pipeline-failure-classification-20260706-0533`. |
| Focused Review Queue gate | Pass | Latest rerun at 2026-07-06 07:53-07:56 +08:00: `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverReviewRunRoutes.test.ts test/serverReviewDispositionWritebackRoutes.test.ts test/serverReviewStorageRoutes.test.ts` passed 6/6; `.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/review-queue.spec.ts --project=chromium` passed 3/3. Live runtime reprobe confirmed `GET /project-links/eb2f6c876f53b33d/review-queue` returns real ClaimBot_API PR `#2655`, `decisionQueue: blocked`, `decisionRiskLevel: high`, and `findingCount: 9`; response `message` was `null` in this run. This proves local/fallback runtime visibility, not Azure Table `ReviewHistory` cloud persistence. Record: `docs/live-e2e-test-records.md#run-mp-review-queue-focused-rerun-20260706-0753`. |
| Settings/config gate | Pass | Latest rerun at 2026-07-06 06:46 +08:00: daemon config/env tests passed 10/10, core settings/auth tests passed 9/9, and `.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/settings-permissions.spec.ts --project=chromium` passed 1/1. Live daemon probes confirmed `secretSource: local_env`, Azure OpenAI deployment `gpt-4o`, embedding deployment `text-embedding-3-small`, config source `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `keyVaultSecretError: null`. This proves the current app can run with local model secrets while Key Vault data-plane permissions are missing. Record: `docs/live-e2e-test-records.md#run-mp-settings-config-focused-gate-20260706-0646`. |
| Source preview / evidence navigation gate | Pass | Latest focused rerun at 2026-07-06 08:20-08:22 +08:00: desktop source workspace tests passed 5 files / 23 tests, daemon workspace file route tests passed 12/12, and focused Chromium source-reference tests passed 2/2. The installed daemon probe used the persisted `ClaimBot_API link`, opened `README.md` from `C:\Users\15492\Develop\ClaimBot_API`, returned `lineCount: 38`, and rejected `..\\outside.txt` as a non-repository-relative path. This confirms `CHAT-12` evidence navigation from transcript reference to full-file preview, tab cleanup, copy actions, line count visibility, language inference, and route safety. Record: `docs/live-e2e-test-records.md#run-mp-source-preview-evidence-focused-20260706-0824`. |
| Chat image attachment and live vision gate | Pass through published `v0.5.19` MSI payload; installed Program Files upgrade pending | Attachment transport gate passed at 2026-07-06 08:17-08:18 +08:00: core multimodal payload tests passed 6/6, daemon image validation/persistence tests passed 13/13, desktop composer/API/draft/transcript tests passed 25/25, and focused Chromium image attachment UX passed 3/3. Live vision then passed after source fix and again in packaged artifacts: source daemon, rebuilt sidecar, freshly built MSI-extracted daemon, version-bumped `0.5.11` MSI-extracted daemon, and published `v0.5.11`/`v0.5.12`/`v0.5.13`/`v0.5.14`/`v0.5.15`/`v0.5.16`/`v0.5.17`/`v0.5.18`/`v0.5.19` MSI-extracted daemons all recognized fixture text `MP VISION TEST`, blue square, and red circle with `leaksControlJson: false` and `duplicateSentence: false`. The currently installed `C:\Program Files\MergePilot` daemon remains stale at `0.5.10`; strict hash parity shows installed binaries differ from the current MSI payload. Records: `docs/live-e2e-test-records.md#run-mp-chat-image-attachment-focused-20260706-0817`, `docs/live-e2e-test-records.md#run-mp-live-vision-chat-source-daemon-clean-stream-20260706-0845`, `docs/live-e2e-test-records.md#run-mp-packaged-live-vision-stream-20260706-0858`, `docs/live-e2e-test-records.md#run-mp-installed-programfiles-live-vision-parity-20260706-0906`, `docs/live-e2e-test-records.md#run-mp-version-bumped-msi-payload-20260706-0913`, `docs/live-e2e-test-records.md#run-mp-github-release-msi-live-vision-20260706-2007`, `docs/live-e2e-test-records.md#run-mp-github-release-v0512-acceptance-20260706-2037`, `docs/live-e2e-test-records.md#run-mp-github-release-v0513-acceptance-20260706-2113`, `docs/live-e2e-test-records.md#run-mp-github-release-v0514-acceptance-20260706-2148`, `docs/live-e2e-test-records.md#run-mp-github-release-v0515-acceptance-20260706-2219`, `docs/live-e2e-test-records.md#run-mp-github-release-v0516-acceptance-20260706-2258`, `docs/live-e2e-test-records.md#run-mp-github-release-v0517-acceptance-20260706-2340`, `docs/live-e2e-test-records.md#run-mp-github-release-v0518-acceptance-20260707-0027`, `docs/live-e2e-test-records.md#run-mp-github-release-v0519-acceptance-20260707-0056`. |
| Project Link lifecycle gate | Pass | Latest rerun at 2026-07-06 06:49-06:50 +08:00: daemon Project Link routes passed 10/10, desktop Project Link models passed 13/13, and focused browser Project Link UX passed 6/6. Live `/project-links` confirmed only expected long-lived links remain, with `ClaimBot_API link` mapped to local repo `C:\Users\15492\Develop\ClaimBot_API`, ADO repo `TeBS-ClaimBot / ClaimBot_API`, and pipeline `117 / ClaimBot_API`. Record: `docs/live-e2e-test-records.md#run-mp-project-link-focused-gate-20260706-0649`. |
| PR/AI insight quality gate | Pass | Latest rerun at 2026-07-06 23:25-23:26 +08:00: core quality contracts passed 19/19, daemon PR/AI quality routes passed 18/18, focused browser PR/pipeline/source UX passed 7/7, and live ADO PR insight passed 1/1 against real ClaimBot_API PR `#2655`. This keeps the native read-only PR insight, seeded quality scoring, persisted artifact/source preview, pipeline controls, and no-approval boundary green after the `v0.5.16` release validation. Record: `docs/live-e2e-test-records.md#run-mp-pr-ai-insight-quality-post-v0516-20260706-2325`. |
| ADO failure-mode gate | Pass | Latest rerun at 2026-07-06 06:55-06:56 +08:00: core ADO client/mutation contracts passed 54/54, daemon ADO/PR/pipeline workflows passed 15/15, and browser permission/ADO UX passed 8/8. This covers ADO auth/discovery, PR reads/mutations contracts, build/pipeline parsing, PR insight preview, missing-pipeline setup, persisted PR insight lookup errors, Settings permission messages, and pipeline controls without mutating ADO. Record: `docs/live-e2e-test-records.md#run-mp-ado-failure-mode-focused-gate-20260706-0655`. |
| Persistence/offline gate | Pass for local/installed persistence | Latest rerun at 2026-07-06 06:59-07:01 +08:00: `@mergepilot/core` local persistence tests passed 6 files / 24 tests, `@mergepilot/daemon` chat/project/review storage route tests passed 5 files / 17 tests, and `@mergepilot/desktop` chat history, draft, review history, operations, audit, and artifact workspace tests passed 8 files / 42 tests. Installed daemon probe on `http://127.0.0.1:8787` confirmed runtime `0.5.10`, `secretSource: local_env`, two long-lived Project Links, and persisted chat history rows. Record: `docs/live-e2e-test-records.md#run-mp-persistence-offline-focused-gate-20260706-0659`. |
| Live Azure permission probe | Pass as diagnostic, access Partial | Latest rerun at 2026-07-07 00:36 +08:00: `MERGEPILOT_E2E_LIVE_AZURE=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts` passed 1/1. Current Azure CLI user `Zhou.Ping@totalebizsolutions.com` can read ARM metadata for `devagentstorage001`, `devagentcosmos001`, and `devagentkv001`, list Storage tables including `CicdAgentProfiles`, and list Cosmos SQL database `cicd-agent`, but still lacks Storage Table entity query access, Cosmos SQL data-plane role assignment, and Key Vault secret metadata/list permission. The default CLI subscription is `TeBS-Internal Azure Bot`, while the probe explicitly targeted subscription `a99512b0-3dc5-476f-8f43-d7db40fbc923`. Runtime remains on local model secrets and no cloud write/persistence gate was run because data-plane permissions remain insufficient. Record: `docs/live-e2e-test-records.md#run-mp-v0518-install-guard-and-azure-permission-20260707-0036`. |
| Full live app business gate | Pass | Latest rerun at 2026-07-16 04:14-04:23 +08:00: `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --workers=1` passed 30/30 in 8.3 minutes with `MERGEPILOT_E2E_DESTRUCTIVE` unset. The first attempt exposed and fixed a real app bug: missing-pipeline setup could surface raw `/chat/workflow-action HTTP 401` before setup guidance because ADO auth was checked too early. The recovery fix checks pipeline configuration first and adds Azure CLI/DefaultAzureCredential ADO token fallback for live dev environments. The focused ClaimBot_API pipeline `#117` recovery path then passed 4/4, and the full gate passed 30/30. No ADO run was queued, `/project-links` retained only expected long-lived links, no `%TEMP%\mergepilot-live-*` directories remained, and the run kept the project aligned with AI insight over real Git/ADO workflows rather than generic code-quality testing. Record: `docs/live-e2e-test-records.md#run-mp-live-app-business-full-ado-recovery-20260716-0423`. |
| Live resource cleanup | Pass | Post-run probe at 2026-07-06 06:35 +08:00 found no `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories. `/project-links` retained only `ClaimBot_API link` plus `project link2`; `ClaimBot_API link` still points to repo `C:\Users\15492\Develop\ClaimBot_API` and pipeline `117 / ClaimBot_API`. Latest five ClaimBot_API pipeline #117 runs remained `4679`, `4678`, `4677`, `4676`, and `4674`, all completed/succeeded; the non-destructive live app gate did not queue a new ADO run. |
| Packaged MSI payload smoke | Pass with signing blocker | Latest local retest at 2026-07-16 15:36-15:42 +08:00 rebuilt current dirty-tree `0.5.21` MSI/NSIS artifacts, passed extracted MSI payload smoke with `healthVersion: 0.5.21`, legacy cleanup WiX validation, index refresh, workflow phase `inspect_environment`, and `/chat` HTTP 200, then passed packaged live vision smoke with final answer mentioning `MP VISION TEST`, blue square, and red circle, `leaksControlJson: false`, and `duplicateSentence: false`. Ports and temp directories were clean afterward. Signature verification still failed because the local MSI and NSIS artifacts are `NotSigned`. Published-release records through `v0.5.19` remain valid for prior acceptance. Latest record: `docs/live-e2e-test-records.md#run-mp-current-dirty-tree-package-acceptance-20260716-1542`. Prior published records: `docs/live-e2e-test-records.md#run-mp-github-release-v0519-acceptance-20260707-0056`. |
| Fresh installed app first-run smoke | Pass for current installed `0.5.22` NSIS state | Latest installed fresh-user verifier at 2026-07-17 22:22-22:24 +08:00 ran `installed-fresh-user-smoke.ps1` and the top-level `run-installed-app-smoke.ps1` wrapper. It starts the actual Program Files daemon with temporary `MERGEPILOT_HOME` and `RUNTIME_DATA_DIR`, removes inherited model/key/cloud env vars, creates a temporary Git repo, verifies fresh `config.toml` and `.env` creation, confirms `secretSource: local_env`, `aoaiKeyInVault: false`, no Key Vault secret error, no `kv://secret/mergepilot-aoai-key` in local-env config, and `/chat/workflow-action` with `sessionId: null` returns `inspect_environment`. The full installed-app wrapper passed package-state, persistence, safety, verifier-safety, and fresh-user checks with `openAfterRun: []`. Strict MSI desktop parity remains separate because the installed desktop is the NSIS bundle shape and `uninstall.exe` is present. Latest record: `docs/live-e2e-test-records.md#run-mp-0522-installed-fresh-user-first-run-smoke-20260717-2224`. Prior installed parity record: `docs/live-e2e-test-records.md#run-mp-0522-installed-parity-and-regression-continuation-20260717-2155`. |
| Dirty-tree source and runner guard | Pass | Latest continuation at 2026-07-17 22:31-22:38 +08:00 passed current dirty-tree desktop typecheck, daemon typecheck, full desktop tests (94 files / 421 tests), and full daemon tests (47 files / 275 tests, 1 live ADO skip). It also found and fixed a test-harness false-green risk: typoed package filters such as `@mergepilot\desktop` previously reached pnpm and printed `No projects matched` while exiting 0. `scripts/windows/pnpm-project.ps1` now preflights explicit package-name filters, and `scripts/windows/pnpm-project-smoke.ps1` proves bad filters exit 1 while valid filters still run. Installed `0.5.22` package-state and stale-template probes still pass. Latest record: `docs/live-e2e-test-records.md#run-mp-0522-source-and-runner-guard-20260717-2238`. |
| Core and release-readiness smoke | Fixed and pass | Latest continuation at 2026-07-17 22:40-23:04 +08:00 passed core typecheck, core tests (50 files / 258 tests, 4 files / 6 live skips), release workflow static smoke, fast release-readiness smoke, and full release-readiness smoke with package runtime gates. The full readiness smoke returned `exitCode: 0`, `ok: true`, 9/9 checks passed, and no failures. This pass also fixed a second harness issue: `verify-current-release-readiness-smoke.ps1` previously emitted passing JSON but returned process exit code `1` because PowerShell retained `$LASTEXITCODE` from an intentionally failing child readiness probe. The smoke now explicitly exits `0` when its own checks pass. Latest record: `docs/live-e2e-test-records.md#run-mp-0522-core-readiness-smoke-20260717-2304`. |
| Chat route-cache and runner-smoke continuation | Fixed and pass | Latest continuation at 2026-07-17 23:05-23:12 +08:00 passed `pnpm-project-smoke.ps1`, mocked Chromium `route cache\|chat` browser regression (53 selected tests passed, 16 live-app tests skipped by design), focused Chat dispatcher tests (2 files / 10 tests), focused daemon config/env tests (2 files / 11 tests), and Windows script parser (34/34). The runner smoke now reads `apps\desktop\package.json` for the expected package/version rather than hard-coding `@mergepilot/desktop@0.5.22`, avoiding false reds on future version bumps. Latest record: `docs/live-e2e-test-records.md#run-mp-0522-chat-route-cache-runner-smoke-20260717-2312`. |
| Installed app window visual smoke | Pass with activation caveat | Current installed Program Files `0.5.22` package-state, auth/avatar backend, installed daemon health/config, installed stale-template scan, installed live vision, and fresh-user first-run smoke all pass. User visual review confirmed the footer avatar renders after reinstall. Computer Use now also provides native app/window discovery, accessibility tree proof, activated screenshot proof, and low-risk Settings/New chat click proof for the installed MergePilot window. The remaining caveat is narrower: screenshots can still capture unrelated content before explicit window activation, so native visual smokes should call `activate_window` before relying on pixel evidence. Records: `docs/live-e2e-test-records.md#run-mp-0522-installed-parity-and-regression-continuation-20260717-2155`, `docs/live-e2e-test-records.md#run-mp-0522-installed-chat-auth-config-continuation-20260717-2220`, `docs/live-e2e-test-records.md#run-mp-0522-installed-fresh-user-first-run-smoke-20260717-2224`, `docs/live-e2e-test-records.md#run-mp-0522-installed-native-ui-computer-use-20260717-2320`. |
| Local packaged payload smoke | Pass with signing blocker | Latest local packaged rerun at 2026-07-16 15:36-15:42 +08:00 built current dirty-tree `0.5.21` MSI and NSIS artifacts after the full source suite. MSI payload smoke and packaged live vision smoke both passed; temp extraction/data directories and test ports were clean afterward. Signature verification failed as expected because the local MSI and NSIS artifacts are `NotSigned`, and the MSI was not installed in this run. Record: `docs/live-e2e-test-records.md#run-mp-current-dirty-tree-package-acceptance-20260716-1542`. |
| Installed restart persistence smoke | Pass | Latest retest at 2026-07-16 15:52 +08:00 verified installed daemon restart persistence at completion level on port `8796` with no manual daemon pre-start. The script auto-started `C:\Program Files\MergePilot\mergepilot-daemon.exe`, created temporary Project Link `46c7b27aa33b9b32`, chat session `chat_1784188353170_7b987e`, observed terminal SSE `done`, verified assistant completion `persistence-ok-mp-installed-persist-20260716-155225` before and after restart, then deleted the chat session, Project Link, and temp repo. JSON reported `daemonAutoStarted: true` and `daemonStopped: true`. A follow-up negative check occupied port `8797` with a non-MergePilot PowerShell listener; the script exited `1`, logged `Refusing to restart unexpected process`, and left the unrelated listener alive for the harness to clean. This check is now repeatable with `installed-restart-persistence-safety-smoke.ps1`, which passed at 16:05 with wrapper exit `0`, inner smoke exit `1`, `containsExpectedRefusal: true`, and `listenerStillAliveAfterSmoke: true`. Post-run checks confirmed ports `8787`, `8796`, and `8797` were closed and no `%TEMP%\mp-installed-*` or live-test temp directories remained. Record: `docs/live-e2e-test-records.md#run-mp-installed-persistence-autostart-gate-20260716-1552`. |
| Destructive ADO PR workflow | Pass | Latest rerun at 2026-07-06 07:18-07:20 +08:00: `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-e2e-20260706-071800 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDestructive.test.ts` passed 1/1. It created draft PR `2742`, run-scoped branch `mergepilot-e2e/mp-e2e-20260706-071800`, PR label, reviewer, work item `7910`, and PR/work-item link, then cleaned them. Independent verification found PR `2742` abandoned, branch ref count `0`, and work item `7910` returning `TF401232`; runtime health stayed green and no temp directories remained. Record: `docs/live-e2e-test-records.md#run-mp-e2e-20260706-071800`. |
| Destructive ClaimBot_API pipeline Chat UI trigger | Pass | At 2026-07-05 22:14-22:17 +08:00, `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "ClaimBot_API pipeline #117"` passed 1/1. It queued ADO run `4678 / 20260705.11` for `ClaimBot_API` pipeline `#117` on `refs/heads/main` at `dffeecd`; the run completed `succeeded` and is retained as ADO build history. |
| Destructive ClaimBot_API pipeline core queue/read-back | Pass | At 2026-07-06 07:22-07:31 +08:00, `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-pipe-20260706-072253 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoPipeline.test.ts` passed 3/3. It listed recent runs, read failed-run timeline/log evidence, queued pipeline `#117` run `4680 / 20260706.1`, read it back through the product ADO pipeline API, and final ADO poll reported `completed/succeeded`. Record: `docs/live-e2e-test-records.md#run-mp-pipe-20260706-072253`. |
| Read-only ClaimBot_API pipeline failure evidence Chat UI smoke | Pass | At 2026-07-05 22:49 +08:00, `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "inspects ClaimBot_API pipeline #117 failure evidence"` passed 1/1. It verified normal Chat input resolves stored Project Link details from `projectLinkId`, inspects pipeline `#117` read-only, surfaces failed run `#4665` build evidence in the transcript, and avoids `ado_trigger_pipeline`. |
| ClaimBot_API pipeline rerun-from-failure suggestion | Pass | At 2026-07-05 22:53 +08:00, `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "rerun approval from failure evidence"` passed 1/1. It verified the `Rerun pipeline` suggestion from the failure transcript prepares an `ado_trigger_pipeline` approval for pipeline `#117`; destructive mode was unset, denial left the latest ADO run ID unchanged. |
| Destructive ClaimBot_API pipeline rerun-from-failure confirmation | Pass | At 2026-07-05 22:59-23:00 +08:00, `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "rerun approval from failure evidence"` passed 1/1. It confirmed the same `Rerun pipeline` approval path, queued run `4679 / 20260705.12`, and ADO reported `completed/succeeded` on `refs/heads/main` at `dffeecd`. |

## Release Gate Proposal

Before each release:

1. Run all package typechecks.
2. Run all focused business tests.
3. Run `@smoke` Playwright E2E.
4. Run live ADO/Azure probes only in an environment with permissions.
5. Run packaged app smoke manually or through packaged automation.
6. Update this document's baseline record if failures or coverage changes.

## Immediate Next Steps

1. Keep full core and daemon suites in the source pre-release gate. The latest run caught and fixed meaningful PR insight and auth/avatar regression coverage, so these suites are valuable beyond simple code quality.
2. Split the current Playwright monolith into business-domain specs while preserving the current Chat layout baseline.
3. Add `@smoke` and `@mocked` tags. First mocked release smoke is done and passing 9/9; continue tagging only workflows that should block every release quickly.
4. Continue extracting reusable temp Git repo E2E fixtures from the live-app business spec, which now covers selected-file staging, rejected approval, approval-feedback revision, draft commit message safety, stage-and-commit, empty-commit guard, staged-only summary, credential-redacted remote target inspection, dirty branch switching, fast-forward target merge, merge conflict recovery, create-and-switch branch, push, behind-branch pull/rebase, pull/rebase conflict recovery, stash push/apply/pop, restore-file, revert-commit, and local release-tag workflows.
5. Extend the live Azure/ADO gated probes after missing Azure data-plane permissions are granted.
6. Extend destructive ADO coverage beyond branch/PR/pipeline smoke, PR insight input collection, PR label/reviewer/work-item mutation cleanup, PR mutation registry contracts, seeded PR insight route-quality assertions, Review Queue persistence coverage, manual Review Queue disposition/write-back coverage, and ClaimBot_API pipeline #117 destructive/read-only/rerun-approval/rerun-confirmation Chat UI records into stale review handling and broader live review-quality records.
7. Close the remaining installed-package proof gap only if strict MSI-shape parity is required. Program Files is now aligned at `0.5.22`, and installed package-state, persistence, safety, fresh-user first-run config, stale-template, avatar/auth, and live vision smokes pass for the current NSIS-shaped install. The remaining installed-package caveat is shape-specific: if MSI parity is required, run `.\scripts\windows\install-and-verify-msi-state.ps1 -ExpectedVersion 0.5.22 -MsiPath .\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.22_x64_en-US.msi` from elevated PowerShell. Otherwise, keep `.\scripts\windows\run-installed-app-smoke.ps1 -ExpectedVersion 0.5.22 -ExpectedDesktopBundleKind nsis` as the current installed-app baseline.
8. Configure public Windows code-signing secrets before the next release: `WINDOWS_CODESIGN_CERT_PFX_BASE64` and `WINDOWS_CODESIGN_CERT_PASSWORD`. The release workflow now verifies Windows installer metadata with `scripts/windows/verify-windows-installer-metadata.ps1`, checks signing readiness with `scripts/windows/verify-windows-signing-readiness.ps1`, signs Windows installers with `scripts/windows/sign-windows-release-artifacts.ps1`, and blocks unsigned assets with `scripts/windows/verify-windows-artifact-signatures.ps1`. Before real signing, keep running `scripts/windows/verify-current-release-readiness-smoke.ps1`, `scripts/windows/verify-windows-artifact-signatures-smoke.ps1`, and `scripts/windows/sign-windows-release-artifacts-smoke.ps1` locally to prove supplied artifact paths and handoff commands are not drifting. Documentation: `docs/windows-code-signing.md`.
9. Candidate pipeline selection from the missing-pipeline transcript is now implemented and covered by both mocked browser regression and live non-destructive ADO discovery-to-save coverage. Next pipeline enhancement: broaden real-world failure classification fixtures.
10. Add permanent browser temp-repo regressions for broader Git recovery UX; interrupted approval restore, failed commit validation, stash push/apply/pop, visible stash-pop conflict recovery, restore-file, revert-commit, local tag creation, and single-tag publication are now covered in the live-app gate.
11. Extract a dedicated reusable `gitRepoFactory.ts` from `tests/e2e/live-app-business.spec.ts` so the 30 live-app business cases can be split by business domain without losing cleanup discipline.
