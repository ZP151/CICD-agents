# Live E2E Test Records

## Purpose

This file records MergePilot live end-to-end test runs that touch real Azure DevOps or Azure resources.

Live tests may create or modify real resources such as branches, pull requests, pipeline runs, work item links, Azure Table entities, Cosmos documents, or test Key Vault secrets. Every run must record what was created, what was cleaned up, and what remains.

## Rules

- Only run destructive tests when `MERGEPILOT_E2E_DESTRUCTIVE=1`.
- Every created resource must include a run ID such as `mp-e2e-YYYYMMDD-HHMMSS`.
- Every created resource must be registered for cleanup immediately after creation.
- Cleanup must run even when the test fails.
- If cleanup fails, record the resource ID/URL and the reason.
- Never mutate production model keys or unmarked user resources.

## Run Template

Copy this template for each live/destructive run.

```markdown
## Run: mp-e2e-YYYYMMDD-HHMMSS

| Field | Value |
|---|---|
| Date/time | YYYY-MM-DD HH:mm:ss TZ |
| Operator/account |  |
| Machine |  |
| Git commit |  |
| Test command |  |
| Environment flags | `MERGEPILOT_E2E_LIVE_ADO=`, `MERGEPILOT_E2E_LIVE_AZURE=`, `MERGEPILOT_E2E_DESTRUCTIVE=` |
| Azure DevOps org |  |
| Azure DevOps project |  |
| Azure DevOps repo |  |
| Azure subscription |  |
| Azure resource group |  |
| Result | Pass / Partial / Fail |

### Tests Run

| Test | Result | Notes |
|---|---|---|
|  |  |  |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO branch |  |  |  |  |
| ADO PR |  |  |  |  |
| ADO pipeline run |  |  |  |  |
| ADO work item link |  |  |  |  |
| Azure Table entity |  |  |  |  |
| Cosmos document |  |  |  |  |
| Key Vault secret |  |  |  |  |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
|  | cleaned / retained / cleanup_failed |  |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
|  |  |  |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
|  |  |  |
```

## Records

## Run: mp-source-typecheck-gate-20260706-0601

| Field | Value |
|---|---|
| Date/time | 2026-07-06 06:01 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` with working-tree business test updates |
| Test command | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck` |
| Environment flags | n/a |
| Azure DevOps org | Not touched by this source gate |
| Azure DevOps project | Not touched by this source gate |
| Azure DevOps repo | Not touched by this source gate |
| Azure subscription | Not touched by this source gate |
| Azure resource group | Not touched by this source gate |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| `@mergepilot/core` typecheck | Pass | `tsc -p tsconfig.json --noEmit` completed successfully. |
| `@mergepilot/daemon` typecheck | Pass | `tsc -p tsconfig.json --noEmit` completed successfully. |
| `@mergepilot/desktop` typecheck | Pass | `tsc -p tsconfig.json --noEmit` completed successfully. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| None | n/a | n/a | No | n/a |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| n/a | n/a | Typechecks are local read-only build checks. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| None | n/a | n/a |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Current core, daemon, and desktop package contracts typecheck after the latest live-app, browser, ADO, settings, packaging, and documentation changes. | Info | Keep this as the current source-level pre-release gate evidence. |

## Run: mp-default-browser-and-smoke-gate-20260706-0557

| Field | Value |
|---|---|
| Date/time | 2026-07-06 05:57-05:59 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` with working-tree business test updates |
| Test command | `.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium`; `.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium --grep "@smoke"` |
| Environment flags | `MERGEPILOT_E2E_LIVE_APP` unset, `MERGEPILOT_E2E_LIVE_ADO` unset, `MERGEPILOT_E2E_DESTRUCTIVE` unset |
| Azure DevOps org | Not touched by this mocked/default browser run |
| Azure DevOps project | Not touched by this mocked/default browser run |
| Azure DevOps repo | Not touched by this mocked/default browser run |
| Azure subscription | Not touched by this mocked/default browser run |
| Azure resource group | Not touched by this mocked/default browser run |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Default Chromium browser gate | Pass | Playwright discovered 84 Chromium tests, passed 54 non-live mocked/default tests in 1.4 minutes, and skipped 30 gated live-app tests by design because live flags were unset. |
| Mocked release smoke gate | Pass | `--grep "@smoke"` selected 9 non-mutating Chromium workflows and passed 9/9 in 26.8 seconds. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| None | n/a | n/a | No | n/a |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| `%TEMP%\mergepilot-live-*` | cleaned | Post-run probe found no live-app temp directories. |
| Daemon runtime | healthy | `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI `gpt-4o`, and `cloudSecrets: false`. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| None | n/a | n/a |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The default non-live browser gate remains green after adding the 30th live-app workflow. | Info | Keep this as the quick default app UI regression gate. |
| The release smoke selector remains stable at 9 mocked workflows. | Info | Continue adding only truly release-critical non-mutating workflows to `@smoke`. |

## Run: mp-installed-native-ui-computer-use-reprobe-20260706-0550

| Field | Value |
|---|---|
| Date/time | 2026-07-06 05:50-05:55 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` with working-tree business test updates |
| Test command | Computer Use read-only reprobe of installed `com.mergepilot.desktop`; `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireLegacyCleanup` |
| Environment flags | n/a |
| Azure DevOps org | Not touched by this installed UI probe |
| Azure DevOps project | Not touched by this installed UI probe |
| Azure DevOps repo | Not touched by this installed UI probe |
| Azure subscription | Not touched by this installed UI probe |
| Azure resource group | Not touched by this installed UI probe |
| Result | Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Installed app state and auth/avatar probe | Pass | `verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireLegacyCleanup` returned `ok: true`; installed version `0.5.10`; install directory `C:\Program Files\MergePilot`; legacy `C:\Program Files\CICD-Agent` absent; current shortcut present; daemon health passed with Azure OpenAI `gpt-4o`; auth returned `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, and avatar length `19339`. |
| Computer Use app/window discovery | Pass | `sky.list_apps()` found one installed MergePilot app: `com.mergepilot.desktop`, display name `MergePilot`, running with window id `216403080`, title `MergePilot`. |
| Installed UI accessibility text | Pass | `get_window_state(... include_text: true)` returned the expected installed UI text: `New chat`, `Pull Requests`, `Project Links`, `Review Queue`, `Pipelines`, `Activity`, `Settings`, `Zhou Ping`, `ClaimBot_API link`, `ClaimBot_API`, and `TeBS-ClaimBot / ClaimBot_API`. |
| Installed UI screenshot/click readiness | Partial | `get_window_state(... include_screenshot: true)` still captured an unrelated Windows background/lockscreen-style image instead of the MergePilot window. `activate_window` still failed with `failed to activate captured window`. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| None | n/a | n/a | No | n/a |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| n/a | n/a | No resources were created. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| None | n/a | n/a |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Computer Use is no longer fully unavailable: app discovery and accessibility inspection work against installed MergePilot. | Info | Keep using accessibility text for passive installed-app smoke evidence. |
| Computer Use visual/click automation is still not release-grade for installed MergePilot because screenshot capture returns the wrong image and activation fails. | Medium | Keep native pixel/click UI smoke marked Partial until Computer Use can capture and activate the actual MergePilot window. |

## Run: mp-live-app-business-full-pass-20260706-0540

| Field | Value |
|---|---|
| Date/time | 2026-07-06 05:40-05:47 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` with working-tree business test updates |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` |
| Environment flags | `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE` unset |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Azure subscription | Not used by this non-destructive app run |
| Azure resource group | Not used by this non-destructive app run |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Full live app business gate | Pass | 30/30 real browser workflows passed in 6.7 minutes. Coverage includes selected-file staging, pending approval reload/restore, approval denial and feedback replanning, stage-and-commit, commit validation failure, empty commit guard, staged-only summary, draft commit message safety, credential and secret redaction, dirty branch switching, target merge, merge/rebase/pull/stash/restore/revert/tag workflows, safe single-tag publication, ClaimBot_API pipeline `#117` discovery-to-save, read-only failure inspection, rerun approval preparation, and direct trigger approval preparation. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| Temporary local Git repos | `mergepilot-live-*` under `%TEMP%` | Local filesystem | Yes | Removed by Playwright test cleanup |
| Temporary Project Links | run-scoped `mp-live-*` links | Local/cloud Project Link store | Yes | Deleted by Playwright test cleanup |
| ADO pipeline run | n/a | n/a | No | Destructive mode was unset; approvals were denied or configuration-only |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary local Git repos | cleaned | Post-run `%TEMP%\mergepilot-live-*` probe returned no directories. |
| Temporary Project Links | cleaned | Post-run `/project-links` listed only the pre-existing `ClaimBot_API link` and `project link2`. |
| ADO pipeline history | unchanged | Latest ClaimBot_API pipeline `#117` run remained `4679 / 20260705.12`; no new run was queued by this non-destructive gate. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| None | n/a | n/a |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The full non-destructive app business gate now includes live Project Link pipeline discovery-to-save coverage, so missing pipeline setup is verified in the same business suite as Git and ADO approval workflows. | Info | Continue using this as the full live source-runtime gate before packaging or release validation. |

## Run: mp-live-pipeline-discovery-save-20260706-0538

| Field | Value |
|---|---|
| Date/time | 2026-07-06 05:37-05:38 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` with working-tree business test updates |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "discovers and saves ClaimBot_API pipeline"` |
| Environment flags | `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE` unset |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Azure subscription | Not used by this non-destructive app run |
| Azure resource group | Not used by this non-destructive app run |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live Chat Project Link pipeline discovery-to-save | Pass | Created a temporary Project Link for `ClaimBot_API` with no `adoPipelineId`, opened the running Chat UI, clicked `Open Pipelines workspace`, verified real ADO discovery returned `#117 ClaimBot_API`, clicked `Use #117 ClaimBot_API`, and verified `/project-links/{id}` saved `adoPipelineId: "117"` and `adoPipelineName: "ClaimBot_API"`. |
| Focused pipeline artifact regression | Pass | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/pipelineWorkflow.test.ts` passed 5/5 after the live browser run. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| Temporary Project Link | `mp-live-claimbot-discover-pipeline-*` | Local/cloud Project Link store | Yes | Deleted in test cleanup |
| ADO pipeline run | n/a | n/a | No | Destructive mode was unset; the test saved configuration only |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary Project Link | cleaned | Post-run `/project-links` listed only the pre-existing `ClaimBot_API link` and `project link2`. |
| ADO pipeline history | unchanged | The test asserted the latest ClaimBot_API pipeline `#117` run ID did not change after saving the candidate. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| None | n/a | n/a |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The live missing-pipeline Project Link flow now closes without opening the Project Link editor: Chat discovers the real repository pipeline and saves it directly. | Info | Keep this as the non-destructive live guard for Project Link pipeline setup. |

## Run: mp-e2e-20260705-220700

| Field | Value |
|---|---|
| Date/time | 2026-07-05 22:08:20-22:10:10 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` with working-tree business test updates |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-e2e-20260705-220700 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDestructive.test.ts` |
| Environment flags | `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE=1` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure subscription | Not used by this destructive ADO test |
| Azure resource group | Not used by this destructive ADO test |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Destructive ADO PR workflow | Pass | Created run-scoped branch `mergepilot-e2e/mp-e2e-20260705-220700`, pushed `/.mergepilot-e2e/mp-e2e-20260705-220700.md`, created draft PR `2740`, updated PR metadata, added/removed label `mergepilot-e2e-mp-e2e-20260705-220700`, added/removed reviewer `a1b6982e-2922-6109-ae4e-b71d27b2ef57`, created work item `7908`, linked/unlinked it to PR `2740`, deleted the work item, abandoned the PR, and deleted the branch. |
| Independent cleanup verification | Pass | `az repos pr show --id 2740` returned `status: abandoned`; `az repos ref list --filter heads/mergepilot-e2e/mp-e2e-20260705-220700` returned `[]`; `az boards work-item show --id 7908` returned `TF401232`, confirming the work item is deleted or no longer readable. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO branch | `mergepilot-e2e/mp-e2e-20260705-220700` | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_git/ClaimBot_API?version=GBmergepilot-e2e%2Fmp-e2e-20260705-220700` | Yes | Deleted |
| ADO PR | `2740` / `[mp-e2e-20260705-220700] MergePilot live destructive smoke - metadata updated` | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_git/ClaimBot_API/pullrequest/2740` | Yes | Abandoned |
| ADO PR label | `mergepilot-e2e-mp-e2e-20260705-220700` | PR label | Yes | Removed |
| ADO PR reviewer | `a1b6982e-2922-6109-ae4e-b71d27b2ef57` | PR reviewer | Yes | Removed |
| ADO work item | `7908` | Work item | Yes | Deleted |
| ADO work item link | `7908 -> PR 2740` | Work item relation | Yes | Unlinked |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| PR label `mergepilot-e2e-mp-e2e-20260705-220700` | cleaned | Added and removed during the test body. |
| PR reviewer `a1b6982e-2922-6109-ae4e-b71d27b2ef57` | cleaned | Added and removed during the test body. |
| Work item link `7908 -> PR 2740` | cleaned | Linked and unlinked during the test body. |
| Work item `7908` | cleaned | Deleted during the test body; independent `az boards work-item show` returned `TF401232`. |
| PR `2740` | cleaned | Abandoned; independent `az repos pr show` returned `status: abandoned`. |
| Branch `mergepilot-e2e/mp-e2e-20260705-220700` | cleaned | Deleted; independent ref lookup returned `[]`. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| PR `2740` historical record | Azure DevOps retains abandoned PR history. | None |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Current destructive PR workflow cleanup passed end-to-end. | Info | Keep this as the current destructive PR baseline for ClaimBot_API. |
| Run artifact written to `output/live-e2e/mp-e2e-20260705-220700-ado-destructive-pr.json`. | Info | Artifact is ignored output; docs contain the durable summary. |

## Run: mp-live-app-full-gate-20260705-145500

| Field | Value |
|---|---|
| Date/time | 2026-07-05 14:50:00-14:55:19 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` with working-tree business test updates |
| Test command | `.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium`; then `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` |
| Environment flags | Default run: no live/destructive flags. Live run: `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE` unset |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Azure subscription | Not used by this non-destructive app run |
| Azure resource group | Not used by this non-destructive app run |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Default Chromium browser E2E gate | Pass | 66 discovered tests: 54 passed, 12 live-app tests skipped by design because live flags were unset. Covers mocked Chat layout, Review Queue, Settings permission UX, source preview, image attachment, PR/pipeline routing, transcript, approvals, and Project Link onboarding. |
| Full live app business gate | Pass | 12/12 real UI tests passed in 3.0 minutes. Covers selected-file staging, approval denial, denial feedback replanning, stage+commit approvals, empty-commit guard, staged-only summary, remote credential redaction, dirty branch-switch approval, local bare remote push, behind-branch pull/rebase, rebase conflict recovery, and ClaimBot_API pipeline `#117` approval preparation. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| Temporary local Git repos | `mergepilot-live-*` under `%TEMP%` | Local filesystem | Yes | Removed by Playwright fixtures; cleanup probe found none remaining. |
| Temporary Project Links | run-scoped `mp-live-*` links | Local/cloud Project Link store | Yes | Deleted by Playwright fixtures. |
| ADO pipeline run | n/a | n/a | No | Destructive mode was unset; ClaimBot_API pipeline approval was prepared but not confirmed. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary local Git repos from this run | cleaned | Cleanup probe after the run found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links from this run | cleaned | Cleanup probe after the run showed only the two pre-existing links: `ClaimBot_API link` and `project link2`. |
| Prior stale Project Link `cc6b556093a0fcb6` / `mp-live-pull-rebase-20260705055337` | cleaned | This was a leftover from an earlier run and was deleted during post-run cleanup. |
| Prior stale temp repo `%TEMP%\mergepilot-live-switch-Dr4vfp` | cleaned | This was a leftover from an earlier run and was removed during post-run cleanup after path validation. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| None from this non-destructive run | All temp local resources and run-scoped Project Links were cleaned; no ADO mutation was made. | n/a |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Attempting to run the default browser gate and live-app gate in parallel can collide on Playwright's configured web server port `1420`. | Low | Run these gates sequentially or split them into separate Playwright projects with `reuseExistingServer` coordination. No product defect was observed. |

## Run: mp-live-rebase-recovery-20260705-144500

| Field | Value |
|---|---|
| Date/time | 2026-07-05 14:31:00-14:47:00 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` with working-tree rebase recovery and pipeline-selection updates |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "rebase recovery"`; `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "ClaimBot_API pipeline"` |
| Environment flags | `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1` for pipeline approval-preparation only, `MERGEPILOT_E2E_DESTRUCTIVE` unset |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Azure subscription | Not used by this non-destructive app run |
| Azure resource group | Not used by this non-destructive app run |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live app rebase conflict recovery | Pass | A temporary local repo was made 1 ahead / 1 behind `origin/main`; the UI prepared `git pull --rebase origin main`; approval caused a real `UU app.config` conflict; the transcript showed `Stopped after git pull --rebase origin main`, reported `Git is in rebase with unresolved conflicts: app.config`, and exposed enabled recovery actions. |
| Daemon confirmed-action recovery contract | Pass | `@mergepilot/daemon test -- test/serverRecoveryWorkflowRoutes.test.ts` passed 5/5, including the failed approved pull/rebase case returning `workflowKind: git`, `workflowPhase: rebase_conflict`, `status: blocked`, and `toolCallsMade[0].ok: false`. |
| ClaimBot_API pipeline approval-preparation | Pass | The live Chat UI selected pipeline `#117 ClaimBot_API`, prepared an `ado_trigger_pipeline` approval, and confirmed legacy pipeline `#108 TeBS-ClaimBot` was absent. Destructive mode was off, so the approval was denied and no new ADO run was queued. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| Temporary local Git repos | `mergepilot-live-rebase-conflict-*` under `%TEMP%` | Local filesystem | Yes | Rebase aborted and temp directory removed by Playwright fixture. |
| Temporary Project Links | `mp-live-rebase-conflict-*`; ClaimBot_API pipeline test Project Link | Local/cloud Project Link store | Yes | Deleted by Playwright fixtures. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary local Git repos | cleaned | The rebase conflict fixture aborts the in-progress rebase before deleting the temp repo root. |
| Temporary Project Links | cleaned | Each live-app test deletes its run-scoped Project Link. |
| ADO pipeline run | not created | `MERGEPILOT_E2E_DESTRUCTIVE` was unset, so the ClaimBot_API pipeline approval was not confirmed. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| None from this non-destructive run | All local temp resources were cleaned; no ADO mutation was made. | n/a |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| A failed `git pull --rebase` returned `returncode: 1` but was previously treated as a successful confirmed action, producing a misleading "updated with rebase" summary. | High | Fixed by treating non-zero tool `returncode` as failure and probing Git recovery state after failed approved Git actions. |
| Git recovery suggestions were rendered as blocked text-fill suggestions instead of actionable recovery commands. | Medium | Fixed by mapping rebase/merge recovery suggestions to structured workspace actions and allowing those actions while workflow status is `blocked`. |

## Run: mp-live-git-recovery-empty-commit-20260705-124350

| Field | Value |
|---|---|
| Date/time | 2026-07-05 12:43:50-12:46:00 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` with working-tree live-app Git recovery test |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` |
| Environment flags | `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE` unset |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Azure subscription | Not used by this local Git recovery test |
| Azure resource group | Not used by this local Git recovery test |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Focused empty-commit recovery test | Pass | `MERGEPILOT_E2E_LIVE_APP=1 ... --grep "empty commit"` passed 1/1. A clean temp repo requested `Commit staged changes... Do not stage anything`; the app explained there were no staged changes, showed no approval card, kept `HEAD` unchanged, and left `git status --short` clean. |
| Full live app business gate | Pass | 7/7 passed: selected-file staging, approval denial, approval feedback replanning, stage+commit, clean-repo empty commit guard, push to local bare remote, and ClaimBot_API pipeline `#117` approval preparation. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| Temporary local Git repos | `mergepilot-live-*` under `%TEMP%` | Local filesystem | Yes | Cleaned by Playwright fixtures. |
| Temporary Project Links | run-scoped live-app Project Links | Local/cloud Project Link store | Yes | Deleted by Playwright fixtures. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary local Git repos | cleaned | Includes the clean repo used for empty commit protection and the bare remote used for push testing. |
| Temporary Project Links | cleaned | Each live-app test deletes its run-scoped Project Link. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| None from this non-destructive run | Destructive mode was not enabled; the ClaimBot_API pipeline approval was denied rather than queued. | n/a |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| None in this run. | n/a | Continue with remaining Git recovery cases such as dirty branch switching, pull/rebase conflicts, and interrupted approval restore. |

## Run: mp-live-review-queue-pr2655-20260705-123048

| Field | Value |
|---|---|
| Date/time | 2026-07-05 12:30:48-12:38:00 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` with working-tree Review Queue route fix |
| Test command | `POST http://127.0.0.1:8787/project-links/eb2f6c876f53b33d/review-run` with `pullRequestId: 2655` and `targetBranch: mergepilot-e2e-manual-review-only`; then `GET /review-queue`; then browser check at `http://127.0.0.1:1420/#/findings` |
| Environment flags | Local running app, Azure OpenAI `gpt-4o`, local model secret source, ADO OAuth |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure subscription | Not used by this ADO PR review test |
| Azure resource group | Not used by this ADO PR review test |
| Result | Pass with product bug found and fixed |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live PR review-run | Pass | `review-run` inspected real ClaimBot_API PR `2655`, used Azure OpenAI, and returned `decisionQueue: blocked`, `decisionRiskLevel: high`, `findingCount: 9`, `tokensIn: 4760`, `tokensOut: 752`. |
| Auto-approval safety | Pass | The request used target branch `mergepilot-e2e-manual-review-only`, which is outside the auto-approval policy, and the final decision was blocked/high. No PR approval mutation was attempted. |
| Review Queue persistence before fix | Fail / product gap | `review-run` wrote local `review-history.json`, but `/review-queue` returned `configured: true`, `count: 0` because cloud storage was configured and the route only read Azure Table `ReviewHistory`. |
| Review Queue route fix | Pass | Updated `/review-queue` to merge cloud items with local review-run history and fall back to local records when Azure Table Storage is unavailable. |
| Review Queue backend verification | Pass | After daemon restart, `/review-queue` returned `configured: true`, `error: Azure storage unavailable. Showing local review history from this device.`, `count: 1`, and included PR `2655`. |
| Review Queue browser verification | Pass | Headless browser opened `http://127.0.0.1:1420/#/findings` with no route mocks and found `#2655` plus `Blocking findings or sensitive changes require a human.` |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| Local review history | `ClaimBot_API / 2655` | `C:\Users\15492\.mergepilot\review-history.json` | Yes | Retained as local Review Queue evidence for this test record. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Azure DevOps PR `2655` | not modified | This was a read/review run only; no approval, comments, labels, or state changes were made. |
| Local review history `ClaimBot_API / 2655` | retained | Retained so `/findings` can show the live-backed Review Queue item. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| Local review history for PR `2655` | Needed to verify Review Queue UI and local fallback behavior while Azure Table entity access remains unavailable. | n/a |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Review Queue cloud/local persistence mismatch: desktop `review-run` wrote local history, while `/review-queue` read only cloud history when Azure Storage was configured. | High | Fixed in `packages/daemon/src/routes/review.routes.ts`; cloud items now merge with local review history, and Azure Table failures show local review history from this device. |
| Azure Table Storage remains unavailable for Review Queue cloud history in this environment. | Medium | Grant the missing Storage Table data-plane role, then rerun a cloud-backed Review Queue persistence test. |

## Run: mp-e2e-20260705-122539

| Field | Value |
|---|---|
| Date/time | 2026-07-05 12:25:39-12:26:00 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` with working-tree business test updates |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-e2e-20260705-122539 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDestructive.test.ts` |
| Environment flags | `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE=1` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure subscription | Not used by this ADO PR mutation test |
| Azure resource group | Not used by this ADO PR mutation test |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Destructive ADO PR workflow | Pass | Created temporary branch `mergepilot-e2e/mp-e2e-20260705-122539`, pushed a run-scoped file, created draft PR `2738`, updated PR metadata, added/removed a PR label, added/removed reviewer `a1b6982e-2922-6109-ae4e-b71d27b2ef57`, created work item `7907`, linked/unlinked it to the PR, deleted the work item, abandoned the PR, and deleted the branch. |
| Independent cleanup verification | Pass | `az repos pr show --id 2738` returned `status: abandoned`; `az repos ref list --filter heads/mergepilot-e2e/mp-e2e-20260705-122539` returned `[]`; `az boards work-item show --id 7907` returned `TF401232`, confirming the work item is deleted or no longer readable. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO branch | `mergepilot-e2e/mp-e2e-20260705-122539` | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_git/ClaimBot_API?version=GBmergepilot-e2e/mp-e2e-20260705-122539` | Yes | Deleted. |
| ADO PR | `2738` | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_git/ClaimBot_API/pullrequest/2738` | Yes | Abandoned. |
| ADO PR label | `mergepilot-e2e-mp-e2e-20260705-122539` | PR `2738` | Yes | Removed. |
| ADO PR reviewer | `a1b6982e-2922-6109-ae4e-b71d27b2ef57` | PR `2738` | Yes | Removed. |
| ADO work item | `7907` | Azure Boards | Yes | Deleted after unlinking from PR. |
| ADO work item link | `7907 -> PR 2738` | Azure Boards / Repos | Yes | Removed before deleting work item. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| PR label | cleaned | Added and removed during the test body. |
| PR reviewer | cleaned | Added and removed during the test body. |
| Work item link | cleaned | Linked and unlinked during the test body. |
| Work item `7907` | cleaned | Deleted during the test body; independent `az boards work-item show` returned `TF401232`. |
| PR `2738` | cleaned | Abandoned; independent `az repos pr show` returned `status: abandoned`. |
| Branch `mergepilot-e2e/mp-e2e-20260705-122539` | cleaned | Deleted; independent ref query returned an empty list. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| PR `2738` audit history | Abandoned PR remains as Azure DevOps audit/history. | n/a |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| None in this run. | n/a | Continue expanding live PR review-quality and Review Queue records. |

## Run: mp-live-readonly-business-gates-20260705-121738

| Field | Value |
|---|---|
| Date/time | 2026-07-05 12:17:38-12:21:00 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` with working-tree business test updates |
| Test command | See Tests Run below |
| Environment flags | `MERGEPILOT_E2E_LIVE_AZURE=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_DESTRUCTIVE` unset |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Azure subscription | `a99512b0-3dc5-476f-8f43-d7db40fbc923` |
| Azure resource group | `developmentagent` |
| Result | Pass with Azure RBAC gaps recorded |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Default Chromium Playwright suite | Pass | `.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium` passed 54 tests; 6 live-app gated tests skipped by default. |
| Live Azure permission probe | Pass as diagnostic / access Partial | `MERGEPILOT_E2E_LIVE_AZURE=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts` passed and reported Storage/Cosmos/Key Vault readiness separately. |
| Live ADO discovery and pipeline read-only probe | Pass | `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts test/liveAdoPipeline.test.ts` passed 3 read-only tests and skipped the destructive pipeline queue test. |
| Live ADO PR insight daemon probe | Pass | `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts` passed 1/1 against a real ClaimBot_API PR. |
| Live app business browser gate | Pass | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` passed 6/6. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| Temporary local Git repos | `mergepilot-live-*` under `%TEMP%` | Local filesystem | Yes | Cleaned by Playwright fixtures. |
| Temporary Project Links | run-scoped live-app Project Links | Local/cloud Project Link store | Yes | Deleted by Playwright fixtures. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary local Git repos | cleaned | Live-app fixtures removed temp working repos and bare remotes. |
| Temporary Project Links | cleaned | Live-app fixtures delete run-scoped Project Links after each case. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| None from this non-destructive run | Destructive mode was not enabled; ADO was read-only. | n/a |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Storage Table entity query still lacks data-plane permission. | Medium | Grant `Storage Table Data Reader` or `Storage Table Data Contributor` on `devagentstorage001` / `CicdAgentProfiles`. |
| Cosmos SQL data-plane role assignments are missing. | Medium | Assign an appropriate Cosmos DB SQL data-plane role, preferably scoped to `devagentcosmos001/cicd-agent`. |
| Key Vault secret list still lacks data-plane permission. | Medium | Grant `Key Vault Secrets User` for reads; use `Secrets Officer` only where write tests are intended. |

## Run: mp-live-claimbot-pipeline-ui-trigger-20260705-121013

| Field | Value |
|---|---|
| Date/time | 2026-07-05 12:10:13-12:11:42 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | MergePilot working tree with frontend `confirmAction` fix and strengthened live UI test; ClaimBot_API source commit `18c62b7` |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "ClaimBot_API pipeline #117"` |
| Environment flags | `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE=1` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Azure subscription | Not used by this ADO pipeline UI trigger test |
| Azure resource group | Not used by this ADO pipeline UI trigger test |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Real Chat UI pipeline inspection | Pass | The app inspected ClaimBot_API pipeline `#117` and did not show legacy pipeline `#108`. |
| Approval card preparation | Pass | The UI produced an `ado_trigger_pipeline` approval for pipeline `#117`. |
| Approval confirmation | Pass | Fixed frontend `confirmAction()` to POST an explicit JSON body/content type so `/chat/:sessionId/confirm-action` is accepted by the daemon. |
| Remote run verification | Pass | Strengthened the Playwright test to read the latest ADO build before approval and poll until a newer run ID appears. The UI approval queued run `4674 / 20260705.8`. |
| Remote CI completion | Pass | Polled run `4674` until `completed/succeeded` at `2026-07-05 12:11:42 +08:00`. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO pipeline run | `4674` / `20260705.8` | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_build/results?buildId=4674` | Yes | Retained as ADO pipeline history. |
| Temporary Project Link | `mp-live-claimbot-pipeline-*` | Local/cloud Project Link store | Yes | Deleted by test cleanup. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Pipeline run `4674` | retained | Azure DevOps build history is an audit record and is retained by design. |
| Temporary Project Link | cleaned | Test cleanup deleted the run-scoped Project Link. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| Pipeline run `4674` | ADO audit/history record. | None |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Previous destructive UI pipeline test was a false positive because it matched generic visible text and did not prove a remote run was queued. | High | Fixed: the test now polls ADO and requires a new run ID. |
| Frontend approval confirmation posted no JSON body/content type, so Fastify rejected `/chat/:sessionId/confirm-action` with `Unsupported Media Type`. | High | Fixed in `apps/desktop/src/api/chat.ts`; `apps/desktop/src/api.test.ts` now verifies the JSON POST contract. |

## Run: mp-live-claimbot-pipeline-direct-confirm-20260705-115954

| Field | Value |
|---|---|
| Date/time | 2026-07-05 11:59:54-12:01:38 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | MergePilot working tree; ClaimBot_API source commit `18c62b7` |
| Test command | Direct daemon API diagnostic: create temporary Project Link, POST `/chat/workflow-action` with `action=trigger_pipeline`, then POST `/chat/{sessionId}/confirm-action` with JSON body `{}`. |
| Environment flags | Live daemon on `http://127.0.0.1:8787`; Azure DevOps authenticated user |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Backend approval proposal | Pass | `/chat/workflow-action` returned a pending `ado_trigger_pipeline` approval with `pipeline_id: 117` and `branch: main`. |
| Backend approval confirmation | Pass | `/chat/{sessionId}/confirm-action` returned HTTP 200 and emitted no error events. |
| Remote pipeline queue | Pass | ADO run `4673 / 20260705.7` was created for ClaimBot_API pipeline `#117`. |
| Remote CI completion | Pass | Polled run `4673` until `completed/succeeded` at `2026-07-05 12:01:38 +08:00`. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO pipeline run | `4673` / `20260705.7` | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_build/results?buildId=4673` | Yes | Retained as ADO pipeline history. |
| Temporary Project Link | `mp-direct-claimbot-pipeline-*` | Local/cloud Project Link store | Yes | Deleted by diagnostic cleanup. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Pipeline run `4673` | retained | Azure DevOps build history is an audit record and is retained by design. |
| Temporary Project Link | cleaned | Direct diagnostic deleted the temporary Project Link in `finally`. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| Pipeline run `4673` | ADO audit/history record. | None |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Backend pipeline approval execution works when called with a valid JSON request. | Info | Use UI test run `4674` as the end-to-end product proof; retain this run as backend diagnostic evidence. |

## Run: claimbot-api-pipeline-4672

| Field | Value |
|---|---|
| Date/time | 2026-07-05 11:12-11:13 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | MergePilot `92cb18a` plus working tree changes; ClaimBot_API source commit `18c62b7` |
| Test command | `az pipelines run --id 117 --branch main --org https://tebssg.visualstudio.com/ --project TeBS-ClaimBot -o json`; then polled `az pipelines runs show --id 4672 ...` |
| Environment flags | Live Azure DevOps CLI authentication; destructive in the sense that a retained pipeline history record was created |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Azure subscription | Not used by this ADO pipeline run |
| Azure resource group | Not used by this ADO pipeline run |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Verify pipeline target | Pass | `az pipelines show --id 117` reported definition `ClaimBot_API`, repository `ClaimBot_API`, default branch `refs/heads/main`, and queue status `enabled`. |
| Queue validation run | Pass | Queued build `4672` / `20260705.6` on `refs/heads/main`, source commit `18c62b707203670b70beab8cf4e3c89bec1a4b7d`. |
| Wait for remote CI result | Pass | Polled run `4672` until `completed/succeeded` at `2026-07-05T11:13:39+08:00`. |
| Verify old failure is gone | Pass | The old `images\Gojek\.DS_Store` MSBuild package-copy failure did not appear because the current run succeeded. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO pipeline run | `4672` / `20260705.6` | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_build/results?buildId=4672` | Yes | Retained as ADO pipeline history. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Pipeline run `4672` | retained | Azure DevOps build history is an audit record and is retained by design. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| Pipeline run `4672` | ADO audit/history record. | None |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| ClaimBot_API pipeline `#117` succeeds on current `main` after the `.DS_Store` source fix. | Info | Continue using pipeline `#117 ClaimBot_API` for ClaimBot_API business workflow validation. |

## Run: mp-live-azure-permission-diagnostic-20260705-105834

| Field | Value |
|---|---|
| Date/time | 2026-07-05 10:58:34 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` plus working tree changes |
| Test command | `MERGEPILOT_E2E_LIVE_AZURE=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts` |
| Environment flags | `MERGEPILOT_E2E_LIVE_AZURE=1`, `MERGEPILOT_E2E_DESTRUCTIVE` not set |
| Azure DevOps org | Not used by this Azure permission probe |
| Azure DevOps project | Not used by this Azure permission probe |
| Azure DevOps repo | Not used by this Azure permission probe |
| Azure subscription | `a99512b0-3dc5-476f-8f43-d7db40fbc923` for target resources; Azure CLI account output also showed default subscription `9e1bd067-1e30-4e20-b29a-f2343141a25e` |
| Azure resource group | `developmentagent` |
| Result | Pass as diagnostic; access remains Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Azure account token | Pass | Azure CLI returned user `Zhou.Ping@totalebizsolutions.com`. |
| Storage account ARM read | Pass | Read metadata for `devagentstorage001`. |
| Storage Table list | Pass | Listed table `CicdAgentProfiles`. |
| Storage Table entity query | Fail diagnostic | Missing Storage Table entity data-plane permission. |
| Cosmos account ARM read | Pass | Read metadata for `devagentcosmos001`. |
| Cosmos SQL database list | Pass | Listed SQL database `cicd-agent`. |
| Cosmos SQL role assignments | Fail diagnostic | No Cosmos SQL data-plane role assignments were returned. |
| Key Vault ARM read | Pass | Read metadata for `devagentkv001`; RBAC authorization is enabled. |
| Key Vault secret list | Fail diagnostic | Caller lacks `Microsoft.KeyVault/vaults/secrets/readMetadata/action`; grant `Key Vault Secrets User` for reads. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| None |  |  | No | No cleanup required |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| None | cleaned | Read-only diagnostic probe did not create Azure resources. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| None |  |  |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Storage Table entity data-plane access is still missing. | Medium | Grant `Storage Table Data Reader` or `Storage Table Data Contributor` on `devagentstorage001` / `CicdAgentProfiles`. |
| Cosmos SQL data-plane role assignment is still missing. | Medium | Assign Cosmos DB Built-in Data Contributor scoped to `devagentcosmos001/cicd-agent` where possible. |
| Key Vault secret metadata/read access is still missing. | Medium | Grant `Key Vault Secrets User` on `devagentkv001`; grant `Secrets Officer` only if writes are needed. |

## Run: mp-live-app-business-suite-20260705-105641

| Field | Value |
|---|---|
| Date/time | 2026-07-05 10:56:41 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` plus working tree changes |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` |
| Environment flags | `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE` not set |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Azure subscription | Not used by this live app business run |
| Azure resource group | Not used by this live app business run |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Selected-file staging through Chat UI | Pass | Approved staging only `README.md`; another dirty file remained unstaged. |
| Approval denial | Pass | Denied a staging approval and verified no files were staged. |
| Approval denial feedback | Pass | Denied the first approval with corrective feedback, then approved the revised action and staged only the revised file. |
| Consecutive stage and commit approvals | Pass | Approved `git add` and follow-up `git commit`; the temp repo got one new commit and ended clean. |
| Push current branch to local bare remote | Pass after selector fix | Initial full-suite run exposed a Playwright strict selector collision with History entries containing `Commit or push`. The selector now exact-matches the right-panel command, and the focused case plus full suite passed. |
| ClaimBot_API pipeline `#117` approval preparation | Pass | Inspected the real pipeline and prepared an `ado_trigger_pipeline` approval. Because destructive mode was off, the approval was denied and no run was queued. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| Local temp Git repos | `%TEMP%\mergepilot-live-stage-*`, `%TEMP%\mergepilot-live-push-*` | Local filesystem | Yes | Deleted by test cleanup. |
| Project Links | `mp-live-*` | Local/cloud Project Link store | Yes | Deleted by test cleanup. |
| ADO pipeline run | None |  | No | Destructive mode was off. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary repos | cleaned | Each test removes its temp repo/root in `finally`. |
| Temporary Project Links | cleaned | Post-run `/project-links` check showed only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | cleaned | No run was created. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| None |  |  |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| History entries can pollute broad role selectors in live UI tests. | Low | Fixed in `tests/e2e/live-app-business.spec.ts` by exact-matching the `Commit or push` and `Push branch` controls. |
| Full live-app business suite now covers Git write approvals plus ClaimBot_API pipeline `#117` approval preparation. | Info | Run destructive pipeline approval only when a retained ADO build record is acceptable. |

## Run: mp-live-claimbot-pipeline-ui-approval-20260705-104655

| Field | Value |
|---|---|
| Date/time | 2026-07-05 10:46:55 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` plus working tree changes |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "ClaimBot_API pipeline #117"` |
| Environment flags | `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE` not set |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Azure subscription | Not used by this ADO pipeline UI approval test |
| Azure resource group | Not used by this ADO pipeline UI approval test |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Running app health | Pass | Frontend `http://127.0.0.1:1420` and daemon `http://127.0.0.1:8787` were already running. |
| Temporary Project Link creation | Pass | Created a run-scoped Project Link for repo `ClaimBot_API`, project `TeBS-ClaimBot`, and pipeline `#117 ClaimBot_API`. |
| Real Chat UI pipeline inspection | Pass | Clicked `Open Pipelines workspace`; the transcript showed ClaimBot_API pipeline `#117` evidence and did not show pipeline `#108` from the separate TeBS-ClaimBot repository mapping. |
| Real Chat UI trigger approval | Pass | Clicked `Trigger pipeline`; the app prepared an `ado_trigger_pipeline` approval for pipeline `#117`. |
| Destructive queue gate | Pass | Because `MERGEPILOT_E2E_DESTRUCTIVE` was not set, the test denied the approval and did not queue a pipeline run. |
| Cleanup verification | Pass | `/project-links` returned only the two pre-existing links after the test; no `mp-live-claimbot-pipeline-*` link remained. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| Project Link | `mp-live-claimbot-pipeline-*` | Local/cloud Project Link store | Yes | Deleted by test cleanup. |
| ADO pipeline run | None |  | No | The approval was denied because destructive mode was off. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary Project Link | cleaned | Post-run `/project-links` check showed only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | cleaned | No run was created. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| None |  |  |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The running app can inspect and prepare approval for the dedicated ClaimBot_API pipeline `#117` without using legacy pipeline `#108`. | Info | Use the destructive gate only when a retained ADO run record is acceptable. |

## Run: mp-live-claimbot-pipeline-readonly-20260705-103558

| Field | Value |
|---|---|
| Date/time | 2026-07-05 10:35:58 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` plus working tree changes |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoPipeline.test.ts` |
| Environment flags | `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE` not set |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Azure subscription | Not used by this ADO pipeline read-only test |
| Azure resource group | Not used by this ADO pipeline read-only test |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live pipeline recent-run list | Pass | Listed recent runs for ClaimBot_API pipeline `#117`. Recent history includes successful runs on `main` after commit `18c62b7` and successful feature-branch run `4671`. |
| Live failed-run diagnostic evidence | Pass | Read timeline/log evidence for the historical failed run caused by missing `.DS_Store` publish content. |
| Destructive queue gate | Pass | Queue test was skipped because `MERGEPILOT_E2E_DESTRUCTIVE` was not set. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| None |  |  | No | No cleanup required |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| None | cleaned | Read-only pipeline probe did not create Azure DevOps resources. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| None |  |  |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| ClaimBot_API business testing is pinned to pipeline `#117 ClaimBot_API`. | Info | Do not use legacy pipeline `#108 TeBS-ClaimBot` for ClaimBot_API workflow validation unless specifically testing that older repo/pipeline. |
| The historical `.DS_Store` packaging failure is resolved on current ClaimBot_API `main`. | Info | Failed run `20260705.1` used old commit `540f9ad`; later runs on `18c62b7` succeeded. |

## Run: mp-e2e-20260705-091420

| Field | Value |
|---|---|
| Date/time | 2026-07-05 09:14:20 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` plus working tree changes |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-e2e-20260705-091420 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDestructive.test.ts` |
| Environment flags | `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE=1` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure subscription | Not used by this ADO PR test |
| Azure resource group | Not used by this ADO PR test |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Destructive PR default gate | Pass | Without the destructive flags, `test/liveAdoDestructive.test.ts` skipped 1/1 tests. |
| Create isolated source branch | Pass | Created `mergepilot-e2e/mp-e2e-20260705-091420` from `main`. |
| Push tagged test commit | Pass | Added `/.mergepilot-e2e/mp-e2e-20260705-091420.md` on the isolated branch. |
| Create draft PR | Pass | Created draft PR `2732` against `main`. |
| Update PR metadata | Pass | Updated PR title and description with the run ID. |
| Collect PR insight input data | Pass | Read PR details, changed files, threads, work items, policy evaluations, and builds for the created PR. |
| Cleanup PR and branch | Pass | PR `2732` was abandoned; branch `mergepilot-e2e/mp-e2e-20260705-091420` was deleted. |
| Independent cleanup verification | Pass | Azure DevOps REST confirmed PR `2732` status `abandoned` and branch ref count `0`. |
| Core typecheck | Pass | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck` passed after adding the destructive-run artifact writer. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO branch | `mergepilot-e2e/mp-e2e-20260705-091420` |  | Yes | Deleted by test cleanup. |
| ADO PR | `2732` | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_git/ClaimBot_API/pullrequest/2732` | Yes | Abandoned by test cleanup. |
| ADO Git file | `/.mergepilot-e2e/mp-e2e-20260705-091420.md` |  | Yes | Removed when source branch was deleted. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| PR `2732` | cleaned | Test artifact recorded `abandoned`; independent REST check confirmed status `abandoned`. |
| Branch `mergepilot-e2e/mp-e2e-20260705-091420` | cleaned | Test artifact recorded `deleted`; independent REST check returned branch ref count `0`. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| Abandoned PR `2732` audit record | Azure DevOps keeps PR audit history after abandonment. | None |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Destructive PR branch/PR lifecycle works for ClaimBot_API with automatic cleanup. | Info | Next ADO gap: add reviewer/tag/work-item mutation and seeded PR insight quality assertions against the created PR. |
| Test now writes an auditable artifact. | Info | Artifact: `output/live-e2e/mp-e2e-20260705-091420-ado-destructive-pr.json`. |

## Run: mp-e2e-20260705-090052

| Field | Value |
|---|---|
| Date/time | 2026-07-05 09:00:52 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` plus working tree changes |
| Test command | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts`; then `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts` |
| Environment flags | First run: `MERGEPILOT_E2E_LIVE_ADO` not set; live run: `MERGEPILOT_E2E_LIVE_ADO=1`; `MERGEPILOT_E2E_DESTRUCTIVE` not set |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Azure subscription | Not used by this ADO discovery test |
| Azure resource group | Not used by this ADO discovery test |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live ADO discovery default gate | Pass | Without `MERGEPILOT_E2E_LIVE_ADO=1`, `test/liveAdoDiscovery.test.ts` skipped 1/1 tests. |
| Azure DevOps account token | Pass | The test acquired an Azure DevOps token from Azure CLI for resource `499b84ac-1321-427f-aa17-267ca6975798`. |
| Project discovery | Pass | Project list for org `tebssg` contained `TeBS-ClaimBot`. |
| Repository discovery | Pass | Repository list for project `TeBS-ClaimBot` contained `ClaimBot_API` and branch metadata included `main`. |
| Pipeline discovery | Pass | Repository-filtered build definition discovery for `ClaimBot_API` contained pipeline `117` / `ClaimBot_API`. |
| Core typecheck | Pass | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck` passed after adding the probe. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| None |  |  | No | No cleanup required |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| None | cleaned | Read-only discovery did not create Azure DevOps resources. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| None |  |  |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Live ADO discovery maps ClaimBot_API to pipeline `#117 ClaimBot_API`. | Info | Keep future ClaimBot_API business tests on the pipeline discovered for the active repository. |

## Run: mp-e2e-20260705-085306

| Field | Value |
|---|---|
| Date/time | 2026-07-05 08:53:06 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` plus working tree changes |
| Test command | `MERGEPILOT_E2E_LIVE_AZURE=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts` |
| Environment flags | `MERGEPILOT_E2E_LIVE_AZURE=1`, `MERGEPILOT_E2E_LIVE_ADO` not set, `MERGEPILOT_E2E_DESTRUCTIVE` not set |
| Azure DevOps org | Not used |
| Azure DevOps project | Not used |
| Azure DevOps repo | Not used |
| Azure subscription | `Visual Studio Enterprise Subscription` / `a99512b0-3dc5-476f-8f43-d7db40fbc923` |
| Azure resource group | `developmentagent` |
| Result | Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live Azure permission probe default gate | Pass | Without `MERGEPILOT_E2E_LIVE_AZURE=1`, `test/liveAzurePermissions.test.ts` skipped 1/1 tests. |
| Live Azure permission probe | Pass as diagnostic | With `MERGEPILOT_E2E_LIVE_AZURE=1`, `test/liveAzurePermissions.test.ts` passed 1/1 and reported each permission area separately. |
| Azure account | Pass | Azure CLI authenticated as `Zhou.Ping@totalebizsolutions.com`; probe commands target subscription `a99512b0-3dc5-476f-8f43-d7db40fbc923`. |
| Storage account ARM | Pass | Storage account `devagentstorage001` is visible. |
| Storage Table list | Pass | Table list returned `CicdAgentProfiles`. |
| Storage Table entity query | Fail | Current user lacks Storage Table data-plane Reader/Contributor for entity queries. |
| Cosmos account ARM | Pass | Cosmos account `devagentcosmos001` is visible. |
| Cosmos SQL database list | Pass | SQL database `cicd-agent` is visible. |
| Cosmos SQL role assignments | Fail | No Cosmos SQL data-plane role assignments were returned. |
| Key Vault ARM | Pass | Key Vault `devagentkv001` is visible and RBAC-enabled. |
| Key Vault secret list | Fail | `Forbidden`; current user lacks secret metadata/data-plane access. |
| Core typecheck | Pass | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck` passed after adding the probe. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| None |  |  | No | No cleanup required |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| None | cleaned | Read-only probe did not create Azure resources. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| None |  |  |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Current user lacks Storage Table entity data-plane role. | High | Assign `Storage Table Data Reader` for read-only probes or `Storage Table Data Contributor` for MergePilot Project Link/review history writes. |
| Cosmos SQL data-plane role assignments are absent. | High | Assign `Cosmos DB Built-in Data Contributor` or scoped equivalent for session persistence. |
| Current user lacks Key Vault secret data-plane role. | Medium | Assign `Key Vault Secrets User` for reads; assign `Key Vault Secrets Officer` only if MergePilot should write/update secrets. |

## Run: mp-e2e-20260705-062430

| Field | Value |
|---|---|
| Date/time | 2026-07-05 06:24:30 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | MergePilot working tree, ClaimBot_API source commit `18c62b7` |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-e2e-20260705-062430 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoPipeline.test.ts` |
| Environment flags | `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE=1` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Azure subscription | Not used by this ADO pipeline test |
| Azure resource group | Not used by this ADO pipeline test |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live pipeline recent-run list | Pass | Listed recent ClaimBot_API pipeline `#117` runs. |
| Live failed-run diagnostic evidence | Pass | Read timeline/log evidence for the latest failed run when present. |
| Queue ClaimBot_API pipeline run | Pass | Queued run `4667` / `20260705.3` on `refs/heads/main`, source commit `18c62b707203670b70beab8cf4e3c89bec1a4b7d`. |
| Read queued run | Pass | The test read the queued run back through the pipeline API. |
| Wait for remote CI result | Pass | Follow-up polling observed run `4667` reach `completed/succeeded` at `2026-07-05T06:27:38.98059+08:00`. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO pipeline run | `4667` / `20260705.3` | `https://tebssg.visualstudio.com/3f914df8-6fd8-4f16-adf4-bf790a87efd2/_build/results?buildId=4667` | Yes | Not deletable through normal ADO pipeline APIs; retained as test run history. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Pipeline run `4667` | retained | Azure DevOps pipeline run history is retained by design. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| Pipeline run `4667` | ADO build/pipeline audit history. | None |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| ClaimBot_API pipeline `#117` destructive queue path now has a current live record and succeeded after the `.csproj` source fix. | Info | Keep future pipeline destructive runs on `#117`, not legacy `#108`. |

## Run: mp-live-claimbot-pipeline-fix-20260705-043100

| Field | Value |
|---|---|
| Date/time | 2026-07-05 04:31:00 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | MergePilot working tree, plus external ClaimBot_API commit `18c62b7` |
| Test command | Manual source fix, `git push origin main`, then daemon `/chat/workflow-action` with `inspect_pipeline` for pipeline `117` |
| Environment flags | Live ADO resources used; destructive in the sense that ClaimBot_API `main` was updated intentionally |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Azure subscription | Not used by this ADO pipeline validation |
| Azure resource group | Not used by this ADO pipeline validation |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Inspect previous failed run | Pass | Pipeline #117 run `4665 / 20260705.1` failed in `VSBuild` because `BotToSharePoint.csproj` referenced missing `images\Gojek\.DS_Store`. |
| Isolate source fix | Pass | Created temporary worktree `C:\Users\15492\Develop\ClaimBot_API-main-pipeline-fix` so unrelated dirty files in `C:\Users\15492\Develop\ClaimBot_API Nov 2025\ClaimBot_API` were not staged. |
| Validate project content references | Pass | Parsed `BotToSharePoint/BotToSharePoint.csproj`; `MissingContentItemCount=0` after the fix. |
| Commit and push fix | Pass | Pushed `18c62b7 fix pipeline content includes` to ClaimBot_API `origin/main`. |
| Validate new pipeline run | Pass | MergePilot `inspect_pipeline` read latest run `4666 / 20260705.2` as `completed/succeeded`. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO Git commit | `18c62b7 fix pipeline content includes` | `https://tebssg.visualstudio.com/TeBS-ClaimBot/_git/ClaimBot_API` | Yes | Retained intentionally as the source fix. |
| ADO pipeline run | `4666` / `20260705.2` | `https://tebssg.visualstudio.com/3f914df8-6fd8-4f16-adf4-bf790a87efd2/_build/results?buildId=4666` | Yes | Retained as pipeline history. |
| Local Git worktree | `C:\Users\15492\Develop\ClaimBot_API-main-pipeline-fix` |  | Yes | Removed after validation. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| ClaimBot_API commit `18c62b7` | retained | This is the production source fix for pipeline #117. |
| Pipeline run `4666` | retained | Azure DevOps build history is an audit record. |
| Temporary worktree | cleaned | Removed after pipeline validation. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| ClaimBot_API commit `18c62b7` | Required fix for the real pipeline failure. | None |
| Pipeline run `4666` | ADO audit/history record. | None |
| None |  |  |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Azure CLI `az pipelines` was blocked locally by a permission error reading `C:\Users\15492\.azure\cliextensions\containerapp\azext_containerapp\azext_metadata.json`. | Low | Used MergePilot's native daemon `inspect_pipeline` path instead; optionally repair Azure CLI extension permissions later. |
| The active ClaimBot_API workspace still contains unrelated dirty files plus a local copy of the `.csproj` fix. | Medium | Do not stage those files accidentally; decide later whether to reset/rebase the active workspace or keep the local changes for feature branch work. |

## Run: mp-live-readonly-20260705-013411

| Field | Value |
|---|---|
| Date/time | 2026-07-05 01:34:11 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | Working tree, not committed |
| Test command | Azure CLI probes, Azure DevOps REST probes, daemon `/healthz`, `/project-links`, `/chat/history`, Playwright `tests/e2e/chat-layout.spec.ts` |
| Environment flags | `MERGEPILOT_E2E_LIVE_ADO` not set, `MERGEPILOT_E2E_LIVE_AZURE` not set, `MERGEPILOT_E2E_DESTRUCTIVE` not set |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure subscription | `Visual Studio Enterprise Subscription` / `a99512b0-3dc5-476f-8f43-d7db40fbc923` |
| Azure resource group | `developmentagent` |
| Result | Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Runtime health | Pass | `/healthz` returned `ok:true`, Azure OpenAI `gpt-4o` available, `cloudSecrets:false`, `cloudSessions:true`. |
| Runtime Project Links | Pass with fallback | `/project-links` returned local Project Links after cloud Table consent failure was classified as fallback-worthy. |
| Runtime chat history | Pass | `/chat/history` returned persisted sessions from the configured session store. |
| Azure Storage ARM read | Pass | Storage account `devagentstorage001` is visible. |
| Azure Storage Table list | Pass | Table names can be listed. |
| Azure Storage Table entity query | Fail | Current user lacks Storage Table data-plane Reader/Contributor for entity queries. |
| Azure Cosmos ARM/database list | Pass | Cosmos account and SQL database `cicd-agent` are visible. |
| Azure Cosmos SQL data role assignment list | Fail | No SQL data-plane role assignments were returned. |
| Azure Key Vault ARM read | Pass | Key Vault `devagentkv001` is visible and RBAC-enabled. |
| Azure Key Vault secret list | Fail | `ForbiddenByRbac`; current user lacks secret data-plane access. |
| Azure DevOps project/repo discovery | Pass | Projects and repos are visible through Azure DevOps REST token. |
| Azure DevOps active PR list | Pass | Active PRs are visible for `ClaimBot_API`. |
| Azure DevOps pipeline definition list | Pass | Build definitions are visible. |
| App-level browser E2E | Pass | `tests/e2e/chat-layout.spec.ts`: 42/42 passed. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| None |  |  | No | No cleanup required |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| None | cleaned | Read-only probe did not create resources. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| None |  |  |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| DevCICDAgent lacks consent for cloud resource scopes used by runtime Table access. | High | Add delegated API permissions/admin consent for Azure Storage, Cosmos DB, and Key Vault, then sign in again. |
| Current user lacks Storage Table entity data-plane role. | High | Assign `Storage Table Data Contributor` or equivalent at `devagentstorage001`. |
| Current user lacks Key Vault secret data-plane role. | Medium | Assign `Key Vault Secrets User`; `Secrets Officer` only if MergePilot should write secrets. |
| Cosmos SQL data-plane role assignments are absent. | High | Assign `Cosmos DB Built-in Data Contributor` or a scoped custom role for session persistence. |
| Runtime Project Links previously returned HTTP 500 when cloud consent was missing. | Fixed | Daemon now falls back to local Project Links for AADSTS65001/consent failures. |

## Run: mp-e2e-20260705-021141

| Field | Value |
|---|---|
| Date/time | 2026-07-05 02:11:41 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` plus working tree changes |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-e2e-20260705-021141 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDestructive.test.ts` |
| Environment flags | `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE=1` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` / `2e209da7-5290-42bc-affe-d0f9530360bd` |
| Azure subscription | Not used by this destructive ADO test |
| Azure resource group | Not used by this destructive ADO test |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Resolve Azure CLI token for Azure DevOps | Pass | Test resolves Windows Azure CLI from `C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd` when project-local PATH does not include `az`. |
| Resolve repository ID | Pass | `ClaimBot_API` resolved to `2e209da7-5290-42bc-affe-d0f9530360bd`. |
| Create isolated branch | Pass | Created `refs/heads/mergepilot-e2e/mp-e2e-20260705-021141` from `main`. |
| Push tagged test commit | Pass | Used ADO pushes API version `7.1`; `7.1-preview.1` returned HTTP 405 during harness hardening and was corrected. |
| Create draft PR | Pass | Created draft PR `2729` targeting `main`. |
| Verify PR visibility | Pass | PR was visible in active PR query before cleanup. |
| Abandon PR | Pass | PR `2729` now has status `abandoned`. |
| Delete source branch | Pass | Follow-up refs query returned no branch. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO branch | `refs/heads/mergepilot-e2e/mp-e2e-20260705-021141` |  | Yes | Deleted |
| ADO PR | `2729` / `[mp-e2e-20260705-021141] MergePilot live destructive smoke` | `https://dev.azure.com/tebssg/3f914df8-6fd8-4f16-adf4-bf790a87efd2/_apis/git/repositories/2e209da7-5290-42bc-affe-d0f9530360bd/pullRequests/2729` | Yes | Abandoned |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| `refs/heads/mergepilot-e2e/mp-e2e-20260705-021141` | cleaned | Post-run refs query returned no branch. |
| PR `2729` | cleaned | PR status is `abandoned`; Azure DevOps retains abandoned PR history by design. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| Abandoned PR `2729` audit record | Azure DevOps keeps PR history after abandon. | None |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Project-local test PATH does not include Azure CLI. | Low | The live test now resolves common Windows Azure CLI paths and supports `MERGEPILOT_E2E_AZURE_CLI_PATH` / `AZURE_CLI_PATH`. |
| ADO pushes API returns HTTP 405 with `api-version=7.1-preview.1` for POST in this environment. | Medium | The destructive test uses `api-version=7.1` for pushes while keeping refs/PRs on existing project helper behavior. |
| Destructive PR smoke covered branch, commit, PR create, PR visibility, PR abandon, and branch cleanup only in this run. | Medium | A later run adds PR metadata update coverage; PR insight against the created PR and reviewer/tag/work-item mutation remain follow-ups. |

## Run: mp-e2e-20260705-022646

| Field | Value |
|---|---|
| Date/time | 2026-07-05 02:26:46 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` plus working tree changes |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-e2e-20260705-022646 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDestructive.test.ts` |
| Environment flags | `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE=1` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` / `2e209da7-5290-42bc-affe-d0f9530360bd` |
| Azure subscription | Not used by this destructive ADO test |
| Azure resource group | Not used by this destructive ADO test |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Resolve Azure CLI token for Azure DevOps | Pass | Reused the gated live ADO auth path. |
| Create isolated branch | Pass | Created `refs/heads/mergepilot-e2e/mp-e2e-20260705-022646` from `main`. |
| Push tagged test commit | Pass | Added a run-scoped file under `/.mergepilot-e2e/`. |
| Create draft PR | Pass | Created draft PR `2730` targeting `main`. |
| Update PR metadata | Pass | Updated title to `[mp-e2e-20260705-022646] MergePilot live destructive smoke - metadata updated` and updated the description. |
| Verify PR visibility and metadata | Pass | Active PR query returned PR `2730` with the updated title before cleanup. |
| Abandon PR | Pass | PR `2730` now has status `abandoned`. |
| Delete source branch | Pass | Follow-up refs query returned no branch. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO branch | `refs/heads/mergepilot-e2e/mp-e2e-20260705-022646` |  | Yes | Deleted |
| ADO PR | `2730` / `[mp-e2e-20260705-022646] MergePilot live destructive smoke - metadata updated` | `https://dev.azure.com/tebssg/3f914df8-6fd8-4f16-adf4-bf790a87efd2/_apis/git/repositories/2e209da7-5290-42bc-affe-d0f9530360bd/pullRequests/2730` | Yes | Abandoned |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| `refs/heads/mergepilot-e2e/mp-e2e-20260705-022646` | cleaned | Post-run refs query returned no branch. |
| PR `2730` | cleaned | PR status is `abandoned`; Azure DevOps retains abandoned PR history by design. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| Abandoned PR `2730` audit record | Azure DevOps keeps PR history after abandon. | None |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Destructive PR smoke now covers create branch, push commit, create draft PR, update title/description, verify active PR metadata, abandon PR, and delete branch. | Info | Add PR insight against the created PR and reviewer/tag/work-item mutation in later gated cases. |

## Run: mp-e2e-20260705-023126

| Field | Value |
|---|---|
| Date/time | 2026-07-05 02:31:26 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` plus working tree changes |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-e2e-20260705-023126 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDestructive.test.ts` |
| Environment flags | `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE=1` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` / `2e209da7-5290-42bc-affe-d0f9530360bd` |
| Azure subscription | Not used by this destructive ADO test |
| Azure resource group | Not used by this destructive ADO test |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Resolve Azure CLI token for Azure DevOps | Pass | Reused the gated live ADO auth path. |
| Create isolated branch | Pass | Created `refs/heads/mergepilot-e2e/mp-e2e-20260705-023126` from `main`. |
| Push tagged test commit | Pass | Added `/.mergepilot-e2e/mp-e2e-20260705-023126.md`. |
| Create draft PR | Pass | Created draft PR `2731` targeting `main`. |
| Update PR metadata | Pass | Updated title to `[mp-e2e-20260705-023126] MergePilot live destructive smoke - metadata updated` and updated the description. |
| Verify active PR metadata | Pass | Active PR query returned PR `2731` with the updated title before cleanup. |
| Collect PR insight inputs | Pass | Collected PR detail, changes, threads, work items, policy evaluations, and source-branch build arrays. |
| Verify PR changed file list | Pass | Change list included `/.mergepilot-e2e/mp-e2e-20260705-023126.md`. |
| Abandon PR | Pass | PR `2731` now has status `abandoned`. |
| Delete source branch | Pass | Follow-up refs query returned no branch. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO branch | `refs/heads/mergepilot-e2e/mp-e2e-20260705-023126` |  | Yes | Deleted |
| ADO PR | `2731` / `[mp-e2e-20260705-023126] MergePilot live destructive smoke - metadata updated` | `https://dev.azure.com/tebssg/3f914df8-6fd8-4f16-adf4-bf790a87efd2/_apis/git/repositories/2e209da7-5290-42bc-affe-d0f9530360bd/pullRequests/2731` | Yes | Abandoned |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| `refs/heads/mergepilot-e2e/mp-e2e-20260705-023126` | cleaned | Post-run refs query returned no branch. |
| PR `2731` | cleaned | PR status is `abandoned`; Azure DevOps retains abandoned PR history by design. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| Abandoned PR `2731` audit record | Azure DevOps keeps PR history after abandon. | None |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Destructive PR smoke now covers PR insight input data collection for a created PR. | Info | Add a full daemon-route PR insight test with golden summary assertions. |
| Reviewer/tag/work-item mutations are still not covered by a destructive live test. | Medium | Add run-scoped reviewer/tag/work-item mutation tests with cleanup and records. |

## Run: mp-e2e-20260705-022155

| Field | Value |
|---|---|
| Date/time | 2026-07-05 02:21:55 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | `92cb18a` plus working tree changes |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-e2e-20260705-022155 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoPipeline.test.ts` |
| Environment flags | `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE=1` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps pipeline | `108` / `TeBS-ClaimBot` |
| Azure DevOps repo | Pipeline definition repository `TeBS-ClaimBot` / `46425bbf-7d5c-4770-95a9-500cda8435d6` |
| Azure subscription | Not used by this ADO pipeline test |
| Azure resource group | Not used by this ADO pipeline test |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Default safety gate | Pass | `test/liveAdoPipeline.test.ts` skips both tests unless live flags are set. |
| Live pipeline inspect | Pass | Listed recent pipeline #108 runs. Latest historical runs included `4638`, `4637`, `4631`, `4630`, `4629`, and `4628`. |
| Pipeline branch preflight | Pass | Pipeline default branches `main` and `develop` did not contain `/azure-pipelines.yml`; test scanned repo branches and selected `production-pipelines`, which does contain the YAML file. |
| Queue pipeline run | Pass | Queued run `4664` / `20260705.1`. |
| Read queued run | Pass | Pipeline run was read back through the Pipelines API. |
| Read build record | Pass | Build record `4664` showed `status=inProgress`, `sourceBranch=refs/heads/production-pipelines`, and URL `https://dev.azure.com/tebssg/3f914df8-6fd8-4f16-adf4-bf790a87efd2/_build/results?buildId=4664`. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO pipeline run | `4664` / `20260705.1` | `https://dev.azure.com/tebssg/3f914df8-6fd8-4f16-adf4-bf790a87efd2/_build/results?buildId=4664` | Yes | Not deletable through normal ADO pipeline APIs; retained as test run history. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Pipeline run `4664` | retained | Azure DevOps pipeline run history is retained by design; record the run ID and URL. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| Pipeline run `4664` | ADO build/pipeline runs are audit records and cannot always be deleted. | None |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Queueing pipeline #108 with branch `main` failed because `/azure-pipelines.yml` is missing in the pipeline repository on `main`. | Medium | The live pipeline test no longer blindly defaults to `main`. |
| Queueing pipeline #108 without a branch used definition default `develop`, which also lacks `/azure-pipelines.yml`. | Medium | The test now preflights the pipeline definition repository and selects a branch containing the YAML file. |
| Pipeline #108 definition points to repo `TeBS-ClaimBot`, not `ClaimBot_API`. | Medium | Project Link pipeline matching should show repository/yaml/branch details so users understand which repo a pipeline runs against. |
| Build timeline request for run `4664` returned a controller/path error. | Medium | Add a dedicated timeline/log probe and update pipeline diagnosis code if the current Build Timeline endpoint is not compatible with this pipeline/run shape. |

## Run: claimbot-api-pipeline-4671

| Field | Value |
|---|---|
| Date/time | 2026-07-05 09:39 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_ADO_PIPELINE_BRANCH=feature/cicd-agent-20260514-111313 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoPipeline.test.ts` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Azure DevOps repo | `ClaimBot_API` |
| Branch | `feature/cicd-agent-20260514-111313` |
| ClaimBot_API commits under test | `3668442 fix: remove stale package content entries`; `0649066 ci: add Azure Pipelines definition to feature branch` |
| Pipeline run | `4671` |
| Pipeline URL | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_build/results?buildId=4671` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live pipeline inspect | Pass | Listed recent runs for ClaimBot_API pipeline `#117`. |
| Failed-run evidence read | Pass | Read timeline/log evidence for the latest failed historical run before the fix. |
| Queue pipeline run | Pass | First queue attempt exposed missing `/azure-pipelines.yml` on the feature branch; after adding the YAML file, the run queued successfully. |
| Remote CI completion | Pass | Polled run `4671` until `state=completed` and `result=succeeded`. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO pipeline run | `4671` | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_build/results?buildId=4671` | Yes | Retained as ADO pipeline history. |
| Git commit | `3668442` | ClaimBot_API `feature/cicd-agent-20260514-111313` | Yes | Kept as source fix. |
| Git commit | `0649066` | ClaimBot_API `feature/cicd-agent-20260514-111313` | Yes | Kept as branch pipeline definition fix. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Pipeline run `4671` | retained | Azure DevOps pipeline runs are audit history. |
| ClaimBot_API branch commits | retained | Required to keep the feature branch queueable and the publish package valid. |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The initial feature-branch queue failed because pipeline #117 could not find `/azure-pipelines.yml` on `feature/cicd-agent-20260514-111313`. | High | Added the same YAML definition present on `origin/main` to the test branch and pushed commit `0649066`. |
| The original MSBuild package failure was caused by stale `.DS_Store` publish content in `BotToSharePoint.csproj`. | High | Pushed commit `3668442`; local content validation and remote pipeline run `4671` both passed. |
| Only the ClaimBot_API repository pipeline was used for this run. | Info | Continue using pipeline `#117 ClaimBot_API` for ClaimBot_API business workflow tests. |

## Run: mp-e2e-20260705-095400

| Field | Value |
|---|---|
| Date/time | 2026-07-05 09:54 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-e2e-20260705-095400 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDestructive.test.ts` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Create isolated branch | Pass | Created `refs/heads/mergepilot-e2e/mp-e2e-20260705-095400` from `main`. |
| Push tagged test commit | Pass | Added `/.mergepilot-e2e/mp-e2e-20260705-095400.md` on the isolated branch. |
| Create draft PR | Pass | Created PR `2733` with run-scoped title and description. |
| Update PR metadata | Pass | Updated PR title/description through the typed PR mutation path. |
| Add/remove PR label | Pass | Added and removed `mergepilot-e2e-mp-e2e-20260705-095400` during the test body. |
| Collect PR insight input data | Pass | Read PR detail, changes, threads, work items, policy evaluations, and builds for the created PR. |
| Cleanup | Pass | Abandoned PR `2733` and deleted the source branch. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO branch | `refs/heads/mergepilot-e2e/mp-e2e-20260705-095400` |  | Yes | Deleted |
| ADO PR | `2733` / `[mp-e2e-20260705-095400] MergePilot live destructive smoke - metadata updated` | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_git/ClaimBot_API/pullrequest/2733` | Yes | Abandoned |
| ADO PR label | `mergepilot-e2e-mp-e2e-20260705-095400` | PR `2733` | Yes | Removed |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| `refs/heads/mergepilot-e2e/mp-e2e-20260705-095400` | cleaned | Independent refs query returned `0`. |
| PR `2733` | cleaned | Independent PR query returned status `abandoned`; Azure DevOps retains abandoned PR history by design. |
| PR label `mergepilot-e2e-mp-e2e-20260705-095400` | cleaned | The test removed the label before PR abandonment. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| Abandoned PR `2733` audit record | Azure DevOps keeps PR history after abandon. | None |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Live PR label add/remove works with the current account and can be cleaned up inside the destructive PR smoke. | Info | Keep this in the destructive PR test as the first live PR mutation cleanup gate. |
| Reviewer and work-item link mutations are still only covered by non-destructive registry contracts. | Medium | Add live reviewer/work-item mutation only after selecting safe identities/work items and cleanup rules. |

## Run: mp-e2e-20260705-095900

| Field | Value |
|---|---|
| Date/time | 2026-07-05 09:59 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-e2e-20260705-095900 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDestructive.test.ts` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Result | Fail, cleaned |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Create isolated branch | Pass | Created `refs/heads/mergepilot-e2e/mp-e2e-20260705-095900`. |
| Create draft PR | Pass | Created PR `2734`. |
| Add/remove PR label | Pass | Added and removed `mergepilot-e2e-mp-e2e-20260705-095900`. |
| Add reviewer by email | Fail | ADO rejected reviewer id `Zhou.Ping@totalebizsolutions.com` with `The identity ... is not recognized`. |
| Cleanup | Pass | Abandoned PR `2734` and deleted the source branch. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| `refs/heads/mergepilot-e2e/mp-e2e-20260705-095900` | cleaned | Independent refs query returned `0`. |
| PR `2734` | cleaned | Independent PR query returned status `abandoned`. |
| PR label `mergepilot-e2e-mp-e2e-20260705-095900` | cleaned | Removed before failure. |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| ADO PR reviewer mutation does not accept the authenticated user's email address as the reviewer URL segment in this org. | Medium | Use ADO identity GUID or an explicit `MERGEPILOT_E2E_ADO_REVIEWER_ID` override. |

## Run: mp-e2e-20260705-100100

| Field | Value |
|---|---|
| Date/time | 2026-07-05 10:01 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-e2e-20260705-100100 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDestructive.test.ts` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Create isolated branch | Pass | Created `refs/heads/mergepilot-e2e/mp-e2e-20260705-100100` from `main`. |
| Push tagged test commit | Pass | Added `/.mergepilot-e2e/mp-e2e-20260705-100100.md`. |
| Create draft PR | Pass | Created PR `2735`. |
| Update PR metadata | Pass | Updated PR title/description. |
| Add/remove PR label | Pass | Added and removed `mergepilot-e2e-mp-e2e-20260705-100100`. |
| Add/remove PR reviewer | Pass | Resolved authenticated ADO identity GUID `a1b6982e-2922-6109-ae4e-b71d27b2ef57`, added it as an optional reviewer, then removed it. |
| Collect PR insight input data | Pass | Read PR detail, changes, threads, work items, policy evaluations, and builds for the created PR. |
| Cleanup | Pass | Abandoned PR `2735` and deleted the source branch. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO branch | `refs/heads/mergepilot-e2e/mp-e2e-20260705-100100` |  | Yes | Deleted |
| ADO PR | `2735` / `[mp-e2e-20260705-100100] MergePilot live destructive smoke - metadata updated` | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_git/ClaimBot_API/pullrequest/2735` | Yes | Abandoned |
| ADO PR label | `mergepilot-e2e-mp-e2e-20260705-100100` | PR `2735` | Yes | Removed |
| ADO PR reviewer | `a1b6982e-2922-6109-ae4e-b71d27b2ef57` | PR `2735` | Yes | Removed |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| `refs/heads/mergepilot-e2e/mp-e2e-20260705-100100` | cleaned | Independent refs query returned `0`. |
| PR `2735` | cleaned | Independent PR query returned status `abandoned`; Azure DevOps retains abandoned PR history by design. |
| PR label `mergepilot-e2e-mp-e2e-20260705-100100` | cleaned | Removed during the test body. |
| PR reviewer `a1b6982e-2922-6109-ae4e-b71d27b2ef57` | cleaned | Removed during the test body. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| Abandoned PR `2735` audit record | Azure DevOps keeps PR history after abandon. | None |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Live PR reviewer add/remove works when the reviewer URL segment uses the ADO identity GUID. | Info | Keep reviewer identity resolution in the live destructive test; product flows should prefer stable identity IDs/descriptors over display email. |
| Work-item link mutation is still only covered by non-destructive registry contracts. | Medium | Add live work-item link/unlink only after selecting a safe test work item and cleanup API. |

## Run: mp-e2e-20260705-100700

| Field | Value |
|---|---|
| Date/time | 2026-07-05 10:07 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-e2e-20260705-100700 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDestructive.test.ts` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Result | Fail, cleaned |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Create isolated branch / draft PR | Pass | Created PR `2736`. |
| Add/remove PR label | Pass | Label cleanup succeeded. |
| Add/remove PR reviewer | Pass | Reviewer cleanup succeeded. |
| Create and link work item | Partial | Work item `7905` accepted the ArtifactLink using project/repository names, but PR work-item listing did not return it. |
| Cleanup | Pass | Unlinked work item relation in cleanup, deleted work item `7905`, abandoned PR `2736`, and deleted the branch. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| `refs/heads/mergepilot-e2e/mp-e2e-20260705-100700` | cleaned | Independent refs query returned `0`. |
| PR `2736` | cleaned | Independent PR query returned status `abandoned`. |
| Work item `7905` | cleaned | Deleted during cleanup. |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Name-based ArtifactLink (`projectName/repositoryName/pullRequestId`) can be accepted by Work Item Tracking but not recognized by the PR work-item endpoint. | High | Update production link logic to use project/repository GUIDs. |

## Run: mp-e2e-20260705-101000

| Field | Value |
|---|---|
| Date/time | 2026-07-05 10:10 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-e2e-20260705-101000 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDestructive.test.ts` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Create isolated branch | Pass | Created `refs/heads/mergepilot-e2e/mp-e2e-20260705-101000` from `main`. |
| Push tagged test commit | Pass | Added `/.mergepilot-e2e/mp-e2e-20260705-101000.md`. |
| Create draft PR | Pass | Created PR `2737`. |
| Update PR metadata | Pass | Updated PR title/description. |
| Add/remove PR label | Pass | Added and removed `mergepilot-e2e-mp-e2e-20260705-101000`. |
| Add/remove PR reviewer | Pass | Added and removed reviewer identity `a1b6982e-2922-6109-ae4e-b71d27b2ef57`. |
| Create/link/unlink/delete work item | Pass | Created work item `7906`, linked it to PR `2737` using project/repository GUID ArtifactLink, verified PR work-item visibility, unlinked the relation, then deleted the work item. |
| Collect PR insight input data | Pass | Read PR detail, changes, threads, work items, policy evaluations, and builds for the created PR. |
| Cleanup | Pass | Abandoned PR `2737` and deleted the source branch. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO branch | `refs/heads/mergepilot-e2e/mp-e2e-20260705-101000` |  | Yes | Deleted |
| ADO PR | `2737` / `[mp-e2e-20260705-101000] MergePilot live destructive smoke - metadata updated` | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_git/ClaimBot_API/pullrequest/2737` | Yes | Abandoned |
| ADO PR label | `mergepilot-e2e-mp-e2e-20260705-101000` | PR `2737` | Yes | Removed |
| ADO PR reviewer | `a1b6982e-2922-6109-ae4e-b71d27b2ef57` | PR `2737` | Yes | Removed |
| ADO work item | `7906` | TeBS-ClaimBot Task | Yes | Unlinked from PR and deleted |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| `refs/heads/mergepilot-e2e/mp-e2e-20260705-101000` | cleaned | Independent refs query returned `0`. |
| PR `2737` | cleaned | Independent PR query returned status `abandoned`; Azure DevOps retains abandoned PR history by design. |
| PR label `mergepilot-e2e-mp-e2e-20260705-101000` | cleaned | Removed during the test body. |
| PR reviewer `a1b6982e-2922-6109-ae4e-b71d27b2ef57` | cleaned | Removed during the test body. |
| Work item `7906` | cleaned | Independent work item GET returned HTTP `404` after deletion. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| Abandoned PR `2737` audit record | Azure DevOps keeps PR history after abandon. | None |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| GUID-based PR ArtifactLink makes the linked work item visible through the PR work-items API. | Info | Keep GUID resolution in `linkAzureWorkItemToPullRequest` and its registry contract tests. |
| PR mutation plumbing now covers title/description, reviewer, label, and work-item link cleanup in live destructive ADO tests. | Info | Next PR-related quality target is seeded insight assertions, not basic mutation plumbing. |

## Run: mp-live-app-business-20260705-130000

| Field | Value |
|---|---|
| Date/time | 2026-07-05 13:00 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Selected-file staging | Pass | Approved `git add -- README.md`; only `README.md` was staged and `notes.txt` stayed unstaged. |
| Approval denial | Pass | Denied a `git add` approval and verified no files were staged. |
| Approval denial feedback | Pass | Denial feedback cancelled the stale approval, replanned, and staged only `notes.txt`. |
| Stage and commit | Pass | Consecutive `git add -A` and `git commit -m` approvals created exactly one commit and left the repo clean. |
| Empty commit guard | Pass | Clean repo prompt to commit staged changes returned `No files are staged for commit. Stopping as requested.`, showed no approval card, preserved `HEAD`, and left the repo clean. |
| Dirty branch switch guard | Pass | Dirty `main` branch switch to `feature/live-switch-target` showed a `HIGH risk` approval for `git_checkout`, did not switch before approval, and preserved the local `README.md` edit after denial. |
| Push to local bare remote | Pass | Approved `git push -u origin feature/live-app-push`; local bare remote received the expected commit. |
| ClaimBot_API pipeline approval preparation | Pass | Real Chat UI inspected ClaimBot_API pipeline `#117`, showed no legacy pipeline `#108`, and prepared the `ado_trigger_pipeline` approval without queueing because destructive mode was not enabled. |

### Resources Created

| Type | Name / ID | Created by test | Cleanup action |
|---|---|---|---|
| Local temp Git repo | `mergepilot-live-*` under `%TEMP%` | Yes | Deleted after each test |
| Local bare Git remote | `mergepilot-live-push-*` under `%TEMP%` | Yes | Deleted after push test |
| Project Link rows | `mp-live-*` temporary links | Yes | Deleted after each test |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Removed in test `finally` blocks with retry. |
| Temporary Project Links | cleaned | Deleted through `/project-links/:id` in test `finally` blocks. |
| ADO pipeline run | none created | The default suite only prepares the approval; destructive pipeline queueing remains gated by `MERGEPILOT_E2E_DESTRUCTIVE=1`. |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Approval cards for workflow-action approvals displayed `MEDIUM risk` even when the backend returned `high`. | High | Fixed: `showApprovalRequestTransition` now copies `approval.riskLevel` onto the `pending_confirm` bubble consumed by `PendingActionCard`; focused transition test and live dirty branch switch test verify `HIGH risk`. |
| The empty-commit guard wording can vary between `No staged changes` and `No files are staged for commit`. | Low | Test matcher now accepts both while retaining hard assertions that no approval appears, `HEAD` is unchanged, and the repo remains clean. |

## Run: mp-live-claimbot-pipeline-recheck-20260705-132817

| Field | Value |
|---|---|
| Date/time | 2026-07-05 13:28 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoPipeline.test.ts` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| List recent ClaimBot_API pipeline runs | Pass | Recent pipeline `#117` history shows successful runs on `refs/heads/main` at commit `18c62b707203670b70beab8cf4e3c89bec1a4b7d`. Latest listed run was `4674 / 20260705.8`, completed `succeeded`. |
| Read latest failed-run evidence | Pass | Historical failed-run timeline/log evidence remains readable for diagnostics. The failure belongs to old commit `540f9ad7` before the `.DS_Store` content-reference fix. |
| Destructive queue smoke | Skipped | `MERGEPILOT_E2E_DESTRUCTIVE` was not set, so no new ADO pipeline run was created. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The active ClaimBot_API business-test pipeline is `#117 ClaimBot_API`, not the legacy `TeBS-ClaimBot` pipeline. | Info | Keep Project Link and automated tests pinned to pipeline `#117` for ClaimBot_API scenarios. |
| The screenshot failure was from old run `4665 / 20260705.1` on commit `540f9ad7`; the current main baseline is fixed by `18c62b7 fix pipeline content includes`. | Info | Use successful runs `4672`, `4673`, and `4674` as the current passing baseline. |

## Run: mp-live-app-business-20260705-134400

| Field | Value |
|---|---|
| Date/time | 2026-07-05 13:44 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Selected-file staging | Pass | Approved `git add -- README.md`; only `README.md` was staged and `notes.txt` stayed unstaged. |
| Approval denial | Pass | Denied a `git add` approval and verified no files were staged. |
| Approval denial feedback | Pass | Denial feedback cancelled the stale approval, replanned, and staged only `notes.txt`. |
| Stage and commit | Pass | Consecutive `git add -A` and `git commit -m` approvals created exactly one commit and left the repo clean. |
| Empty commit guard | Pass | Clean repo prompt to commit staged changes showed no approval, preserved `HEAD`, and left the repo clean. |
| Staged-only commit scope | Pass | `What will be committed?` summarized only staged `README.md` and preserved unstaged `notes.txt`. |
| Remote target credential redaction | Pass | A temporary repo used `https://mergepilot:supersecrettoken@example.visualstudio.com/...` as `origin`; Chat answered the remote push target without displaying the token and without approval. |
| Dirty branch switch guard | Pass | Dirty `main` branch switch to `feature/live-switch-target` showed a `HIGH risk` approval, did not switch before approval, and preserved the local edit after denial. |
| Push to local bare remote | Pass | Approved `git push -u origin feature/live-app-push`; local bare remote received the expected commit. |
| ClaimBot_API pipeline approval preparation | Pass | Real Chat UI inspected ClaimBot_API pipeline `#117`, showed no legacy pipeline `#108`, and prepared the `ado_trigger_pipeline` approval without queueing because destructive mode was not enabled. |

### Resources Created

| Type | Name / ID | Created by test | Cleanup action |
|---|---|---|---|
| Local temp Git repo | `mergepilot-live-*` under `%TEMP%` | Yes | Deleted after each test |
| Local bare Git remote | `mergepilot-live-push-*` under `%TEMP%` | Yes | Deleted after push/remote-target tests |
| Project Link rows | `mp-live-*` temporary links | Yes | Deleted after each test |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Removed in test `finally` blocks with retry. |
| Temporary Project Links | cleaned | Deleted through `/project-links/:id` in test `finally` blocks. |
| ADO pipeline run | none created | The default suite only prepares the approval; destructive pipeline queueing remains gated by `MERGEPILOT_E2E_DESTRUCTIVE=1`. |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Git probe output was not consistently redacting credentials embedded in remote URLs. | High | Fixed: core executor and daemon Git probe output now redact URL userinfo; daemon contract tests and the live Chat UI remote-target test verify no token is exposed. |
| Natural-language `Where will this push go?` did not previously route directly to the read-only remote-target workflow. | Medium | Fixed: read-only chat routing maps remote-target prompts to `inspect_remote_target` without approval or mutation. |

## Run: mp-live-app-business-20260705-140300

| Field | Value |
|---|---|
| Date/time | 2026-07-05 14:03 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Selected-file staging | Pass | Approved `git add -- README.md`; only `README.md` was staged and `notes.txt` stayed unstaged. |
| Approval denial | Pass | Denied a `git add` approval and verified no files were staged. |
| Approval denial feedback | Pass | Denial feedback cancelled the stale approval, replanned, and staged only `notes.txt`. |
| Stage and commit | Pass | Consecutive `git add -A` and `git commit -m` approvals created exactly one commit and left the repo clean. |
| Empty commit guard | Pass | Clean repo prompt to commit staged changes showed no approval, preserved `HEAD`, and left the repo clean. |
| Staged-only commit scope | Pass | `What will be committed?` summarized only staged `README.md` and preserved unstaged `notes.txt`. |
| Remote target credential redaction | Pass | A temporary repo used `https://mergepilot:supersecrettoken@example.visualstudio.com/...` as `origin`; Chat answered the remote push target without displaying the token and without approval. |
| Dirty branch switch guard | Pass | Dirty `main` branch switch to `feature/live-switch-target` showed a `HIGH risk` approval, did not switch before approval, and preserved the local edit after denial. |
| Push to local bare remote | Pass | Approved `git push -u origin feature/live-app-push`; local bare remote received the expected commit. |
| Pull/rebase behind branch | Pass | A temp repo started one commit behind `origin/main`; the workspace menu showed `Behind remote by 1`, approval displayed `git pull --rebase origin main`, approval moved local `HEAD` to the remote commit, and final status was clean/up to date. |
| ClaimBot_API pipeline approval preparation | Pass | Real Chat UI inspected ClaimBot_API pipeline `#117`, showed no legacy pipeline `#108`, and prepared the `ado_trigger_pipeline` approval without queueing because destructive mode was not enabled. |

### Resources Created

| Type | Name / ID | Created by test | Cleanup action |
|---|---|---|---|
| Local temp Git repo | `mergepilot-live-*` under `%TEMP%` | Yes | Deleted after each test |
| Local bare Git remote | `mergepilot-live-push-*` and `mergepilot-live-behind-*` under `%TEMP%` | Yes | Deleted after push, remote-target, and pull/rebase tests |
| Project Link rows | `mp-live-*` temporary links | Yes | Deleted after each test |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Removed in test `finally` blocks with retry. |
| Temporary Project Links | cleaned | Deleted through `/project-links/:id` in test `finally` blocks. |
| ADO pipeline run | none created | The default suite only prepares the approval; destructive pipeline queueing remains gated by `MERGEPILOT_E2E_DESTRUCTIVE=1`. |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Approval cards for `git_pull` displayed tool-name arguments (`git_pull remote=origin branch=main rebase=true`) instead of the concrete Git command. | Medium | Fixed: approval command preview now renders `git pull --rebase origin main`; focused approval-card test and live pull/rebase UI test verify the command text. |

## Run: mp-claimbot-pipeline-selection-20260705-141400

| Field | Value |
|---|---|
| Date/time | 2026-07-05 14:14 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts`; `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "ClaimBot_API pipeline"` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live ADO discovery for ClaimBot_API | Pass | Current account discovered project `TeBS-ClaimBot`, repository `ClaimBot_API`, and repository-filtered pipeline `#117 ClaimBot_API`. |
| Live app ClaimBot_API pipeline action | Pass | Real Chat UI inspected and prepared approval for `ClaimBot_API` pipeline `#117`; the legacy `#108 TeBS-ClaimBot` definition was not shown. |
| Desktop Project Link pipeline recommendation unit coverage | Pass | `src/projectLinks.test.ts` now verifies that a discovery result with `repo:ClaimBot_API` wins over a same-project legacy `TeBS-ClaimBot` pipeline. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The old screenshot failure belongs to historical ClaimBot_API run `4665 / 20260705.1` at commit `540f9ad7`; newer `ClaimBot_API #117` runs on `18c62b7` have succeeded. | Info | Treat `#117 ClaimBot_API` as the active test pipeline baseline and avoid using the legacy `#108 TeBS-ClaimBot` definition for ClaimBot_API business tests. |
| Project Link auto-discovery previously had a helper for recommendation, but multi-pipeline auto-discovery did not apply it. | Medium | Fixed: Project Link creation/editing now auto-picks the repo-matched pipeline when multiple pipeline definitions are discovered. |

## Run: mp-claimbot-pipeline-readonly-20260705-150000

| Field | Value |
|---|---|
| Date/time | 2026-07-05 15:00 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts test/liveAdoPipeline.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/projectLinks.test.ts` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live ClaimBot_API discovery | Pass | Discovered project `TeBS-ClaimBot`, repository `ClaimBot_API`, and repository-filtered pipeline `#117 ClaimBot_API`. |
| Live ClaimBot_API pipeline read-only inspection | Pass | Listed recent pipeline `#117` runs and read timeline/log evidence for the historical failed run. The destructive queue test remained skipped. |
| Project Link pipeline recommendation unit coverage | Pass | `src/projectLinks.test.ts` passed 11/11 and keeps the exact repo-matched `ClaimBot_API` pipeline ahead of legacy same-project definitions. |

### ADO Run Baseline

| Pipeline | Current status | Notes |
|---|---|---|
| `#117 ClaimBot_API` | Healthy baseline | Recent runs `4674`, `4673`, `4672`, `4667`, and `4666` completed `succeeded`; historical run `4665 / 20260705.1` failed on old commit `540f9ad7` before the `.DS_Store` publish-content fix. |
| `#108 TeBS-ClaimBot` | Not used for ClaimBot_API tests | Kept only as a legacy project pipeline. ClaimBot_API Project Links and tests must use `#117 ClaimBot_API`. |

## Run: mp-live-ado-azure-probes-20260705-150300

| Field | Value |
|---|---|
| Date/time | 2026-07-05 15:03 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts`; `MERGEPILOT_E2E_LIVE_AZURE=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / PR `#2655` |
| Azure target | subscription `a99512b0-3dc5-476f-8f43-d7db40fbc923` / resource group `developmentagent` |
| Result | Pass as tests; Azure access remains partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live PR insight daemon route | Pass | Inspected real ClaimBot_API PR `#2655` through `/chat/workflow-action`; no approval or mutation was required. |
| Azure account and ARM visibility | Pass | Azure CLI account resolved to `Zhou.Ping@totalebizsolutions.com`; ARM reads passed for `devagentstorage001`, `devagentcosmos001`, and `devagentkv001`. |
| Storage Table list | Pass | Listed table `CicdAgentProfiles`. |
| Storage Table entity query | Partial | Query failed because the user still lacks Storage Table data-plane reader/contributor permission. |
| Cosmos SQL readiness | Partial | Cosmos ARM database list passed, but no Cosmos SQL data-plane role assignment was returned. |
| Key Vault secret access | Partial | Key Vault ARM read passed, but secret metadata/list access failed with RBAC `Forbidden`. |

### Resources Created

| Type | Name / ID | Created by test | Cleanup action |
|---|---|---|---|
| ADO PR/resource mutation | none | No | Read-only PR insight only. |
| Azure Table/Cosmos/Key Vault data | none | No | Permission probe only. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The ADO read-only PR insight path remains healthy for ClaimBot_API. | Info | Keep `test/liveAdoPrInsight.test.ts` as the live non-destructive PR gate. |
| Azure data-plane access is still incomplete. | Medium | Grant `Storage Table Data Contributor`, Cosmos DB built-in data contributor, and `Key Vault Secrets User` where cloud-backed storage/secrets are expected. Local model secrets remain usable because `cloudSecrets` is disabled. |

## Run: mp-live-app-full-gate-20260705-150400

| Field | Value |
|---|---|
| Date/time | 2026-07-05 15:04 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Selected-file staging | Pass | Real Chat UI approval staged only the requested file in an isolated temp repo. |
| Approval denial | Pass | Denying a real `git add` approval did not stage files. |
| Denial feedback replanning | Pass | Feedback became the next instruction and staged only the revised target file. |
| Stage and commit | Pass | Consecutive approvals staged and committed exactly once. |
| Empty commit guard | Pass | Clean repo commit request produced no approval and no empty commit. |
| Staged-only summary | Pass | `What will be committed?` summarized only staged content. |
| Remote credential redaction | Pass | Remote URL credentials were not exposed in the transcript. |
| Dirty branch switch guard | Pass | Branch switch with dirty changes required approval and preserved local edits after denial. |
| Push to local bare remote | Pass | Approved push updated the isolated local bare remote. |
| Pull/rebase behind branch | Pass | Approved `git pull --rebase origin main` updated the behind branch. |
| Rebase conflict recovery | Pass | Failed rebase surfaced conflict state and recovery actions instead of reporting false success. |
| ClaimBot_API pipeline approval preparation | Pass | Real Chat UI prepared approval for pipeline `#117 ClaimBot_API`; no ADO pipeline run was queued because destructive mode was unset. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | none created | Destructive mode was unset, so the suite did not queue a new run. |

## Run: mp-packaged-sidecar-version-smoke-20260705-152000

| Field | Value |
|---|---|
| Date/time | 2026-07-05 15:20 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run build:sidecar`; `.\scripts\windows\packaged-sidecar-smoke.ps1 -Port 18895` |
| App/package target | `apps\desktop\src-tauri\binaries\mergepilot-daemon-x86_64-pc-windows-msvc.exe`; synced to `apps\desktop\src-tauri\target\release\mergepilot-daemon.exe` |
| Result | Pass after packaged version fix |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Packaged sidecar health | Pass | `/healthz` returned `version: 0.5.10`, matching `packages/daemon/package.json`. |
| Packaged index refresh | Pass | Temporary repo index refresh saw 1 file, indexed 1 file, and produced 2 chunks with no pending embeddings. |
| Packaged workflow action | Pass | `/chat/workflow-action` completed `inspect_environment`. |
| Packaged first-message chat | Pass | `/chat` returned HTTP 200 and did not contain known packaged-runtime failure markers such as `better_sqlite3`, `bindings file`, `schema.sql`, `Could not locate`, or `Expected object`. |
| Version regression guard | Pass | `scripts\windows\packaged-sidecar-smoke.ps1` now fails if the packaged sidecar health version differs from `packages/daemon/package.json`. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary packaged-smoke repo | cleaned | Created under `%TEMP%\mergepilot-packaged-sidecar-repo-*` and removed in the script `finally` block. |
| Temporary packaged-smoke data dir | cleaned | Created under `%TEMP%\mergepilot-packaged-sidecar-data-*` and removed in the script `finally` block. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Packaged daemon returned health version `0.1.0` because `process.env.npm_package_version` is absent inside the pkg binary. | Medium | Fixed by injecting `packages/daemon/package.json` version at esbuild bundle time and adding a packaged smoke assertion. |

## Run: mp-live-app-git-maintenance-gate-20260705-153000

| Field | Value |
|---|---|
| Date/time | 2026-07-05 15:30 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Full live app business gate | Pass | 15/15 real browser tests passed in 3.5 minutes. |
| Stash dirty work | Pass | Real Chat UI prepared `git_stash action=push` approval, approval created a stash with message `mergepilot live stash test`, and the temp repo returned to a clean working tree. |
| Restore selected file | Pass | Real Chat UI prepared `git_restore paths=README.md`; approval restored only `README.md` and preserved the dirty `notes.txt` edit. |
| Revert last commit | Pass | Real Chat UI prepared high-risk `git_revert ref=HEAD`; approval created a revert commit, restored `README.md` to original content, and left the temp repo clean. |
| Existing Git/ADO gate | Pass | Existing selected staging, denial, denial feedback, stage+commit, empty commit guard, staged-only summary, credential redaction, dirty branch switch guard, local push, pull/rebase, rebase conflict recovery, and ClaimBot_API pipeline `#117` approval-prep cases still passed. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | none created | Destructive mode was unset, so the suite did not queue a new run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `git_stash`, `git_restore`, and `git_revert` are product-usable through normal Chat approval despite not being exposed as dedicated workspace-menu buttons. | Info | Keep the live-app regression as the business gate for these natural-language Git maintenance workflows. |
| Release tag creation was not covered because no `git_tag` write tool existed in the registered tool set at this point in the run history. | Medium | Resolved by later `mp-live-app-release-tag-gate-20260705-154800` and `mp-live-app-push-tag-gate-20260705-162700` runs. |

## Run: mp-live-app-release-tag-gate-20260705-154800

| Field | Value |
|---|---|
| Date/time | 2026-07-05 15:48 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/gitOptions.test.ts test/toolCapabilities.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionWorkflowDerivation.test.ts`; `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Structured `git_tag` core tool | Pass | `test/gitOptions.test.ts` verifies an annotated local tag can be created at `HEAD` and inspected with `git_show`. |
| Tool capability registry | Pass | `test/toolCapabilities.test.ts` verifies `git_tag` is registered as high-risk, approval-required, and requires `name`. |
| Pending action derivation | Pass | `test/chatSessionWorkflowDerivation.test.ts` verifies release-tag language derives `git_tag` with `name`, `ref`, `message`, and `annotated` args. |
| Focused live app tag workflow | Pass | `live-app-business.spec.ts --grep "creates a local release tag"` passed; Chat UI prepared high-risk `git_tag`, approval created the tag, repo remained clean, and no push occurred. |
| Full live app business gate | Pass | 16/16 real browser tests passed in 3.6 minutes. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | none created | Destructive mode was unset, so the suite did not queue a new run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `GIT-W-17` local release tag creation is now covered through a first-class tool and real Chat UI approval. | Info | Tag publication was later covered by the dedicated `git_push_tag` workflow in `mp-live-app-push-tag-gate-20260705-162700`. |

## Run: mp-live-claimbot-pipeline-target-20260705-155500

| Field | Value |
|---|---|
| Date/time | 2026-07-05 15:55 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | `az pipelines runs list --organization https://tebssg.visualstudio.com/ --project TeBS-ClaimBot --pipeline-ids 117 --top 5`; `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoPipeline.test.ts`; `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "ClaimBot_API pipeline"` |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Pipeline identity check | Pass | ADO definition `#117` is named `ClaimBot_API` and is the dedicated pipeline for repository `ClaimBot_API`; old `#108 TeBS-ClaimBot` is not used for the ClaimBot_API business gate. |
| Previous pipeline failure diagnosis | Pass | The failed screenshot run used source version `540f9ad7`, whose project file still referenced missing `.DS_Store` content entries. The current `origin/main` version is `18c62b7 fix pipeline content includes`, and that project file no longer references `.DS_Store`. |
| Latest ClaimBot_API pipeline health | Pass | Recent pipeline `#117` runs on `refs/heads/main` at `18c62b7` include successful runs `20260705.8`, `20260705.7`, and `20260705.6`. |
| Core live ADO pipeline smoke | Pass | `test/liveAdoPipeline.test.ts` passed 2 read-only tests and skipped the destructive queue test by design. |
| Running app pipeline approval path | Pass | Focused Playwright test passed 1/1; the real Chat UI prepared an `ado_trigger_pipeline` approval for pipeline `#117 ClaimBot_API` and asserted legacy pipeline `#108` was absent. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| ADO pipeline run | none created | Destructive mode was unset, so the focused app test denied the prepared approval and did not queue a new run. |
| Temporary Project Link | cleaned | The focused app test deletes its temporary Project Link after the assertion. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The `.DS_Store` packaging failure is already fixed on the current ClaimBot_API `main` branch and should not block future business tests. | Info | Continue using pipeline `#117 ClaimBot_API` as the live ADO pipeline target for ClaimBot_API scenarios. |

## Run: mp-live-app-push-tag-gate-20260705-162700

| Field | Value |
|---|---|
| Date/time | 2026-07-05 16:27 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/gitOptions.test.ts test/toolCapabilities.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionWorkflowDerivation.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/components/conversation/ApprovalEvidence.test.tsx`; `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Structured `git_push_tag` core tool | Pass | `test/gitOptions.test.ts` verifies pushing `refs/tags/v1.2.3-test:refs/tags/v1.2.3-test` updates only the named tag on the bare remote; the working branch and another local tag remain unpushed. |
| Tool capability registry | Pass | `test/toolCapabilities.test.ts` verifies `git_push_tag` is registered as high-risk, approval-required, and requires `name`. |
| Pending action derivation | Pass | `test/chatSessionWorkflowDerivation.test.ts` verifies explicit tag-push language derives `git_push_tag`, while PR label/tag wording does not derive a Git tag write. |
| Approval evidence rendering | Pass | `ApprovalEvidence.test.tsx` verifies the approval preview shows a single-tag refspec and does not show `--tags` or `-u origin`. |
| Focused live app tag push workflow | Pass | `live-app-business.spec.ts --grep "pushes one release tag"` passed; Chat UI prepared high-risk `git_push_tag`, approval pushed the requested tag to a local bare remote, and did not push the feature branch or another local tag. |
| Focused selector regressions | Pass | `--grep "requires approval before switching"` and `--grep "surfaces rebase recovery"` both passed after scoping selectors to the main app surface instead of History items. |
| Full live app business gate | Pass | 17/17 real browser tests passed in 3.7 minutes. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | none created | Destructive mode was unset, so the suite prepared but did not queue the ClaimBot_API pipeline `#117` approval. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `GIT-W-17` now covers both local release tag creation and safe single-tag publication. | Info | Keep tag publication as a separate `git_push_tag` tool so prompts cannot accidentally push branches or all local tags. |

## Run: mp-live-app-stash-apply-gate-20260705-165100

| Field | Value |
|---|---|
| Date/time | 2026-07-05 16:51 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/gitOptions.test.ts test/toolCapabilities.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionWorkflowDerivation.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/components/conversation/ApprovalEvidence.test.tsx`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`; `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Structured `git_stash apply` core tool | Pass | `test/gitOptions.test.ts` verifies `git_stash action=apply` restores the stashed file content and leaves the stash entry intact. |
| Pending action derivation | Pass | `test/chatSessionWorkflowDerivation.test.ts` verifies `Apply the latest stash without dropping it` derives `git_stash action=apply`, including the case where an explicit planner proposal says `pop`. |
| Approval evidence rendering | Pass | `ApprovalEvidence.test.tsx` verifies the approval card preview shows `git stash apply`, not `git stash pop`. |
| Focused live app stash apply workflow | Pass | `live-app-business.spec.ts --grep "applies the latest stash"` passed; Chat UI prepared `git stash apply`, approval restored `README.md`, left the working tree dirty with the restored content, and kept the stash entry. |
| Full live app business gate | Pass | 18/18 real browser tests passed in 4.1 minutes. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | none created | Destructive mode was unset, so the suite prepared but did not queue the ClaimBot_API pipeline `#117` approval. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `GIT-W-14` is now covered for non-dropping stash restore. | Info | A later follow-up can add `git stash pop` conflict/drop semantics, but the safer `apply` path now has product and live UI coverage. |
| Runtime daemon uses built `@mergepilot/core` dist for workspace package imports. | Medium | After core tool changes, rebuild `@mergepilot/core` before running live app tests; otherwise the daemon can show new approval args but execute old tool behavior. |

## Run: mp-live-claimbot-pipeline-117-retarget-20260705-165700

| Field | Value |
|---|---|
| Date/time | 2026-07-05 16:57 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | `az pipelines runs list --pipeline-ids 117 --top 5`; `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "ClaimBot_API pipeline #117"` |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Historical pipeline failure diagnosis | Pass | The failed screenshot run used commit `540f9ad`. Current `main` is `18c62b7 fix pipeline content includes`, which removed missing `.DS_Store` and zip content entries from `BotToSharePoint.csproj`. |
| Recent ClaimBot_API pipeline runs | Pass | `az pipelines runs list --pipeline-ids 117 --top 5` showed recent `main` runs `20260705.6`, `20260705.7`, and `20260705.8` succeeded on commit `18c62b7`. |
| Project Link retargeting | Pass | The running app's `ClaimBot_API link` now points to local repo `C:\Users\15492\Develop\ClaimBot_API` and ADO pipeline `117 / ClaimBot_API`. |
| Focused live app pipeline workflow | Pass | The real Chat UI prepared the ClaimBot_API pipeline `#117` approval and did not route to the legacy `TeBS-ClaimBot` pipeline. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| ClaimBot_API testing should stay mapped to pipeline `#117 ClaimBot_API`. | Info | Validate ClaimBot_API app workflows against the pipeline discovered for the ClaimBot_API repository. |
| The `.DS_Store` package failure is resolved on the dedicated ClaimBot_API pipeline. | Info | Future failures on pipeline `#117` should be treated as new regressions, not the old missing-content issue from run `20260705.1`. |

## Run: mp-live-app-stash-pop-gate-20260705-171900

| Field | Value |
|---|---|
| Date/time | 2026-07-05 17:19 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/gitOptions.test.ts test/toolCapabilities.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionGitCheckpoint.test.ts test/chatSessionWorkflowDerivation.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/components/conversation/ApprovalEvidence.test.tsx`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build`; focused live `--grep "pops the latest stash"`; full live app gate |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Structured `git_stash pop` clean restore | Pass | `test/gitOptions.test.ts` verifies `git_stash action=pop` restores the stashed content and drops the stash entry after a clean restore. |
| Structured `git_stash pop` conflict safety | Pass | `test/gitOptions.test.ts` verifies a conflict returns non-zero, leaves `UU README.md`, and keeps the stash entry available for recovery. |
| Pending action derivation | Pass | `test/chatSessionWorkflowDerivation.test.ts` verifies explicit pop/drop language derives `git_stash action=pop` and is not rewritten to apply. |
| Approval evidence rendering | Pass | `ApprovalEvidence.test.tsx` verifies the approval preview shows `git stash pop` for dropping restores. |
| Focused live app stash pop workflow | Pass | Real Chat UI prepared `git stash pop`, approval restored `README.md`, left the working tree modified, and removed the stash entry after success. |
| Index lock regression | Pass | A previous full-gate run exposed `git add -A` failing on `.git/index.lock`; Git read tools and checkpoint reads now run with `GIT_OPTIONAL_LOCKS=0`, focused stage-and-commit retest passed, and the full live app gate passed. |
| Full live app business gate | Pass | 19/19 real browser tests passed in 4.5 minutes. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | none created | Destructive mode was unset, so the ClaimBot_API pipeline `#117` approval path was inspected/prepared without queueing a run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `GIT-W-14` now covers both non-dropping `stash apply` and dropping `stash pop` success semantics. | Info | Keep conflict-preservation at core level and add a visible browser recovery UX case later if conflict UI needs more polish. |
| Concurrent Git status/checkpoint reads can briefly lock the index and block confirmed writes. | Medium | Fixed by using `GIT_OPTIONAL_LOCKS=0` for read-only Git tools and checkpoint reads; full live app gate now passes after daemon restart. |

## Run: mp-live-app-stash-pop-conflict-gate-20260705-173700

| Field | Value |
|---|---|
| Date/time | 2026-07-05 17:37 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/gitOperation.test.ts test/chatSessionWorkflowDerivation.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/components/conversation/ApprovalEvidence.test.tsx`; focused live `--grep "stash pop conflict"`; full live app gate |
| App target | `http://127.0.0.1:1420/#/chat` with restarted daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Ordinary Git index conflict guidance | Pass | `test/gitOperation.test.ts` verifies normal index conflicts produce `git_conflict` guidance that says Git keeps the stash entry when the conflict comes from stash pop. |
| Failed confirmed Git action recovery scope | Pass | `chatConfirmedOutcome` now sends failed `git_*` approvals through the deterministic Git recovery path even when the approval was planner-derived and does not carry structured workflow metadata. |
| Focused live app stash-pop conflict workflow | Pass | Real Chat UI prepared `git stash pop`; after approval, Git left `UU README.md`, the transcript showed `Stopped after git stash pop`, conflict recovery guidance named `README.md`, and `git stash list` still contained `mergepilot pop conflict fixture`. |
| Full live app business gate | Pass | 20/20 real browser tests passed in 4.7 minutes. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | none created | Destructive mode was unset, so the ClaimBot_API pipeline `#117` approval path was inspected/prepared without queueing a run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `GIT-W-14` now has visible browser coverage for stash-pop conflict recovery, not only core-level conflict preservation. | Info | Remaining Git recovery gaps are failed commit validation, interrupted approval restore, and broader recovery UX. |
| Failed planner-derived Git approvals skipped deterministic Git recovery because they lacked `workflow.kind = git`. | Medium | Fixed by treating failed `git_*` confirmed actions as Git recovery candidates. |

## Run: mp-live-app-commit-validation-gate-20260705-175200

| Field | Value |
|---|---|
| Date/time | 2026-07-05 17:52 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/gitOperation.test.ts test/chatSessionWorkflowDerivation.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck`; focused live `--grep "commit validation"`; full live app gate |
| App target | `http://127.0.0.1:1420/#/chat` with restarted daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Daemon focused recovery tests | Pass | `test/gitOperation.test.ts` and `test/chatSessionWorkflowDerivation.test.ts` passed 33/33. |
| Daemon typecheck | Pass | `@mergepilot/daemon typecheck` passed after adding deterministic failed-commit recovery. |
| Focused live app commit validation workflow | Pass | A temp repo had `README.md` staged and a failing `pre-commit` hook. The structured Commit workflow prepared `git_commit`; after approval, `HEAD` remained unchanged, `README.md` stayed staged, and the transcript showed deterministic commit failure guidance with `mergepilot validation failed` evidence. |
| Full live app business gate | Pass | 21/21 real browser tests passed in 4.7 minutes. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | none created | Destructive mode was unset, so the ClaimBot_API pipeline `#117` approval path was inspected/prepared without queueing a run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Failed `git_commit` approvals without merge/rebase conflicts previously fell back to planner continuation. | Medium | Fixed with deterministic failed-commit recovery that explains the failure, preserves staged-scope evidence, and avoids suggesting bypass flags unless the user explicitly chooses that risk. |
| `GIT-W-03` now covers validation failure, not only successful commit creation and empty-commit guard. | Info | Remaining Git recovery gap is interrupted approval/session restore plus broader recovery UX. |

## Run: mp-live-app-approval-restore-gate-20260705-181900

| Field | Value |
|---|---|
| Date/time | 2026-07-05 18:19 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | Focused live `--grep "restores a pending approval"`; focused live `--grep "rebase recovery"`; full live app gate |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Focused live app pending approval restore workflow | Pass | A temp repo requested `git add README.md`; the approval card appeared, backend `/chat/{sessionId}/state` retained `pendingApproval.action.tool = git_add`, no staged files existed before approval, the browser page was reloaded, the approval card restored, and approval staged only `README.md` while leaving `notes.txt` unstaged. |
| Focused live app rebase recovery selector retest | Pass | The rebase conflict workflow passed after scoping the branch button locator to the main panel, preventing History titles containing `main` from colliding with the Environment branch control. |
| Full live app business gate | Pass | 22/22 real browser tests passed in 5.2 minutes. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | none created | Destructive mode was unset, so the ClaimBot_API pipeline `#117` approval path was inspected/prepared without queueing a run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `CHAT-05` / `CHAT-08` now has visible browser coverage for restoring an interrupted pending approval after reload. | Info | Continue with broader recovery UX, but interrupted approval/session restore is no longer an uncovered live-app gap. |
| Live app History titles can create ambiguous role names for broad `getByRole("button", { name })` locators. | Low | Keep critical workflow controls scoped to `main` or exact accessible names in Playwright tests. |

## Run: mp-live-app-merge-target-gate-20260705-183300

| Field | Value |
|---|---|
| Date/time | 2026-07-05 18:33 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | Focused live `--grep "merges the target branch"`; full live app gate |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Focused live app target-merge workflow | Pass | A temp repo had current branch `feature/live-merge-target` behind `main`. Chat was prompted to merge `main` into the current branch using fast-forward only. The approval card appeared before execution, `HEAD` was unchanged before approval, and approving advanced the current branch to the `main` target commit while keeping the current branch name. |
| Full live app business gate | Pass | 23/23 real browser tests passed in 5.7 minutes. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | none created | Destructive mode was unset, so the ClaimBot_API pipeline `#117` approval path was inspected/prepared without queueing a run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `GIT-W-12` now has visible browser coverage for a safe fast-forward target merge through the Chat approval card. | Info | Add a separate merge-conflict recovery browser case later if broader recovery UX becomes the next priority. |

## Run: mp-live-app-create-branch-gate-20260705-184200

| Field | Value |
|---|---|
| Date/time | 2026-07-05 18:42 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | Focused live `--grep "creates and switches"`; full live app gate |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Focused live app create-and-switch branch workflow | Pass | A clean temp repo started on `main`. Chat was prompted to create and switch to `feature/live-new-branch`. The approval card appeared before execution, the repo stayed on `main` before approval, and approving created/switched to the new branch while leaving the working tree clean. |
| Full live app business gate | Pass | 24/24 real browser tests passed in 5.9 minutes. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | none created | Destructive mode was unset, so the ClaimBot_API pipeline `#117` approval path was inspected/prepared without queueing a run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `GIT-W-08` now has visible browser coverage for creating and switching to a new branch through the Chat approval card. | Info | Add a pushed-new-branch remote workflow later if release smoke needs branch publication coverage beyond local creation. |

## Run: mp-live-app-merge-conflict-gate-20260705-185500

| Field | Value |
|---|---|
| Date/time | 2026-07-05 18:55 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | Focused live `--grep "merge conflict"`; full live app gate |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Focused live app merge-conflict workflow | Pass | A temp repo had current branch `feature/live-merge-conflict` and `main` both changing `app.config`. Chat was prompted to merge `main` without rebase. The approval card appeared before execution, the working tree was clean before approval, approving left `UU app.config`, the transcript showed the failed merge step, and recovery buttons `Continue merge` / `Abort merge` were enabled. |
| Full live app business gate | Pass | 25/25 real browser tests passed in 6.2 minutes. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | none created | Destructive mode was unset, so the ClaimBot_API pipeline `#117` approval path was inspected/prepared without queueing a run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `GIT-W-12` and `GIT-R-07` now have visible browser coverage for merge-conflict detection and recovery affordances after an approved merge. | Info | Broader recovery UX can now focus on completing resolved merge/rebase flows and preserving clean summaries after recovery. |

## Run: mp-live-app-draft-message-gate-20260705-190600

| Field | Value |
|---|---|
| Date/time | 2026-07-05 19:06 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | Focused live `--grep "drafts a commit message"`; full live app gate |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Focused live app draft commit message workflow | Pass | A temp repo had unstaged edits in `README.md` and `notes.txt`. Chat was prompted to draft a commit message in read-only mode. The UI returned commit-message text, showed no approval card, did not expose `git_add` or `git_commit`, kept `HEAD` unchanged, left the staged diff empty, and preserved both files as unstaged changes. |
| Full live app business gate | Pass | 26/26 real browser tests passed in 6.5 minutes. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | none created | Destructive mode was unset, so the ClaimBot_API pipeline `#117` approval path was inspected/prepared without queueing a run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `GIT-W-04` and `AI-Q-02` now have visible browser coverage proving commit-message drafting stays read-only and does not drift into staging or committing. | Info | Next AI-safety coverage should target review-only prompts with seeded secret/risk content. |

## Run: mp-live-app-secret-review-gate-20260705-192300

| Field | Value |
|---|---|
| Date/time | 2026-07-05 19:23 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | Focused live `--grep "redacts secret-like"`; full live app gate |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Focused live app secret-like diff review | Pass | A temp repo added `.env.sample` containing `AZURE_OPENAI_API_KEY=mp_live_secret_1234567890abcdef`. Chat was prompted to review current changes for leaked credentials/secrets in read-only mode. The UI reported secret/credential/API-key risk, did not display the full secret value, showed no approval card, did not expose `git_add` or `git_commit`, kept `HEAD` unchanged, left the staged diff empty, and preserved `.env.sample` as untracked. |
| Full live app business gate | Pass | 27/27 real browser tests passed in 6.5 minutes. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | none created | Destructive mode was unset, so the ClaimBot_API pipeline `#117` approval path was inspected/prepared without queueing a run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `SEC-01`, `AI-Q-01`, and `AI-Q-02` now have visible browser coverage proving a review-only diff with an API-key-like value is summarized as a credential risk without leaking the complete value or drifting into Git write actions. | Info | Broaden security fixtures next to PAT strings in logs, ADO auth failures, and model/provider error surfaces. |

## Run: mp-live-app-pipeline-artifact-redaction-20260705-195000

| Field | Value |
|---|---|
| Date/time | 2026-07-05 19:50 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | Core ADO build-log/tool redaction tests; daemon ADO workflow route tests; focused live browser `--grep "redacts secret-like"` and `--grep "prepares ClaimBot_API pipeline #117"` |
| App target | `http://127.0.0.1:1420/#/chat` with freshly restarted daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Core ADO log and command-output redaction | Pass | `test/adoBuildPipelineInternal.test.ts` and `test/toolExecutor.test.ts` passed 22/22. ADO build log excerpts and command output redact API-key, bearer-token, PAT-like, access-token, client-secret, password, and credentialed URL values. |
| Daemon ADO workflow route contract | Pass | `test/serverAdoWorkflowRoutes.test.ts` passed 3/3. The ClaimBot_API pipeline `#117` failure artifact path redacts secrets in timeline issues, build log excerpts, workflow tool stdout, and artifact markdown. Work-item link approval confirmation preserves PR workflow state. |
| Focused live app secret-like diff review | Pass | The running app reviewed a diff with a secret-like Azure OpenAI key and did not reveal the complete value or propose Git write actions. |
| Focused live app ClaimBot_API pipeline approval preparation | Pass | The running app selected ClaimBot_API pipeline `#117` and prepared an `ado_trigger_pipeline` approval without showing legacy pipeline `#108`. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Focused live browser tests clean their temp repositories after the run. |
| Temporary Project Links | cleaned | The tests use run-scoped Project Links and clean them after completion. |
| ADO pipeline run | none created | Destructive mode was unset, so ClaimBot_API pipeline `#117` was only inspected/prepared for approval and was not queued. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Pipeline failure evidence now has route-level redaction before it is exposed as transcript tool output or markdown artifacts. | Info | Add a broader ADO auth-failure fixture next so authentication diagnostics cannot leak raw tokens or provider errors. |

## Run: mp-live-app-full-gate-20260705-195900

| Field | Value |
|---|---|
| Date/time | 2026-07-05 19:59 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | Full live app business gate |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` restarted from current source |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Full live app business gate | Pass | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` passed 27/27 in 6.2 minutes. |
| Git maintenance workflows | Pass | Covered selected staging, pending approval reload/restore, approval denial, denial feedback replanning, stage+commit, commit validation failure, empty commit guard, staged-only summary, draft commit message safety, dirty branch switching, branch creation, push to a local bare remote, pull/rebase, rebase conflict recovery, merge target, merge conflict recovery, stash push/apply/pop, stash-pop conflict recovery, restore, revert, local release tag creation, and safe single-tag publication. |
| Security workflows | Pass | Covered credential-redacted remote target inspection and secret-like diff review without leaking the full secret or drifting into Git write actions. |
| ClaimBot_API pipeline workflow | Pass | Prepared the `ado_trigger_pipeline` approval for ClaimBot_API pipeline `#117` and did not show legacy pipeline `#108`. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | none created | Destructive mode was unset, so ClaimBot_API pipeline `#117` was only prepared for approval and was not queued. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The current source passes the full non-destructive live app gate after the pipeline artifact redaction and workflow-state fixes. | Info | Continue with the remaining high-value gaps: installed first-run UI smoke, candidate pipeline persistence from transcript, broader AI answer-quality fixtures, and Azure data-plane permission retests after RBAC is granted. |

## Run: mp-live-ado-azure-probes-20260705-200400

| Field | Value |
|---|---|
| Date/time | 2026-07-05 20:04 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | Live ADO discovery/pipeline/PR insight probes; live Azure permission diagnostic |
| App target | Daemon route probe through Fastify inject for PR insight; Azure/ADO probes through current local toolchain |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` / PR `#2655` |
| Azure target | Subscription `a99512b0-3dc5-476f-8f43-d7db40fbc923`; resource group `developmentagent`; `devagentstorage001`, `devagentcosmos001`, `devagentkv001` |
| Result | Pass as tests; Azure data-plane access remains partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live ADO discovery | Pass | `test/liveAdoDiscovery.test.ts` discovered project `TeBS-ClaimBot`, repository `ClaimBot_API`, and pipeline `#117 ClaimBot_API` with the current account. |
| Live ADO pipeline read-only diagnostics | Pass | `test/liveAdoPipeline.test.ts` listed recent ClaimBot_API pipeline runs and read timeline/log evidence for the latest failed run; destructive queue test was skipped. |
| Live ADO PR insight | Pass | `test/liveAdoPrInsight.test.ts` inspected real ClaimBot_API PR `#2655` without approval or mutation. |
| Live Azure permission diagnostic | Pass as diagnostic, Partial access | Azure account probe returned `Zhou.Ping@totalebizsolutions.com`; Storage account ARM, Storage Table list, Cosmos account ARM, Cosmos SQL database list, and Key Vault ARM passed. Storage Table entity query, Cosmos SQL role assignment listing, and Key Vault secret list still lack data-plane permissions. |

### Permission Gaps

| Resource area | Current result | Required follow-up |
|---|---|---|
| Storage Table entity query | Fail | Grant `Storage Table Data Reader` or `Storage Table Data Contributor` on table `CicdAgentProfiles` or an appropriate parent scope. |
| Cosmos SQL data plane | Fail | Assign Cosmos DB built-in data role, preferably scoped to `devagentcosmos001/cicd-agent`. |
| Key Vault secrets | Fail | Grant `Key Vault Secrets User` on `devagentkv001`; `Secrets Officer` is needed only for writes. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| ADO PRs/branches/pipeline runs | none created | This run was read-only and did not queue a pipeline or mutate PR state. |
| Azure resources | none mutated | Permission probe only read metadata/list endpoints and reported data-plane failures. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| ADO read-only integration is healthy for ClaimBot_API, but Azure cloud persistence cannot be fully validated until data-plane roles are granted. | Medium | Rerun this probe after assigning Storage Table, Cosmos SQL, and Key Vault roles. |

## Run: mp-claimbot-api-pipeline-baseline-20260705-201800

| Field | Value |
|---|---|
| Date/time | 2026-07-05 20:18 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | Azure DevOps CLI pipeline definition and recent-run query |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Pipeline definition binding | Pass | `az pipelines build definition show --id 117` confirmed pipeline `#117` is named `ClaimBot_API`, repository is `ClaimBot_API`, YAML is `azure-pipelines.yml`, and queue status is enabled. |
| Latest ClaimBot_API run baseline | Pass | `az pipelines runs list --pipeline-ids 117 --top 5` showed latest run `#4674 / 20260705.8` on `refs/heads/main`, commit `18c62b707203670b70beab8cf4e3c89bec1a4b7d`, result `succeeded`. |
| Focused live app pipeline UI | Pass | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "prepares ClaimBot_API pipeline #117"` passed 1/1. |
| Legacy-pipeline avoidance | Pass | The checked pipeline definition is the dedicated ClaimBot_API pipeline `#117`; this record does not use the legacy `TeBS-ClaimBot` pipeline. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The earlier screenshot failure was from run `#20260705.1` on commit `540f9ad`; the current ClaimBot_API baseline is healthy after commit `18c62b7 fix pipeline content includes`. | Info | Use pipeline `#117 ClaimBot_API` for MergePilot live pipeline tests and record any future destructive queue runs by run id. |

## Run: mp-live-app-full-gate-20260705-205400

| Field | Value |
|---|---|
| Date/time | 2026-07-05 20:54 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | Default Chromium Playwright gate; full non-destructive live app business gate |
| App target | `http://127.0.0.1:1420/#/chat` with daemon `http://127.0.0.1:8787` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass after test-locator hardening |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Default browser gate | Pass | `.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium` passed 54 tests and skipped 27 live-app tests by design. |
| Focused branch-menu locator retests | Pass | `--grep "pulls a behind branch"` passed 1/1 after scoping the `main` branch assertion to the Environment panel. `--grep "switching branches"` passed 1/1 after using Environment-panel branch text for the target branch. `--grep "rebase recovery"` passed 1/1 after the same Environment-panel scoping cleanup. |
| Full live app business gate | Pass | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` passed 27/27 in 6.8 minutes. |

### Coverage

| Area | Result | Notes |
|---|---|---|
| Git maintenance workflows | Pass | Covered selected staging, pending approval reload/restore, approval denial, denial feedback replanning, stage+commit, commit validation failure, empty commit guard, staged-only summary, draft commit message safety, dirty branch switching, branch creation, push to a local bare remote, pull/rebase, rebase conflict recovery, merge target, merge conflict recovery, stash push/apply/pop, stash-pop conflict recovery, restore, revert, local release tag creation, and safe single-tag publication. |
| Security workflows | Pass | Covered credential-redacted remote target inspection and secret-like diff review without leaking the full secret or drifting into Git write actions. |
| ClaimBot_API pipeline workflow | Pass | Prepared the `ado_trigger_pipeline` approval for ClaimBot_API pipeline `#117` and did not show pipeline `#108` from the separate TeBS-ClaimBot repository mapping. Destructive mode was off, so no ADO pipeline run was queued. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | Two stale Project Links from earlier failed selector runs were deleted manually. `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | none created | Destructive mode was unset, so ClaimBot_API pipeline `#117` was only prepared for approval and was not queued. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The product flow passed; the initial failures in this run were Playwright locator collisions with History items whose accessible names contained `main`. | Low | Keep branch-menu assertions scoped to the Environment/pinned summary panel so persistent History content cannot break business-gate stability. |

## Run: mp-live-ado-azure-probes-20260705-205800

| Field | Value |
|---|---|
| Date/time | 2026-07-05 20:58 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | Live ADO discovery/pipeline/PR insight probes; live Azure permission diagnostic |
| App target | Daemon route probe through Fastify inject for PR insight; Azure/ADO probes through current local toolchain |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` / PR `#2655` |
| Azure target | Subscription `a99512b0-3dc5-476f-8f43-d7db40fbc923`; resource group `developmentagent`; `devagentstorage001`, `devagentcosmos001`, `devagentkv001` |
| Result | Pass as tests; Azure data-plane access remains partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live ADO discovery | Pass | `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts test/liveAdoPipeline.test.ts` discovered project `TeBS-ClaimBot`, repository `ClaimBot_API`, and pipeline `#117 ClaimBot_API`. |
| Live ADO pipeline read-only diagnostics | Pass | The same command passed 2/2 read-only pipeline checks with the destructive queue test skipped. Recent pipeline `#117` runs `20260705.8`, `20260705.7`, and `20260705.6` remain `completed/succeeded` on `refs/heads/main` at commit `18c62b7`. |
| Live ADO PR insight | Pass | `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts` inspected real ClaimBot_API PR `#2655` without approval or mutation. |
| Live Azure permission diagnostic | Pass as diagnostic, Partial access | `MERGEPILOT_E2E_LIVE_AZURE=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts` passed 1/1. ARM reads passed for Storage, Cosmos, and Key Vault; Storage Table list and Cosmos SQL database list passed. |

### Permission Gaps

| Resource area | Current result | Required follow-up |
|---|---|---|
| Storage Table entity query | Fail | Grant `Storage Table Data Reader` or `Storage Table Data Contributor` on table `CicdAgentProfiles` or an appropriate parent scope. |
| Cosmos SQL data plane | Fail | Assign Cosmos DB built-in data role, preferably scoped to `devagentcosmos001/cicd-agent`. |
| Key Vault secrets | Fail | Grant `Key Vault Secrets User` on `devagentkv001`; `Secrets Officer` is needed only for writes. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Local temp repos/remotes | none created | This probe did not run browser temp-repo workflows. Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | none created | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO PRs/branches/pipeline runs | none created | This run was read-only and did not queue a pipeline or mutate PR state. |
| Azure resources | none mutated | Permission probe only read metadata/list endpoints and reported data-plane failures. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| ADO integration remains healthy for ClaimBot_API after the 20:54 live app gate; Azure cloud persistence still cannot be fully validated until data-plane roles are granted. | Medium | Rerun this probe after assigning Storage Table, Cosmos SQL, and Key Vault roles. |

## Run: mp-live-claimbot-pipeline-harden-20260705-211000

| Field | Value |
|---|---|
| Date/time | 2026-07-05 21:10 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test commands | `git push origin main` in `C:\Users\15492\Develop\ClaimBot_API`; `az pipelines run --organization https://dev.azure.com/tebssg --project TeBS-ClaimBot --id 117 --branch main`; `az pipelines runs show --id 4677` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Changes Validated

| Change | Result | Notes |
|---|---|---|
| ClaimBot_API commit | Pushed | Commit `dffeecd fix: harden web package content validation` was pushed to `origin/main`. |
| Missing content include guard | Validated | `azure-pipelines.yml` now checks concrete `Content` / `None` includes before VSBuild and ignores OS metadata such as `.DS_Store` and `Thumbs.db`. |
| Web package OS metadata exclusion | Validated | `BotToSharePoint.csproj` excludes `.DS_Store` and `Thumbs.db` from Web Package inputs so stale OS metadata cannot break package copy. |
| Repository pipeline selection | Validated | The run used pipeline `#117 ClaimBot_API` for the ClaimBot_API Project Link. |

### Pipeline Result

| Run | Source | Result |
|---|---|---|
| `4677 / 20260705.10` | `refs/heads/main` at `dffeecd534790c4446a29208674f2b6021640a63` | `completed/succeeded` |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| ADO pipeline run | retained | Pipeline runs are retained as normal ADO history. No cleanup required. |
| ClaimBot_API local working tree | partial local changes remain | Only pipeline hardening files were committed. Local `Web.config`, `FolderProfile.pubxml`, and `Web - Copy.config` remain uncommitted because they are environment-specific and unrelated to the pipeline fix. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The screenshot failure came from the earlier `540f9ad7` pipeline run where `.DS_Store` was still referenced as project content. Current `main` has both stale content cleanup and pipeline/package guards. | Low | Keep MergePilot business tests mapped to `ClaimBot_API` pipeline `#117`. |

## Run: mp-live-claimbot-pipeline-ui-trigger-20260705-221440

| Field | Value |
|---|---|
| Date/time | 2026-07-05 22:14:40-22:17:12 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "ClaimBot_API pipeline #117"` |
| Environment flags | `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE=1` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure DevOps pipeline | `117` / `ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| ClaimBot_API pipeline source sanity | Pass | The local and remote ClaimBot_API `main` branch are at `dffeecd fix: harden web package content validation`. The older screenshot failure was from run `4665 / 20260705.1` on commit `540f9ad7`; current `main` no longer reproduces the missing `.DS_Store` packaging failure. |
| Real Chat UI pipeline trigger | Pass | The running MergePilot Chat UI selected `ClaimBot_API` pipeline `#117`, showed no pipeline text from the separate TeBS-ClaimBot repository mapping, prepared `ado_trigger_pipeline`, and confirmed the approval with `Yes, run this action`. |
| ADO run completion poll | Pass | New ADO run `4678 / 20260705.11` queued on `refs/heads/main` at `dffeecd534790c4446a29208674f2b6021640a63`, started at `2026-07-05T14:14:51Z`, finished at `2026-07-05T14:17:12Z`, and completed `succeeded`. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO pipeline run | `4678 / 20260705.11` | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_build/results?buildId=4678` | Yes | Retained as normal ADO build history |
| Temporary Project Link | `mp-live-claimbot-pipeline-*` | Local/cloud Project Link store | Yes | Deleted by Playwright fixture |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| ADO pipeline run `4678` | retained | Pipeline history is intentionally retained for auditability. |
| Temporary Project Link | cleaned | The focused Playwright fixture deleted its run-scoped Project Link. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| MergePilot can trigger the dedicated ClaimBot_API pipeline through the real Chat approval path, and the resulting run succeeds after the `dffeecd` pipeline hardening fix. | Info | Keep ClaimBot_API pipeline tests on `#117 ClaimBot_API`; treat future `#117` failures as new regressions rather than the old `540f9ad7` `.DS_Store` issue. |

## Run: mp-live-claimbot-pipeline-readonly-chat-20260705-224900

| Field | Value |
|---|---|
| Date/time | 2026-07-05 22:49 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "inspects ClaimBot_API pipeline #117 failure evidence"` |
| Environment flags | `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, destructive mode unset |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Daemon ADO workflow regression | Pass | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverAdoWorkflowRoutes.test.ts` passed 4/4. Added coverage for normal `/chat` requests that carry only `projectLinkId`; the daemon resolves the stored Project Link before read-only pipeline routing. |
| Daemon typecheck | Pass | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck` passed. |
| Direct SSE probe | Pass | `/chat` with inline ClaimBot_API Project Link returned `Pipeline #117`, selected failed run `#4665`, and included the old `.DS_Store`/MSBuild packaging evidence after preferring true failed runs over newer canceled runs. |
| Real Chat UI read-only pipeline inspection | Pass | The running Chat UI selected the ClaimBot_API Project Link, inspected pipeline `#117`, showed latest failed evidence for run `#4665`, surfaced `Copying file` / `MSBuild` / `Publishing.targets` evidence, showed no `Approval required`, did not call `ado_trigger_pipeline`, and did not show pipeline `#108` from the separate TeBS-ClaimBot repository mapping. |

### Fixes Validated

| Fix | Result | Notes |
|---|---|---|
| Project Link resolution in Chat | Validated | `/chat` now resolves the stored Project Link from `projectLinkId` when the frontend request lacks a full inline `projectLink` payload. This prevents normal Chat prompts from losing ADO pipeline mapping. |
| Pipeline failure evidence selection | Validated | Pipeline inspection now prefers the latest `failed` run over a newer `canceled` run when summarizing failure evidence. This keeps failure diagnosis focused on actionable build errors. |
| Visible failure summary | Validated | Pipeline summaries now include failed timeline records, error issues, and diagnostic log lines in the Chat transcript instead of hiding all evidence behind the artifact card. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary Project Link | cleaned | The focused Playwright fixture deleted its run-scoped Project Link. |
| ADO pipeline runs | none created | This run was read-only and destructive mode was unset. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The first browser attempts exposed two real product issues: Chat lost stored Project Link details when only `projectLinkId` was posted, and pipeline failure summaries chose newer canceled runs before older failed runs. | High | Fixed and covered by daemon regression plus live Chat UI read-only pipeline smoke. |

## Run: mp-live-claimbot-pipeline-rerun-suggestion-20260705-225300

| Field | Value |
|---|---|
| Date/time | 2026-07-05 22:53 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "rerun approval from failure evidence"` |
| Environment flags | `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, destructive mode unset |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Real Chat UI rerun-from-failure suggestion | Pass | The Chat UI first inspected pipeline `#117` read-only, surfaced failed-run evidence, then the `Rerun pipeline` suggestion prepared an `ado_trigger_pipeline` approval for pipeline `#117`. |
| Non-destructive denial | Pass | With destructive mode disabled, the test clicked `No, don't run it` and verified the latest ClaimBot_API pipeline run ID did not change. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary Project Link | cleaned | The focused Playwright fixture deleted its run-scoped Project Link. |
| ADO pipeline runs | none created | The approval was denied and destructive mode was unset. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The pipeline failure transcript can now continue into a rerun approval without visiting the separate Pipelines workspace, while still preserving explicit approval and no-op denial safety. | Info | Next destructive variant can confirm the same suggestion path queues a real new run and records the retained ADO run ID. |

## Run: mp-live-claimbot-pipeline-rerun-destructive-20260705-225920

| Field | Value |
|---|---|
| Date/time | 2026-07-05 22:59:20-23:00:55 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "rerun approval from failure evidence"` |
| Environment flags | `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE=1` |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Baseline latest run | `4678 / 20260705.11`, `completed/succeeded` |
| Created run | `4679 / 20260705.12` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Real Chat UI rerun-from-failure confirmation | Pass | The Chat UI inspected pipeline `#117`, surfaced failed-run evidence, clicked `Rerun pipeline`, displayed an `ado_trigger_pipeline` approval for pipeline `#117`, and confirmed it with `Yes, run this action`. |
| ADO queue verification | Pass | The test observed a new run ID greater than baseline `4678`. Follow-up ADO probe confirmed run `4679 / 20260705.12` on `refs/heads/main` at `dffeecd534790c4446a29208674f2b6021640a63`. |
| ADO completion poll | Pass | `az devops invoke` showed run `4679` moved from `inProgress` to `completed/succeeded`; queue time `2026-07-05T14:59:20Z`, finish time `2026-07-05T15:00:55Z`. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO pipeline run | `4679 / 20260705.12` | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_build/results?buildId=4679` | Yes | Retained as normal ADO build history |
| Temporary Project Link | `mp-live-claimbot-pipeline-*` | Local/cloud Project Link store | Yes | Deleted by Playwright fixture |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| ADO pipeline run `4679` | retained | Pipeline history is intentionally retained for auditability. |
| Temporary Project Link | cleaned | The focused Playwright fixture deleted its run-scoped Project Link. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The full pipeline rerun-from-failure UX now works end to end from Chat transcript suggestion to real ADO run creation and successful completion on ClaimBot_API pipeline `#117`. | Info | Keep this destructive gate opt-in and use it before releases or after pipeline workflow changes. |

## Run: mp-live-claimbot-pipeline-focused-regression-20260705-230900

| Field | Value |
|---|---|
| Date/time | 2026-07-05 23:09 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "ClaimBot_API pipeline #117"` |
| Environment flags | `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, destructive mode unset |
| Azure DevOps target | `https://tebssg.visualstudio.com/` / project `TeBS-ClaimBot` / repository `ClaimBot_API` / pipeline `#117 ClaimBot_API` |
| Latest observed ADO run before test | `4679 / 20260705.12`, `completed/succeeded` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Real Chat UI read-only pipeline inspection | Pass | Normal Chat input inspected `ClaimBot_API` pipeline `#117`, surfaced historical failed-run evidence for diagnosis, and avoided approval UI. |
| Real Chat UI rerun-from-failure suggestion | Pass | The failure transcript's `Rerun pipeline` suggestion prepared an `ado_trigger_pipeline` approval for pipeline `#117`. Destructive mode was unset, so the test denied the approval and verified no new ADO run was queued. |
| Real Chat UI direct pipeline approval preparation | Pass | The app prepared a pipeline trigger approval for `#117 ClaimBot_API` through the normal Chat UI path. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary Project Links | cleaned | Each focused Playwright fixture deleted its run-scoped Project Link. |
| ADO pipeline runs | none created | Destructive mode was unset; approval was denied where a trigger was prepared. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The current running app maps the `ClaimBot_API` Project Link to pipeline definition `#117 ClaimBot_API`. | Info | Keep future ClaimBot_API live pipeline tests on the pipeline discovered for the active repository. |

## Run: mp-live-app-full-gate-20260705-231800

| Field | Value |
|---|---|
| Date/time | 2026-07-05 23:18-23:24 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` |
| Environment flags | `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, destructive mode unset |
| Result | Pass |

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Live app business workflows | Pass | `29/29` real browser workflows passed in `6.4m`. |
| Git write and recovery workflows | Pass | Covered selected-file staging, pending approval reload/restore, approval denial, feedback replanning, stage+commit, commit validation failure, empty commit guard, staged-only summary, draft commit message safety, dirty branch switch, merge, merge conflict recovery, create/switch branch, push to local bare remote, pull/rebase, rebase conflict recovery, stash push/apply/pop, stash-pop conflict recovery, restore, revert, local tag creation, and single-tag publication. |
| Security and read-only workflows | Pass | Covered credential-redacted remote target inspection and secret-like diff review without leaking the sensitive value or escalating into write actions. |
| ADO pipeline workflows | Pass | Covered `ClaimBot_API` repository mapping to pipeline `#117 ClaimBot_API`, read-only failed-run evidence inspection, rerun approval preparation, direct pipeline approval preparation, and non-destructive denial without queueing a new ADO run. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary local repos | cleaned | Post-run probe found no `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| ADO pipeline runs | none created | Destructive mode was unset; latest observed `ClaimBot_API` pipeline runs remained `4679`, `4678`, and `4677`, all `completed/succeeded`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The non-destructive live app business baseline is healthy after adding the broader ClaimBot_API pipeline coverage. | Info | Continue toward installed-app first-run UI smoke, Review Queue live persistence/disposition, and broader PR review lifecycle coverage. |

## Run: mp-review-queue-focused-gate-20260705-232800

| Field | Value |
|---|---|
| Date/time | 2026-07-05 23:28 +08:00 |
| Operator/account | local test runner |
| Machine | `zhoulaptop` |
| Daemon command | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverReviewRunRoutes.test.ts test/serverReviewDispositionWritebackRoutes.test.ts test/serverReviewStorageRoutes.test.ts` |
| Browser command | `.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/review-queue.spec.ts --project=chromium` |
| Resource mode | local/mocked; no real ADO or Azure resources mutated |
| Result | Pass |

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Daemon Review Queue routes | Pass | `6/6` Vitest route tests passed across review-run persistence, review storage, review operations, and disposition ADO write-back success/failure recording. |
| Browser Review Queue UI | Pass | `3/3` Chromium tests passed for `/findings`: queue evidence rendering, acknowledgement disposition, request-changes ADO write-back retry, and stale review rerun refresh. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| ADO resources | none created | Browser routes were mocked and daemon tests used local mocked ADO clients. |
| Azure resources | none mutated | This gate does not prove cloud ReviewHistory persistence; that remains gated by Azure Table data-plane permission. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Review Queue local/contract and browser behavior is healthy for the current source. | Info | Next Review Queue evidence should target true cloud ReviewHistory persistence after Storage Table entity permissions are granted. |

## Run: mp-installed-app-first-run-smoke-20260705-233500

| Field | Value |
|---|---|
| Date/time | 2026-07-05 23:35-23:45 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| MSI | `C:\Users\15492\Develop\Agents\CICD-agents\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.10_x64_en-US.msi` |
| Install command | Elevated `msiexec.exe /i <msi> /qn /L*v C:\Users\15492\AppData\Local\Temp\mergepilot-msi-install-20260705-233540.log` |
| Installed desktop | `C:\Program Files\MergePilot\mergepilot-desktop.exe` |
| Installed daemon | `C:\Program Files\MergePilot\mergepilot-daemon.exe` |
| Resource mode | Local installed-app smoke; no ADO or Azure resources mutated |
| Result | Pass with installer cleanup finding |

### Tests Run

| Area | Result | Notes |
|---|---|---|
| MSI install | Pass | Install log ended with `Installation success or error status: 0` for `MergePilot 0.5.10`. |
| Installed process launch | Pass | Launching `C:\Program Files\MergePilot\mergepilot-desktop.exe` opened a visible `MergePilot` window and started bundled `mergepilot-daemon.exe`. Port `127.0.0.1:8787` was owned by the installed daemon, not the development `tsx` daemon. |
| Installed health/config | Pass | `/healthz` returned `ok: true`, `version: 0.5.10`, `llmConfigured: true`, provider `azure`, deployment `gpt-4o`, API version `2024-08-01-preview`, endpoint `https://devagentproj-resource.openai.azure.com`, config source `C:\Users\15492\.mergepilot\config.toml`, cloud Project Link store enabled, cloud secrets disabled, and cloud sessions enabled. |
| Installed auth/avatar | Pass | `/auth/status` returned authenticated, and `/auth/me` returned `Zhou.Ping@totalebizsolutions.com`, display name `Zhou Ping`, `fromCache: true`, and a cached avatar data URL. |
| First local repo workflow | Pass | A temporary Git repo was indexed through `/chat/index-refresh` with `filesSeen: 1`, `filesIndexed: 1`, `embedded: 1`; `/chat/workflow-action` returned `inspect_environment`; first `/chat` returned HTTP 200 with SSE session/progress events and no `sessionId null` or `/chat/workflow-action HTTP 400` regression. |
| Packaged smoke rerun | Pass | `scripts\windows\packaged-sidecar-smoke.ps1 -Port 18905` and `scripts\windows\packaged-msi-payload-smoke.ps1 -Port 18906` both returned `ok: true`, `healthVersion: 0.5.10`, `refreshFilesIndexed: 1`, `workflowPhase: inspect_environment`, and `chatStatus: 200`. |
| Native typed UI automation | Blocked | The Windows Computer Use helper failed to initialize with a package export error under `@oai/sky`, so this run did not automate keystrokes/clicks inside the installed native window. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary Git repo | cleaned | The temp repository used for index/chat smoke was removed after the probe. |
| ADO resources | none created | This smoke did not create PRs, branches, work items, or pipeline runs. |
| Azure resources | none mutated | This smoke read local config and daemon health/auth state only. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Fresh installed `0.5.10` runtime works at process/API/window level. | Info | Keep this as the current installed-app baseline while adding native UI automation later. |
| MSI install leaves old NSIS artifacts and duplicate uninstall state. | High | Fix installer upgrade cleanup: remove old `cicd-agent-desktop.exe`, `cicd-daemon.exe`, old `uninstall.exe`, stale `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Total eBiz Solutions\MergePilot.lnk`, and duplicate `MergePilot 0.5.5` uninstall registry entry. |
| New shortcuts point to the current binary. | Info | `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\MergePilot\MergePilot.lnk` and `C:\Users\Public\Desktop\MergePilot.lnk` target `C:\Program Files\MergePilot\mergepilot-desktop.exe`; the stale shortcut is separate and must be cleaned. |

## Run: mp-installed-app-cleanup-and-first-run-smoke-20260706-0000

| Field | Value |
|---|---|
| Date/time | 2026-07-06 00:00-00:18 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| MSI | `C:\Users\15492\Develop\Agents\CICD-agents\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.10_x64_en-US.msi` |
| Resource mode | Packaged and installed-app smoke; no ADO or Azure resources mutated |
| Result | Pass for packaged/installed first-run APIs; manual admin install still needed for old `CICD-Agent` removal verification |

### Tests Run

| Area | Result | Notes |
|---|---|---|
| WiX legacy cleanup build | Pass | `installer-assets\legacy-cleanup.wxs` compiled and linked with `main.wixobj`. The MSI now includes cleanup components for old `cicd-agent-desktop.exe`, `cicd-daemon.exe`, `uninstall.exe`, old NSIS uninstall registry keys, stale Start Menu shortcut, and the old `CICD-Agent` UpgradeCode `FAD92C43-A438-5354-9454-9D75AC5AF4DA`. |
| Desktop release build | Pass | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run tauri:build` regenerated `MergePilot_0.5.10_x64_en-US.msi` and `MergePilot_0.5.10_x64-setup.exe` successfully. |
| Packaged MSI payload smoke | Pass | `.\scripts\windows\packaged-msi-payload-smoke.ps1 -Port 18908` returned `ok: true`, `legacyCleanupWixValidated: true`, `healthVersion: 0.5.10`, `refreshFilesIndexed: 1`, `workflowPhase: inspect_environment`, and `chatStatus: 200`. |
| Installed daemon first-run smoke | Pass | Launching `C:\Program Files\MergePilot\mergepilot-desktop.exe` started the installed daemon on `127.0.0.1:8787`; `/healthz` returned `version: 0.5.10`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, cloud Project Link store enabled, cloud secrets disabled, and cloud sessions enabled. |
| Installed local repo workflow | Pass | A temporary Git repo was indexed through the installed daemon with `filesSeen: 1` and `filesIndexed: 1`; `/chat/workflow-action` returned `inspect_environment`; first `/chat` returned HTTP `200` with no `sessionId null` and no `/chat/workflow-action HTTP 400` regression. |
| Installed identity/avatar APIs | Pass | `auth-cache.json`, `/auth/status`, and `/auth/accounts` all contained `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, and a cached avatar data URL. A smoke probe that read `email/displayName` was corrected because the API fields are `upn/name`. |
| Admin reinstall from Codex tool channel | Blocked | Non-admin silent install detected old `CICD-Agent` through `OLD_CICD_AGENT_PRODUCTS` but failed at `RemoveExistingProducts` with MSI `Error 1730: You must be an Administrator to remove this application`. Interactive UAC launch from the Codex tool channel did not reliably surface/return, so final old-product removal must be verified by running the MSI from an elevated context. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary Git repo | cleaned | The installed first-run temp repo was removed after the probe. |
| ADO resources | none created | No PRs, branches, work items, or pipeline runs were created. |
| Azure resources | none mutated | The smoke read local config and auth/cache state only. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Fresh installed app first-run API path is healthy. | Info | Keep the packaged smoke as a release gate because it catches sidecar/config/session regressions without requiring admin install. |
| MSI cleanup logic is now present in the generated package, but old `CICD-Agent 0.2.0` removal still needs elevated real-install verification. | High | Run the rebuilt MSI from an administrator shell or approved UAC prompt, then verify no `CICD-Agent` uninstall entry or `C:\Program Files\CICD-Agent` directory remains. |

## Run: mp-default-browser-and-install-state-verifier-20260706-0023

| Field | Value |
|---|---|
| Date/time | 2026-07-06 00:23-00:31 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Non-destructive browser regression plus local install-state verification |
| Result | Pass for default browser gate and installed runtime; strict legacy cleanup still fails until admin install removes old `CICD-Agent` |

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Installed MSI state verifier | Pass | Added `scripts\windows\verify-installed-msi-state.ps1`. Running `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon` returned `ok: true`: one `MergePilot 0.5.10` uninstall entry, `C:\Program Files\MergePilot` contains only `mergepilot-daemon.exe`, `mergepilot-desktop.exe`, and `Uninstall MergePilot.lnk`, current Start Menu shortcut exists, and installed `/healthz` reports `0.5.10`. |
| Strict legacy cleanup verifier | Expected fail | Running `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -RequireLegacyCleanup` returned `ok: false` with two expected failures: legacy uninstall entry `CICD-Agent` remains and `C:\Program Files\CICD-Agent` remains. This is now the repeatable post-admin-install acceptance check. |
| Default Chromium browser gate | Pass | `.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium` discovered `83` tests, passed `54`, and skipped `29` live-app tests by design because live flags were unset. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| ADO resources | none created | Default browser gate used mocked routes or skipped live-app tests. |
| Azure resources | none mutated | Install-state verifier only read local registry/files and installed daemon health. |
| Temporary browser artifacts | retained only on failure | Playwright reported no failures, so no failure screenshots/traces were required for this run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Default browser regression remains green after installer cleanup work. | Info | Keep this gate in the release checklist because it covers Chat layout, Project Link onboarding, image attachment, source preview, Settings permission UX, Review Queue, approvals, transcript behavior, and read-only PR/pipeline routing. |
| Old `CICD-Agent 0.2.0` is still the only install-state blocker. | High | Run the rebuilt MSI as administrator, then rerun `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -RequireLegacyCleanup`. |

## Run: mp-live-readonly-ado-azure-gate-20260706-0027

| Field | Value |
|---|---|
| Date/time | 2026-07-06 00:27-00:28 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Live read-only ADO and Azure diagnostic gates; destructive mode unset |
| Result | Pass as tests; Azure access remains partial |

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Live ADO discovery | Pass | `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts test/liveAdoPipeline.test.ts` passed discovery for project `TeBS-ClaimBot`, repo `ClaimBot_API`, and pipeline `#117 ClaimBot_API`. |
| Live ADO pipeline read-only | Pass | Same core command passed `3/3` read-only tests with `1` destructive queue case skipped. It listed recent pipeline runs and read timeline/log evidence for the latest failed pipeline run. |
| Live ADO PR insight | Pass | `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts` passed `1/1`, inspecting a real ClaimBot_API PR without approval or mutation. |
| Live Azure permission diagnostic | Pass as diagnostic / Partial access | `MERGEPILOT_E2E_LIVE_AZURE=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts` passed `1/1`. ARM reads passed; Storage Table list found `CicdAgentProfiles`; Cosmos SQL database list found `cicd-agent`; Key Vault ARM passed. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| ADO PRs/branches/work items | none created | PR insight and discovery were read-only. |
| ADO pipeline runs | none queued | Destructive pipeline queue test was skipped by design. |
| Azure resources | none mutated | Azure permission test only probed metadata/list/readiness. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| ClaimBot_API ADO read-only integration remains healthy. | Info | Continue using repository-mapped pipeline `#117 ClaimBot_API` for ClaimBot_API business gates. |
| Azure data-plane permission gaps remain unchanged. | Medium | Storage Table entity query needs `Storage Table Data Reader/Contributor`; Cosmos SQL role assignments are missing; Key Vault secret list/read metadata still needs `Key Vault Secrets User`. |

## Run: mp-installed-msi-avatar-and-cleanup-fix-20260706-0041

| Field | Value |
|---|---|
| Date/time | 2026-07-06 00:32-00:41 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| MSI rebuilt | `C:\Users\15492\Develop\Agents\CICD-agents\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.10_x64_en-US.msi` |
| MSI size/time | `54,161,408` bytes, `2026-07-06 00:37:14 +08:00` |
| Resource mode | Local installed-app verification plus package rebuild; no ADO/Azure resources mutated |
| Result | Fix built and packaged; requires reinstall validation |

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Installed MSI verifier after user install | Partial | `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -RequireLegacyCleanup` returned installed `MergePilot 0.5.10`, healthy daemon `/healthz`, and no legacy uninstall entries. Strict mode still failed because `C:\Program Files\CICD-Agent` remained with `Uninstall CICD-Agent.lnk`. |
| Installed daemon health | Pass | `/healthz` returned `ok: true`, `version: 0.5.10`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `llmConfigured: true`, cloud Project Link store enabled, cloud secrets disabled, and cloud sessions enabled. |
| Avatar API diagnostic | Pass for API, fail for installed UI | `/auth/status` returned `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, and an `avatarDataUrl` with valid JPEG bytes (`data:image/jpeg;base64`, `14,486` decoded bytes, JPEG magic bytes `FF D8`). Manual installed UI showed a broken avatar image. |
| Avatar root cause | Fixed in source | The installed desktop CSP allowed only `default-src 'self'` and daemon connections. Tauri WebView therefore blocked the Graph photo data URL. `apps\desktop\src-tauri\tauri.conf.json` now allows `img-src 'self' data: blob:`. |
| Legacy install directory cleanup | Fixed in source | `apps\desktop\src-tauri\installer-assets\legacy-cleanup.wxs` now includes `LegacyCicdAgentInstallDirCleanup`, removing residual `C:\Program Files\CICD-Agent` files including `Uninstall CICD-Agent.lnk`, then removing the empty directory. |
| Desktop typecheck | Pass | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck` passed. |
| Desktop package build | Pass | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run tauri:build` rebuilt the desktop app, sidecar, MSI, and NSIS installer. |
| Packaged MSI payload smoke | Pass | `.\scripts\windows\packaged-msi-payload-smoke.ps1 -Port 18909` returned `ok: true`, `legacyCleanupWixValidated: true`, `healthVersion: 0.5.10`, `refreshFilesSeen: 1`, `refreshFilesIndexed: 1`, `workflowPhase: inspect_environment`, and `chatStatus: 200`. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| ADO resources | none created | This run did not create PRs, branches, work items, or pipeline runs. |
| Azure resources | none mutated | This run only read installed auth and health state. |
| Local MSI extraction temp dir | cleaned | `packaged-msi-payload-smoke.ps1` removed its temporary extraction directory after completion. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Footer avatar failure was not a Microsoft Graph/account issue; it was Tauri CSP blocking data URL images. | Medium | Reinstall the latest rebuilt MSI and visually confirm the footer avatar renders. |
| The user-installed `0.5.10` cleaned the legacy uninstall entry, but not the old `C:\Program Files\CICD-Agent` directory. | Medium | Reinstall the latest rebuilt MSI as administrator and rerun `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -RequireLegacyCleanup`. |
| The rebuilt MSI package includes the CSP and legacy directory cleanup fixes. | Info | Use the rebuilt `MergePilot_0.5.10_x64_en-US.msi` dated `2026-07-06 00:37:14 +08:00` for the next install validation. |

## Run: mp-installed-msi-recheck-latest-not-installed-20260706-0049

| Field | Value |
|---|---|
| Date/time | 2026-07-06 00:47-00:49 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Local installed-app verification; no ADO/Azure resources mutated |
| Result | Installed runtime is healthy but not the latest rebuilt MSI payload |

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Strict installed MSI verifier | Fail for expected latest-install blocker | `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -RequireLegacyCleanup` returned `ok: false`. MergePilot `0.5.10` and daemon health passed; strict mode failed only because `C:\Program Files\CICD-Agent` still exists with `Uninstall CICD-Agent.lnk`. |
| Installed binary freshness | Fail for latest package validation | `C:\Program Files\MergePilot\mergepilot-desktop.exe` has `LastWriteTime 2026-07-06 00:10:10` and SHA256 `DE2EDBEB07984FB79545B597EF8E97BCCDA8220D3C686B9DC04461E743A41C61`. The current rebuilt release exe has `LastWriteTime 2026-07-06 00:38:10` and SHA256 `8F00B0E39941D3EC174C303F060F8956F2C9B098B23A35772C9BD4A8382D26B0`. |
| Latest MSI artifact | Pass | Latest rebuilt MSI remains `C:\Users\15492\Develop\Agents\CICD-agents\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.10_x64_en-US.msi`, `54,161,408` bytes, `2026-07-06 00:37:14 +08:00`, SHA256 `BD7AB85B781FE0A73E0B193AEFB6D88843A0951CDFFA5C06270D0E68294B9D05`. |
| Installed daemon health | Pass | `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `llmConfigured: true`, cloud Project Link store enabled, cloud secrets disabled, and cloud sessions enabled. |
| Avatar API | Pass for API | `/auth/status` returned authenticated user `Zhou Ping` / `Zhou.Ping@totalebizsolutions.com` with an avatar data URL length of `19,339`. Since the installed desktop binary is older than the CSP fix, the visible avatar cannot be accepted as fixed until the latest MSI is installed. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The current installed app is not the latest rebuilt MSI payload, despite sharing version `0.5.10`. | High | Install the MSI dated `2026-07-06 00:37:14 +08:00`, then rerun the strict verifier and avatar visual check. |
| Runtime API smoke is still healthy. | Info | Continue using `/healthz` and `/auth/status` as the installed-app API baseline; the unresolved item is installed payload freshness and UI CSP validation. |

## Run: mp-installed-msi-strict-pass-20260706-0047

| Field | Value |
|---|---|
| Date/time | 2026-07-06 00:47 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Local installed-app verification; no ADO/Azure resources mutated |
| Result | Pass for installed payload freshness, daemon health, auth/avatar API, and legacy cleanup |

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Enhanced strict installed MSI verifier | Pass | `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireMsiPayloadMatch -RequireLegacyCleanup` returned `ok: true`. It extracted the current MSI, compared installed desktop/daemon hashes against the MSI payload, checked daemon health, checked auth status, required an avatar data URL, and required legacy cleanup. |
| Installed payload hash match | Pass | Installed desktop SHA256 `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` matched the MSI payload desktop hash. Installed daemon SHA256 `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` matched the MSI payload daemon hash. |
| Installed file timestamps | Pass | `C:\Program Files\MergePilot\mergepilot-desktop.exe` is dated `2026-07-06 00:37:00`; `mergepilot-daemon.exe` is dated `2026-07-06 00:35:30`. |
| Legacy cleanup | Pass | `C:\Program Files\CICD-Agent` no longer exists. No legacy uninstall entries remain. |
| Installed daemon health | Pass | `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `llmConfigured: true`, cloud Project Link store enabled, cloud secrets disabled, and cloud sessions enabled. |
| Auth/avatar API | Pass | `/auth/status` returned authenticated user `Zhou Ping` / `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, and avatar data URL length `19,339`. |
| Installed UI visual avatar automation | Blocked by automation helper | Attempting Computer Use failed during bootstrap with `Package subpath './dist/project/cua/sky_js/src/targets/windows/internal/computer_use_client_base.js' is not defined by "exports" ... @oai/sky/package.json`. No fallback mouse/keyboard automation was used. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Latest MSI install acceptance now passes at the file/process/API level. | Info | Keep `-RequireMsiPayloadMatch` in the release verifier so same-version stale installs are caught. |
| Legacy `CICD-Agent` cleanup is verified. | Info | Keep the residual directory cleanup component in `legacy-cleanup.wxs`. |
| Avatar API and installed CSP fix are present, but visual avatar rendering was not machine-verified in this run because Computer Use was unavailable at the time. | Low | Superseded by `mp-live-app-full-gate-pull-branch-fix-20260706-0113`, where user visual review and restored Computer Use screenshot automation both confirmed the installed footer avatar. |

## Run: mp-live-app-full-gate-pull-branch-fix-20260706-0113

| Field | Value |
|---|---|
| Date/time | 2026-07-06 01:06-01:13 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Non-destructive live browser gate against source daemon and live ClaimBot_API ADO read-only paths |
| Result | Pass |

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Pull/rebase derivation focused daemon regression | Pass | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatSessionWorkflowDerivation.test.ts` passed `28/28`. The new regression preserves an explicit `origin main` target from natural language pull/rebase prompts. |
| Source daemon runtime | Pass | Temporarily replaced the installed daemon on `127.0.0.1:8787` with source runtime `@mergepilot/daemon dev` (`tsx src/bin.ts`) so the browser gate exercised the current code fix. `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI `gpt-4o`, and config `C:\Users\15492\.mergepilot\config.toml`. |
| Focused behind-branch pull/rebase Chat UI | Pass | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "pulls a behind branch"` passed `1/1`. The approval card used the concrete command `git pull --rebase origin main` and the local `HEAD` advanced to the remote commit. |
| Full live app business gate | Pass | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` passed `29/29` in `7.1m`. Coverage included selected-file staging, pending approval reload/restore, denial, denial feedback replanning, stage+commit, commit validation failure, empty commit guard, staged-only summary, draft commit message safety, secret-like diff redaction, dirty branch switch, merge/rebase/pull/stash/restore/revert/tag workflows, safe single-tag publication, credential-redacted remote target inspection, and ClaimBot_API pipeline `#117` read-only/approval preparation. |
| Installed footer avatar visual confirmation | Pass | User supplied an installed-app screenshot after reinstall showing the footer avatar rendered for `Zhou Ping`. After the Computer Use plugin cache fix, automated Windows capture also succeeded against `com.mergepilot.desktop`: the snapshot showed the footer avatar, `Zhou Ping`, `Ask MergePilot anything`, `ClaimBot_API link`, `Add image`, and `GPT-4o`. |
| Computer Use automation recovery | Pass | The previous `@oai/sky` package-export bootstrap issue was fixed in the local plugin cache by dynamically importing the internal Computer Use client file by absolute `file://` path. `sky.list_apps()` returned 40 apps, including `MergePilot`, and `get_window_state` captured the installed MergePilot window. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| ADO resources | none created | Destructive mode was unset, so no ADO PR, work item, branch, or pipeline run was created. |
| Temporary Git repositories | cleaned by test fixture | The full live app gate removed its run-scoped `%TEMP%\mergepilot-live-*` repositories during test cleanup. |
| Installed daemon | restored after source test | The live browser gate intentionally used the source daemon because the installed binary did not include this turn's pull/rebase derivation fix at that moment. After the gate, the source daemon was stopped and `C:\Program Files\MergePilot\mergepilot-daemon.exe --port 8787` was started. `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI `gpt-4o`, and config `C:\Users\15492\.mergepilot\config.toml`. This package-build gap was later closed by `mp-packaged-msi-pull-branch-fix-20260706-0126`; a fresh admin install is still needed only for the already-installed app on disk to receive that exact rebuilt MSI payload. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Pull/rebase approval now preserves the explicit remote branch target. | High | Resolved for the current packaged artifact by `mp-packaged-msi-pull-branch-fix-20260706-0126`; the rebuilt MSI payload smoke passed after the derivation fix was included in the sidecar build. |
| Full non-destructive live app business gate is green after the fix. | Info | Keep this gate as the broad regression check before the next release build. |
| Installed avatar rendering is visually and automatically confirmed. | Info | Keep `img-src 'self' data: blob:` in Tauri CSP, keep `-RequireAvatar` in the installed-state verifier, and keep Computer Use as the preferred native-window screenshot path while the local plugin-cache patch remains present. |

## Run: mp-packaged-msi-pull-branch-fix-20260706-0126

| Field | Value |
|---|---|
| Date/time | 2026-07-06 01:18-01:26 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Local package build and extracted-MSI payload smoke; no ADO/Azure resources mutated |
| Result | Pass |

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Daemon typecheck | Pass | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck` passed. |
| Desktop typecheck | Pass | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck` passed. |
| Desktop package build | Pass | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run tauri:build` rebuilt the sidecar, desktop app, MSI, and NSIS installer. The build included the pull/rebase branch-target derivation fix that was already covered by daemon regression and live Chat UI tests. |
| Packaged MSI payload smoke | Pass | `.\scripts\windows\packaged-msi-payload-smoke.ps1 -Port 18910` returned `ok: true`, `legacyCleanupWixValidated: true`, `healthVersion: 0.5.10`, `refreshFilesSeen: 1`, `refreshFilesIndexed: 1`, `workflowPhase: inspect_environment`, and `chatStatus: 200`. |

### Artifacts

| Artifact | Size | SHA256 |
|---|---:|---|
| `apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.10_x64_en-US.msi` | `54,161,408` bytes | `EBD08A0D20FF7321C47122649E9463FD9BD66C0E24221DF8D196FB9226D69C0F` |
| `apps\desktop\src-tauri\target\release\bundle\nsis\MergePilot_0.5.10_x64-setup.exe` | `45,718,379` bytes | `C8E4004A5B5F55BEB80E3006961E821A2E0F5928EFFAD4A45DCC1E51E8C0D9D0` |
| `apps\desktop\src-tauri\binaries\mergepilot-daemon-x86_64-pc-windows-msvc.exe` | `78,070,517` bytes | `0F4428F7848C8AA8A099F7FD0B10F888ABFAF98DF7A20C400875130074BD12F5` |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| ADO resources | none created | Package build and payload smoke were local-only. |
| Azure resources | none mutated | Package build and payload smoke only read local config through daemon startup. |
| Installed daemon | left running | `127.0.0.1:8787` remained owned by `C:\Program Files\MergePilot\mergepilot-daemon.exe`; `/healthz` returned `ok: true`, `0.5.10`, Azure OpenAI `gpt-4o`, and config `C:\Users\15492\.mergepilot\config.toml`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The pull/rebase derivation fix is now present in the rebuilt packaged sidecar/MSI artifact. | Info | A fresh admin install is still required before the already-installed app on disk contains this exact package payload. |
| Packaged runtime smoke remains healthy after the derivation fix. | Info | Keep `packaged-msi-payload-smoke.ps1` in the release gate. |

## Run: mp-installed-restart-persistence-20260706-0135

| Field | Value |
|---|---|
| Date/time | 2026-07-06 01:32-01:35 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Installed daemon restart persistence smoke; temporary local Git repo plus temporary Project Link; no ADO resources mutated |
| Result | Pass for Project Link, user config, and chat-history session persistence; partial for full assistant completion persistence |

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Installed daemon restart | Pass | Restarted only `C:\Program Files\MergePilot\mergepilot-daemon.exe` on `127.0.0.1:8787`. After restart, `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudProjectLinkStore: true`, and `cloudSessions: true`. |
| Project Link restart persistence | Pass | Created temporary Project Link `mp-projectlink-restart-20260706-013509 Project Link` with ID `a0c540440974aff3`, confirmed it existed before restart, restarted the installed daemon, confirmed it still existed after restart, then deleted it successfully. Health uptime moved from `150.359` seconds before restart to `2.479` seconds after restart. |
| Chat history restart persistence | Pass with scope note | Created a temporary chat session `chat_1783272751746_39fa96` from prompt `Persistence smoke mp-persist-20260706-013229...`, restarted the installed daemon, and confirmed the session appeared in `/chat/history` after restart. The retained message count was `1` user message, so this proves session/history persistence across restart, not assistant-completion persistence. The test session was deleted successfully. |
| User/model config persistence | Pass | Before and after restart, `/healthz` continued to report config source `C:\Users\15492\.mergepilot\config.toml`, Azure OpenAI provider, deployment `gpt-4o`, API version `2024-08-01-preview`, and endpoint `https://devagentproj-resource.openai.azure.com`. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary Project Link | Deleted | `DELETE /project-links/a0c540440974aff3` returned `ok: true`. |
| Temporary chat session | Deleted | `DELETE /chat/chat_1783272751746_39fa96` returned `ok: true`. |
| Temporary repositories | Deleted | Run-scoped repos under `%TEMP%\mp-projectlink-restart-*` and `%TEMP%\mp-persist-*` were removed. |
| ADO/Azure resources | None created | This smoke only used local daemon routes and existing cloud/local stores. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Installed daemon restart preserves Project Link state and user model configuration. | Info | Add this as a scripted installed-app persistence verifier instead of keeping it as an ad hoc probe. |
| Chat session/history survives restart, but this run did not prove assistant completion persistence. | Medium | Add a deterministic mocked/short-live chat completion persistence test that waits for a terminal `done` event and verifies assistant bubbles/messages after restart. |

## Run: mp-installed-persist-20260706-013958

| Field | Value |
|---|---|
| Date/time | 2026-07-06 01:39-01:40 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Scripted installed daemon restart persistence smoke; temporary local Git repo plus temporary Project Link and chat session; no ADO resources mutated |
| Result | Pass |

### Command

```powershell
.\scripts\windows\installed-restart-persistence-smoke.ps1
```

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Installed daemon identity guard | Pass | The script verified that port `8787` was owned by `C:\Program Files\MergePilot\mergepilot-daemon.exe` before restarting it. |
| Project Link restart persistence | Pass | Created temporary Project Link ID `9abbf2b48e644f44`, confirmed it existed before restart, restarted the installed daemon, confirmed it still existed after restart, then deleted it. |
| Chat completion restart persistence | Pass | Posted a real `/chat` request with expected completion `persistence-ok-mp-installed-persist-20260706-013958`, received HTTP `200`, observed terminal SSE `event: done`, confirmed the assistant completion was persisted before restart, restarted the installed daemon, then confirmed the same assistant completion was still present in `/chat/chat_1783273200630_6a6a6a/messages`. |
| Chat history restart persistence | Pass | Chat session `chat_1783273200630_6a6a6a` appeared in `/chat/history` before and after daemon restart. |
| User/model config persistence | Pass | Before and after restart, `/healthz` reported version `0.5.10`, config source `C:\Users\15492\.mergepilot\config.toml`, provider `azure`, deployment `gpt-4o`, `cloudProjectLinkStore: true`, and `cloudSessions: true`. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary Project Link | Deleted | `DELETE /project-links/9abbf2b48e644f44` returned `ok: true`. |
| Temporary chat session | Deleted | `DELETE /chat/chat_1783273200630_6a6a6a` returned `ok: true`. |
| Temporary repository | Deleted | `%TEMP%\mp-installed-persist-20260706-013958` was removed. A follow-up hygiene check removed two older failed-probe temp directories and confirmed no `mp-installed-persist-*`, `mp-projectlink-restart-*`, or `mp-persist-*` temp directories remain. |
| ADO/Azure resources | None created | The smoke used local daemon routes and existing configured stores only. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Installed restart persistence is now scriptable and completion-level. | Info | Keep `scripts\windows\installed-restart-persistence-smoke.ps1` in the release gate after installed MSI verification. |
| User/model config, Project Link state, chat history, and assistant completion all survived installed daemon restart. | Info | This closes the previous partial persistence gap from `mp-installed-restart-persistence-20260706-0135`. |

## Run: mp-live-azure-permissions-20260706-0143

| Field | Value |
|---|---|
| Date/time | 2026-07-06 01:43-01:44 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Live Azure permission diagnostic only; no Azure resources mutated |
| Result | Pass as diagnostic, access still Partial |

### Command

```powershell
$env:MERGEPILOT_E2E_LIVE_AZURE='1'
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts
```

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Azure account | Pass | Azure CLI is signed in as `Zhou.Ping@totalebizsolutions.com`. The default CLI subscription is `TeBS-Internal Azure Bot` (`9e1bd067-1e30-4e20-b29a-f2343141a25e`), while the probe explicitly targeted subscription `a99512b0-3dc5-476f-8f43-d7db40fbc923` and resource group `developmentagent`. |
| Storage account ARM | Pass | Read `devagentstorage001`, kind `StorageV2`, location `eastus`. |
| Storage Table list | Pass | Listed table `CicdAgentProfiles`. |
| Storage Table entity query | Fail diagnostic | Azure CLI reported missing data-plane permission and recommended Storage Table Data Reader/Contributor among the required roles. |
| Cosmos account ARM | Pass | Read `devagentcosmos001`, endpoint `https://devagentcosmos001.documents.azure.com:443/`, kind `GlobalDocumentDB`. |
| Cosmos SQL database list | Pass | Listed SQL database `cicd-agent`. |
| Cosmos SQL role assignments | Fail diagnostic | No Cosmos SQL data-plane role assignments were returned. |
| Key Vault ARM | Pass | Read `devagentkv001`, RBAC authorization enabled, URI `https://devagentkv001.vault.azure.net/`. |
| Key Vault secret list | Fail diagnostic | RBAC denied `Microsoft.KeyVault/vaults/secrets/readMetadata/action` for Azure CLI app `04b07795-8ddb-461a-bbee-02f9e1bf7b46` and user object `8f74dcbd-1729-4b19-83be-577f45d5a55b`. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Azure Storage | none created | Permission probe only listed tables and attempted one entity query. |
| Cosmos DB | none created | Permission probe only read account/database metadata and role assignments. |
| Key Vault | none created | Permission probe only attempted secret metadata listing. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Azure data-plane access remains incomplete. | Medium | Grant `Storage Table Data Reader` or `Storage Table Data Contributor` on `devagentstorage001` / `CicdAgentProfiles`, assign Cosmos DB Built-in Data Contributor scoped to `devagentcosmos001/cicd-agent` where possible, and grant `Key Vault Secrets User` on `devagentkv001` if Key Vault secret reads are enabled. |
| True cloud ReviewHistory persistence is still not provable in this environment. | Medium | Rerun Review Queue cloud persistence after Storage Table entity query succeeds. |

## Run: mp-live-ado-readonly-20260706-0147

| Field | Value |
|---|---|
| Date/time | 2026-07-06 01:47 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Live Azure DevOps read-only probes; destructive queue disabled; no ADO resources mutated |
| Result | Pass |

### Commands

```powershell
$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts test/liveAdoPipeline.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts
az pipelines runs list --organization https://tebssg.visualstudio.com/ --project TeBS-ClaimBot --pipeline-ids 117 --top 5
```

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Live ADO discovery | Pass | `test/liveAdoDiscovery.test.ts` passed 1/1. Current account discovered Azure DevOps project `TeBS-ClaimBot`, repository `ClaimBot_API`, and repository-filtered pipeline `#117 ClaimBot_API`. |
| Live pipeline recent runs | Pass | `test/liveAdoPipeline.test.ts` listed recent runs for ClaimBot_API pipeline `#117`. |
| Live pipeline failed-run timeline/log evidence | Pass | `test/liveAdoPipeline.test.ts` read timeline and log evidence for the latest failed or canceled run when available. |
| Destructive pipeline queue guard | Pass | The destructive queue test was skipped because `MERGEPILOT_E2E_DESTRUCTIVE` was not set. |
| Live PR insight daemon workflow | Pass | `test/liveAdoPrInsight.test.ts` passed 1/1 at 01:47. `/chat/workflow-action` inspected real ClaimBot_API PR `#2655`, returned HTTP 200, completed the six read tools, produced `workflowKind: pr`, `workflowPhase: inspected`, and did not produce a pending approval. |
| Live PR insight cleanup retest | Pass | After this run exposed accumulated `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories from earlier runs, `test/liveAdoPrInsight.test.ts` was updated to remove its run-scoped `RUNTIME_DATA_DIR` in `afterAll`. Ten stale directories were removed, then the live PR insight test was rerun at 01:51 and passed 1/1 with zero leftover `mergepilot-daemon-live-pr-insight-*` directories. |
| Current pipeline baseline | Pass | `az pipelines runs list --pipeline-ids 117 --top 5` showed recent ClaimBot_API pipeline runs `4679`, `4678`, `4677`, `4676`, and `4674` all `succeeded`. The latest four runs are on `refs/heads/main` at commit `dffeecd534790c4446a29208674f2b6021640a63`; run `4674` is on `18c62b707203670b70beab8cf4e3c89bec1a4b7d`. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| ADO pipeline runs | none created | Destructive queue was disabled. |
| ADO PR/work item/branch/tag resources | none created | PR insight was read-only. |
| Local temporary daemon data | cleaned by test process | `liveAdoPrInsight.test.ts` uses a run-scoped `RUNTIME_DATA_DIR`, closes the in-process daemon after the test, and now removes that temp directory in `afterAll`. Follow-up check reported `leftoverTempDirs: 0`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| ADO read-only business gate remains healthy for ClaimBot_API. | Info | Keep `liveAdoDiscovery`, `liveAdoPipeline`, and `liveAdoPrInsight` in the release gate for ClaimBot_API PR/pipeline insight. |
| Pipeline #117 baseline remains green. | Info | Recent retained runs `4679` through `4676` succeeded on commit `dffeecd`; future pipeline failures should be treated as new regressions unless tied to a deliberate test branch. |
| Live PR insight test cleanup now removes run-scoped temp data. | Info | Keep the `afterAll` cleanup in `packages/daemon/test/liveAdoPrInsight.test.ts` so repeated business-test runs do not accumulate `%TEMP%` directories. |

## Run: mp-default-chromium-browser-gate-20260706-0154

| Field | Value |
|---|---|
| Date/time | 2026-07-06 01:54-01:57 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Mocked/default Playwright Chromium browser gate; live-app tests skipped by design; no ADO/Azure resources mutated |
| Result | Pass |

### Command

```powershell
.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium
```

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Default Chromium browser gate | Pass | Playwright discovered 83 Chromium tests, passed 54, and skipped 29 live-app tests by design. Runtime was `3.1m`. |
| Chat layout and workflow UI | Pass | Covered Project Link chat shell layout, narrow onboarding, compact command chips, structured commit/PR/pipeline controls, branch divergence, pinned summary dropdown behavior, no-link onboarding, ADO field inference, ClaimBot_API pipeline recommendation, image attach/drop/paste, PR insight routing, pipeline setup guidance, read-only PR/pipeline/local-Git natural-language routing, approval composer state, suggestion visibility, workflow follow-up chips, UI stream chunks, deduplication, long streamed markdown, stop/late-response handling, artifact workspace, Mermaid error display, source references, code preview copy/tab cleanup, saved PR insight artifact lookup, and ordinary artifact shell behavior. |
| Review Queue browser gate | Pass | Covered queue evidence rendering, acknowledgement disposition, ADO write-back retry, and stale review rerun refresh. |
| Settings permission browser gate | Pass | Covered missing Key Vault permission messaging, switching built-in model secrets to local `.env`, clearing cloud warnings in local mode, and surfacing latest Key Vault set failure after switching back. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| ADO/Azure resources | none created | Live-app tests were skipped and mocked/default browser tests do not mutate live cloud resources. |
| Business temp directories | none remaining | Follow-up check reported `leftoverBusinessTempDirs: 0` for `mergepilot-live-*`, `mergepilot-daemon-live-pr-insight-*`, `mp-installed-persist-*`, `mp-persist-*`, and `mp-projectlink-restart-*`. |
| Installed daemon | healthy | Post-run `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI `gpt-4o`, `cloudProjectLinkStore: true`, and `cloudSessions: true`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Mocked/default browser business baseline remains green after the latest installed-persistence, live ADO, and cleanup-test changes. | Info | Keep this gate as the non-live UI regression baseline before release packaging or destructive live runs. |

## Run: mp-ai-insight-quality-gate-20260706-0204

| Field | Value |
|---|---|
| Date/time | 2026-07-06 01:59-02:04 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Local seeded AI quality fixtures; no ADO/Azure resources mutated |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/aiInsightQuality.test.ts test/aiInsightQualityChatPlanner.test.ts test/chatPlannerGuards.test.ts test/chatContext.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverAiInsightQualityRoutes.test.ts
```

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Core AI insight quality fixtures | Pass | 4 focused core test files passed, 15/15 tests. Coverage includes final-answer scoring, ChatPlanner final-answer quality, read-only guard behavior, Git/context evidence, seeded ClaimBot-style change-review context, binary/minified source exclusion, architecture golden context, index status, and embedding fallback. |
| Daemon `/chat` SSE AI insight gate | Pass | `test/serverAiInsightQualityRoutes.test.ts` passed 2/2. The seeded dirty ClaimBot-style repo verifies `/chat` emits no approval event for read-only review, accepts grounded final answers with required files and risk categories, rejects vague/write-escalating final answers, and strips hidden write approvals from the final result. |
| Test cleanup hardening | Pass | This run exposed accumulated `%TEMP%\mergepilot-ai-quality-*` and `%TEMP%\cicd-chat-context-*` directories from older runs. `serverAiInsightQualityRoutes.test.ts` now removes its runtime data dir and seeded repos in `afterEach`; `chatContext.test.ts` now tracks and removes its temp repos/data dirs in `afterEach`. Old stale directories were removed, and the rerun left `leftoverTempDirs: 0`. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| ADO/Azure resources | none created | These are local seeded tests. |
| AI quality temp directories | cleaned | Follow-up check reported zero `mergepilot-ai-quality-*` and `cicd-chat-context-*` directories. |
| Installed daemon | healthy | Post-run `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI `gpt-4o`, `cloudProjectLinkStore: true`, and `cloudSessions: true`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| AI insight quality gates remain green and now clean their temporary data. | Info | Keep these focused gates before broader live-app runs because they protect the core product goal: specific AI insight rather than generic Git/ADO summaries. |

## Run: mp-installed-native-ui-computer-use-20260706-0210

| Field | Value |
|---|---|
| Date/time | 2026-07-06 02:05-02:10 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Installed native Windows app smoke using Computer Use plus installed-state verifier; no ADO/Azure resources mutated |
| Result | Partial |

### Commands / Probes

```powershell
.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireMsiPayloadMatch -RequireLegacyCleanup
GET http://127.0.0.1:8787/healthz
GET http://127.0.0.1:8787/auth/status
```

Computer Use probes:

- `sky.list_apps()` returned the installed `MergePilot` app with one `com.mergepilot.desktop` window.
- `sky.list_windows()` returned the installed process window: `process:C:\Program Files\MergePilot\mergepilot-desktop.exe`, title `MergePilot`.
- `get_window_state(..., include_text: true)` returned MergePilot accessibility text from the installed process window.

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Installed daemon health | Pass | `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI provider, deployment `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudProjectLinkStore: true`, `cloudSecrets: false`, and `cloudSessions: true`. |
| Installed auth/avatar API | Pass | `/auth/status` returned authenticated user `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, and a JPEG `avatarDataUrl`. |
| Installed native window accessibility | Pass | Computer Use read the installed native window text and verified `New chat`, `Project Links`, `Review Queue`, `Pipelines`, `Settings`, `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `ClaimBot_API link`, and `TeBS-ClaimBot / ClaimBot_API`. |
| Legacy install cleanup | Pass | `C:\Program Files\CICD-Agent` no longer exists, legacy publisher shortcut dir is absent, and no legacy uninstall entries were reported. |
| Installed payload hash match | Fail | The installed `mergepilot-desktop.exe` and `mergepilot-daemon.exe` hashes do not match the current MSI payload hashes from `apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.10_x64_en-US.msi`. This means the installed app is usable but is not proven to be the current rebuilt MSI payload. |
| Computer Use visual screenshot capture | Partial | Computer Use can enumerate and read the installed MergePilot accessibility tree, but `activate_window` returned `failed to activate captured window`, and the screenshot surface showed an unrelated Windows background instead of the MergePilot pixels. Treat current evidence as text-level native UI evidence, not pixel-level screenshot evidence. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| ADO/Azure resources | none created | This run only inspected the installed app and local daemon endpoints. |
| Installed app state | left running | MergePilot stayed open and the installed daemon remained healthy on `127.0.0.1:8787`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Computer Use bootstrap is restored, but screenshot/activation evidence is weaker than expected. | Medium | Keep using accessibility text for low-risk installed UI checks, but do not claim pixel-level native UI verification until `activate_window` and screenshots reliably target MergePilot. |
| The installed Program Files binaries are stale relative to the current MSI payload. | High | Reinstall the latest `MergePilot_0.5.10_x64_en-US.msi` from an elevated installer context, then rerun `verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireMsiPayloadMatch -RequireLegacyCleanup`. |

## Run: mp-current-msi-payload-smoke-20260706-0214

| Field | Value |
|---|---|
| Date/time | 2026-07-06 02:11-02:14 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | MSI administrative extraction and payload runtime smoke; no Program Files install and no ADO/Azure resources mutated |
| Result | Pass |

### Command

```powershell
.\scripts\windows\packaged-msi-payload-smoke.ps1 -Port 18921
```

### Artifact

| Field | Value |
|---|---|
| MSI path | `apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.10_x64_en-US.msi` |
| MSI size | `54,161,408` bytes |
| MSI SHA256 | `EBD08A0D20FF7321C47122649E9463FD9BD66C0E24221DF8D196FB9226D69C0F` |

### Tests Run

| Area | Result | Notes |
|---|---|---|
| MSI administrative extraction | Pass | Extracted `mergepilot-desktop.exe` and `mergepilot-daemon.exe` from the MSI into `%TEMP%\mergepilot-msi-extract-*`. |
| Legacy cleanup WiX markers | Pass | `legacyCleanupWixValidated: true`; generated WiX and the `legacy-cleanup.wxs` fragment include the required cleanup markers. |
| Extracted daemon health | Pass | Extracted daemon started on port `18921` and returned `healthVersion: 0.5.10`. |
| Repository indexing smoke | Pass | Temp repo refresh reported `refreshFilesSeen: 1` and `refreshFilesIndexed: 1`. |
| Workflow action smoke | Pass | `/chat/workflow-action` reached `workflowPhase: inspect_environment`. |
| First chat API smoke | Pass | First `/chat` request returned HTTP `200`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The current MSI payload is internally healthy. | Info | The installed-app failure is not caused by a broken MSI payload; it is caused by Program Files containing binaries whose hashes do not match this latest MSI. |
| MSI extraction emitted Git CRLF warnings for temp fixture files. | Low | Warnings only referenced the temporary extracted smoke fixture (`README.md`, `index.ts`) and did not fail the smoke. |

## Run: mp-live-secret-review-browser-scored-20260706-0230

| Field | Value |
|---|---|
| Date/time | 2026-07-06 02:18-02:30 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Focused live browser Chat gate against a temporary source daemon; temp Git repo only; no ADO/Azure resources mutated |
| Result | Pass after product and test hardening |

### Commands / Probes

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/workspaceWorkflow.test.ts test/serverReadOnlyGitChatRoutes.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
$env:MERGEPILOT_E2E_LIVE_APP='1'
$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "redacts secret-like"
GET http://127.0.0.1:8787/healthz
```

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Workspace workflow summary unit | Pass | `inspect_changes` now flags `.env.sample` as a security/config risk and keeps the changed-file evidence. |
| Read-only Git Chat routes | Pass | Focused daemon route tests still preserve read-only behavior and do not emit approval for review-only change prompts. |
| Daemon typecheck | Pass | `@mergepilot/daemon typecheck` completed successfully. |
| Browser secret-review AI scorer | Pass | Focused Playwright gate waited for terminal Chat state, collected visible `main` transcript text, and scored it with `evaluateAiInsightAnswer` requiring `.env.sample`, `security`, `config`, and review-only scope. |
| Cleanup | Pass | Follow-up probe reported `leftoverSecretReviewDirs: 0`. |
| Runtime restoration | Pass | After source-daemon validation, the installed daemon was restored on `127.0.0.1:8787`; `/healthz` returned `ok: true`, version `0.5.10`, Azure deployment `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The direct read-only `inspect_changes` path only listed changed files and did not identify sensitive config risk for `.env.sample`. | High | Fixed in source: `inspect_changes` summaries now add a security/config risk line for `.env`, appsettings, `Web.config`, config, secret, key, credential, and settings paths. Rebuild/reinstall before claiming this behavior in the installed MSI. |
| The previous browser secret-review test could pass by matching the user prompt or hidden History text instead of the final visible assistant transcript. | Medium | Fixed: the test now waits for the Stop button to disappear/composer to re-enable, reads `main.innerText()`, and scores the visible transcript instead of using broad text matching. |
| Browser-output AI quality scoring is now connected to one real Chat UI path. | Info | Broaden this pattern to PR insight, pipeline diagnosis, architecture/context answers, and live model batches. |

## Run: mp-live-pipeline-browser-scored-20260706-0237

| Field | Value |
|---|---|
| Date/time | 2026-07-06 02:36-02:37 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Focused live browser Chat gate against the running app runtime; temporary Project Link only; read-only ADO pipeline inspection; no ADO pipeline run queued |
| Result | Pass |

### Commands / Probes

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/aiInsightQuality.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck
$env:MERGEPILOT_E2E_LIVE_APP='1'
$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "inspects ClaimBot_API pipeline #117 failure evidence"
```

### Tests Run

| Area | Result | Notes |
|---|---|---|
| AI quality evaluator evidence checks | Pass | `test/aiInsightQuality.test.ts` passed 3/3 after adding `requiredEvidence`, which can score business evidence such as `Pipeline #117`, `#4665`, `MSBuild`, and `Microsoft.Web.Publishing.targets` without pretending they are source files. |
| Core typecheck | Pass | `@mergepilot/core typecheck` completed successfully. |
| Browser pipeline failure transcript scorer | Pass | Focused live Playwright gate passed 1/1. The visible Chat transcript for `Inspect pipeline 117 and summarize recent failed run evidence` was scored with `requiredEvidence: ["Pipeline #117", "#4665", "MSBuild"]`, `requiredCategories: ["deployment"]`, and `reviewOnly: true`. |
| ADO mutation guard | Pass | The test verified no `Approval required`, no `ado_trigger_pipeline`, and no `Pipeline #108` leakage while inspecting ClaimBot_API pipeline `#117`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The AI quality evaluator needed a generic business-evidence check for non-file evidence. | Medium | Fixed: `requiredEvidence` now supports pipeline/PR/build/policy evidence strings. Reuse it for PR insight and architecture transcript scoring next. |
| Pipeline diagnosis now has visible browser-output quality scoring, not just text-presence assertions. | Info | Broaden to PR insight visible transcript scoring and architecture/context answer scoring. |

## Run: mp-pr-insight-browser-scored-20260706-0241

| Field | Value |
|---|---|
| Date/time | 2026-07-06 02:40-02:41 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Mocked browser PR insight transcript gate; no ADO/Azure resources mutated |
| Result | Pass |

### Commands / Probes

```powershell
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts --project=chromium --grep "natural-language read-only PR insight"
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/aiInsightQuality.test.ts
GET http://127.0.0.1:8787/healthz
```

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Browser PR insight transcript scorer | Pass | Focused Chromium test passed 1/1. The visible transcript for natural-language PR insight is scored with `requiredEvidence` for `PR #2655`, `16 changed file(s)`, `0 failed/canceled build(s)`, and `0 failed policy evaluation(s)`, requires deployment evidence, and keeps review-only scope. |
| AI quality evaluator regression | Pass | `test/aiInsightQuality.test.ts` passed 3/3, keeping the new `requiredEvidence` behavior covered. |
| Runtime health | Pass | Installed daemon remained healthy on `127.0.0.1:8787` with version `0.5.10`, Azure deployment `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| PR insight visible browser output now has a quality scorer for concrete PR evidence. | Info | Live ADO PR insight remains covered by `test/liveAdoPrInsight.test.ts`; a future slice can add a real live browser PR insight scorer if a stable PR prompt and output are needed. |
| Browser transcript scoring now covers local change review, pipeline diagnosis, and PR insight. | Info | Next AI-output quality gap is architecture/context answer scoring or live model batch scoring. |

## Run: mp-architecture-browser-scored-20260706-0251

| Field | Value |
|---|---|
| Date/time | 2026-07-06 02:43-02:51 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Mocked browser architecture/source-reference gate; no ADO/Azure resources mutated |
| Result | Pass after fixture hardening |

### Commands / Probes

```powershell
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts --project=chromium --grep "source preview|source references|project-context source references"
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/aiInsightQuality.test.ts
GET http://127.0.0.1:8787/healthz
```

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Browser architecture transcript scorer | Pass after fixture hardening | Focused Chromium source-reference gate now scores visible architecture transcript text. It requires `apps/desktop/src/pages/Chat.tsx`, `packages/core/src/chatContext.ts`, `desktop UI`, `repository grounding`, and review-only scope. |
| Source reference preview behavior | Pass | The same focused run passed 2/2 and still verifies that clicking the `chatContext.ts` reference opens only the referenced file in the right-side code preview, shows line count and target line, supports copy actions, and cleans up tabs. |
| AI quality evaluator regression | Pass | `test/aiInsightQuality.test.ts` passed 3/3, keeping `requiredEvidence` behavior covered. |
| Runtime health | Pass | Installed daemon remained healthy on `127.0.0.1:8787` with version `0.5.10`, Azure deployment `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The first scorer attempt failed because the architecture answer body did not mention the concrete source files even though metadata/source references existed. | Medium | Fixed the fixture to model the desired product behavior: the answer body now names `Chat.tsx` and `chatContext.ts` directly, while source references remain clickable supporting evidence. |
| Browser transcript scoring now covers local change review, pipeline diagnosis, PR insight, and architecture/source-grounded answers. | Info | Next AI-output quality gap is live model batch scoring and broader installed-app replay of these gates after rebuilding/reinstalling the MSI. |

## Run: mp-mocked-browser-smoke-tags-20260706-0258

| Field | Value |
|---|---|
| Date/time | 2026-07-06 02:55-02:58 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Mocked Playwright browser smoke; no ADO/Azure resources mutated |
| Result | Pass |

### Command

```powershell
.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium --grep "@smoke"
```

### Tests Run

| Area | Result | Notes |
|---|---|---|
| Chat shell | Pass | `@smoke @mocked keeps the project-linked chat shell inside the viewport`. |
| PR insight controls | Pass | `@smoke @mocked routes PR insight controls without requiring a typed PR id`. |
| Pipeline controls | Pass | `@smoke @mocked routes pipeline controls as explicit structured CI workflow actions`. |
| Missing pipeline setup | Pass | `@smoke @mocked guides pipeline setup when the active Project Link has no pipeline ID`. |
| Natural-language PR insight | Pass | `@smoke @mocked renders natural-language read-only PR insight without approval UI`. |
| Natural-language pipeline inspection | Pass | `@smoke @mocked renders natural-language read-only pipeline inspection without trigger approval`. |
| Architecture/source references | Pass | `@smoke @mocked renders project-context source references in the conversation`. |
| Review Queue | Pass | `@smoke @mocked renders review-run queue evidence and records an acknowledged disposition`. |
| Settings permissions | Pass | `@smoke @mocked settings explains missing Key Vault permission and can switch built-in model secrets to local env`. |

### Summary

| Metric | Value |
|---|---|
| Tests discovered by `@smoke` | 9 |
| Passed | 9 |
| Failed | 0 |
| Duration | 41.1 seconds |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| A repeatable mocked browser smoke gate now exists for release-critical app workflows. | Info | Keep this smaller than the full browser suite; add only workflows that should block every release quickly. |
| No live ADO/Git mutation is attached to `@smoke`. | Info | Keep live and destructive tests behind explicit environment flags. |

## Run: mp-installed-native-ui-computer-use-20260706-0301

| Field | Value |
|---|---|
| Date/time | 2026-07-06 03:01 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Installed Windows app verifier plus Computer Use accessibility inspection; no ADO/Azure resources mutated |
| Result | Partial |

### Commands / Probes

```powershell
.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireMsiPayloadMatch -RequireLegacyCleanup
GET http://127.0.0.1:8787/healthz
GET http://127.0.0.1:8787/auth/status
Computer Use: sky.list_apps()
Computer Use: get_window_state({ include_text: true }) for com.mergepilot.desktop
```

### Results

| Area | Result | Notes |
|---|---|---|
| Installed daemon health | Pass | `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI `gpt-4o`, endpoint `https://devagentproj-resource.openai.azure.com`, `cloudSecrets: false`, and `cloudSessions: true`. |
| Installed auth/avatar API | Pass | `/auth/status` returned authenticated user `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, and a JPEG data URL length of `19339`. |
| Legacy cleanup | Pass | `C:\Program Files\CICD-Agent` does not exist, the legacy publisher Start Menu folder does not exist, and only one `MergePilot` uninstall entry is present. |
| Installed native window discovery | Pass | Computer Use `sky.list_apps()` returned `com.mergepilot.desktop` with one `MergePilot` window. |
| Installed native accessibility text | Pass | The native window accessibility tree included `New chat`, `Pull Requests`, `Project Links`, `Review Queue`, `Pipelines`, `Activity`, `Settings`, `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `ClaimBot_API link`, and `TeBS-ClaimBot / ClaimBot_API`. |
| Installed payload hash match | Fail | `verify-installed-msi-state.ps1` returned `ok: false` because installed Program Files binaries do not match the current MSI payload hashes. Installed files are from `2026-07-06 00:35-00:37`, while the current MSI was generated at `2026-07-06 01:25`. |
| Computer Use activation | Partial | `sky.activate_window()` still returned `failed to activate captured window`. Passive accessibility text is usable; reliable click/pixel screenshot automation is not yet proven. |

### Hash Evidence

| File | SHA256 |
|---|---|
| Installed `C:\Program Files\MergePilot\mergepilot-desktop.exe` | `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` |
| Current MSI payload desktop exe | `1C9B2A89307BDB9F2F71B7A91FB64802AC831CE8BA6A90522FFBB0263A0CB0AC` |
| Installed `C:\Program Files\MergePilot\mergepilot-daemon.exe` | `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` |
| Current MSI payload daemon exe | `0F4428F7848C8AA8A099F7FD0B10F888ABFAF98DF7A20C400875130074BD12F5` |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Avatar loading is currently healthy in the installed app runtime. | Info | Keep `-RequireAvatar` in the installed verifier because it catches CSP/auth regressions cheaply. |
| The installed app on disk is still not the latest rebuilt MSI payload. | High | Install `apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.10_x64_en-US.msi` generated at `2026-07-06 01:25 +08:00`, then rerun `verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireMsiPayloadMatch -RequireLegacyCleanup`. |
| Computer Use can inspect installed MergePilot accessibility text but cannot yet activate the window reliably. | Medium | Keep installed native UI proof at accessibility-text level until activation/screenshot targeting is stable. |

## Run: mp-live-azure-ado-readonly-20260706-0303

| Field | Value |
|---|---|
| Date/time | 2026-07-06 03:03-03:05 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Live Azure and Azure DevOps read-only probes; destructive ADO pipeline queue disabled; no resources mutated |
| Result | Pass as read-only business gate; Azure data-plane access remains partial |

### Commands / Probes

```powershell
$env:MERGEPILOT_E2E_LIVE_AZURE = "1"
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts

$env:MERGEPILOT_E2E_LIVE_ADO = "1"
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts test/liveAdoPipeline.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts

az pipelines runs list --organization https://tebssg.visualstudio.com/ --project TeBS-ClaimBot --pipeline-ids 117 --top 5
GET http://127.0.0.1:8787/healthz
```

### Results

| Area | Result | Notes |
|---|---|---|
| Live Azure permission probe | Pass as diagnostic | `test/liveAzurePermissions.test.ts` passed 1/1 and reported current Azure CLI user `Zhou.Ping@totalebizsolutions.com`. |
| Azure ARM metadata | Pass | Storage account `devagentstorage001`, Cosmos account `devagentcosmos001`, and Key Vault `devagentkv001` ARM probes passed. |
| Azure data-plane permissions | Partial | Storage Table list passed and found `CicdAgentProfiles`; Storage Table entity query failed due missing `Storage Table Data Reader/Contributor`; Cosmos SQL database list passed but no Cosmos SQL data-plane role assignments were returned; Key Vault secret list failed on `Microsoft.KeyVault/vaults/secrets/readMetadata/action`. |
| Live ADO discovery | Pass | `test/liveAdoDiscovery.test.ts` discovered project `TeBS-ClaimBot`, repository `ClaimBot_API`, and repository-filtered pipeline `#117 ClaimBot_API`. |
| Live pipeline read-only | Pass | `test/liveAdoPipeline.test.ts` passed 2 read-only tests and skipped the destructive queue test by design. It listed recent runs and read timeline/log evidence for the latest failed pipeline run when available. |
| Live PR insight route | Pass | `test/liveAdoPrInsight.test.ts` passed 1/1 against real ClaimBot_API PR `#2655`; workflow completed `done`, stayed read-only, and produced no pending approval. |
| Pipeline #117 recent run baseline | Pass | Recent runs `4679`, `4678`, `4677`, and `4676` succeeded on `refs/heads/main` at commit `dffeecd534790c4446a29208674f2b6021640a63`; run `4674` succeeded on commit `18c62b707203670b70beab8cf4e3c89bec1a4b7d`. |
| Temp data cleanup | Pass | No `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories remained after the daemon PR insight test. |
| Runtime health | Pass | Installed daemon stayed healthy on `127.0.0.1:8787` with version `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| ClaimBot_API read-only ADO gates remain healthy for project, repo, pipeline, and PR insight. | Info | Keep `test/liveAdoDiscovery.test.ts`, `test/liveAdoPipeline.test.ts`, and `test/liveAdoPrInsight.test.ts` in the read-only release gate. |
| Azure resource metadata is readable, but user data-plane permissions remain incomplete. | Medium | Grant Storage Table Data Reader/Contributor, Cosmos DB Built-in Data Contributor scoped to `devagentcosmos001/cicd-agent`, and Key Vault Secrets User on `devagentkv001` before claiming cloud persistence/secret coverage complete. |

## Run: mp-live-app-business-full-20260706-0312

| Field | Value |
|---|---|
| Date/time | 2026-07-06 03:12-03:22 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Live browser app gate against the running daemon and real ClaimBot_API ADO read-only resources; destructive ADO disabled |
| Result | Pass after focused assertion fix; initial full invocation was 28/29 |

### Commands / Probes

```powershell
$env:MERGEPILOT_E2E_LIVE_APP = "1"
$env:MERGEPILOT_E2E_LIVE_ADO = "1"
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium

.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "does not create an empty commit"
GET http://127.0.0.1:8787/healthz
GET http://127.0.0.1:8787/project-links
az pipelines runs list --organization https://tebssg.visualstudio.com/ --project TeBS-ClaimBot --pipeline-ids 117 --top 3
```

### Results

| Area | Result | Notes |
|---|---|---|
| Full live app business invocation | Partial on first invocation | 28/29 browser workflows passed in 9.0 minutes. The only failing test was the clean-repo empty-commit guard. |
| Clean-repo empty-commit product behavior | Pass | The failure screenshot and accessibility context showed the product did the right thing: `No files are currently staged for commit. No action will be taken.`, no approval card, no commit, and clean repo state. |
| Clean-repo empty-commit test assertion | Fixed | The test regex expected `no files are staged`; the product output contained `no files are currently staged`, so the assertion did not match. The E2E assertion now accepts `no files .*staged` in the main transcript paragraph. |
| Focused empty-commit rerun | Pass | Focused Playwright rerun passed 1/1 in 28.9 seconds after the assertion fix. |
| Git workflow coverage | Pass except the initial assertion flake | The full invocation passed selected-file staging, pending approval reload/restore, approval denial, denial-feedback replanning, stage+commit, commit validation failure, staged-only summary, draft commit message, remote credential redaction, secret-like diff review, dirty branch switch, target merge, merge conflict recovery, branch creation/switch, push to local bare remote, pull/rebase, rebase conflict recovery, stash push/apply/pop, stash-pop conflict recovery, restore-file, revert-commit, local tag creation, and single-tag publication. |
| ClaimBot_API pipeline coverage | Pass | The full invocation inspected pipeline `#117`, prepared rerun/direct trigger approvals, denied them because destructive mode was disabled, and did not queue a new ADO run. |
| Cleanup | Pass | No `%TEMP%\mergepilot-live-*` directories remained. `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| Runtime health | Pass | Daemon remained healthy on `127.0.0.1:8787` with version `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. |
| ADO run baseline | Pass | Latest three ClaimBot_API pipeline `#117` runs remained `4679`, `4678`, and `4677`, all `succeeded` on commit `dffeecd534790c4446a29208674f2b6021640a63`; no new run was queued by this non-destructive gate. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The clean-repo empty-commit guard behavior is correct, but the E2E assertion was too narrow for natural wording variation. | Medium | Fixed the test assertion in `tests/e2e/live-app-business.spec.ts`; keep this case in the live app gate because it protects against accidental empty commits. |
| The live app business gate is broad enough to expose assertion brittleness in addition to product regressions. | Info | Continue splitting the monolithic file into domain specs, but keep this full run available as a broad release confidence pass. |

## Run: mp-live-app-business-full-pass-20260706-0326

| Field | Value |
|---|---|
| Date/time | 2026-07-06 03:26-03:34 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Live browser app gate against the running daemon and real ClaimBot_API ADO read-only resources; destructive ADO disabled |
| Result | Pass |

### Command

```powershell
$env:MERGEPILOT_E2E_LIVE_APP = "1"
$env:MERGEPILOT_E2E_LIVE_ADO = "1"
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium
```

### Results

| Area | Result | Notes |
|---|---|---|
| Full live app business gate | Pass | 29/29 browser workflows passed in 7.7 minutes after the clean-repo empty-commit assertion fix. |
| Empty commit guard | Pass | `does not create an empty commit when no staged changes exist` passed inside the full suite. |
| Git workflow coverage | Pass | Covered selected-file staging, pending approval reload/restore, approval denial, denial-feedback replanning, stage+commit, commit validation failure, empty commit guard, staged-only summary, draft commit message, remote credential redaction, secret-like diff review, dirty branch switch, target merge, merge conflict recovery, branch creation/switch, push to local bare remote, pull/rebase, rebase conflict recovery, stash push/apply/pop, stash-pop conflict recovery, restore-file, revert-commit, local tag creation, and single-tag publication. |
| ClaimBot_API pipeline coverage | Pass | Inspected pipeline `#117`, prepared rerun/direct trigger approvals, denied them because destructive mode was disabled, and did not queue a new ADO run. |
| Cleanup | Pass | No `%TEMP%\mergepilot-live-*` directories remained. `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| Runtime health | Pass | Daemon remained healthy on `127.0.0.1:8787` with version `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. |
| ADO run baseline | Pass | Latest three ClaimBot_API pipeline `#117` runs remained `4679`, `4678`, and `4677`, all `succeeded` on commit `dffeecd534790c4446a29208674f2b6021640a63`; no new run was queued by this non-destructive gate. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The full live app business gate is green after the assertion fix. | Info | Treat `mp-live-app-business-full-pass-20260706-0326` as the current live app business baseline. |

## Run: mp-smoke-and-empty-commit-guard-20260706-0337

| Field | Value |
|---|---|
| Date/time | 2026-07-06 03:37-03:38 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Mocked release smoke plus one focused live app guard; destructive ADO disabled |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium --grep "@smoke"

$env:MERGEPILOT_E2E_LIVE_APP = "1"
$env:MERGEPILOT_E2E_LIVE_ADO = "1"
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "does not create an empty commit"
```

### Results

| Area | Result | Notes |
|---|---|---|
| Mocked release smoke | Pass | `@smoke` selected 9 non-mutating Chromium browser workflows and passed 9/9 in 26.6 seconds. |
| Focused live empty-commit guard | Pass | `does not create an empty commit when no staged changes exist` passed 1/1 in 29.5 seconds after the assertion fix. |
| Cleanup | Pass | No `%TEMP%\mergepilot-live-*` directories remained. `/project-links` retained only `ClaimBot_API link` and `project link2`. |
| Runtime health | Pass | Daemon remained healthy on `127.0.0.1:8787` with version `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The fast release smoke and the focused live empty-commit guard are both green after the full live gate baseline. | Info | Keep `@smoke` as the quick pre-release UI gate and retain the empty-commit guard in the broader live app suite. |

## Run: mp-installed-native-ui-reprobe-20260706-0344

| Field | Value |
|---|---|
| Date/time | 2026-07-06 03:44 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Installed Program Files app plus Computer Use native-window probe |
| Result | Partial |

### Commands

```powershell
.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireLegacyCleanup
.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireMsiPayloadMatch -RequireLegacyCleanup
```

### Results

| Area | Result | Notes |
|---|---|---|
| Installed runtime and auth | Pass | Installed `/healthz` returned version `0.5.10`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `llmConfigured: true`, `cloudSecrets: false`, and `cloudSessions: true`. `/auth/status` returned authenticated user `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, and avatar data URL length `19339`. |
| Legacy cleanup | Pass | `C:\Program Files\CICD-Agent` is absent; no legacy uninstall entries were detected; the current `MergePilot` uninstall entry is present. |
| MSI payload identity | Fail | Installed desktop hash `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` and daemon hash `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` still do not match the current MSI payload hashes `1C9B2A89307BDB9F2F71B7A91FB64802AC831CE8BA6A90522FFBB0263A0CB0AC` and `0F4428F7848C8AA8A099F7FD0B10F888ABFAF98DF7A20C400875130074BD12F5`. |
| Computer Use app discovery | Pass | Computer Use can enumerate `com.mergepilot.desktop` and the process-backed `C:\Program Files\MergePilot\mergepilot-desktop.exe` window titled `MergePilot`. |
| Computer Use accessibility text | Pass | The native accessibility tree includes `New chat`, `Project Links`, `Review Queue`, `Pipelines`, `Settings`, `Zhou Ping`, `ClaimBot_API link`, `ClaimBot_API`, and `TeBS-ClaimBot / ClaimBot_API`. |
| Computer Use activation and screenshot | Partial | `activate_window` still returns `failed to activate captured window`. Screenshot capture returns an image payload, but the captured visual surface is not reliable as MergePilot UI evidence, so Computer Use remains suitable for text-level native smoke only in this environment. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The installed app is usable and the avatar/config path is healthy; the earlier avatar concern is not reproduced at the API or native text level. | Info | Keep `-ProbeAuth -RequireAvatar` in the installed verifier. |
| Current Program Files binaries remain stale relative to the latest workspace MSI payload. | Medium | Reinstall the latest `MergePilot_0.5.10_x64_en-US.msi` from an elevated installer context, then rerun the verifier with `-RequireMsiPayloadMatch`. |
| Computer Use is no longer unavailable, but it is not yet a reliable click/pixel automation layer for MergePilot on this machine. | Medium | Treat Computer Use as a text-level installed-app smoke until activation and screenshot capture return the actual app window consistently. |

## Run: mp-review-queue-focused-gate-20260706-0346

| Field | Value |
|---|---|
| Date/time | 2026-07-06 03:46-03:47 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Local/mocked Review Queue business gate; no live ADO mutation |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverReviewRunRoutes.test.ts test/serverReviewDispositionWritebackRoutes.test.ts test/serverReviewStorageRoutes.test.ts
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/review-queue.spec.ts --project=chromium
```

### Results

| Area | Result | Notes |
|---|---|---|
| Daemon Review Queue routes | Pass | 3 Vitest files passed: `serverReviewRunRoutes.test.ts`, `serverReviewDispositionWritebackRoutes.test.ts`, and `serverReviewStorageRoutes.test.ts`; 6/6 tests passed. |
| Browser Review Queue workflow | Pass | Chromium Review Queue E2E passed 3/3: queue evidence and acknowledged disposition, request-changes with ADO write-back retry, and stale review rerun refresh. |
| Runtime health | Pass | Installed/running daemon `/healthz` remained healthy with version `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. |
| Cleanup | Pass | No `%TEMP%\mergepilot-live-*` directories were present after the run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The local/mocked Review Queue business gate remains green after the installed-app and Computer Use reprobe work. | Info | Keep this as the fast PR review queue regression until Azure Table data-plane permission is available for true cloud ReviewHistory persistence. |

## Run: mp-ai-insight-quality-focused-gate-20260706-0348

| Field | Value |
|---|---|
| Date/time | 2026-07-06 03:48-03:49 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Deterministic core and daemon AI insight quality gates; no live ADO mutation |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/aiInsightQuality.test.ts test/aiInsightQualityChatPlanner.test.ts test/chatPlannerGuards.test.ts test/chatContext.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverAiInsightQualityRoutes.test.ts test/workspaceWorkflow.test.ts test/serverReadOnlyGitChatRoutes.test.ts
```

### Results

| Area | Result | Notes |
|---|---|---|
| Core AI insight quality | Pass | 4 Vitest files passed and 16/16 tests passed across final-answer scoring, ChatPlanner quality, review-only write guard behavior, and seeded ClaimBot-style chat context evidence. |
| Daemon AI/workflow quality | Pass | 3 Vitest files passed and 14/14 tests passed across `/chat` AI insight scoring, workspace workflow routing, and read-only Git chat routing. |
| Read-only scope discipline | Pass | The focused daemon gate verifies current-branch, review-only change, staged-scope, and remote-target questions stay read-only and do not escalate into fetch/stage/commit approvals. |
| Runtime health | Pass | Running daemon `/healthz` remained healthy with version `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. |
| Cleanup | Pass | No `%TEMP%\mergepilot-live-*` directories were present after the run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The deterministic AI insight gate remains green and now reports 16 core tests plus 14 daemon tests in the focused set. | Info | Keep broadening AI quality through live-model batches and installed-app replay after the latest MSI is installed. |

## Run: mp-typecheck-and-mocked-browser-gate-20260706-0352

| Field | Value |
|---|---|
| Date/time | 2026-07-06 03:52-03:53 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Package typechecks plus full mocked Chromium browser business gate; live app tests skipped by design |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck
.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium
```

### Results

| Area | Result | Notes |
|---|---|---|
| Core typecheck | Pass | `@mergepilot/core` TypeScript check completed with `tsc -p tsconfig.json --noEmit`. |
| Daemon typecheck | Pass | `@mergepilot/daemon` TypeScript check completed with `tsc -p tsconfig.json --noEmit`. |
| Desktop typecheck | Pass | `@mergepilot/desktop` TypeScript check completed with `tsc -p tsconfig.json --noEmit`. |
| Full mocked Chromium browser gate | Pass | 54/54 non-live browser tests passed in 1.3 minutes; 29 gated live-app tests were skipped because `MERGEPILOT_E2E_LIVE_APP` was not set. |
| Browser business coverage | Pass | Covered Chat layout, Project Link onboarding/inference, Settings Key Vault/local-env fallback messaging, image attachments, source preview, PR insight controls, pipeline controls, natural-language read-only Git/PR/pipeline routing, Review Queue workflows, approval UI, streamed tool lifecycle, history recovery, artifacts, and result workspace behavior. |
| Runtime health | Pass | Running daemon `/healthz` remained healthy with version `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. |
| Cleanup | Pass | No `%TEMP%\mergepilot-live-*` directories were present after the run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The full non-live browser business gate remains green after the latest test/documentation updates. | Info | Keep this as the broad mocked UI gate; live app behavior remains covered by the gated `MERGEPILOT_E2E_LIVE_APP=1` suite. |

## Run: mp-packaged-installed-smoke-rerun-20260706-0357

| Field | Value |
|---|---|
| Date/time | 2026-07-06 03:57-03:58 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Extracted MSI payload smoke plus installed Program Files daemon restart persistence smoke |
| Result | Pass with installed payload caveat |

### Commands

```powershell
.\scripts\windows\packaged-msi-payload-smoke.ps1 -Port 18922
.\scripts\windows\installed-restart-persistence-smoke.ps1
```

### Results

| Area | Result | Notes |
|---|---|---|
| Packaged MSI payload smoke | Pass | Extracted `apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.10_x64_en-US.msi`, validated the WiX legacy cleanup markers, launched the extracted desktop/daemon payload, and returned `healthVersion: 0.5.10`, `refreshFilesSeen: 1`, `refreshFilesIndexed: 1`, `workflowPhase: inspect_environment`, and `chatStatus: 200`. |
| Installed daemon restart persistence | Pass | `installed-restart-persistence-smoke.ps1` used `C:\Program Files\MergePilot\mergepilot-daemon.exe`, created temporary Project Link `6bbc8c48377710cd`, chat session `chat_1783281452380_1a0b44`, observed terminal SSE `done`, verified assistant completion `persistence-ok-mp-installed-persist-20260706-035729` before and after daemon restart, then deleted the temporary chat, Project Link, and repo. |
| Runtime health after smoke | Pass | `/healthz` returned version `0.5.10`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true` after the installed daemon restart. |
| Project Link cleanup | Pass | `/project-links` returned only the long-lived `ClaimBot_API link` and `project link2`; the temporary persistence Project Link was removed. |
| Temp directory cleanup | Pass | No `%TEMP%\mergepilot-live-*`, `%TEMP%\mergepilot-installed-*`, `%TEMP%\mergepilot-persist-*`, or `%TEMP%\mergepilot-msi-extract-*` directories remained after the run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The current MSI payload remains runnable and the installed daemon persistence path remains healthy. | Info | Keep both scripts in the release gate. |
| This smoke does not replace the strict installed payload hash gate. | Medium | The separate `-RequireMsiPayloadMatch` verifier still requires an elevated install of the latest MSI before it can pass. |

## Run: mp-live-ado-readonly-rerun-20260706-0400

| Field | Value |
|---|---|
| Date/time | 2026-07-06 04:00-04:01 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Live Azure DevOps read-only discovery, pipeline, and PR insight gates for ClaimBot_API; destructive queue skipped |
| Result | Pass |

### Commands

```powershell
$env:MERGEPILOT_E2E_LIVE_ADO = "1"
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts test/liveAdoPipeline.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts

az pipelines runs list --organization https://dev.azure.com/tebssg --project TeBS-ClaimBot --pipeline-ids 117 --top 5 --query "[].{id:id,buildNumber:buildNumber,status:status,result:result,sourceBranch:sourceBranch,sourceVersion:sourceVersion}" -o json
```

### Results

| Area | Result | Notes |
|---|---|---|
| Live ADO discovery | Pass | `test/liveAdoDiscovery.test.ts` passed 1/1 and discovered the ClaimBot_API project, repository, and pipeline with the current account. |
| Live ADO pipeline read-only | Pass | `test/liveAdoPipeline.test.ts` passed 2/2 read-only tests; the destructive queue case was skipped by design. The test listed recent pipeline runs and read timeline/log evidence for the latest failed pipeline run. |
| Live daemon PR insight | Pass | `test/liveAdoPrInsight.test.ts` passed 1/1 and inspected a real ClaimBot_API pull request without approval or mutation. |
| Runtime health | Pass | Running daemon `/healthz` remained healthy with version `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. |
| Temp cleanup | Pass | No `%TEMP%\mergepilot-daemon-live-pr-insight-*` or `%TEMP%\mergepilot-live-*` directories were present after the run. |
| ADO mutation check | Pass | ClaimBot_API pipeline `#117` latest five runs remained `4679 / 20260705.12`, `4678 / 20260705.11`, `4677 / 20260705.10`, `4676 / 20260705.9`, and `4674 / 20260705.8`; no new pipeline run was queued by this read-only gate. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Live ADO read-only integration remains healthy for ClaimBot_API. | Info | Keep this gate separate from destructive pipeline/PR mutation gates so it can run frequently. |

## Run: mp-live-azure-permission-diagnostic-20260706-0404

| Field | Value |
|---|---|
| Date/time | 2026-07-06 04:04-04:05 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Live Azure permission diagnostic for subscription `a99512b0-3dc5-476f-8f43-d7db40fbc923`, resource group `developmentagent` |
| Result | Pass as diagnostic; Azure access Partial |

### Command

```powershell
$env:MERGEPILOT_E2E_LIVE_AZURE = "1"
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts
```

### Results

| Area | Result | Notes |
|---|---|---|
| Azure CLI account | Pass | Current CLI user is `Zhou.Ping@totalebizsolutions.com`; default CLI subscription is `TeBS-Internal Azure Bot`, while the probe explicitly targeted subscription `a99512b0-3dc5-476f-8f43-d7db40fbc923`. |
| Storage account ARM | Pass | `devagentstorage001` ARM metadata is readable. |
| Storage Table list | Pass | Table list is readable and includes `CicdAgentProfiles`. |
| Storage Table entity query | Fail | Data-plane entity query still lacks required Storage Table Data Reader/Contributor permissions. |
| Cosmos account ARM | Pass | `devagentcosmos001` ARM metadata is readable. |
| Cosmos SQL database list | Pass | SQL database list is readable and includes `cicd-agent`. |
| Cosmos SQL role assignments | Fail | No Cosmos SQL data-plane role assignments were returned. |
| Key Vault ARM | Pass | `devagentkv001` ARM metadata is readable and RBAC authorization is enabled. |
| Key Vault secret list | Fail | Secret metadata/list still fails with `Forbidden` for `Microsoft.KeyVault/vaults/secrets/readMetadata/action`. |
| Runtime health | Pass | Running daemon `/healthz` remained healthy with version `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. |
| Cleanup | Pass | No `%TEMP%\mergepilot-live-*` directories were present after the diagnostic. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Azure cloud persistence is still not fully testable with the current account because required data-plane permissions are missing. | High | Grant Storage Table Data Reader/Contributor on `CicdAgentProfiles`, Cosmos DB Built-in Data Contributor for `devagentcosmos001/cicd-agent`, and Key Vault Secrets User on `devagentkv001`, then rerun this diagnostic and the cloud ReviewHistory gate. |

## Run: mp-core-daemon-full-suite-20260706-0414

| Field | Value |
|---|---|
| Date/time | 2026-07-06 04:14-04:18 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Full source-level core and daemon Vitest suites; no live ADO or Azure mutation |
| Result | Pass after fixes |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/azureAuthSession.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverPullRequestRoutes.test.ts test/serverPullRequestInsightPreviewRoutes.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
git diff --check -- packages/core/test/azureAuthSession.test.ts packages/daemon/src/routes/pullRequestInsight.ts packages/daemon/src/routes/pull-requests.routes.ts
```

### Results

| Area | Result | Notes |
|---|---|---|
| Core full suite | Pass after test mock fix | Latest full `@mergepilot/core` Vitest rerun at 04:17 passed with 47 files passed, 4 skipped, 242 tests passed, and 6 skipped. |
| Azure auth session focused regression | Pass | `test/azureAuthSession.test.ts` passed 2/2 after the MSAL cache helper mock was restored. This protects authenticated profile refresh and Graph avatar retrieval. |
| Daemon PR route focused regression | Pass | `serverPullRequestRoutes.test.ts` and `serverPullRequestInsightPreviewRoutes.test.ts` passed 3/3 after restoring build evidence and pipeline-run enrichment. |
| Daemon full suite | Pass | Full `@mergepilot/daemon` Vitest suite passed with 45 files passed, 1 skipped, 255 tests passed, and 1 skipped. |
| Daemon typecheck | Pass | `@mergepilot/daemon` TypeScript check completed with `tsc -p tsconfig.json --noEmit`. |
| Diff hygiene | Pass with line-ending warnings | `git diff --check` reported no whitespace errors. It only reported expected Windows LF-to-CRLF warnings for the edited files. |

### Fixes Made During This Gate

| Fix | Business impact |
|---|---|
| Restored `withMsalCacheAccess` in the Azure auth session test mock. | Prevents regression coverage from falsely bypassing refreshed signed-in user and avatar behavior. This is directly related to installed-app identity/avatar confidence. |
| Restored `listAzureBuilds` loading in PR insight preview. | PR insight and review readiness again preserve failed build evidence instead of returning empty build blockers. |
| Added pipeline-run enrichment to PR list routes when a Project Link has `adoPipelineId`. | PR lists can show the current related pipeline run signal, which supports the product goal of AI insight over PR/pipeline status rather than plain ADO browsing. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| None | n/a | n/a | No | Source-level tests only. |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| n/a | n/a | No live resources were created or mutated. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Full core and daemon suites are now green after closing two regressions that matter to the business workflow: identity/avatar refresh and PR insight build/pipeline evidence. | Info | Keep these suites in the pre-release source gate before running live app or packaged MSI gates. |
| Node still prints `DEP0040` `punycode` warnings during daemon tests. | Low | Track separately as dependency cleanup; it does not block current business workflow validation. |

## Run: mp-installed-msi-reprobe-20260706-0419

| Field | Value |
|---|---|
| Date/time | 2026-07-06 04:19-04:22 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Installed Program Files app verifier, installed daemon restart persistence, and Computer Use native-window probe |
| Result | Partial |

### Commands

```powershell
.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireMsiPayloadMatch -RequireLegacyCleanup
.\scripts\windows\installed-restart-persistence-smoke.ps1
```

Computer Use probe:

```text
sky.list_apps()
sky.get_window_state({ window: MergePilot, include_text: true })
sky.activate_window({ window: MergePilot })
sky.get_window_state({ window: MergePilot, include_screenshot: true })
```

### Results

| Area | Result | Notes |
|---|---|---|
| Installed runtime health | Pass | `/healthz` returned version `0.5.10`, Azure OpenAI `gpt-4o`, config source `C:\Users\15492\.mergepilot\config.toml`, `cloudProjectLinkStore: true`, `cloudSecrets: false`, and `cloudSessions: true`. |
| Installed auth/avatar API | Pass | `/auth/status` returned authenticated user `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, avatar length `19339`, and JPEG data URL prefix `data:image/jpeg;base64,/9j/4AAQS`. |
| Legacy cleanup | Pass | `C:\Program Files\CICD-Agent` does not exist, no legacy uninstall entries were found, and the current `MergePilot` uninstall entry is present. |
| Installed MSI payload identity | Fail | Installed hashes still do not match the current MSI payload. Installed desktop hash: `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57`; current MSI desktop hash: `1C9B2A89307BDB9F2F71B7A91FB64802AC831CE8BA6A90522FFBB0263A0CB0AC`. Installed daemon hash: `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8`; current MSI daemon hash: `0F4428F7848C8AA8A099F7FD0B10F888ABFAF98DF7A20C400875130074BD12F5`. |
| Installed daemon restart persistence | Pass | `installed-restart-persistence-smoke.ps1` passed with run ID `mp-installed-persist-20260706-041954`. Project Link, chat session, terminal `done`, and assistant completion `persistence-ok-mp-installed-persist-20260706-041954` survived daemon restart; cleanup deleted the temporary chat, Project Link, and repo. |
| Computer Use app discovery | Pass | `sky.list_apps()` returned the native `com.mergepilot.desktop` app with one window titled `MergePilot`; Chrome also had a `MergePilot - Google Chrome` window. |
| Computer Use accessibility text | Pass | Native MergePilot window accessibility text included `New chat`, `Project Links`, `Review Queue`, `Pipelines`, `Settings`, `Zhou Ping`, `ClaimBot_API link`, `ClaimBot_API`, and `TeBS-ClaimBot / ClaimBot_API`. |
| Computer Use activation | Fail | `sky.activate_window({ window })` returned `failed to activate captured window`. |
| Computer Use screenshot | Fail for visual evidence | Screenshot capture returned `1348x965` images, but the visible content was the Windows background/lock-screen style image rather than the MergePilot UI. It is not acceptable as pixel-level app evidence. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| Temporary Project Link | `788dc85a6a49c444` | Local/cloud Project Link store | Yes | Deleted |
| Temporary chat session | `chat_1783282795531_4c14d6` | Local/cloud session store | Yes | Deleted |
| Temporary local repo | `mp-installed-persist-20260706-041954` temp repo | Local filesystem | Yes | Deleted |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary Project Link `788dc85a6a49c444` | cleaned | Deleted by installed restart persistence script. |
| Temporary chat session `chat_1783282795531_4c14d6` | cleaned | Deleted by installed restart persistence script. |
| Temporary repo | cleaned | Deleted by installed restart persistence script. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Installed app runtime, auth/avatar API, legacy cleanup, and restart persistence are healthy. | Info | Keep these installed verifier scripts in the release gate. |
| Installed binaries are still stale relative to the current workspace MSI payload. | High | Reinstall the exact current MSI payload from `apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.10_x64_en-US.msi` with elevated installer context, then rerun `verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireMsiPayloadMatch -RequireLegacyCleanup`. |
| Computer Use is now usable for native app discovery and accessibility text, but not reliable for activation or screenshot/pixel proof on this machine. | Medium | Treat Computer Use as a text-level installed-app smoke only until activation succeeds and screenshots capture the real MergePilot window. |

## Run: mp-desktop-full-suite-20260706-0424

| Field | Value |
|---|---|
| Date/time | 2026-07-06 04:24-04:27 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Desktop UI/unit/business interaction Vitest suite; no live ADO or Azure mutation |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck
git diff --check -- docs\live-e2e-test-records.md docs\automated-business-test-suite-plan.md docs\business-test-execution-report.md packages\core\test\azureAuthSession.test.ts packages\daemon\src\routes\pullRequestInsight.ts packages\daemon\src\routes\pull-requests.routes.ts
```

### Results

| Area | Result | Notes |
|---|---|---|
| Full desktop Vitest suite | Pass | `@mergepilot/desktop` passed 67/67 test files and 321/321 tests. |
| Desktop typecheck | Pass | `tsc -p tsconfig.json --noEmit` completed successfully for `@mergepilot/desktop`. |
| Diff hygiene | Pass with line-ending warnings | `git diff --check` reported no whitespace errors. It only reported expected Windows LF-to-CRLF warnings on the edited core/daemon files. |

### Business Coverage Confirmed

| Area | Evidence |
|---|---|
| Chat transcript and streaming UI | `ExecutionTimeline`, `ChatMessageList`, stream dispatcher, terminal stream state, smooth streaming text, bubble finalization, structured conversation parts, and scroll tests all passed. |
| Approval and evidence UI | `PendingActionCard`, `ApprovalEvidence`, approval metadata, workflow task state, and suggestion reply tests passed. |
| Source/file preview workspace | `ArtifactWorkspace`, source preview language, copy state, source title utils, reference parts, and artifact workspace hook tests passed. |
| Project Link and workspace controls | `projectLinks`, active Project Link runtime, branch menu, workspace actions, divergence notice, and composer menu tests passed. |
| PR, Review Queue, and pipeline UI models | PR insight artifacts, pull request view model, review queue runtime/view model, review operations, review history, review audit, and pipeline model tests passed. |
| Composer and attachments | Composer send state, image attachment handling, suggestion chips, command chips, and draft persistence tests passed. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| None | n/a | n/a | No | Source-level desktop tests only. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The desktop UI/business interaction layer is green after the recent chat transcript, approval, source preview, Project Link, Review Queue, and installed-app changes. | Info | Keep this full desktop suite in the source pre-release gate alongside full core and daemon suites. |

## Run: mp-live-app-business-full-pass-20260706-0428

| Field | Value |
|---|---|
| Date/time | 2026-07-06 04:28-04:34 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Full non-destructive live app browser business gate; real local app runtime, real temp Git repos, live ADO read-only pipeline access; no destructive ADO mutation |
| Result | Pass |

### Commands

```powershell
$env:MERGEPILOT_E2E_LIVE_APP = "1"
$env:MERGEPILOT_E2E_LIVE_ADO = "1"
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium

Invoke-RestMethod -Uri http://127.0.0.1:8787/healthz
Invoke-RestMethod -Uri http://127.0.0.1:8787/project-links
Get-ChildItem -Path $env:TEMP -Directory -Filter mergepilot-live-*
az pipelines runs list --organization https://dev.azure.com/tebssg --project TeBS-ClaimBot --pipeline-ids 117 --top 5
```

### Results

| Area | Result | Notes |
|---|---|---|
| Full live app browser business gate | Pass | 29/29 Playwright tests passed in 5.9 minutes. |
| Runtime health after run | Pass | `/healthz` returned version `0.5.10`, Azure OpenAI `gpt-4o`, config source `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`. |
| Temp cleanup | Pass | No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories remained after the run. |
| Project Link cleanup | Pass | `/project-links` retained only long-lived links: `ClaimBot_API link` with pipeline `117 / ClaimBot_API`, and `project link2`. |
| ADO mutation check | Pass | ClaimBot_API pipeline `#117` latest five runs remained `4679 / 20260705.12`, `4678 / 20260705.11`, `4677 / 20260705.10`, `4676 / 20260705.9`, and `4674 / 20260705.8`; this non-destructive gate did not queue a new pipeline run. |

### Business Coverage Confirmed

| Area | Evidence |
|---|---|
| Git staging and approval safety | Selected-file staging, pending approval reload/restore, approval denial, denial feedback replanning, stage-and-commit continuation, commit validation failure, empty commit guard, staged-only summary, and commit-message drafting all passed. |
| Git branch/merge/rebase recovery | Dirty branch switch approval, approved target merge, merge conflict recovery, create-and-switch branch, push to local bare remote, pull/rebase behind branch, and rebase conflict recovery all passed. |
| Git stash/restore/revert/tag workflows | Stash push, stash apply without dropping, stash pop with drop after success, stash pop conflict preservation, selected-file restore, revert last commit, local release tag creation, and single-tag push all passed. |
| Security and redaction | Remote credential target inspection and secret-like diff review both passed without leaking credential values. |
| ClaimBot_API ADO pipeline workflow | Normal Chat inspected ClaimBot_API pipeline `#117` failure evidence, prepared rerun approval from failure evidence suggestions, and prepared direct pipeline trigger approval; approvals were denied or left non-destructive by test design. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| Temporary local Git repos | `mergepilot-live-*` under `%TEMP%` | Local filesystem | Yes | Deleted by Playwright fixtures |
| Temporary Project Links | run-scoped links created by live app tests | Local/cloud Project Link store | Yes | Deleted by Playwright fixtures |
| ADO pipeline run | n/a | n/a | No | `MERGEPILOT_E2E_DESTRUCTIVE` was unset |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| Temporary local Git repos | cleaned | Post-run probe found zero `%TEMP%\mergepilot-live-*` directories. |
| Temporary Project Links | cleaned | Post-run `/project-links` returned only `ClaimBot_API link` and `project link2`. |
| ADO pipeline run | not created | Latest ClaimBot_API pipeline `#117` run remained `4679`, so no new run was queued. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The full non-destructive live app business gate remains green after the latest core, daemon, desktop, installed-app, and documentation updates. | Info | Keep this as the main real UI business gate before destructive ADO or release packaging gates. |
| This gate is intentionally non-destructive for ADO. | Info | Destructive PR and pipeline mutation confidence still comes from the separate opt-in destructive gates and retained ADO run records. |

## Run: mp-live-ado-azure-readonly-20260706-0436

| Field | Value |
|---|---|
| Date/time | 2026-07-06 04:36-04:38 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Resource mode | Live ADO read-only gates plus live Azure permission diagnostic; no destructive ADO or Azure mutation |
| Result | ADO Pass; Azure diagnostic Pass with access Partial |

### Commands

```powershell
$env:MERGEPILOT_E2E_LIVE_ADO = "1"
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts test/liveAdoPipeline.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts

$env:MERGEPILOT_E2E_LIVE_AZURE = "1"
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts

Invoke-RestMethod -Uri http://127.0.0.1:8787/healthz
Get-ChildItem -Path $env:TEMP -Directory -Filter mergepilot-live-*
Get-ChildItem -Path $env:TEMP -Directory -Filter mergepilot-daemon-live-pr-insight-*
az pipelines runs list --organization https://dev.azure.com/tebssg --project TeBS-ClaimBot --pipeline-ids 117 --top 5
```

### Results

| Area | Result | Notes |
|---|---|---|
| Live ADO discovery | Pass | `test/liveAdoDiscovery.test.ts` passed 1/1 and discovered the ClaimBot_API project, repository, and pipeline with the current account. |
| Live ADO pipeline read-only | Pass | `test/liveAdoPipeline.test.ts` passed 2/2 read-only tests; the destructive queue case was skipped by design. Recent runs and failed-run timeline/log evidence are readable. |
| Live daemon PR insight | Pass | `test/liveAdoPrInsight.test.ts` passed 1/1 and inspected a real ClaimBot_API pull request without approval or mutation. |
| Azure CLI account | Pass | Current CLI user is `Zhou.Ping@totalebizsolutions.com`; the CLI default subscription is `TeBS-Internal Azure Bot`, while the probe explicitly targets subscription `a99512b0-3dc5-476f-8f43-d7db40fbc923`. |
| Storage account ARM | Pass | `devagentstorage001` ARM metadata is readable. |
| Storage Table list | Pass | Table list is readable and includes `CicdAgentProfiles`. |
| Storage Table entity query | Fail | Current account still lacks Storage Table data-plane entity query permission. Required role: Storage Table Data Reader or Storage Table Data Contributor on `CicdAgentProfiles`. |
| Cosmos account ARM | Pass | `devagentcosmos001` ARM metadata is readable. |
| Cosmos SQL database list | Pass | SQL database list is readable and includes `cicd-agent`. |
| Cosmos SQL role assignments | Fail | No Cosmos SQL data-plane role assignments were returned. Required role: Cosmos DB Built-in Data Contributor scoped to `devagentcosmos001/cicd-agent` where possible. |
| Key Vault ARM | Pass | `devagentkv001` ARM metadata is readable and RBAC authorization is enabled. |
| Key Vault secret list | Fail | Secret metadata/list still fails with `Forbidden` for `Microsoft.KeyVault/vaults/secrets/readMetadata/action`. Required role: Key Vault Secrets User on `devagentkv001`; Secrets Officer is needed only for writes. |
| Runtime health | Pass | `/healthz` returned version `0.5.10`, Azure OpenAI `gpt-4o`, config source `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`. |
| Temp cleanup | Pass | No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories remained after the gates. |
| ADO mutation check | Pass | ClaimBot_API pipeline `#117` latest five runs remained `4679 / 20260705.12`, `4678 / 20260705.11`, `4677 / 20260705.10`, `4676 / 20260705.9`, and `4674 / 20260705.8`; no new run was queued. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| None | n/a | n/a | No | Read-only/diagnostic gates only. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Live ADO read-only integration remains healthy for ClaimBot_API project, repo, pipeline `#117`, failed-run evidence, and PR insight. | Info | Keep this gate as the frequent live ADO check before destructive PR/pipeline gates. |
| Azure cloud data-plane access remains partial. | High | Grant Storage Table Data Reader/Contributor, Cosmos DB Built-in Data Contributor, and Key Vault Secrets User, then rerun this diagnostic and the cloud ReviewHistory persistence gate. |

## Run: mp-e2e-20260706-044011

| Field | Value |
|---|---|
| Date/time | 2026-07-06 04:40-04:43 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | Current working tree with uncommitted business test documentation and PR insight/auth test fixes |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-e2e-20260706-044011 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDestructive.test.ts` |
| Environment flags | `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE=1`, `MERGEPILOT_E2E_RUN_ID=mp-e2e-20260706-044011` |
| Azure DevOps org | `tebssg` |
| Azure DevOps project | `TeBS-ClaimBot` |
| Azure DevOps repo | `ClaimBot_API` |
| Azure subscription | Not used by this destructive ADO test |
| Azure resource group | Not used by this destructive ADO test |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Destructive ADO PR workflow | Pass | Created run-scoped branch `mergepilot-e2e/mp-e2e-20260706-044011`, pushed `/.mergepilot-e2e/mp-e2e-20260706-044011.md`, created draft PR `2741`, updated PR metadata, added/removed label `mergepilot-e2e-mp-e2e-20260706-044011`, added/removed reviewer `a1b6982e-2922-6109-ae4e-b71d27b2ef57`, created work item `7909`, linked/unlinked it to PR `2741`, deleted the work item, abandoned the PR, and deleted the branch. |
| Independent cleanup verification | Pass | `az repos pr show --id 2741` returned `status: abandoned`; `az repos ref list --filter heads/mergepilot-e2e/mp-e2e-20260706-044011` returned `[]`; `az boards work-item show --id 7909` returned `TF401232`, confirming the work item is deleted or no longer readable. |
| Runtime and temp cleanup probe | Pass | `/healthz` remained healthy with version `0.5.10`; post-run temp probe found zero `%TEMP%\mergepilot-live-*` and `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories. |

### Resources Created

| Type | Name / ID | URL | Created by test | Cleanup action |
|---|---|---|---|---|
| ADO branch | `mergepilot-e2e/mp-e2e-20260706-044011` | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_git/ClaimBot_API?version=GBmergepilot-e2e%2Fmp-e2e-20260706-044011` | Yes | Deleted |
| ADO PR | `2741` / `[mp-e2e-20260706-044011] MergePilot live destructive smoke - metadata updated` | `https://dev.azure.com/tebssg/TeBS-ClaimBot/_git/ClaimBot_API/pullrequest/2741` | Yes | Abandoned |
| ADO PR label | `mergepilot-e2e-mp-e2e-20260706-044011` | PR label | Yes | Removed |
| ADO PR reviewer | `a1b6982e-2922-6109-ae4e-b71d27b2ef57` | PR reviewer | Yes | Removed |
| ADO work item | `7909` | Work item | Yes | Deleted |
| ADO work item link | `7909 -> PR 2741` | Work item relation | Yes | Unlinked |

### Cleanup Results

| Resource | Cleanup result | Notes |
|---|---|---|
| PR label `mergepilot-e2e-mp-e2e-20260706-044011` | cleaned | Added and removed during the test body. |
| PR reviewer `a1b6982e-2922-6109-ae4e-b71d27b2ef57` | cleaned | Added and removed during the test body. |
| Work item link `7909 -> PR 2741` | cleaned | Linked and unlinked during the test body. |
| Work item `7909` | cleaned | Deleted during the test body; independent `az boards work-item show` returned `TF401232`. |
| PR `2741` | cleaned | Abandoned; independent `az repos pr show` returned `status: abandoned`. |
| Branch `mergepilot-e2e/mp-e2e-20260706-044011` | cleaned | Deleted; independent ref lookup returned `[]`. |

### Resources Left Behind

| Resource | Reason | Follow-up owner |
|---|---|---|
| PR `2741` historical record | Azure DevOps retains abandoned PR history. | None |
| Artifact `output/live-e2e/mp-e2e-20260706-044011-ado-destructive-pr.json` | Local ignored test artifact used for audit evidence. | None |

### Failures / Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Current destructive PR workflow cleanup passed end-to-end for ClaimBot_API. | Info | Keep this as the latest destructive PR baseline. |
| This test proves real ADO mutation and cleanup for PR metadata, reviewer, label, work item, branch, and PR lifecycle. | Info | Broader destructive PR insight quality can build on this fixture when needed. |

## Run: mp-installed-msi-reprobe-20260706-0446

| Field | Value |
|---|---|
| Date/time | 2026-07-06 04:46 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | Current working tree with uncommitted business test documentation and product/test fixes |
| Test command | `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireMsiPayloadMatch -RequireLegacyCleanup`; then `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireLegacyCleanup` |
| Installed location | `C:\Program Files\MergePilot` |
| Installed version | `0.5.10` |
| Current MSI baseline | `apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.10_x64_en-US.msi` |
| Result | Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Installed runtime health | Pass | `/healthz` returned version `0.5.10`, Azure OpenAI deployment `gpt-4o`, config source `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`. |
| Installed auth and avatar | Pass | `/auth/status` returned authenticated user `Zhou Ping` / `Zhou.Ping@totalebizsolutions.com` with avatar data URL length `19339` and prefix `data:image/jpeg;base64,/9j/4AAQS`. User visual review also confirmed the footer avatar renders in the installed app. |
| Legacy install cleanup | Pass | `C:\Program Files\CICD-Agent` is absent, the old publisher shortcut folder is absent, and only one `MergePilot` uninstall entry remains for version `0.5.10`. |
| Current shortcut | Pass | `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\MergePilot\MergePilot.lnk` exists. |
| Strict MSI payload hash match | Fail | Installed `mergepilot-desktop.exe` hash `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` and installed `mergepilot-daemon.exe` hash `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` do not match the current rebuilt MSI payload hashes `1C9B2A89307BDB9F2F71B7A91FB64802AC831CE8BA6A90522FFBB0263A0CB0AC` and `0F4428F7848C8AA8A099F7FD0B10F888ABFAF98DF7A20C400875130074BD12F5`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Installed first-run runtime, auth, avatar, shortcut, and legacy cleanup are healthy after the user's fresh MSI install. | Info | Keep `verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireLegacyCleanup` as the installed-app smoke gate. |
| Strict hash mismatch remains because the current workspace MSI was rebuilt at 2026-07-06 01:25 +08:00, while the installed binaries have 2026-07-06 00:35-00:37 +08:00 timestamps. This indicates the app was installed from an older same-version `0.5.10` payload, or Windows Installer did not overwrite files during a same-version reinstall. | High | Treat every installable release as requiring a version bump, or add a documented repair/reinstall path that forces same-version payload replacement before claiming strict installed-payload parity. |

## Run: mp-installed-persist-20260706-044832

| Field | Value |
|---|---|
| Date/time | 2026-07-06 04:48-04:49 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | Current working tree with uncommitted business test documentation and product/test fixes |
| Test command | `.\scripts\windows\installed-restart-persistence-smoke.ps1` |
| Installed daemon | `C:\Program Files\MergePilot\mergepilot-daemon.exe` |
| Port | `8787` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Installed daemon health before restart | Pass | Version `0.5.10`, config source `C:\Users\15492\.mergepilot\config.toml`, provider `azure`, deployment `gpt-4o`, `cloudProjectLinkStore: true`, and `cloudSessions: true`. |
| Temporary Project Link persistence | Pass | Created Project Link `9dd4e1cdacbab85b`; it existed before and after daemon restart. |
| Chat completion and history persistence | Pass | Created session `chat_1783284515625_7aca25`; `/chat` returned HTTP `200`, terminal SSE reached `done`, and assistant completion `persistence-ok-mp-installed-persist-20260706-044832` was present before and after daemon restart. |
| Installed daemon restart | Pass | Restarted the installed daemon process from `C:\Program Files\MergePilot\mergepilot-daemon.exe`; health after restart still reported version `0.5.10`, user config source, Azure provider, and `gpt-4o`. |
| Cleanup | Pass | Deleted the temporary chat session, temporary Project Link, and temporary repo. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Installed daemon restart persistence is healthy for Project Links, cloud-backed sessions, terminal completion, assistant completion, and cleanup. | Info | Keep this smoke as the installed-runtime business persistence gate. |
| This pass does not close the strict MSI hash parity gap from `mp-installed-msi-reprobe-20260706-0446`; it proves the currently installed app works and persists state, not that it matches the latest rebuilt same-version MSI payload. | Info | Pair this smoke with `verify-installed-msi-state.ps1 -RequireMsiPayloadMatch` after version-bumped release installs. |

## Run: mp-ai-insight-quality-gate-20260706-0455

| Field | Value |
|---|---|
| Date/time | 2026-07-06 04:55-04:57 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | Current working tree with uncommitted business test documentation and product/test fixes |
| Core/daemon commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/aiInsightQuality.test.ts test/aiInsightQualityChatPlanner.test.ts test/chatContext.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverAiInsightQualityRoutes.test.ts test/serverPrInsightWorkflowRoutes.test.ts` |
| Browser command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "redacts secret-like values|inspects ClaimBot_API pipeline #117 failure evidence"` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Core AI insight quality evaluator | Pass | `test/aiInsightQuality.test.ts`, `test/aiInsightQualityChatPlanner.test.ts`, and `test/chatContext.test.ts` passed 13/13. These cover seeded ClaimBot-style review expectations, vague-answer rejection, review-only scope enforcement, and context containing risk/test/security evidence. |
| Daemon AI insight route quality | Pass | `test/serverAiInsightQualityRoutes.test.ts` and `test/serverPrInsightWorkflowRoutes.test.ts` passed 5/5. These verify `/chat` SSE output quality for seeded local changes and PR insight summaries with files, work items, CI, policy, pending, and thread signals. |
| Live app secret/config review quality | Pass | Browser test `redacts secret-like values while reviewing current changes` passed. The visible Chat transcript passed `evaluateAiInsightAnswer` for required `.env.sample`, security/config categories, and review-only behavior; the secret value was not rendered, no approval was created, `HEAD` was unchanged, and the index stayed empty. |
| Live ClaimBot_API pipeline failure evidence quality | Pass | Browser test `inspects ClaimBot_API pipeline #117 failure evidence through normal Chat input` passed. The visible transcript included `Pipeline #117`, failed run `#4665`, and `MSBuild`/Publishing evidence, passed the deployment-category quality gate, and did not show `ado_trigger_pipeline` or `Pipeline #108`. |
| Live ADO pipeline read-only probe | Pass | `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoPipeline.test.ts` passed 2/2 read-only tests with 1 destructive queue test skipped by design. |
| Runtime and cleanup probe | Pass | `/healthz` remained healthy with version `0.5.10`, Azure OpenAI `gpt-4o`, and config source `C:\Users\15492\.mergepilot\config.toml`. No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories remained. |
| ADO mutation check | Pass | ClaimBot_API pipeline `#117` latest five runs remained `4679`, `4678`, `4677`, `4676`, and `4674`; the read-only quality gate did not queue a new pipeline run. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| AI insight quality now has core, daemon, and live browser evidence for seeded local-change review and real ClaimBot_API pipeline failure analysis. | Info | Keep these focused gates as the fast AI-Q regression set before broader live app batches. |
| The pipeline failure evidence path is verified as read-only in both visible transcript and ADO run history. | Info | Use this as the baseline before adding richer rerun-from-failure UX checks. |

## Run: mp-installed-native-ui-computer-use-20260706-0503

| Field | Value |
|---|---|
| Date/time | 2026-07-06 05:00-05:03 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | Current working tree with uncommitted business test documentation and product/test fixes |
| Tool | Computer Use via `mcp__node_repl.js` and `C:\Users\15492\.codex\plugins\cache\openai-bundled\computer-use\26.608.12217\scripts\computer-use-client.mjs` |
| Result | Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Computer Use runtime bootstrap | Pass | The locally repaired Computer Use plugin imported successfully; `setupComputerUseRuntime()` succeeded and `sky.list_apps()` returned 40 apps. |
| MergePilot native window enumeration | Pass | Computer Use found `com.mergepilot.desktop` running with window id `216403080`, title `MergePilot`, and display name `MergePilot`. The old `com.cicdagent.desktop` entry was present but not running. A later process-backed refresh also found `process:C:\Program Files\MergePilot\mergepilot-desktop.exe` with the same window id. |
| Native accessibility read | Pass | `sky.get_window_state({ include_screenshot: false, include_text: true })` returned document text for the installed app. The text confirmed the Pipelines page, signed-in user `Zhou Ping` / `Zhou.Ping@totalebizsolutions.com`, `ClaimBot_API link`, project/repo `TeBS-ClaimBot / ClaimBot_API`, pipeline `#117`, and actions including `Inspect runs`, `AI analyze`, and `Trigger pipeline`. |
| Passive screenshot metadata | Partial | `sky.screenshot({ windows: [window] })` returned screenshot metadata with size `1348x965`, but the displayed image content was the Windows lockscreen/Spotlight river image rather than the MergePilot window, so it is not valid pixel-level UI proof. |
| Native window activation | Fail | `sky.activate_window({ window })` failed with `failed to activate captured window` for both the bundle id window and the process-backed window. |
| Native click navigation | Fail | Clicking the `New chat` accessibility element failed with `failed to activate captured window`, so Computer Use cannot yet drive installed app navigation. |
| Native raise action | Fail | `perform_secondary_action` with `Raise` on the root element also failed with `failed to activate captured window`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Computer Use is no longer unavailable for this workstation: import, runtime setup, app enumeration, and read-only native accessibility proof now work. | Info | Keep using it for native installed-app inventory and accessibility evidence while the activation path is repaired. |
| Computer Use is not yet reliable enough to replace manual visual review or Playwright browser coverage for installed UI smoke. | High | Investigate the Tauri/Windows activation or capture path. Native release acceptance still needs reliable screenshot, activation, and click proof, or an alternate automation route such as Tauri WebDriver. |

## Run: mp-live-azure-review-queue-reprobe-20260706-0507

| Field | Value |
|---|---|
| Date/time | 2026-07-06 05:07-05:08 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | Current working tree with uncommitted business test documentation and product/test fixes |
| Commands | `MERGEPILOT_E2E_LIVE_AZURE=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts`; `GET http://127.0.0.1:8787/healthz`; `GET http://127.0.0.1:8787/project-links`; `GET http://127.0.0.1:8787/project-links/eb2f6c876f53b33d/review-queue` |
| Result | Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Azure permission probe | Pass as diagnostic, access Partial | `test/liveAzurePermissions.test.ts` passed 1/1. The Azure CLI account is `Zhou.Ping@totalebizsolutions.com`; default CLI subscription is `TeBS-Internal Azure Bot`, while the probe explicitly targeted subscription `a99512b0-3dc5-476f-8f43-d7db40fbc923` and resource group `developmentagent`. |
| Storage account ARM | Pass | User can read `devagentstorage001` ARM metadata. |
| Storage Table list | Pass | User can list Storage tables and saw `CicdAgentProfiles`. |
| Storage Table entity query | Fail | Entity query failed with missing Storage data-plane permission. Remediation remains `Storage Table Data Reader` or `Storage Table Data Contributor`; MergePilot needs Contributor for Project Link and ReviewHistory writes. |
| Cosmos account ARM and database list | Pass | User can read `devagentcosmos001` ARM metadata and list SQL database `cicd-agent`. |
| Cosmos SQL data-plane role assignments | Fail | No Cosmos SQL data-plane role assignments were returned. Runtime cloud session data-plane proof still needs Cosmos DB Built-in Data Contributor or equivalent scoped assignment. |
| Key Vault ARM | Pass | User can read `devagentkv001` ARM metadata and the vault URI. |
| Key Vault secret metadata/list | Fail | Secret list failed with `Forbidden`; user still needs `Key Vault Secrets User` for centralized secret reads. |
| Installed/running daemon health | Pass | `GET /healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudProjectLinkStore: true`, `cloudSecrets: false`, and `cloudSessions: true`. |
| Project Link list | Pass | Runtime returned `ClaimBot_API link` with id `eb2f6c876f53b33d`, repo path `C:\Users\15492\Develop\ClaimBot_API`, ADO project/repo `TeBS-ClaimBot / ClaimBot_API`, and pipeline `117 / ClaimBot_API`. |
| Review Queue local fallback | Pass | `GET /project-links/eb2f6c876f53b33d/review-queue` returned PR `2655` for repository `ClaimBot_API`, `decisionQueue: blocked`, `decisionRiskLevel: high`, `findingCount: 9`, and the message `Azure storage unavailable. Showing local review history from this device.` |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Live Review Queue remains useful to the user when Azure Table ReviewHistory is unavailable: the runtime falls back to local review history and still shows PR `#2655` evidence. | Info | Keep this fallback as the current business-safe behavior while cloud roles are pending. |
| True cloud ReviewHistory persistence is still not proven because Storage Table entity access is denied. | High | Grant `Storage Table Data Contributor` on `devagentstorage001`, then rerun a real review-run and verify the resulting `ReviewHistory` entity can be queried from Azure Table Storage. |
| Cosmos and Key Vault data-plane permissions are still incomplete. | Medium | Grant Cosmos SQL data-plane role and Key Vault secret data role before claiming full cloud-backed installed-user readiness. |

## Run: mp-live-pipeline-rerun-suggestion-reprobe-20260706-0513

| Field | Value |
|---|---|
| Date/time | 2026-07-06 05:12-05:13 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | Current working tree with uncommitted business test documentation and product/test fixes |
| Browser command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium --grep "rerun approval from failure evidence"` |
| ADO verification command | `az pipelines runs list --organization https://dev.azure.com/tebssg --project TeBS-ClaimBot --pipeline-ids 117 --top 5 -o json` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Frontend availability | Pass | Playwright web server started or reused the Vite app at `http://127.0.0.1:1420`; the installed/running daemon on `127.0.0.1:8787` was already healthy before the run. |
| Live Chat pipeline failure evidence follow-up | Pass | Focused browser test `prepares ClaimBot_API pipeline #117 rerun approval from failure evidence suggestions` passed 1/1 in 29.0 seconds. |
| Rerun approval preparation | Pass | The real Chat UI used the failed pipeline evidence path, exposed the `Rerun pipeline` suggestion, and prepared an `ado_trigger_pipeline` approval for ClaimBot_API pipeline `#117`. |
| Non-destructive guard | Pass | `MERGEPILOT_E2E_DESTRUCTIVE` was unset, so the test denied the approval and did not queue a pipeline run. |
| ADO run history check | Pass | Latest five ClaimBot_API pipeline `#117` runs remained `4679`, `4678`, `4677`, `4676`, and `4674`; no new run appeared after the focused rerun-suggestion test. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Pipeline rerun-from-failure UX is currently covered in the live app: the assistant can move from failure evidence to a rerun approval without mutating ADO unless destructive mode is enabled. | Info | Keep this focused gate as the fast regression for failure-to-rerun approval behavior. |
| Candidate pipeline persistence from the transcript remains separate from rerun approval behavior. | Medium | Continue treating candidate persistence as a product/test gap; this run only verifies configured pipeline `#117` rerun suggestion flow. |

## Run: mp-mocked-pipeline-candidate-persist-20260706-0523

| Field | Value |
|---|---|
| Date/time | 2026-07-06 05:21-05:23 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | Current working tree with uncommitted product/test fixes |
| Unit commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/components/conversation/suggestionReplyDerivation.test.ts src/pages/chat/chatDerivedState.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck` |
| Browser command | `.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts --project=chromium --grep "guides pipeline setup"` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Pipeline setup suggestion derivation | Pass | Desktop unit tests passed 31/31 across suggestion derivation and Chat derived state. The setup-required transcript now produces `Use #117 ClaimBot_API`, skips already configured candidates, and can derive suggestions from system/workflow-action summaries as well as assistant bubbles. |
| Desktop typecheck | Pass | `@mergepilot/desktop typecheck` passed. |
| Mocked Chat missing-pipeline browser flow | Pass | Focused Playwright test passed 1/1. `Open Pipelines workspace` with an active Project Link lacking `adoPipelineId` showed setup guidance, rendered `Use #117 ClaimBot_API`, and clicking it sent `PUT /project-links/pw-profile-no-pipeline` with `adoPipelineId: "117"` and `adoPipelineName: "ClaimBot_API"`. |
| Non-mutating guard | Pass | The candidate-save click updated Project Link state only; the test verified no second `/chat/workflow-action` call occurred and no approval UI was shown. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Candidate pipeline persistence from the transcript is now covered at mocked browser level. | Info | Keep this as the fast regression for missing-pipeline setup before adding live ADO discovery-to-save coverage. |
| The flow still does not mutate ADO resources; it only writes the Project Link mapping. | Info | Live ADO execution remains covered by the separate configured-pipeline read-only/destructive gates. |

## Run: mp-pipeline-failure-artifact-golden-20260706-0529

| Field | Value |
|---|---|
| Date/time | 2026-07-06 05:28-05:30 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | Current working tree with uncommitted product/test fixes |
| Commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/pipelineWorkflow.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Pipeline failure artifact golden structure | Pass | `test/pipelineWorkflow.test.ts` passed 4/4. The new golden coverage verifies a true failed run is selected for the artifact even when a newer run is canceled, locks the artifact id/title for `Pipeline #117 run #4665 failure`, and requires pipeline/run table evidence, failed/canceled run list, VSBuild evidence, `.DS_Store`, `Microsoft.Web.Publishing.targets`, and candidate next actions. |
| Pipeline summary/artifact redaction | Pass | The new redaction coverage injects `api_key`, `token`, `client_secret`, bearer token, and credential URL values into run URL, timeline issues, and log excerpts, then verifies summary plus markdown artifact contain `***REDACTED***` and no raw secret values. |
| Daemon typecheck | Pass | `@mergepilot/daemon typecheck` passed. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Failed pipeline artifact evidence is now protected by deterministic daemon-level golden tests, not only live ADO observations. | Info | Keep this focused gate before changing pipeline failure formatting, log extraction, or artifact rendering. |
| The test is non-mutating and does not touch Azure DevOps. | Info | Live pipeline read-only/destructive gates remain the evidence for real ADO integration. |

## Run: mp-pipeline-failure-classification-20260706-0533

| Field | Value |
|---|---|
| Date/time | 2026-07-06 05:31-05:33 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | Current working tree with uncommitted product/test fixes |
| Commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/pipelineWorkflow.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Source/config pipeline failure classification | Pass | Existing ClaimBot_API-style VSBuild/`.DS_Store` artifact coverage now also verifies `Classification: Likely source/configuration failure` and recommends inspecting referenced files/configuration plus focused local validation before committing a fix. |
| Transient infrastructure pipeline failure classification | Pass | New fixture with hosted-agent communication loss, network timeout, `ETIMEDOUT`, package feed failure, and `503` verifies summary and artifact classify the failure as `Likely infrastructure/transient failure` and recommend service-health inspection plus rerun approval before code changes. |
| Daemon typecheck | Pass | `@mergepilot/daemon typecheck` passed. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| PIPE-08 now has deterministic coverage for infra-vs-code failure classification. | Info | Broaden later with live failed-run examples after enough real ADO failure diversity exists. |
| The classification is evidence-based and stored in both summary and markdown artifact, so Chat can show the signal without forcing the user to open artifact details. | Info | Keep the summary wording stable enough for downstream AI-quality and UI tests. |

## Run: mp-full-source-suites-20260706-0605

| Field | Value |
|---|---|
| Date/time | 2026-07-06 06:05-06:06 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Git commit | Current working tree with uncommitted product/test fixes and test documentation |
| Commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Full core source suite | Pass | `@mergepilot/core test` passed 47 test files with 4 live-gated files skipped and 242 tests with 6 live-gated tests skipped. Coverage includes Azure auth/session cache behavior, Graph avatar support, Git/ADO tool contracts, chat planning, AI insight quality scoring, project-link config, checkpoints, repo indexing, memory, telemetry, and pipeline agent offline planning. |
| Full daemon source suite | Pass | `@mergepilot/daemon test` passed 45 files with 1 live-gated file skipped and 258 tests with 1 live-gated test skipped. Coverage includes daemon HTTP routes, workflow action derivation, approvals, PR/pipeline insight routes, Review Queue storage/fallback paths, Git write/recovery workflows, workspace file preview APIs, settings/config behavior, and pipeline failure classification. |
| Full desktop source suite | Pass | `@mergepilot/desktop test` passed 67/67 files and 323/323 tests. Coverage includes execution transcript rendering, streaming state, approval cards, approval evidence, source/file preview workspace, Project Link controls, Review Queue UI models, PR artifacts, pipeline model, composer state, image attachments, pagination, layout state, and chat history/runtime behavior. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The full source-level regression baseline is green after the latest live-app, browser, ADO, settings, packaging, and documentation work. | Info | Keep this gate as the standard local source baseline before staging a release-oriented batch. |
| These suites are non-live or live-gated by default; they do not replace the live app business gate or live ADO/Azure probes. | Info | Continue running the dedicated live-app and live ADO gates when validating real Git/ADO/installed-app behavior. |
| Computer Use is locally repaired enough to enumerate and read the installed MergePilot window, but activation/screenshot reliability remains a separate native UI automation gap. | Medium | Keep using Playwright and daemon/install scripts for release evidence until Computer Use can reliably activate, click, and capture the correct window pixels. |

## Run: mp-installed-strict-payload-reprobe-20260706-0609

| Field | Value |
|---|---|
| Date/time | 2026-07-06 06:09-06:10 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Installed app | `C:\Program Files\MergePilot` |
| Current MSI | `C:\Users\15492\Develop\Agents\CICD-agents\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.10_x64_en-US.msi` |
| Commands | `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireMsiPayloadMatch -RequireLegacyCleanup`; `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireLegacyCleanup`; `.\scripts\windows\installed-restart-persistence-smoke.ps1` |
| Result | Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Strict installed MSI payload parity | Fail | `-RequireMsiPayloadMatch` returned `ok: false`. Installed `mergepilot-desktop.exe` hash `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` did not match MSI payload hash `1C9B2A89307BDB9F2F71B7A91FB64802AC831CE8BA6A90522FFBB0263A0CB0AC`. Installed `mergepilot-daemon.exe` hash `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` did not match MSI payload hash `0F4428F7848C8AA8A099F7FD0B10F888ABFAF98DF7A20C400875130074BD12F5`. |
| Installed runtime smoke without payload parity | Pass | Non-strict verifier returned `ok: true`. Installed `/healthz` reported version `0.5.10`, Azure OpenAI provider, deployment `gpt-4o`, endpoint `https://devagentproj-resource.openai.azure.com`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudProjectLinkStore: true`, `cloudSecrets: false`, and `cloudSessions: true`. |
| Installed auth/avatar | Pass | `/auth/status` returned authenticated user `Zhou Ping` / `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, avatar data URL length `19339`, and prefix `data:image/jpeg;base64,/9j/4AAQS`. |
| Legacy cleanup and shortcuts | Pass | `C:\Program Files\CICD-Agent` is absent, old publisher shortcut folder is absent, one `MergePilot` uninstall entry exists, and the current MergePilot Start Menu shortcut exists. |
| Installed restart persistence | Pass | `installed-restart-persistence-smoke.ps1` passed with run ID `mp-installed-persist-20260706-061000`. It created Project Link `b948c57bf36e3bd2` and chat session `chat_1783289402406_f2ecad`, observed `/chat` HTTP `200`, terminal SSE `done`, and assistant completion `persistence-ok-mp-installed-persist-20260706-061000` before and after installed daemon restart. Cleanup deleted the chat session, Project Link, and temp repo. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The installed app is business-usable: health, configured model, auth/avatar, legacy cleanup, and restart persistence all pass. | Info | Keep the non-strict verifier plus restart persistence smoke as the installed-runtime readiness gate. |
| The installed app is not proven to be the exact current MSI payload. | High | Do not treat same-version reinstall as release proof. Bump the product/package version for release installs, or add a documented force-repair/uninstall-reinstall path and rerun `-RequireMsiPayloadMatch` until Program Files hashes match the MSI payload. |
| The payload mismatch is a packaging/release process issue, not an Azure model, avatar, or runtime configuration failure. | Info | Keep it tracked separately from first-run business functionality so the team does not chase the wrong layer. |

## Run: mp-installed-native-ui-computer-use-reprobe-20260706-0615

| Field | Value |
|---|---|
| Date/time | 2026-07-06 06:15-06:16 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Installed app | `C:\Program Files\MergePilot` |
| Tool | Computer Use via `C:\Users\15492\.codex\plugins\cache\openai-bundled\computer-use\26.608.12217\scripts\computer-use-client.mjs` |
| Result | Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Computer Use runtime bootstrap | Pass | `setupComputerUseRuntime()` succeeded and `sky.list_apps()` returned 40 apps. `com.mergepilot.desktop` was running with one window titled `MergePilot`; the old `com.cicdagent.desktop` entry was present but not running. |
| Native accessibility read | Pass | `get_window_state({ include_screenshot: false, include_text: true })` returned MergePilot accessibility content. Document text confirmed `New chat`, `Project Links`, `Review Queue`, `Pipelines`, `Settings`, signed-in user `Zhou Ping` / `Zhou.Ping@totalebizsolutions.com`, `ClaimBot_API link`, `ClaimBot_API`, `TeBS-ClaimBot / ClaimBot_API`, pipeline `#117`, and actions including `Save connection`, `Inspect runs`, `AI analyze`, and `Trigger pipeline`. |
| Native window activation | Fail | `sky.activate_window({ window })` still failed with `failed to activate captured window`. |
| Passive screenshot capture | Fail for visual evidence | `get_window_state({ include_screenshot: true })` returned a `1348x965` JPEG payload, but the visible content was unrelated Windows Spotlight/lockscreen river imagery, not the MergePilot UI. This cannot be accepted as pixel-level installed-app proof. |
| Native click navigation | Fail | A safe click attempt on the `New chat` accessibility element failed with `failed to activate captured window`, so Computer Use still cannot drive installed app navigation. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Computer Use remains useful for installed-app inventory and accessibility-level smoke evidence. | Info | Keep using it to verify native window presence, signed-in identity text, active page text, and Project Link/pipeline content. |
| Computer Use is still not release-grade for native installed UI pixel/click acceptance on this workstation. | High | Investigate the Tauri/Windows activation and capture path, or add an alternate native automation route such as Tauri WebDriver before claiming automated installed UI click/pixel coverage. |
| This reprobe did not mutate app state. | Info | The only attempted action was a safe `New chat` click, and it failed before activation. |

## Run: mp-live-azure-permission-diagnostic-20260706-0617

| Field | Value |
|---|---|
| Date/time | 2026-07-06 06:17 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Azure subscription targeted by probe | `a99512b0-3dc5-476f-8f43-d7db40fbc923` |
| Azure resource group | `developmentagent` |
| Command | `MERGEPILOT_E2E_LIVE_AZURE=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts` |
| Result | Pass as diagnostic; access Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Azure account | Pass | Azure CLI user is `Zhou.Ping@totalebizsolutions.com`. Default CLI subscription is `TeBS-Internal Azure Bot` (`9e1bd067-1e30-4e20-b29a-f2343141a25e`), while the probe explicitly targeted subscription `a99512b0-3dc5-476f-8f43-d7db40fbc923`. |
| Storage account ARM | Pass | Read ARM metadata for `devagentstorage001`, kind `StorageV2`, location `eastus`. |
| Storage Table list | Pass | Listed table `CicdAgentProfiles`. |
| Storage Table entity query | Fail | Entity query still fails with missing Storage Table data-plane permission. Required remediation remains `Storage Table Data Reader` or `Storage Table Data Contributor` on table `CicdAgentProfiles` or an appropriate parent scope. |
| Cosmos account ARM | Pass | Read `devagentcosmos001`, endpoint `https://devagentcosmos001.documents.azure.com:443/`, kind `GlobalDocumentDB`. |
| Cosmos SQL database list | Pass | Listed SQL database `cicd-agent`. |
| Cosmos SQL role assignments | Fail | No Cosmos SQL data-plane role assignments were returned. Required remediation remains Cosmos DB Built-in Data Contributor or equivalent scoped to `devagentcosmos001/cicd-agent` where possible. |
| Key Vault ARM | Pass | Read `devagentkv001`; RBAC authorization is enabled and vault URI is `https://devagentkv001.vault.azure.net/`. |
| Key Vault secret list | Fail | Secret metadata/list still fails with `Forbidden` for action `Microsoft.KeyVault/vaults/secrets/readMetadata/action`. Required remediation remains `Key Vault Secrets User` on `devagentkv001`; `Secrets Officer` is needed only for writes. |

### Resources

| Resource | Created/modified? | Cleanup |
|---|---|---|
| Azure resources | No | Probe only read metadata/list/readiness. |
| Storage Table entities | No | Entity query failed before reading entity data. |
| Cosmos documents | No | Probe did not create or modify documents. |
| Key Vault secrets | No | Probe did not create, update, or read secret values. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Azure ARM/metadata visibility remains healthy for the configured resources. | Info | Keep this diagnostic in the gated cloud readiness suite. |
| Azure data-plane access remains incomplete. | High | Grant Storage Table Data Reader/Contributor, Cosmos DB Built-in Data Contributor or equivalent, and Key Vault Secrets User before claiming cloud-backed Project Link/history/session/secret readiness complete. |
| True cloud ReviewHistory persistence still cannot be proven in this environment. | High | Rerun Review Queue cloud persistence only after Storage Table entity query succeeds. |

## Run: mp-live-ado-readonly-rerun-20260706-0620

| Field | Value |
|---|---|
| Date/time | 2026-07-06 06:20-06:21 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Azure DevOps organization | `https://dev.azure.com/tebssg` |
| Azure DevOps project/repo | `TeBS-ClaimBot` / `ClaimBot_API` |
| Pipeline target | `#117 ClaimBot_API` |
| Commands | `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts test/liveAdoPipeline.test.ts`; `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts`; `az pipelines runs list --organization https://dev.azure.com/tebssg --project TeBS-ClaimBot --pipeline-ids 117 --top 5 -o json` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live ADO discovery | Pass | `test/liveAdoDiscovery.test.ts` passed 1/1 and discovered project `TeBS-ClaimBot`, repository `ClaimBot_API`, and repository-filtered pipeline `#117 ClaimBot_API` with the current account. |
| Live ADO pipeline read-only | Pass | `test/liveAdoPipeline.test.ts` passed 2/2 read-only tests. It listed recent pipeline runs and read timeline/log evidence for a failed pipeline run. |
| Destructive pipeline queue case | Skipped | `MERGEPILOT_E2E_DESTRUCTIVE` was unset, so no pipeline queue mutation was attempted. |
| Live daemon PR insight | Pass | `test/liveAdoPrInsight.test.ts` passed 1/1. `/chat/workflow-action` inspected a real ClaimBot_API pull request and returned HTTP 200 without approval or mutation. |
| ADO mutation check | Pass | Latest five ClaimBot_API pipeline `#117` runs remained `4679 / 20260705.12`, `4678 / 20260705.11`, `4677 / 20260705.10`, `4676 / 20260705.9`, and `4674 / 20260705.8`; no new pipeline run was queued. |
| Temp cleanup | Pass | No `%TEMP%\mergepilot-daemon-live-pr-insight-*` or `%TEMP%\mergepilot-live-*` directories remained after the tests. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| ClaimBot_API live ADO read-only coverage remains healthy after the Computer Use plugin cache repair. | Info | Keep this as the frequent ADO gate for Project Link discovery, pipeline inspection, and PR insight. |
| This run did not mutate Azure DevOps resources. | Info | Destructive PR/pipeline tests remain separate opt-in gates with cleanup records. |

## Run: mp-installed-runtime-native-reprobe-20260706-0622

| Field | Value |
|---|---|
| Date/time | 2026-07-06 06:22-06:25 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Installed app | `C:\Program Files\MergePilot` |
| Current MSI | `C:\Users\15492\Develop\Agents\CICD-agents\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.10_x64_en-US.msi` |
| Commands/tools | `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireMsiPayloadMatch -RequireLegacyCleanup`; `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireLegacyCleanup`; Computer Use via `computer-use-client.mjs`; `.\scripts\windows\installed-restart-persistence-smoke.ps1` |
| Result | Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Strict installed MSI payload parity | Fail | Installed `mergepilot-desktop.exe` hash `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` did not match MSI payload hash `1C9B2A89307BDB9F2F71B7A91FB64802AC831CE8BA6A90522FFBB0263A0CB0AC`. Installed `mergepilot-daemon.exe` hash `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` did not match MSI payload hash `0F4428F7848C8AA8A099F7FD0B10F888ABFAF98DF7A20C400875130074BD12F5`. |
| Installed runtime smoke without payload parity | Pass | Non-strict verifier returned `ok: true`. Installed `/healthz` reported version `0.5.10`, Azure OpenAI provider, deployment `gpt-4o`, endpoint `https://devagentproj-resource.openai.azure.com`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudProjectLinkStore: true`, `cloudSecrets: false`, and `cloudSessions: true`. |
| Installed auth/avatar | Pass | `/auth/status` returned authenticated user `Zhou Ping` / `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, avatar data URL length `19339`, and JPEG data URL prefix `data:image/jpeg;base64,/9j/4AAQS`. |
| Legacy cleanup and shortcuts | Pass | `C:\Program Files\CICD-Agent` is absent, old publisher shortcut folder is absent, one `MergePilot` uninstall entry exists, and the current MergePilot Start Menu shortcut exists. |
| Computer Use app/window discovery | Pass | `sky.list_apps()` found exactly one `com.mergepilot.desktop` app with one window titled `MergePilot`. |
| Native accessibility read | Pass | `get_window_state({ include_screenshot: false, include_text: true })` returned installed app text for `New chat`, `Project Links`, `Review Queue`, `Pipelines`, `Settings`, `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `ClaimBot_API link`, `ClaimBot_API`, `TeBS-ClaimBot / ClaimBot_API`, pipeline `#117`, `Save connection`, `Inspect runs`, `AI analyze`, and `Trigger pipeline`. |
| Native window activation | Fail | `sky.activate_window({ window })` still failed with `failed to activate captured window`. |
| Native screenshot capture | Fail for visual proof | `get_window_state({ include_screenshot: true })` returned one `1348x965` JPEG payload for the MergePilot window handle, but the visible content was unrelated Windows Spotlight/lockscreen river imagery, not MergePilot. |
| Native click navigation | Fail | A safe click on the `New chat` accessibility element failed with `failed to activate captured window`; no app state-changing action was performed. |
| Installed restart persistence | Pass | `installed-restart-persistence-smoke.ps1` passed with run ID `mp-installed-persist-20260706-062516`. It created Project Link `b80913c0c0a29a64` and chat session `chat_1783290319072_b416ae`, observed `/chat` HTTP `200`, terminal SSE `done`, and assistant completion `persistence-ok-mp-installed-persist-20260706-062516` before and after installed daemon restart. Cleanup deleted the chat session, Project Link, and temp repo. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Installed business runtime remains healthy: config/model, auth/avatar, legacy cleanup, and restart persistence all pass. | Info | Keep the non-strict verifier plus restart persistence smoke in the installed-runtime readiness gate. |
| Same-version MSI replacement is still not proven. | High | Bump the product/package version or add a documented repair/uninstall-reinstall path, then rerun strict payload parity until Program Files hashes match the MSI payload. |
| Computer Use is repaired enough for native app discovery and accessibility-level inspection, but not for release-grade pixel/click UI proof. | High | Investigate Tauri/Windows capture and activation behavior, or add an alternate native automation route such as Tauri WebDriver. |
| Computer Use plugin startup root cause is now understood and locally repaired. | Info | The cached Computer Use plugin entry file `C:\Users\15492\.codex\plugins\cache\openai-bundled\computer-use\26.608.12217\scripts\computer-use-client.mjs` previously deep-imported an internal `@oai/sky` file that is not exported by `@oai/sky@0.4.19`, causing `ERR_PACKAGE_PATH_NOT_EXPORTED`. The local cache patch dynamically resolves the real package directory and imports the internal file by absolute `file://` URL. A future Codex plugin cache refresh may overwrite this local repair. |
| This run did not mutate Azure DevOps resources. | Info | Only local temporary Project Link/chat/repo resources were created by the restart persistence smoke, and all were cleaned. |

## Run: mp-live-app-business-full-pass-20260706-0628

| Field | Value |
|---|---|
| Date/time | 2026-07-06 06:28-06:34 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Running app at `http://127.0.0.1:1420` with daemon `http://127.0.0.1:8787` |
| Resource mode | Full non-destructive live app browser business gate; real local app runtime, real temp Git repos, live ADO read-only pipeline access; no destructive ADO mutation |
| Command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Full live app business gate | Pass | 30/30 real browser workflows passed in 6.2 minutes. |
| Git approval workflows | Pass | Covered selected-file staging, pending approval reload/restore with execute-once safety, approval denial, denial feedback replanning, stage-and-commit, commit validation failure with staged-change preservation, empty-commit guard, staged-only summary, draft commit message safety, dirty branch switching, target merge, merge conflict recovery, create-and-switch branch, local bare remote push, pull/rebase from a behind branch, rebase conflict recovery, stash push/apply/pop, stash-pop conflict recovery with stash preservation, restore selected file, revert last commit, local release tag creation, and safe single-tag publication. |
| Security/read-only workflows | Pass | Covered credential-redacted remote target inspection and secret-like diff redaction during read-only change review without staging, committing, or leaking secret values. |
| ClaimBot_API pipeline workflows | Pass | Covered live discovery-to-save for pipeline `#117 ClaimBot_API`, read-only failure evidence inspection through normal Chat input, rerun approval preparation from failure evidence suggestions, and direct trigger approval preparation. Destructive mode was unset, so approvals were denied or left non-mutating by test design. |
| ADO mutation check | Pass | Latest five ClaimBot_API pipeline `#117` runs remained `4679 / 20260705.12`, `4678 / 20260705.11`, `4677 / 20260705.10`, `4676 / 20260705.9`, and `4674 / 20260705.8`; no new pipeline run was queued. |
| Project Link cleanup | Pass | `/project-links` retained only long-lived links: `ClaimBot_API link` with pipeline `117 / ClaimBot_API`, and `project link2`. |
| Temp cleanup | Pass | No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories remained after the run. |
| Runtime health after run | Pass | `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudProjectLinkStore: true`, `cloudSecrets: false`, and `cloudSessions: true`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The current running app remains healthy against the full non-destructive project-maintenance workflow suite. | Info | Keep this as the main application-level business gate while continuing to split the large spec into smaller business-domain specs. |
| No ADO resources were mutated by this run. | Info | Destructive PR/pipeline gates remain separate and explicitly opt-in. |
| The test file is still slow at 6.2 minutes. | Medium | Continue extracting reusable temp Git repo fixtures and split the suite by Git, pipeline, and security domains without weakening cleanup checks. |

## Run: mp-review-queue-focused-rerun-20260706-0637

| Field | Value |
|---|---|
| Date/time | 2026-07-06 06:37-06:38 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Running app daemon at `http://127.0.0.1:8787` |
| Resource mode | Focused Review Queue route/UI gate plus live runtime queue visibility; no destructive ADO mutation |
| Commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverReviewRunRoutes.test.ts test/serverReviewDispositionWritebackRoutes.test.ts test/serverReviewStorageRoutes.test.ts`; `.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/review-queue.spec.ts --project=chromium`; live `GET /project-links/eb2f6c876f53b33d/review-queue` |
| Result | Pass for local/fallback behavior |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Daemon Review Queue routes | Pass | 3 files passed, 6/6 tests passed. Coverage includes review-run persistence, queue listing, manual disposition recording, ADO write-back success/failure recording, storage fallback paths, and route-level queue contracts. |
| Browser Review Queue workflow | Pass | 3/3 Chromium tests passed in 21.0 seconds: queue evidence acknowledgement, request-changes with ADO write-back retry, and stale review rerun refresh. |
| Live runtime queue visibility | Pass | `GET /project-links/eb2f6c876f53b33d/review-queue` returned real `ClaimBot_API link`, `count: 1`, PR `#2655`, `decisionQueue: blocked`, `decisionRiskLevel: high`, and `findingCount: 9`. The response `message` was `null` in this run. |
| Runtime health and cleanup | Pass | `/healthz` remained healthy with version `0.5.10`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudProjectLinkStore: true`, `cloudSecrets: false`, and `cloudSessions: true`. No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories remained. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Review Queue is business-usable for the current ClaimBot_API runtime through local/fallback storage. | Info | Keep the route/UI gates plus live runtime queue probe in the focused Review Queue gate. |
| This run does not prove Azure Table `ReviewHistory` entity persistence. | High | Rerun a cloud persistence-specific Review Queue test only after Storage Table data-plane entity query/write permission is granted. |
| No ADO resources were mutated. | Info | This gate intentionally verified queue visibility and UI disposition behavior without creating PRs or queuing pipelines. |

## Run: mp-computer-use-post-cache-repair-20260706-0642

| Field | Value |
|---|---|
| Date/time | 2026-07-06 06:42 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Tool | Computer Use via `C:\Users\15492\.codex\plugins\cache\openai-bundled\computer-use\26.608.12217\scripts\computer-use-client.mjs` |
| Target app | Installed `MergePilot`, app id `com.mergepilot.desktop`, window id `216403080`, title `MergePilot` |
| Result | Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Computer Use bootstrap | Pass | `setupComputerUseRuntime()` succeeded after the local plugin cache repair. |
| App/window discovery | Pass | `sky.list_apps()` returned `com.mergepilot.desktop` with one running window titled `MergePilot`; legacy `com.cicdagent.desktop` remained installed but not running. |
| Native accessibility read | Pass | `get_window_state({ include_screenshot: false, include_text: true })` returned MergePilot text including `New chat`, `Project Links`, `Review Queue`, `Pipelines`, `Settings`, `Zhou Ping`, `ClaimBot_API link`, `ClaimBot_API`, and `TeBS-ClaimBot / ClaimBot_API`. |
| Native activation | Fail | `sky.activate_window({ window })` still failed with `failed to activate captured window`. |
| Native screenshot capture | Fail for visual proof | `get_window_state({ include_screenshot: true })` returned a `1348x965` JPEG payload, but the rendered image was Windows Spotlight/lockscreen river content, not the MergePilot UI. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Computer Use is no longer blocked at plugin import/runtime bootstrap. | Info | Treat the local cache repair as successful for app discovery and accessibility-level verification. |
| Computer Use is still not release-grade for installed UI click/pixel smoke on this workstation. | High | The remaining failure is in native activation/capture behavior, not in the plugin entry-file import. Continue using Playwright and daemon/install scripts for release evidence until a reliable native UI automation path is available. |
| No app or ADO state was changed. | Info | This was a passive probe except for the failed activation attempt. |

## Run: mp-settings-config-focused-gate-20260706-0646

| Field | Value |
|---|---|
| Date/time | 2026-07-06 06:46 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Running app daemon at `http://127.0.0.1:8787` plus mocked Chromium Settings UI |
| Resource mode | Non-mutating config/settings gate; no ADO mutation |
| Commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/daemonEnv.test.ts test/llmSettings.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/settings.test.ts test/azureAuthSession.test.ts test/azureAuthCredential.test.ts`; `.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/settings-permissions.spec.ts --project=chromium`; live `GET /healthz` and `GET /daemon/config` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Daemon config/env tests | Pass | 2 files passed, 10/10 tests passed. Coverage includes user config template creation, local `.env` loading, Key Vault secret references, default system Key Vault URL, explicit process env precedence, and LLM settings behavior. |
| Core settings/auth tests | Pass | 3 files passed, 9/9 tests passed. Coverage includes settings parsing, Azure auth session behavior, and Azure credential handling. |
| Settings browser permission UX | Pass | 1/1 Chromium test passed. The mocked Settings UI explains missing Key Vault `secrets/get`, allows switching built-in model secrets to `Local .env`, removes the stale Key Vault warning after switching, and shows the `secrets/set` permission message when the user tries to switch back to Key Vault without write permission. |
| Live daemon config probe | Pass | `/healthz` returned `ok: true`, version `0.5.10`, `llmConfigured: true`, `llmProvider: azure`, deployment `gpt-4o`, API version `2024-08-01-preview`, endpoint `https://devagentproj-resource.openai.azure.com`, config source `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`. `/daemon/config` returned `secretSource: local_env`, `azureEmbeddingDeployment: text-embedding-3-small`, Key Vault URL `https://devagentkv001.vault.azure.net/`, Storage account `devagentstorage001`, Cosmos endpoint `https://devagentcosmos001.documents.azure.com:443/`, and `keyVaultSecretError: null`. |
| Temp cleanup check | Pass | No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories were present after the gate. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The current app can operate with local model secrets while Key Vault permissions are unavailable. | Info | Keep `Local .env` as the practical default for the current permission state. |
| Settings permission messaging is user-actionable for Key Vault read and write failures. | Info | Continue to distinguish `secrets/get` from `secrets/set` in Settings and health diagnostics. |
| This gate does not prove Key Vault secret read/write success. | Medium | Rerun a Key Vault success-path gate only after the account/app has `Key Vault Secrets User` or equivalent permissions on `devagentkv001`. |
| No app, cloud, or ADO state was changed. | Info | The browser test used mocked Settings routes; live runtime probes were read-only. |

## Run: mp-project-link-focused-gate-20260706-0649

| Field | Value |
|---|---|
| Date/time | 2026-07-06 06:49-06:50 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Running app daemon at `http://127.0.0.1:8787` plus mocked Chromium Chat UI |
| Resource mode | Non-destructive Project Link lifecycle and mapping gate |
| Commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverProjectLinkRoutes.test.ts test/chatProjectLinkIdRoutes.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/projectLinks.test.ts src/pages/chat/useActiveProjectLinkRuntime.test.ts`; `.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts --project=chromium --grep "pipeline setup|Project Link|Use #117|source references|branch menus"`; live `GET /project-links` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Daemon Project Link routes | Pass | 2 files passed, 10/10 tests passed. Coverage includes Project Link CRUD, pipeline field persistence, local fallback when Azure Table auth/consent is unavailable, avoiding Key Vault PAT lookup in `local_env` mode, internal ADO discovery, internal pipeline discovery, and ADO tool availability checks. |
| Desktop Project Link models | Pass | 2 files passed, 13/13 tests passed. Coverage includes pipeline candidate ranking, generated-name refresh without overwriting user names, stable discovery signatures, applying discovered pipeline id/name, canonical active Project Link persistence, and active Project Link repo-path resolution. |
| Browser Project Link UX | Pass | 6/6 Chromium tests passed. Coverage includes empty Project Link onboarding without pinned-summary clutter, ADO field inference from local repo creation, ClaimBot_API pipeline recommendation when multiple pipelines exist, missing-pipeline setup guidance, active Project Link long-workflow transcript clarity, and project-context source references. |
| Live Project Link state | Pass | `GET /project-links` returned only the expected long-lived links: `ClaimBot_API link` (`C:\Users\15492\Develop\ClaimBot_API`, org `https://tebssg.visualstudio.com/`, project `TeBS-ClaimBot`, repo `ClaimBot_API`, pipeline `117 / ClaimBot_API`) and `project link2` (`C:\Users\15492\Develop\TeBS-ClaimBot`, no pipeline id). |
| Temp cleanup check | Pass | No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories were present after the gate. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Project Link lifecycle and active mapping behavior remain healthy after the recent Settings, pipeline, and chat transcript changes. | Info | Keep this focused gate as the fast regression for Project Link CRUD, inference, pipeline persistence, and active-link routing. |
| The current ClaimBot_API Project Link is correctly mapped to pipeline `#117 ClaimBot_API`. | Info | This confirms the test target is the repository-specific pipeline used by current ADO and pipeline gates. |
| This gate is non-destructive and does not queue pipelines or mutate ADO. | Info | Live ADO discovery and destructive ADO checks remain separate opt-in gates. |

## Run: mp-pr-ai-insight-quality-rerun-20260706-0652

| Field | Value |
|---|---|
| Date/time | 2026-07-06 06:52-06:54 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Running app daemon at `http://127.0.0.1:8787`; focused mocked Chromium Chat UI; live ADO read-only PR insight |
| Resource mode | Non-mutating PR insight and AI quality gate; live ClaimBot_API PR read-only probe; no ADO writes |
| Commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/aiInsightQuality.test.ts test/aiInsightQualityChatPlanner.test.ts test/chatPlannerGuards.test.ts test/chatContext.test.ts test/adoPullRequestMutationRegistry.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverPrInsightWorkflowRoutes.test.ts test/serverAiInsightQualityRoutes.test.ts test/serverPrInsightStorageRoutes.test.ts test/serverReadOnlyGitChatRoutes.test.ts test/workspaceWorkflow.test.ts`; `.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts --project=chromium --grep "PR insight|pipeline controls|source references|secret/config review"`; `MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts`; live read-only `POST /chat` for PR `#2655` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Core AI/PR quality contracts | Pass | 5 files passed, 19/19 tests passed. Coverage includes AI insight answer scoring, ChatPlanner quality integration, read-only/write-escalation guards, seeded ClaimBot-style context evidence, and PR mutation registry payload contracts for title/description/reviewer/label/work-item operations. |
| Daemon PR/AI quality routes | Pass | 5 files passed, 18/18 tests passed. Coverage includes seeded PR insight summaries with changed files, failed builds, blocking/pending policies, active threads, linked work items, persisted PR insight artifacts, daemon AI answer scoring, read-only Git routing, and workspace workflow behavior. |
| Browser PR/pipeline/source UX | Pass | 7/7 Chromium tests passed. Coverage includes structured PR insight controls, pipeline controls, natural-language read-only PR insight without approval UI, project-context source references, saved PR insight artifact source loading, persisted PR insight lookup errors, and ordinary artifact shells not being misread as PR insight artifacts. |
| Live ADO PR insight route | Pass | `MERGEPILOT_E2E_LIVE_ADO=1` daemon test passed 1/1 against real ClaimBot_API PR `#2655`, inspecting the PR without approval or mutation. |
| Live normal Chat PR read-only routing | Pass | `POST /chat` for `Analyze PR 2655...Read-only only` returned HTTP `200`, streamed `PR #2655`, emitted no approval markers, called `ado_get_pull_request_by_id` and `ado_get_pull_request_changes`, and did not call write tools such as `ado_create_pull_request`, `ado_update_pull_request`, `git_push`, `git_commit`, or `git_add`. |
| Runtime health and cleanup | Pass | `/healthz` remained healthy at version `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories were present after the gate. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| PR insight remains aligned with the product goal: native ADO read-only data is converted into AI-visible readiness evidence without drifting into approvals or writes. | Info | Keep this as the focused regression for PR readiness, quality scoring, and read-only routing. |
| Current quality gates cover deterministic answer evidence better than subjective model quality. | Medium | Future improvement can add a small eval harness with more seeded PR/pipeline datasets after the Vitest golden set stabilizes. |
| This gate did not mutate ADO. | Info | PR write/update behavior remains covered by separate contract and destructive cleanup gates. |

## Run: mp-ado-failure-mode-focused-gate-20260706-0655

| Field | Value |
|---|---|
| Date/time | 2026-07-06 06:55-06:56 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Running app daemon health probe plus mocked core/daemon/browser ADO failure-mode gates |
| Resource mode | Non-mutating ADO failure-mode, permission-message, PR/pipeline boundary gate |
| Commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/adoClientAuth.test.ts test/adoClient.test.ts test/adoClientDiscovery.test.ts test/adoClientPullRequests.test.ts test/adoBuildPipelineInternal.test.ts test/adoHealthInternal.test.ts test/adoPullRequestsInternal.test.ts test/adoPullRequestMutations.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverAdoWorkflowRoutes.test.ts test/serverPrInsightWorkflowRoutes.test.ts test/serverPullRequestInsightPreviewRoutes.test.ts test/serverPullRequestRoutes.test.ts test/pipelineWorkflow.test.ts`; `.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/settings-permissions.spec.ts tests/e2e/chat-layout.spec.ts --project=chromium --grep "permission|missing pipeline|pipeline setup|lookup errors|pipeline controls|PR insight"` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Core ADO client and mutation contracts | Pass | 8 files passed, 54/54 tests passed. Coverage includes ADO auth behavior, general ADO client handling, project/repo/pipeline discovery, pull request reads, build/pipeline internal parsing, health checks, pull request internal models, and PR mutation contracts. |
| Daemon ADO/PR/pipeline workflows | Pass | 5 files passed, 15/15 tests passed. Coverage includes ADO workflow routes, PR insight workflow routes, PR insight preview routes, pull request list/context routes, and pipeline workflow failure classification/evidence behavior. |
| Browser permission and ADO UX | Pass | 8/8 Chromium tests passed. Coverage includes Settings Key Vault permission messaging, PR insight controls, pipeline controls, missing-pipeline setup guidance, natural-language read-only PR insight without approval UI, saved PR insight artifact source loading, persisted PR insight lookup errors, and avoiding false PR insight artifact lookup for ordinary artifact shells. |
| Runtime health and cleanup | Pass | `/healthz` remained healthy at version `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories were present after the gate. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Mocked ADO failure-mode and permission UX coverage is healthy across core, daemon, and browser layers. | Info | Keep this as the fast gate for ADO boundary behavior when live permissions are partial. |
| This gate complements, but does not replace, live Azure data-plane permission probes. | Medium | Storage Table, Cosmos SQL, and Key Vault success paths still need live RBAC before they can be proven end-to-end. |
| No ADO resources were mutated. | Info | Write/mutation behavior remains covered by PR mutation contracts and separate destructive cleanup gates. |

## Run: mp-persistence-offline-focused-gate-20260706-0659

| Field | Value |
|---|---|
| Date/time | 2026-07-06 06:59-07:01 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Installed daemon at `http://127.0.0.1:8787` plus local Vitest persistence suites |
| Resource mode | Non-mutating local/installed persistence and offline fallback gate |
| Commands | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/memoryStore.test.ts test/projectLinkConfig.test.ts test/reviewHistoryLocal.test.ts test/reviewOperationsLocal.test.ts test/reviewQueueEntity.test.ts test/prInsightArtifactsLocal.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatHistoryStore.test.ts test/serverChatHistoryRoutes.test.ts test/serverPrInsightStorageRoutes.test.ts test/serverProjectLinkRoutes.test.ts test/serverReviewStorageRoutes.test.ts`; `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatSessionHistory.test.ts src/pages/chat/chatDraftPersistence.test.ts src/reviewHistoryLocal.test.ts src/reviewRunHistory.test.ts src/reviewOperations.test.ts src/reviewAudit.test.ts src/pages/chat/artifacts/useArtifactWorkspace.test.ts src/pages/chat/artifacts/ArtifactWorkspace.test.tsx`; installed daemon `GET /healthz`, `GET /daemon/config`, `GET /project-links`, and `GET /chat/history` |
| Result | Pass for local/installed persistence |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Core local persistence contracts | Pass | 6 files passed, 24/24 tests passed. Coverage includes memory store behavior, Project Link config persistence, local review history, local review operations, review queue entity modeling, and local PR insight artifacts. Raw log: `output/live-e2e/persistence-core-20260706-065951.log`. |
| Daemon persistence/storage routes | Pass | 5 files passed, 17/17 tests passed. Coverage includes chat history store behavior, chat history routes, PR insight storage routes, Project Link routes, and review storage routes. Raw log: `output/live-e2e/persistence-daemon-20260706-065951.log`. |
| Desktop persistence UI models | Pass | 8 files passed, 42/42 tests passed. Coverage includes chat session history, chat draft persistence, local review history, review run history, review operations, review audit records, artifact workspace state, and artifact workspace rendering. Raw log: `output/live-e2e/persistence-desktop-20260706-065951.log`. |
| Installed daemon runtime probe | Pass | `mergepilot-daemon.exe` was running from `C:\Program Files\MergePilot\mergepilot-daemon.exe --port 8787`. `/healthz` returned `ok: true`, version `0.5.10`; `/daemon/config` returned `secretSource: local_env`; `/project-links` returned two persisted long-lived links; `/chat/history` returned persisted session rows including recent PR insight and Git workflow prompts. Raw probe: `output/live-e2e/persistence-live-installed-probe-20260706-070107.json`. |
| Source default daemon probe | Informational | A first probe against `127.0.0.1:1421` failed because the source/dev daemon was not running; process inspection showed the installed daemon was the active runtime on port `8787`. Raw probe: `output/live-e2e/persistence-live-probe-20260706-070027.json`. |
| Business temp cleanup check | Pass | No `%TEMP%\mergepilot-live-*`, `%TEMP%\mergepilot-daemon-live-pr-insight-*`, `%TEMP%\mp-installed-persist-*`, `%TEMP%\mp-persist-*`, or `%TEMP%\mp-projectlink-restart-*` directories were present after the gate. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Local and installed persistence paths are healthy for the current product baseline. | Info | Keep this as the fast gate for chat history, Project Link persistence, review storage fallback, and PR insight artifacts. |
| The installed runtime is the active app under test for this pass. | Info | Use port `8787` for installed-app probes unless the app reports a different sidecar port. |
| This gate does not prove Azure Table or Cosmos data-plane persistence success. | Medium | Rerun cloud persistence probes after Storage Table entity and Cosmos SQL data-plane roles are granted. |

## Run: mp-computer-use-native-retry-20260706-0703

| Field | Value |
|---|---|
| Date/time | 2026-07-06 07:03 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Tool | Computer Use via `C:\Users\15492\.codex\plugins\cache\openai-bundled\computer-use\26.608.12217\scripts\computer-use-client.mjs` |
| Target app | Installed `MergePilot`, app id `com.mergepilot.desktop`, window id `216403080`, title `MergePilot` |
| Result | Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Computer Use bootstrap | Pass | `setupComputerUseRuntime()` succeeded through the repaired plugin entry file. |
| App/window discovery | Pass | `sky.list_apps()` returned exactly one MergePilot match: `com.mergepilot.desktop`, running with window `216403080`, title `MergePilot`. |
| Native accessibility read | Pass | `get_window_state({ include_text: true })` returned real MergePilot text including `New chat`, `Project Links`, `Review Queue`, `Pipelines`, `Settings`, `Zhou Ping`, `ClaimBot_API link`, `ClaimBot_API`, and `TeBS-ClaimBot / ClaimBot_API`. |
| Native activation | Fail | `sky.activate_window({ window })` returned `failed to activate captured window`. No click/input automation was attempted after this failure. |
| Native screenshot capture | Fail for visual proof | `get_window_state({ include_screenshot: true })` returned a `1348x965` screenshot payload, but the image showed Windows Spotlight/lockscreen river content instead of the MergePilot UI. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The local Computer Use plugin import/runtime issue is repaired. | Info | Keep using Computer Use for passive installed-app discovery and accessibility-level checks. |
| Computer Use is still not reliable for release-grade installed UI click/pixel proof on this workstation. | High | Treat native click/screenshot acceptance as blocked by activation/capture behavior until the Computer Use runtime can foreground and capture the actual MergePilot window. |
| Playwright, daemon probes, and installed smoke scripts remain the reliable release evidence path. | Info | Continue using browser/API/install scripts for deterministic release gates. |

## Run: mp-installed-strict-and-azure-permission-rerun-20260706-0706

| Field | Value |
|---|---|
| Date/time | 2026-07-06 07:06-07:07 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Installed `C:\Program Files\MergePilot` app on daemon port `8787`; Azure CLI account `Zhou.Ping@totalebizsolutions.com` |
| Resource mode | Non-mutating installed-state and Azure permission diagnostic |
| Commands | `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireMsiPayloadMatch -RequireLegacyCleanup`; `$env:MERGEPILOT_E2E_LIVE_AZURE='1'; .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts` |
| Result | Installed runtime partial; Azure permission diagnostic pass with access partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Installed strict state verifier | Partial | `verify-installed-msi-state.ps1` returned `ok: false` only because installed binary hashes do not match the current MSI payload hashes. Installed runtime checks passed: legacy `C:\Program Files\CICD-Agent` directory absent, current shortcut present, uninstall entry is `MergePilot 0.5.10`, `/healthz` reported version `0.5.10`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudProjectLinkStore: true`, `cloudSecrets: false`, `cloudSessions: true`, and `keyVaultSecretError: null`. Auth returned `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, avatar length `19339`. |
| MSI payload parity | Fail | Installed desktop hash `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` and installed daemon hash `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` still differ from current MSI payload hashes `1C9B2A89307BDB9F2F71B7A91FB64802AC831CE8BA6A90522FFBB0263A0CB0AC` and `0F4428F7848C8AA8A099F7FD0B10F888ABFAF98DF7A20C400875130074BD12F5`. |
| Live Azure permission diagnostic | Pass as diagnostic, access partial | Vitest passed 1/1. ARM metadata reads passed for Storage account `devagentstorage001`, Cosmos account `devagentcosmos001`, and Key Vault `devagentkv001`. Storage Table list passed and found `CicdAgentProfiles`; Cosmos SQL database list passed and found `cicd-agent`. |
| Storage Table entity access | Fail | Entity query failed with missing data-plane permissions. Required role: `Storage Table Data Reader` or `Storage Table Data Contributor` on `CicdAgentProfiles` or parent scope. |
| Cosmos SQL data-plane role | Fail | No Cosmos SQL data-plane role assignments were returned. Required role: Cosmos DB Built-in Data Contributor, scoped to `devagentcosmos001/cicd-agent` where possible. |
| Key Vault secret metadata/list access | Fail | Key Vault secret list failed with `Forbidden` for Azure CLI app id `04b07795-8ddb-461a-bbee-02f9e1bf7b46`, object id `8f74dcbd-1729-4b19-83be-577f45d5a55b`, action `Microsoft.KeyVault/vaults/secrets/readMetadata/action`. Required role: `Key Vault Secrets User` on `devagentkv001`; `Key Vault Secrets Officer` only if writes are needed. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Installed app runtime, auth, avatar, config, and legacy cleanup remain healthy. | Info | The user-visible installed app is usable with local `.env` secrets while cloud secret permissions are missing. |
| Strict release parity is still not proven for the currently installed Program Files binaries. | High | Reinstall with a version-bumped MSI or force a repair path that replaces same-version files, then rerun `-RequireMsiPayloadMatch`. |
| Azure data-plane access remains partial. | High | Grant Storage Table entity read/write, Cosmos SQL data-plane role, and Key Vault secret metadata/read roles before rerunning cloud persistence and Key Vault success-path tests. |

## Run: mp-fresh-browser-gate-20260706-0710

| Field | Value |
|---|---|
| Date/time | 2026-07-06 07:10-07:12 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Mocked Chromium browser gates plus installed daemon probe on `http://127.0.0.1:8787` |
| Resource mode | Non-mutating browser regression and runtime cleanup check |
| Commands | `.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium --grep "@smoke"`; `.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium`; installed daemon `GET /healthz`, `GET /project-links`, and `GET /chat/history` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Mocked browser smoke | Pass | 9/9 Chromium smoke tests passed in 27.7 seconds. Raw log: `output/live-e2e/browser-smoke-20260706-071010.log`. |
| Default Chromium browser gate | Pass | 84 Chromium tests discovered; 54 passed and 30 gated live-app tests skipped by design in 1.3 minutes. Raw log: `output/live-e2e/browser-default-20260706-071010.log`. |
| Installed daemon health probe | Pass | `/healthz` returned `ok: true`, version `0.5.10`, provider `azure`, deployment `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. Raw probe: `output/live-e2e/browser-gate-runtime-probe-20260706-071225.json`. |
| Project Link state | Pass | `/project-links` returned two long-lived links. `ClaimBot_API link` remained mapped to project `TeBS-ClaimBot` and pipeline `117 / ClaimBot_API`; `project link2` remained without a pipeline id. |
| Chat history state | Pass | `/chat/history` returned 30 persisted rows. |
| Business temp cleanup | Pass | No `%TEMP%\mergepilot-live-*`, `%TEMP%\mergepilot-daemon-live-pr-insight-*`, `%TEMP%\mp-installed-persist-*`, `%TEMP%\mp-persist-*`, or `%TEMP%\mp-projectlink-restart-*` directories were present after the browser gate. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The mocked browser UI baseline is still green after the recent persistence, permission, and installed-runtime probes. | Info | Keep this as the fast UI regression gate for Chat shell, PR/pipeline controls, Project Link UX, Review Queue, Settings permission messages, source preview, and transcript behavior. |
| The installed daemon remained healthy during the browser gate. | Info | Continue probing installed runtime state after large browser gates to catch sidecar/config drift. |
| No live ADO or Azure resources were mutated. | Info | This gate intentionally skipped the 30 live-app tests by design. |

## Run: mp-live-ado-readonly-rerun-20260706-0714

| Field | Value |
|---|---|
| Date/time | 2026-07-06 07:14-07:15 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Live Azure DevOps read-only tests plus installed daemon probe on `http://127.0.0.1:8787` |
| Resource mode | Non-mutating live ADO discovery, pipeline evidence, and PR insight gate |
| Commands | `$env:MERGEPILOT_E2E_LIVE_ADO='1'; .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts test/liveAdoPipeline.test.ts`; `$env:MERGEPILOT_E2E_LIVE_ADO='1'; .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts`; installed daemon `GET /healthz` and `GET /project-links` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live ADO discovery and pipeline smoke | Pass | 2 files passed. 3 tests passed and 1 destructive queue test skipped by design. Coverage includes discovering the ClaimBot_API project/repository/pipeline with the current account, listing recent pipeline runs, and reading timeline/log evidence for the latest failed pipeline run. Raw log: `output/live-e2e/live-ado-core-readonly-20260706-071426.log`. |
| Live ADO PR insight workflow | Pass | 1 daemon test passed. It inspected a real ClaimBot_API pull request without approval or mutation. Raw log: `output/live-e2e/live-ado-daemon-pr-insight-20260706-071426.log`. |
| Installed daemon health probe | Pass | `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI deployment `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. Raw probe: `output/live-e2e/live-ado-rerun-runtime-probe-20260706-071507.json`. |
| Project Link state | Pass | `/project-links` returned two long-lived links. `ClaimBot_API link` remained mapped to project `TeBS-ClaimBot` and pipeline `117 / ClaimBot_API`; `project link2` remained without a pipeline id. |
| Business temp cleanup | Pass | No `%TEMP%\mergepilot-live-*`, `%TEMP%\mergepilot-daemon-live-pr-insight-*`, `%TEMP%\mp-installed-persist-*`, `%TEMP%\mp-persist-*`, or `%TEMP%\mp-projectlink-restart-*` directories were present after the live ADO gate. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Live read-only ADO access remains healthy for the product's primary ClaimBot_API target. | Info | Continue using pipeline `117 / ClaimBot_API` and the real ClaimBot_API PR insight workflow as the current read-only ADO acceptance path. |
| The destructive pipeline queue path was intentionally skipped. | Info | Queue/rerun behavior remains covered by separate opt-in destructive gates and by non-destructive approval-preparation browser gates. |
| This gate did not exercise Azure Storage/Cosmos/Key Vault data-plane persistence. | Medium | Cloud persistence remains blocked by the RBAC gaps recorded in the Azure permission diagnostic. |

## Run: mp-e2e-20260706-071800

| Field | Value |
|---|---|
| Date/time | 2026-07-06 07:18-07:20 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Live Azure DevOps destructive PR workflow against `tebssg / TeBS-ClaimBot / ClaimBot_API`; installed daemon probe on `http://127.0.0.1:8787` |
| Resource mode | Destructive live ADO PR/write workflow with cleanup |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-e2e-20260706-071800 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDestructive.test.ts` |
| Environment flags | `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE=1`, `MERGEPILOT_E2E_RUN_ID=mp-e2e-20260706-071800` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Destructive ADO PR workflow | Pass | 1/1 test passed. The run created branch `mergepilot-e2e/mp-e2e-20260706-071800`, pushed `/.mergepilot-e2e/mp-e2e-20260706-071800.md`, created draft PR `2742`, updated PR metadata, added/removed label `mergepilot-e2e-mp-e2e-20260706-071800`, added/removed reviewer `a1b6982e-2922-6109-ae4e-b71d27b2ef57`, created work item `7910`, linked/unlinked it to PR `2742`, deleted the work item, abandoned the PR, and deleted the branch. Raw log: `output/live-e2e/destructive-ado-pr-20260706-071800.log`. |
| Run artifact | Pass | Artifact `output/live-e2e/mp-e2e-20260706-071800-ado-destructive-pr.json` records PR `2742`, branch `mergepilot-e2e/mp-e2e-20260706-071800`, work item `7910`, cleanup statuses for label/reviewer/link/work item/PR/branch, and PR URL `https://dev.azure.com/tebssg/TeBS-ClaimBot/_git/ClaimBot_API/pullrequest/2742`. |
| Independent cleanup verification | Pass | `az repos pr show --id 2742` returned `status: abandoned`; `az repos ref list --repository ClaimBot_API -p TeBS-ClaimBot --filter heads/mergepilot-e2e/mp-e2e-20260706-071800` returned `0` refs; `az boards work-item show --id 7910` returned `TF401232`, confirming the work item is deleted or no longer readable. Raw verification: `output/live-e2e/destructive-ado-pr-independent-verify-20260706-071946.json` and `output/live-e2e/destructive-ado-pr-branch-verify-20260706-072015.json`. |
| Installed daemon health probe | Pass | `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI deployment `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. Raw probe: `output/live-e2e/destructive-ado-pr-runtime-probe-20260706-071835.json`. |
| Project Link state | Pass | `/project-links` returned two long-lived links. `ClaimBot_API link` remained mapped to project `TeBS-ClaimBot` and pipeline `117 / ClaimBot_API`; `project link2` remained without a pipeline id. |
| Business temp cleanup | Pass | No `%TEMP%\mergepilot-live-*`, `%TEMP%\mergepilot-daemon-live-pr-insight-*`, `%TEMP%\mp-installed-persist-*`, `%TEMP%\mp-persist-*`, or `%TEMP%\mp-projectlink-restart-*` directories were present after the destructive ADO PR gate. |

### Resources Created And Cleaned

| Resource | Identifier | Cleanup status |
|---|---|---|
| ADO branch | `mergepilot-e2e/mp-e2e-20260706-071800` | Deleted; independent ref lookup returned `0`. |
| ADO PR | `2742` | Abandoned. |
| ADO PR label | `mergepilot-e2e-mp-e2e-20260706-071800` | Added and removed during test body. |
| ADO reviewer | `a1b6982e-2922-6109-ae4e-b71d27b2ef57` | Added and removed during test body. |
| ADO work item | `7910` | Deleted; lookup returned `TF401232`. |
| ADO work item link | `7910 -> PR 2742` | Linked and unlinked during test body. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The live destructive PR workflow remains healthy for ClaimBot_API. | Info | Keep this as the current real ADO mutation baseline for PR metadata, reviewer, label, work-item, branch, and PR lifecycle cleanup. |
| Cleanup completed successfully and was independently verified. | Info | Continue requiring independent branch/PR/work-item verification for destructive gates. |
| This gate did not queue a pipeline run. | Info | Destructive pipeline queue coverage remains separate from destructive PR workflow coverage. |

## Run: mp-pipe-20260706-072253

| Field | Value |
|---|---|
| Date/time | 2026-07-06 07:22-07:31 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Live Azure DevOps core pipeline workflow against `tebssg / TeBS-ClaimBot / ClaimBot_API` pipeline `#117`; installed daemon probe on `http://127.0.0.1:8787` |
| Resource mode | Destructive live ADO pipeline queue/read-back; ADO build history intentionally retained |
| Test command | `MERGEPILOT_E2E_LIVE_ADO=1 MERGEPILOT_E2E_DESTRUCTIVE=1 MERGEPILOT_E2E_RUN_ID=mp-pipe-20260706-072253 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoPipeline.test.ts` |
| Environment flags | `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE=1`, `MERGEPILOT_E2E_RUN_ID=mp-pipe-20260706-072253` |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live ADO pipeline read and destructive queue workflow | Pass | 3/3 core tests passed. Coverage listed recent pipeline runs, read timeline/log evidence for the latest failed run, queued a tagged pipeline run, and read the new run back through the same product ADO pipeline API. Raw log: `output/live-e2e/destructive-ado-pipeline-core-20260706-072253.log`. |
| ADO pipeline queue/read-back | Pass | The test queued ClaimBot_API pipeline run `4680 / 20260706.1` for pipeline `#117`. Follow-up REST probe confirmed `state: completed`, `result: succeeded`, created at `2026-07-05T23:23:00.1580268Z`, finished at `2026-07-05T23:24:33.5745301Z`, URL `https://dev.azure.com/tebssg/3f914df8-6fd8-4f16-adf4-bf790a87efd2/_build/results?buildId=4680`. Raw final run record: `output/live-e2e/destructive-ado-pipeline-run-4680-final-20260706-073050.json`. |
| REST run listing evidence | Pass | Product-style Pipelines REST query showed run `4680` at the top of pipeline `#117` history while it was in progress, then the final poll confirmed success. Raw listing: `output/live-e2e/destructive-ado-pipeline-rest-runs-20260706-072416.json`. |
| Installed daemon health probe | Pass | `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI deployment `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. Raw probe: `output/live-e2e/destructive-ado-pipeline-runtime-probe-20260706-072319.json`. |
| Project Link state | Pass | `/project-links` retained two long-lived links. `ClaimBot_API link` remained mapped to project `TeBS-ClaimBot` and pipeline `117 / ClaimBot_API`; `project link2` remained without a pipeline id. |
| Business temp cleanup | Pass | No `%TEMP%\mergepilot-live-*`, `%TEMP%\mergepilot-daemon-live-pr-insight-*`, `%TEMP%\mp-installed-persist-*`, `%TEMP%\mp-persist-*`, or `%TEMP%\mp-projectlink-restart-*` directories were present after the destructive pipeline gate. |

### Resources Created And Retained

| Resource | Identifier | Cleanup status |
|---|---|---|
| ADO pipeline run | `4680 / 20260706.1` | Retained as normal ADO build history; completed `succeeded`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The core ClaimBot_API pipeline queue/read-back path remains healthy for pipeline `#117`. | Info | Keep this as the current product-code ADO pipeline mutation baseline, separate from Chat UI approval preparation. |
| The run used the repository-mapped ClaimBot_API pipeline and did not drift to another pipeline target. | Info | Continue asserting pipeline id/name from Project Link state before destructive queue tests. |
| The only discardable artifact is the earlier malformed PowerShell poll URL from local test orchestration. | Low | Ignore `output/live-e2e/destructive-ado-pipeline-run-4680-poll-20260706-072430.json`; it used bad string interpolation in the manual poll command and is not product evidence. |

## Run: mp-computer-use-native-recheck-20260706-0738

| Field | Value |
|---|---|
| Date/time | 2026-07-06 07:38-07:42 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Installed MergePilot native window through the repaired Computer Use plugin cache |
| Resource mode | Passive native-window inspection; no app mutation |
| Result | Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Computer Use bootstrap and app discovery | Pass | `setupComputerUseRuntime()` succeeded and `sky.list_apps()` returned 40 apps. MergePilot was discovered as `com.mergepilot.desktop` with one targetable window titled `MergePilot`. |
| Native accessibility read | Pass | `get_window_state({ include_screenshot: false, include_text: true })` returned an accessibility tree containing `New chat`, `Project Links`, `Review Queue`, `Pipelines`, `Settings`, signed-in user `Zhou Ping`, `ClaimBot_API link`, and `TeBS-ClaimBot / ClaimBot_API`. |
| Native screenshot capture | Fail | `get_window_state({ include_screenshot: true })` returned a `1348x965` screenshot, but the image content was unrelated Windows Spotlight/lockscreen river imagery rather than the MergePilot window. |
| Native activation | Fail | `activate_window({ window })` still failed with `failed to activate captured window`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The repaired plugin cache moved Computer Use from unavailable to accessibility-level native inspection. | Info | Keep using accessibility reads for passive installed-app state checks. |
| Pixel/click proof is still blocked by the Computer Use window capture/activation layer. | High | Native installed UI smoke cannot be upgraded to full pass until screenshot capture returns the MergePilot window and activation succeeds. |

## Run: mp-installed-strict-rerun-20260706-0737

| Field | Value |
|---|---|
| Date/time | 2026-07-06 07:37-07:38 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Installed MergePilot from `C:\Program Files\MergePilot` with installed daemon on `http://127.0.0.1:8787` |
| Resource mode | Passive installed-app verification; no app or cloud mutation |
| Command | `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireMsiPayloadMatch -RequireLegacyCleanup` |
| Result | Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Installed strict state verifier | Partial | Raw log: `output/live-e2e/installed-strict-rerun-20260706-073748.log`. The verifier returned `ok: false` only because installed binary hashes do not match the current MSI payload hashes. |
| Installed daemon health | Pass | `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI deployment `gpt-4o`, API version `2024-08-01-preview`, endpoint `https://devagentproj-resource.openai.azure.com`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`. |
| Installed auth and avatar | Pass | `/auth/status` returned authenticated user `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, and `avatarLength: 19339`; the raw runtime probe also confirmed the field is `avatarDataUrl`. |
| Legacy cleanup | Pass | `C:\Program Files\CICD-Agent` was absent, the old publisher shortcut directory was absent, the current MergePilot shortcut existed, and the only uninstall entry was `MergePilot 0.5.10`. |
| MSI payload parity | Fail | Installed desktop hash `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` and installed daemon hash `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` still differ from current MSI payload hashes `1C9B2A89307BDB9F2F71B7A91FB64802AC831CE8BA6A90522FFBB0263A0CB0AC` and `0F4428F7848C8AA8A099F7FD0B10F888ABFAF98DF7A20C400875130074BD12F5`. |
| Runtime state probe | Pass | Follow-up probe `output/live-e2e/installed-runtime-probe-20260706-073814.json` confirmed `/healthz`, authenticated user, two Project Links, 30 chat history rows, and `ClaimBot_API link` mapped to local repo `C:\Users\15492\Develop\ClaimBot_API`, project `TeBS-ClaimBot`, and pipeline `117 / ClaimBot_API`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Installed runtime, auth, avatar, Project Link state, chat history, and legacy cleanup remain healthy. | Info | Continue using the installed app for business runtime checks. |
| Release-grade installed payload parity is still not proven for the current Program Files binaries. | High | Use a version-bumped MSI, uninstall/reinstall, or force-repair path that replaces same-version files, then rerun `-RequireMsiPayloadMatch`. |

## Run: mp-live-app-business-full-rerun-20260706-0741

| Field | Value |
|---|---|
| Date/time | 2026-07-06 07:41-07:48 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Installed MergePilot desktop and daemon from `C:\Program Files\MergePilot`, daemon on `http://127.0.0.1:8787`; Playwright Chromium driving the running app |
| Resource mode | Full non-destructive live app browser business gate; real local temp Git repos, live ADO read-only access, no destructive ADO mutation |
| Test command | `MERGEPILOT_E2E_LIVE_APP=1 MERGEPILOT_E2E_LIVE_ADO=1 .\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium` |
| Environment flags | `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE` unset |
| Result | Pass |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Full live app business gate | Pass | 30/30 real browser workflows passed in 6.6 minutes. Raw log: `output/live-e2e/live-app-business-full-rerun-20260706-074123.log`. |
| Git write and recovery workflows | Pass | Coverage included selected-file staging, pending approval reload/restore, approval denial, denial feedback replanning, stage-and-commit, commit validation failure with staged-change preservation, empty commit guard, staged-only summary, draft commit message safety, dirty branch switching, target merge, merge conflict recovery, create-and-switch branch, push to local bare remote, pull/rebase from a behind branch, rebase conflict recovery, stash push/apply/pop, stash-pop conflict recovery with stash preservation, restore selected file, revert last commit, local tag creation, and safe single-tag publication. |
| Read-only safety and redaction | Pass | Coverage included remote credential redaction and secret-like diff redaction while reviewing current changes. |
| ClaimBot_API pipeline workflows | Pass | Coverage discovered and saved ClaimBot_API pipeline `#117` when a Project Link had no pipeline ID, inspected ClaimBot_API pipeline `#117` failure evidence through normal Chat input, prepared rerun approval from failure evidence suggestions, and prepared direct pipeline approval. |
| Runtime and Project Link cleanup probe | Pass | Follow-up probe `output/live-e2e/live-app-business-full-rerun-probe-20260706-074828.json` reported `/healthz ok: true`, version `0.5.10`, deployment `gpt-4o`, two Project Links, 30 chat history rows, and `ClaimBot_API link` still mapped to `C:\Users\15492\Develop\ClaimBot_API`, project `TeBS-ClaimBot`, pipeline `117 / ClaimBot_API`. |
| Business temp cleanup | Pass | Follow-up probe found `0` directories matching `%TEMP%\mergepilot-live-*`, `%TEMP%\mergepilot-daemon-live-pr-insight-*`, `%TEMP%\mp-installed-persist-*`, `%TEMP%\mp-persist-*`, and `%TEMP%\mp-projectlink-restart-*`. |
| ADO mutation check | Pass | Follow-up ADO run probe `output/live-e2e/live-app-business-full-rerun-ado-runs-20260706-074829.json` showed latest ClaimBot_API pipeline `#117` run remained `4680 / 20260706.1` from the earlier destructive core queue gate; no newer run was queued by this non-destructive browser gate. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The full running-app business workflow remains green after the installed runtime, Computer Use, and destructive pipeline reruns. | Info | Keep this as the current non-destructive live app baseline. |
| Non-destructive mode preserved ADO run history. | Info | Continue asserting latest run ID before and after live browser pipeline approval-preparation tests. |

## Run: mp-review-queue-focused-rerun-20260706-0753

| Field | Value |
|---|---|
| Date/time | 2026-07-06 07:53-07:56 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Focused daemon Review Queue route tests, mocked Chromium Review Queue browser workflows, and installed daemon live runtime probe on `http://127.0.0.1:8787` |
| Resource mode | Local/mocked Review Queue business gate plus live runtime read probe; no live ADO mutation |
| Result | Pass for local/fallback behavior |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Daemon Review Queue routes | Pass | `.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverReviewRunRoutes.test.ts test/serverReviewDispositionWritebackRoutes.test.ts test/serverReviewStorageRoutes.test.ts` passed 3 files / 6 tests. Raw log: `output/live-e2e/review-queue-daemon-focused-rerun-20260706-075349.log`. |
| Browser Review Queue workflows | Pass | `.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/review-queue.spec.ts --project=chromium` passed 3/3 in 19.6 seconds. Coverage includes queue evidence rendering and acknowledged disposition, request-changes ADO write-back plus retry, and stale review rerun refresh. Raw log: `output/live-e2e/review-queue-browser-focused-rerun-20260706-075457.log`. |
| Live runtime Review Queue probe | Pass for local/fallback visibility | `GET /project-links/eb2f6c876f53b33d/review-queue` returned one real ClaimBot_API queue item for PR `#2655`, with `decisionQueue: blocked`, `decisionRiskLevel: high`, `findingCount: 9`, `contextConfidence: low`, source commit `214975ac65f3658386c8968bd333490f536f5f16`, and response `message: null`. Raw probe: `output/live-e2e/review-queue-live-runtime-rerun-20260706-075615.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Review Queue route, browser, and live runtime fallback behavior remain healthy. | Info | Keep this gate as the focused Review Queue business acceptance path. |
| This is not proof of Azure Table `ReviewHistory` cloud persistence. | Medium | Rerun cloud persistence once Storage Table data-plane permissions are granted. |

## Run: mp-pr-ai-insight-quality-rerun-20260706-0800

| Field | Value |
|---|---|
| Date/time | 2026-07-06 08:00-08:04 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Focused core/daemon/browser PR and AI insight quality gates plus live ADO PR insight read against real ClaimBot_API PR `#2655`; installed daemon probe on `http://127.0.0.1:8787` |
| Resource mode | Non-mutating PR/AI insight regression; live ADO read-only PR insight; no Git, PR, pipeline, or cloud writes |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/aiInsightQuality.test.ts test/aiInsightQualityChatPlanner.test.ts test/chatPlannerGuards.test.ts test/chatContext.test.ts test/adoPullRequestMutationRegistry.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/serverPrInsightWorkflowRoutes.test.ts test/serverAiInsightQualityRoutes.test.ts test/serverPrInsightStorageRoutes.test.ts test/serverReadOnlyGitChatRoutes.test.ts test/workspaceWorkflow.test.ts
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts --project=chromium --grep "PR insight|pipeline controls|source references|secret/config review"
$env:MERGEPILOT_E2E_LIVE_ADO='1'; .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Core PR/AI quality contracts | Pass | 5 files / 19 tests passed. Coverage includes deterministic AI answer scoring, ChatPlanner final-answer quality, read-only planning guards, seeded ClaimBot-style chat context evidence, and PR mutation registry payload mapping. Raw log: `output/live-e2e/pr-ai-quality-core-rerun-20260706-080051.log`. |
| Daemon PR/AI quality routes | Pass | 5 files / 18 tests passed. Coverage includes PR insight workflow routes, AI insight quality route scoring, PR insight storage behavior, read-only Git chat routes, and workspace workflow command planning. Raw log: `output/live-e2e/pr-ai-quality-daemon-rerun-20260706-080051.log`. |
| Focused browser PR/pipeline/source UX | Pass | 7/7 Chromium tests passed. Coverage includes PR insight controls, pipeline controls, natural-language read-only PR insight without approval UI, project-context source references, saved PR insight artifact source loading, persisted PR insight lookup errors, and ordinary artifact shell handling. Raw log: `output/live-e2e/pr-ai-quality-browser-rerun-20260706-080128.log`. |
| Live ADO PR insight read | Pass | 1/1 daemon live ADO PR insight test passed against real ClaimBot_API PR `#2655`. Raw log: `output/live-e2e/pr-ai-quality-live-ado-pr-insight-rerun-20260706-080216.log`. |
| Installed daemon health and cleanup probe | Pass | `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI deployment `gpt-4o`; `/project-links` returned two links; no `%TEMP%\mergepilot-live-*`, `%TEMP%\mergepilot-daemon-live-pr-insight-*`, `%TEMP%\mp-installed-persist-*`, `%TEMP%\mp-persist-*`, or `%TEMP%\mp-projectlink-restart-*` directories remained. Raw probe: `output/live-e2e/pr-ai-quality-runtime-probe-20260706-080412.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| PR insight remains aligned with the product goal: native ADO read evidence feeds AI analysis without drifting into approval or mutation. | Info | Keep this focused gate before broader live app or destructive ADO runs. |
| Browser coverage still protects the UX boundary between read-only insight, PR artifact lookup, source preview, and pipeline controls. | Info | Broaden seeded PR/pipeline datasets later, but this is the current PR/AI insight baseline. |

## Run: mp-installed-computer-use-recheck-20260706-0806

| Field | Value |
|---|---|
| Date/time | 2026-07-06 08:06-08:10 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Installed MergePilot from `C:\Program Files\MergePilot`; installed daemon on `http://127.0.0.1:8787`; repaired local Computer Use plugin cache |
| Resource mode | Passive installed-app verification and native-window inspection; no app mutation |
| Result | Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Strict installed MSI state verifier | Partial | `.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireMsiPayloadMatch -RequireLegacyCleanup` returned exit code `1` only because installed binary hashes still differ from the current MSI payload hashes. Raw log: `output/live-e2e/installed-strict-after-computer-use-fix-20260706-080658.log`. |
| Installed daemon health | Pass | `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI deployment `gpt-4o`, API version `2024-08-01-preview`, endpoint `https://devagentproj-resource.openai.azure.com`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`. |
| Installed auth and avatar | Pass | The verifier reported authenticated user `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, `avatarLength: 19339`, and JPEG data URL prefix `data:image/jpeg;base64,/9j/4AAQS`. This confirms the earlier installed-app avatar visibility issue is fixed in the running app state. |
| Legacy cleanup | Pass | `C:\Program Files\CICD-Agent` was absent, the old publisher shortcut directory was absent, the current MergePilot shortcut existed, and the only uninstall entry was `MergePilot 0.5.10`. |
| MSI payload parity | Fail | Installed desktop hash `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` and installed daemon hash `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` still differ from current MSI payload hashes `1C9B2A89307BDB9F2F71B7A91FB64802AC831CE8BA6A90522FFBB0263A0CB0AC` and `0F4428F7848C8AA8A099F7FD0B10F888ABFAF98DF7A20C400875130074BD12F5`. |
| Runtime state probe | Pass | Follow-up probe confirmed two Project Links, 30 chat history rows, and no business temp directories. Raw probe: `output/live-e2e/installed-runtime-after-computer-use-fix-20260706-080658.json`. |
| Computer Use bootstrap and app discovery | Pass | Repaired Computer Use runtime listed 40 apps and discovered exactly one MergePilot app, `com.mergepilot.desktop`, with one targetable window titled `MergePilot`. |
| Computer Use accessibility proof | Pass | Accessibility tree included `New chat`, `Project Links`, `Review Queue`, `Pipelines`, `Settings`, signed-in user `Zhou Ping`, `ClaimBot_API link`, and `TeBS-ClaimBot / ClaimBot_API`. |
| Computer Use activation | Fail | `sky.activate_window({ window })` still failed with `failed to activate captured window`. |
| Computer Use screenshot proof | Fail | `get_window_state({ include_screenshot: true })` returned one `1348x965` screenshot, but the displayed image was unrelated Windows Spotlight/lockscreen river imagery instead of the MergePilot window. Summary artifact: `output/live-e2e/installed-computer-use-recheck-20260706-0806.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Installed runtime, auth, avatar, Project Link state, chat history, and legacy cleanup are healthy. | Info | Treat the user-visible avatar issue as fixed for the current installed app state. |
| Strict release payload parity is still not proven. | High | Build/install a version-bumped MSI or add a documented force-repair/uninstall-reinstall path that replaces same-version binaries, then rerun `-RequireMsiPayloadMatch`. |
| Computer Use is repaired for bootstrap, app discovery, and accessibility-level installed-app proof. | Info | Use it for passive native state checks when Playwright browser coverage is insufficient. |
| Computer Use is still not release-grade for installed UI pixel/click acceptance. | High | Activation and screenshot capture must return the actual MergePilot window before this can replace manual visual review or a Tauri WebDriver-style native automation route. |

## Run: mp-installed-computer-use-recheck-20260706-0940

| Field | Value |
|---|---|
| Date/time | 2026-07-06 09:40-09:47 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Installed MergePilot from `C:\Program Files\MergePilot`; installed daemon on `http://127.0.0.1:8787`; locally repaired Computer Use plugin cache |
| Resource mode | Passive native-window inspection plus one low-risk navigation click attempt; no Git, ADO, pipeline, cloud, or installer writes |
| Result | Partial; accessibility proof still passes, screenshot/click proof still fails |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Installed daemon health probe | Pass | `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI deployment `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`. This confirms the running app is healthy but still not the `0.5.11` installed payload. |
| Install verifier skip-install diagnostic | Expected fail | `.\scripts\windows\install-and-verify-msi-state.ps1 -SkipInstall -SkipVision` exited `1` because installed Program Files binaries are still `0.5.10` while the expected MSI is `0.5.11`. Raw log: `output/live-e2e\install-and-verify-msi-state-skipinstall-current-after-cua-fix-20260706.log`. |
| Computer Use bootstrap and app discovery | Pass | `sky.list_apps()` returned 40 apps and exactly one MergePilot app, `com.mergepilot.desktop`, with one targetable window titled `MergePilot`. |
| Computer Use accessibility proof | Pass | `get_window_state({ include_text: true })` read the MergePilot accessibility tree and found `New chat`, `Project Links`, `Review Queue`, `Pipelines`, `Settings`, signed-in user `Zhou Ping`, `ClaimBot_API link`, `ClaimBot_API`, and `TeBS-ClaimBot / ClaimBot_API`. |
| Computer Use screenshot proof | Fail | Capturing the MergePilot window through both `com.mergepilot.desktop` and `process:C:\Program Files\MergePilot\mergepilot-desktop.exe` returned one `1348x965` screenshot, but the displayed image was still unrelated river/Windows Spotlight imagery rather than MergePilot UI. |
| Computer Use activation and click proof | Fail | `sky.activate_window({ window })` and a low-risk click on the Settings navigation element both failed with `failed to activate captured window`. No app navigation occurred. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The user's plugin-cache repair successfully restores the Computer Use runtime entry point and app discovery. | Info | Keep using Computer Use for passive native state/accessibility probes in this local session. |
| Native window screenshot/click acceptance remains incomplete even after the plugin import fix. | High | Do not treat Computer Use as release-grade installed UI pixel/click proof until activation succeeds and screenshots show the actual MergePilot window. |
| The remaining failure is now below the app business layer: Windows capture/activation behavior for the Tauri window, not MergePilot's accessibility tree or app runtime. | Medium | Consider a Tauri/WebDriver-style installed-app automation route or a small in-app diagnostic visual endpoint if Computer Use capture cannot be made reliable. |
| Installed Program Files parity is still separate and unresolved. | High | Install the `0.5.11` MSI as administrator, then rerun strict installed parity plus installed live vision. |

## Run: mp-live-azure-permission-rerun-20260706-0942

| Field | Value |
|---|---|
| Date/time | 2026-07-06 09:42-09:43 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Live Azure permission diagnostic through Azure CLI after the latest login/plugin repair state |
| Resource mode | Read-only Azure probe; no Azure Table, Cosmos, Key Vault, Git, ADO, pipeline, or installer writes |
| Result | Pass as diagnostic; access remains Partial |

### Command

```powershell
$env:MERGEPILOT_E2E_LIVE_AZURE='1'
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts *> output\live-e2e\live-azure-permissions-after-cua-fix-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Azure account | Pass | Azure CLI account is `Zhou.Ping@totalebizsolutions.com` in tenant `1f432b2e-9e7a-4aa0-ace2-53af62d309f6`; default CLI subscription is `TeBS-Internal Azure Bot`, while the probe targets subscription `a99512b0-3dc5-476f-8f43-d7db40fbc923`. |
| Storage account ARM | Pass | ARM metadata for `devagentstorage001` is readable. |
| Storage Table list | Pass | Table list returned `CicdAgentProfiles`. |
| Storage Table entity query | Fail | Entity query still returns a permissions error. Required role remains `Storage Table Data Reader` or `Storage Table Data Contributor` on `CicdAgentProfiles` or the storage account scope. |
| Cosmos account ARM | Pass | ARM metadata for `devagentcosmos001` is readable. |
| Cosmos SQL database list | Pass | SQL database list returns `cicd-agent`. |
| Cosmos SQL role assignments | Fail | No Cosmos SQL data-plane role assignments were returned. Required role remains Cosmos DB Built-in Data Contributor, ideally scoped to `devagentcosmos001/cicd-agent`. |
| Key Vault ARM | Pass | ARM metadata for `devagentkv001` is readable and RBAC authorization is enabled. |
| Key Vault secret list | Fail | Secret metadata/list still fails with `Microsoft.KeyVault/vaults/secrets/readMetadata/action` forbidden for Azure CLI app id `04b07795-8ddb-461a-bbee-02f9e1bf7b46` and user object id `8f74dcbd-1729-4b19-83be-577f45d5a55b`. Required role remains `Key Vault Secrets User` for reads; `Key Vault Secrets Officer` is needed only for writes. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Azure management-plane discovery works, but required data-plane permissions are still missing. | High | Do not run cloud persistence success gates until Storage Table entity query, Cosmos SQL data-plane access, and Key Vault secret metadata/list access succeed. |
| Local model-secret mode remains the correct current runtime mode. | Info | Keep Key Vault as optional/disabled in Settings until `secrets/get` is granted. |
| This run confirms the Azure login state did not close the remaining RBAC gaps. | Medium | Re-run this probe after role assignments propagate. |

## Run: mp-live-app-business-full-rerun-20260706-0950

| Field | Value |
|---|---|
| Date/time | 2026-07-06 09:50-09:57 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Running installed MergePilot app with daemon on `http://127.0.0.1:8787`; Chromium Playwright against the real Chat UI |
| Resource mode | Live app, non-destructive; uses isolated temp Git repositories and live ADO read/approval-preparation only; no ADO pipeline queue, no PR creation, no cloud writes |
| Result | Pass |

### Commands

```powershell
$env:MERGEPILOT_E2E_LIVE_APP='1'
$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium *> output\live-e2e\live-app-business-full-rerun-20260706-0950-rerun.log

az pipelines runs list --organization https://dev.azure.com/tebssg --project TeBS-ClaimBot --pipeline-ids 117 --top 5 --query "[].{id:id,buildNumber:buildNumber,status:status,result:result,sourceBranch:sourceBranch,sourceVersion:sourceVersion}" -o json > output\live-e2e\live-app-business-full-rerun-ado-runs-20260706-0950.json
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Full non-destructive live app business suite | Pass | 30/30 Chromium tests passed in 6.7 minutes. Raw log: `output/live-e2e\live-app-business-full-rerun-20260706-0950-rerun.log`. |
| Real Chat UI Git workflows | Pass | Covered selected-file staging, pending approval restore, approval denial, denial-feedback replanning, stage+commit, commit validation failure, empty commit guard, staged-only summary, draft commit message safety, remote credential redaction, secret-like diff redaction, dirty branch switch approval, target merge, merge conflict recovery, create/switch branch, push to local bare remote, pull with rebase, rebase conflict recovery, stash push/apply/pop/conflict recovery, restore, revert, local tag creation, and single-tag push. |
| Real Chat UI ADO pipeline workflows | Pass | Covered ClaimBot_API pipeline `#117` discovery-to-save, read-only failed-run inspection, rerun approval preparation, and direct trigger approval preparation. Destructive mode was unset, so no run was queued. |
| Runtime and Project Link post-run probe | Pass | Installed daemon stayed healthy with `/healthz.version: 0.5.10`, Azure OpenAI `gpt-4o`, local config `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`. Persisted Project Links remained `ClaimBot_API link` mapped to repo `C:\Users\15492\Develop\ClaimBot_API`, ADO repo `TeBS-ClaimBot / ClaimBot_API`, pipeline `117 / ClaimBot_API`, plus `project link2`. Raw probe: `output/live-e2e\live-app-business-full-rerun-probe-20260706-0950.json`. |
| Cleanup | Pass | No `%TEMP%\mergepilot-live-*`, `%TEMP%\mergepilot-daemon-live-pr-insight-*`, `%TEMP%\mp-installed-persist-*`, `%TEMP%\mp-persist-*`, or `%TEMP%\mp-projectlink-restart-*` directories remained after the run. |
| ADO no-new-run verification | Pass | Latest ClaimBot_API pipeline `#117` run stayed `4680 / 20260706.1`, `completed/succeeded`, proving this non-destructive live app suite did not queue a new ADO pipeline run. Raw ADO snapshot: `output/live-e2e\live-app-business-full-rerun-ado-runs-20260706-0950.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The installed app still passes the product's broadest non-destructive real UI business workflow gate. | Info | Keep this as the main release confidence gate for Git/approval/ADO read-only behavior while packaged/admin-install gates are handled separately. |
| This run proves business workflow behavior, not `0.5.11` installed parity. | Medium | Installed daemon is still `0.5.10`; rerun after administrator installation of `MergePilot_0.5.11_x64_en-US.msi`. |
| ADO pipeline safety boundary held. | Info | Approval-preparation workflows did not queue a pipeline when destructive mode was unset. |

## Run: mp-default-chromium-browser-gate-20260706-1000

| Field | Value |
|---|---|
| Date/time | 2026-07-06 10:00-10:02 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Local Vite frontend on `http://127.0.0.1:1420`, installed daemon on `http://127.0.0.1:8787`, Chromium Playwright |
| Resource mode | Mocked/non-mutating browser gate; live-app tests skipped by design because `MERGEPILOT_E2E_LIVE_APP` was not set |
| Result | Pass |

### Commands

```powershell
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe --dir apps/desktop exec vite --host 127.0.0.1 --port 1420 *> output\live-e2e\browser-gate-vite-20260706-1000.log
.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium *> output\live-e2e\default-chromium-browser-gate-20260706-1000.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Default Chromium browser gate | Pass | Playwright discovered 84 Chromium tests, skipped 30 gated live-app tests by design, and passed the remaining 54 tests in 1.0 minute. Raw log: `output/live-e2e\default-chromium-browser-gate-20260706-1000.log`. |
| Mocked Chat/UI coverage | Pass | Covered Chat shell layout, Project Link onboarding and ADO inference, pipeline recommendation/setup, image attachment UI, PR/pipeline read-only routing, local Git read-only routing, approval composer state, suggestion chips, UI stream lifecycle, approval card rendering, long markdown/source output, history streaming behavior, artifact workspace, Mermaid errors, source preview copy/tab cleanup, and PR insight artifact lookup states. |
| Settings and Review Queue browser coverage | Pass | Covered Key Vault permission/local-env Settings UX, Review Queue evidence, acknowledgement, request-changes write-back retry, and stale review rerun refresh. |
| Runtime probe | Pass | Installed daemon stayed healthy with version `0.5.10`, Azure OpenAI `gpt-4o`, local config `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`. Raw probe: `output/live-e2e\default-chromium-browser-gate-probe-20260706-1000.json`. |
| Cleanup | Pass | No business temp directories remained. The test Vite process on port `1420` was stopped after the run; installed MergePilot daemon on `8787` was left running. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The broad non-mutating browser UI gate remains green after the latest business-test/doc updates. | Info | Keep this as the fast UI regression gate alongside the heavier live app business suite. |
| The gate validates browser-visible frontend behavior, not native installed pixel/click proof. | Medium | Native pixel/click proof remains tracked separately under the Computer Use/Tauri-driver gap. |
| The gate does not prove `0.5.11` Program Files installation. | Medium | Installed daemon is still `0.5.10`; rerun installed parity after admin MSI install. |

## Run: mp-live-azure-permission-rerun-20260706-0812

| Field | Value |
|---|---|
| Date/time | 2026-07-06 08:12-08:13 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Live Azure permission diagnostic through Azure CLI; installed daemon probe on `http://127.0.0.1:8787` |
| Resource mode | Read-only Azure permission diagnostic; no Azure data mutation |
| Command | `MERGEPILOT_E2E_LIVE_AZURE=1 .\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts` |
| Result | Pass as diagnostic; access Partial |

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live Azure permission diagnostic | Pass as diagnostic | 1/1 Vitest test passed in 21.98 seconds. Raw log: `output/live-e2e/live-azure-permissions-rerun-20260706-081208.log`. |
| Azure account | Pass | Azure CLI account is `Zhou.Ping@totalebizsolutions.com`; default CLI subscription is `TeBS-Internal Azure Bot`, while the probe explicitly targets subscription `a99512b0-3dc5-476f-8f43-d7db40fbc923` in resource group `developmentagent`. |
| Storage account ARM | Pass | `devagentstorage001` ARM metadata is readable. |
| Storage Table list | Pass | Table list succeeds and returned `CicdAgentProfiles`. |
| Storage Table entity query | Fail | Entity query still fails with missing data-plane permission. Required role remains `Storage Table Data Reader` or `Storage Table Data Contributor` on table `CicdAgentProfiles` or the storage account scope. |
| Cosmos account ARM | Pass | `devagentcosmos001` ARM metadata is readable and endpoint is `https://devagentcosmos001.documents.azure.com:443/`. |
| Cosmos SQL database list | Pass | SQL database list succeeds and includes `cicd-agent`. |
| Cosmos SQL role assignments | Fail | No Cosmos SQL data-plane role assignments were returned. Required role remains `Cosmos DB Built-in Data Contributor`, scoped to `devagentcosmos001/cicd-agent` where possible. |
| Key Vault ARM | Pass | `devagentkv001` ARM metadata is readable and RBAC authorization is enabled. |
| Key Vault secret metadata/list | Fail | Secret metadata/list still fails with `Forbidden` for action `Microsoft.KeyVault/vaults/secrets/readMetadata/action`. Required role remains `Key Vault Secrets User` on `devagentkv001`; `Key Vault Secrets Officer` is needed only for writes. |
| Installed daemon health and cleanup | Pass | `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI deployment `gpt-4o`; `/daemon/config` reported `secretSource: local_env`; no business temp directories remained. Summary artifact: `output/live-e2e/live-azure-permission-rerun-summary-20260706-081306.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Azure access remains partial after the latest login/session state. | High | Grant Storage Table entity data access, Cosmos SQL data-plane access, and Key Vault secret metadata/read access before rerunning cloud persistence success gates. |
| Cloud persistence write tests were intentionally not run. | Info | The destructive cloud policy requires sufficient permissions before creating/deleting Azure Table, Cosmos, or Key Vault test resources. |
| The installed app runtime is healthy and using local model secrets while cloud secret permissions are unavailable. | Info | Continue treating local `.env` / config secret source as the current working mode until Key Vault permission succeeds. |

## Run: mp-chat-image-attachment-focused-20260706-0817

| Field | Value |
|---|---|
| Date/time | 2026-07-06 08:17-08:18 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Focused core/daemon/desktop image attachment tests, mocked Chromium Chat UI attachment paths, and installed daemon config probe on `http://127.0.0.1:8787` |
| Resource mode | Non-mutating local/browser regression; no live model vision call and no cloud mutation |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/chatPlannerAgentFinalTool.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/chatPlannerPersistenceImageAttachments.test.ts test/server.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/api.test.ts src/pages/chat/useComposerImageAttachments.test.ts src/pages/chat/chatComposerSendState.test.ts src/pages/chat/chatDraftPersistence.test.ts src/pages/chat/layout/ChatMessageList.test.tsx
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts --project=chromium --grep "image attachments"
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Core multimodal planner payload | Pass | 1 file / 6 tests passed. Coverage includes forwarding image attachments into multimodal model content with `image_url` and `detail: auto`. Raw log: `output/live-e2e/chat-image-core-focused-20260706-0817.log`. |
| Daemon image validation and persistence safety | Pass | 2 files / 13 tests passed. Coverage includes passing image attachments to the planner, accepting image-only chat requests, storing image placeholders instead of raw data URLs, rejecting MIME/data URL mismatches, rejecting oversized images, and rejecting more than three image attachments. Raw log: `output/live-e2e/chat-image-daemon-focused-20260706-0817.log`. |
| Desktop composer, API, draft, and transcript rendering | Pass | 5 files / 25 tests passed. Coverage includes API payload forwarding, image slot limits, non-image filtering, oversized-image rejection, image-only send state, preparing-image send blocking, draft persistence redaction, and thumbnail rendering without duplicate `[image: ...]` placeholders. Raw log: `output/live-e2e/chat-image-desktop-focused-20260706-0817.log`. |
| Browser Chat image attachment UX | Pass | 3/3 Chromium tests passed. Coverage includes adding an image through the compact composer `+` menu, drag-and-drop image attachment, and pasted image attachment. Raw log: `output/live-e2e/chat-image-browser-focused-20260706-0817.log`. |
| Installed daemon model/config probe | Pass | `/healthz` returned `ok: true`, version `0.5.10`, Azure OpenAI deployment `gpt-4o`, API version `2024-08-01-preview`, deployment available `true`; `/daemon/config` reported `secretSource: local_env`; no business temp directories remained. Raw probe: `output/live-e2e/chat-image-runtime-probe-20260706-0818.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `CHAT-11` image attachment transport is covered from UI input through daemon validation to model payload construction. | Info | Keep this focused gate before broad browser release gates because it protects the vision-capable Chat path. |
| Raw image bytes are not persisted into chat history/drafts. | Info | Continue treating image data as transient request payload; persisted history should keep only human-readable placeholders. |
| This gate proves attachment transport, validation, and current `gpt-4o` configuration. | Info | Live visual answer quality is tracked separately by `mp-live-vision-chat-source-daemon-clean-stream-20260706-0845`. |

## Run: mp-live-vision-chat-source-daemon-clean-stream-20260706-0845

| Field | Value |
|---|---|
| Date/time | 2026-07-06 08:32-08:46 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Installed daemon live vision probe on `http://127.0.0.1:8787`, followed by rebuilt source daemon probe on `http://127.0.0.1:18939` |
| Resource mode | Non-mutating local chat/model eval; temporary chat sessions were deleted; no Git, ADO, pipeline, or cloud writes |
| Result | Pass after source fix |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/chatPlannerFinalization.test.ts test/chatPlannerAgentFinalTool.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Installed daemon live vision probe | Reproduced issue, visual recognition passed | The installed daemon recognized the fixture image text `MP VISION TEST` plus the blue square and red circle, but its SSE stream duplicated/malformed the visible tail with control JSON text. Raw log: `output/live-e2e/live-vision-chat-sse-20260706-0832.log`; probe: `output/live-e2e/live-vision-chat-probe-20260706-0832.json`. |
| Streaming/control JSON focused core tests | Pass | `test/chatPlannerFinalization.test.ts` and `test/chatPlannerAgentFinalTool.test.ts` passed 17/17 after adding regressions for malformed finalization tool-call streaming, unmarked compatibility control JSON, prose plus `agent_final` duplication, and cross-step nudge duplication. Raw log: `output/live-e2e/live-vision-stream-leak-core-cross-step-fix-20260706-0845.log`. |
| Core typecheck/build | Pass | `@mergepilot/core typecheck` and `@mergepilot/core build` passed after the streaming fix. Raw logs: `output/live-e2e/live-vision-stream-leak-core-typecheck-cross-step-fix-20260706-0845.log`, `output/live-e2e/live-vision-stream-leak-core-build-cross-step-fix-20260706-0845.log`. |
| Rebuilt source daemon live vision probe | Pass | Source daemon on port `18939` returned one clean answer: `The large text is "MP VISION TEST," and the two colored shapes are a blue square and a red circle.` Probe confirmed `matchesText: true`, `matchesShapes: true`, `leaksControlJson: false`, `duplicateSentence: false`, `assistantDeltaCount: 24`, and deleted the temporary chat session. Raw SSE: `output/live-e2e/live-vision-source-daemon-sse-20260706-0845-source-clean.log`; probe: `output/live-e2e/live-vision-source-daemon-probe-20260706-0845-source-clean.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `CHAT-11` is now covered beyond transport: live `gpt-4o` vision answer quality passed for a stable non-sensitive fixture image. | Info | Keep the fixture and expected-answer parser as the fast live vision gate for future composer/image changes. |
| The visible streaming leak was a planner streaming/finalization issue, not an Azure OpenAI vision issue. | High | Keep the new core regressions around `agent_final`, compatibility JSON, and cross-step finalization so source and packaged daemons cannot reintroduce duplicated visible text. |
| The installed daemon originally contained the old streaming behavior, but the rebuilt sidecar and freshly built MSI payload now prove the fix in packaged artifacts. | Medium | Reinstall or version-bump the desktop package, then rerun the same live vision probe against the actual installed daemon on `http://127.0.0.1:8787` to close Program Files payload parity. |

## Run: mp-packaged-live-vision-stream-20260706-0858

| Field | Value |
|---|---|
| Date/time | 2026-07-06 08:58-09:02 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Rebuilt packaged sidecar on `http://127.0.0.1:18940`, then daemon extracted from freshly built MSI on `http://127.0.0.1:18941` |
| Resource mode | Non-mutating local chat/model eval; temporary Git repo, image fixture, MSI extraction directory, runtime data directory, and chat sessions were cleaned up |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run build:sidecar *> output\live-e2e\packaged-live-vision-build-sidecar-20260706.log
.\scripts\windows\packaged-live-vision-smoke.ps1 -Port 18940 *> output\live-e2e\packaged-live-vision-smoke-20260706.log
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run tauri:build *> output\live-e2e\packaged-live-vision-tauri-build-20260706.log
.\scripts\windows\packaged-live-vision-smoke.ps1 -Port 18941 -MsiPath .\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.10_x64_en-US.msi *> output\live-e2e\packaged-live-vision-msi-smoke-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Rebuilt packaged sidecar live vision stream | Pass | Sidecar `apps\desktop\src-tauri\binaries\mergepilot-daemon-x86_64-pc-windows-msvc.exe` returned `/healthz.version` `0.5.10`, recognized fixture text `MP VISION TEST`, blue square, and red circle, emitted 24 assistant deltas, reported `leaksControlJson: false`, `duplicateSentence: false`, and deleted temporary chat session `chat_1783299294522_2ecdfd`. Raw log: `output/live-e2e/packaged-live-vision-smoke-20260706.log`; raw SSE: `output/live-e2e/packaged-live-vision-sse-18940.log`. |
| Fresh MSI build | Pass | `@mergepilot/desktop tauri:build` completed and generated `apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.10_x64_en-US.msi` plus `apps\desktop\src-tauri\target\release\bundle\nsis\MergePilot_0.5.10_x64-setup.exe`. Raw log: `output/live-e2e/packaged-live-vision-tauri-build-20260706.log`. |
| MSI-extracted daemon live vision stream | Pass | The smoke administratively extracted the freshly built MSI, launched `PFiles\MergePilot\mergepilot-daemon.exe`, returned `/healthz.version` `0.5.10`, recognized fixture text `MP VISION TEST`, blue square, and red circle, emitted 24 assistant deltas, reported `leaksControlJson: false`, `duplicateSentence: false`, and deleted temporary chat session `chat_1783299527074_3518dc`. Raw log: `output/live-e2e/packaged-live-vision-msi-smoke-20260706.log`; raw SSE: `output/live-e2e/packaged-live-vision-sse-18941.log`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `CHAT-11` live image understanding and clean SSE streaming are now proven in source daemon, rebuilt packaged sidecar, and freshly built MSI payload. | Info | Keep `scripts\windows\packaged-live-vision-smoke.ps1` as the release gate for future image/composer/streaming changes. |
| The remaining packaging gap is installed Program Files parity, not the MSI payload itself. | Medium | Install a version-bumped MSI or force repair/reinstall so `C:\Program Files\MergePilot` receives this payload, then rerun the installed daemon vision probe on port `8787`. |
| The smoke deletes the temporary chat session and removes local temp directories after the run. | Info | No ADO, pipeline, cloud, or repository remote resources were created. |

## Run: mp-installed-programfiles-live-vision-parity-20260706-0906

| Field | Value |
|---|---|
| Date/time | 2026-07-06 09:06-09:08 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Currently installed `C:\Program Files\MergePilot\mergepilot-daemon.exe` launched on `http://127.0.0.1:18942`; installed app health also probed on `http://127.0.0.1:8787` |
| Resource mode | Non-mutating local chat/model eval and installed-state probe; no Git remote, ADO, pipeline, or cloud writes |
| Result | Fail for installed payload parity; app health/auth/avatar pass |

### Commands

```powershell
.\scripts\windows\verify-installed-msi-state.ps1 -ProbeDaemon -ProbeAuth -RequireAvatar -RequireMsiPayloadMatch -RequireLegacyCleanup *> output\live-e2e\installed-strict-payload-parity-20260706-continue.log
.\scripts\windows\packaged-live-vision-smoke.ps1 -Port 18942 -SidecarPath 'C:\Program Files\MergePilot\mergepilot-daemon.exe' *> output\live-e2e\installed-programfiles-live-vision-smoke-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Strict installed MSI payload parity | Fail | Installed app health/auth/avatar and legacy cleanup passed, but installed binary hashes still differ from the freshly built MSI payload. Installed `mergepilot-desktop.exe` hash was `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57`; installed `mergepilot-daemon.exe` hash was `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8`. Current MSI payload hashes were `E57EECD4A8E4D995E152A63F95173DC65BBA231CD6507500C91CAEA0C135367F` and `16760F491FE8EF88087D0808206D630CF7A9849F4BC0EFC0FF614309CA40F51C`. Raw log: `output/live-e2e/installed-strict-payload-parity-20260706-continue.log`. |
| Installed daemon health/auth/avatar | Pass | Running installed daemon on port `8787` returned `/healthz.ok: true`, version `0.5.10`, Azure OpenAI deployment `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`. Auth returned `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, and avatar data URL length `19339`. |
| Installed Program Files daemon live vision stream | Fail | The installed daemon recognized fixture text `MP VISION TEST`, blue square, and red circle, but the stream gate failed with `matchesText=True`, `matchesShapes=True`, `leaksControlJson=True`, and `duplicateSentence=True`. Final visible answer was correct, but stale installed streaming behavior still leaks/duplicates control-finalization content. Raw log: `output/live-e2e/installed-programfiles-live-vision-smoke-20260706.log`; raw SSE: `output/live-e2e/packaged-live-vision-sse-18942.log`. |
| Temporary port cleanup | Pass | No process remained listening on port `18942` after the failed smoke. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The currently installed Program Files payload is stale relative to the freshly built MSI payload. | High | Build and install a version-bumped package, or implement a documented repair/reinstall path that actually replaces same-version binaries, then rerun strict payload parity. |
| The installed daemon has the old streaming/finalization behavior even though image understanding itself works. | High | Do not count installed `0.5.10` as release-clean for `CHAT-11` until the Program Files daemon passes `leaksControlJson: false` and `duplicateSentence: false`. |
| Installed app health, model configuration, auth, avatar, and legacy cleanup remain good. | Info | The failure is scoped to payload replacement/installed binary freshness, not user auth or local model configuration. |

## Run: mp-version-bumped-msi-payload-20260706-0913

| Field | Value |
|---|---|
| Date/time | 2026-07-06 09:09-09:17 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Version-bumped `0.5.11` package build, extracted MSI payload smoke, and extracted MSI live vision smoke |
| Resource mode | Local build/package validation; no Program Files install because the current shell is not elevated; no Git remote, ADO, pipeline, or cloud writes |
| Result | Pass for package payload; installed parity still pending admin install |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop run tauri:build *> output\live-e2e\version-bumped-0.5.11-tauri-build-20260706.log
.\scripts\windows\packaged-msi-payload-smoke.ps1 -Port 18943 *> output\live-e2e\version-bumped-0.5.11-msi-payload-smoke-20260706-rerun.log
.\scripts\windows\packaged-live-vision-smoke.ps1 -Port 18944 -MsiPath .\apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.11_x64_en-US.msi *> output\live-e2e\version-bumped-0.5.11-msi-live-vision-smoke-20260706-rerun.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Version source consistency | Pass | Root package, desktop, core, daemon, cli, review-agent, and Tauri app config were bumped from `0.5.10` to `0.5.11`. `rg` confirmed no `0.5.10` package/Cargo version source remains outside historical docs and the legacy cleanup maximum. |
| Desktop typecheck | Pass | `@mergepilot/desktop@0.5.11 typecheck` passed with `tsc -p tsconfig.json --noEmit`. |
| Tauri package build | Pass | `@mergepilot/desktop tauri:build` generated `apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.11_x64_en-US.msi` and `apps\desktop\src-tauri\target\release\bundle\nsis\MergePilot_0.5.11_x64-setup.exe`. Raw log: `output/live-e2e\version-bumped-0.5.11-tauri-build-20260706.log`. |
| MSI artifact hashes | Pass | MSI size `54,169,600`, SHA256 `ED5B43FCAAB0614D5CA952EB475796AA2618F54283EF4903E0ACF66D5F6E8D9E`; NSIS size `45,719,522`, SHA256 `0DB28D9B773FEB065D8513CEE7CCC8A053D608E1BB910779B509F6205C10F53B`. |
| Extracted MSI payload smoke | Pass | `packaged-msi-payload-smoke.ps1` returned `ok: true`, `legacyCleanupWixValidated: true`, `healthVersion: 0.5.11`, `refreshFilesSeen: 1`, `refreshFilesIndexed: 1`, `workflowPhase: inspect_environment`, and `chatStatus: 200`. Raw log: `output/live-e2e\version-bumped-0.5.11-msi-payload-smoke-20260706-rerun.log`. |
| Extracted MSI live vision stream | Pass | `packaged-live-vision-smoke.ps1` extracted the `0.5.11` MSI, launched its daemon, returned `healthVersion: 0.5.11`, recognized `MP VISION TEST`, blue square, and red circle, emitted 24 assistant deltas, reported `leaksControlJson: false`, `duplicateSentence: false`, and deleted temporary chat session `chat_1783300564640_596e50`. Raw log: `output/live-e2e\version-bumped-0.5.11-msi-live-vision-smoke-20260706-rerun.log`; raw SSE: `output/live-e2e\packaged-live-vision-sse-18944.log`. |
| Installed Program Files upgrade | Not run | Current shell identity `zhoulaptop\Zhou Ping` is not elevated (`IsAdministrator: False`), so the test did not silently modify `C:\Program Files\MergePilot`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The version-bumped `0.5.11` MSI payload is healthy and contains the clean live vision streaming fix. | Info | Use `apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.11_x64_en-US.msi` for the next admin install validation. |
| The previous same-version replacement problem has a concrete release path now: install a higher ProductVersion package. | High | Install `0.5.11` as administrator, then run strict hash parity and installed daemon live vision smoke against `C:\Program Files\MergePilot\mergepilot-daemon.exe`. |
| The package smoke scripts now derive artifact version from package metadata where practical. | Info | This reduces future false negatives from hard-coded MSI paths after version bumps. |

## Run: mp-install-verifier-script-20260706-0920

| Field | Value |
|---|---|
| Date/time | 2026-07-06 09:18-09:22 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | New install-and-verify script plus current installed `0.5.10` app |
| Resource mode | Non-elevated script validation; no Program Files install; daemon on port `8787` was restarted from current installed binary for verification |
| Result | Pass for verifier readiness; expected fail for current installed app parity |

### Commands

```powershell
.\scripts\windows\install-and-verify-msi-state.ps1 *> output\live-e2e\install-and-verify-msi-state-nonadmin-20260706.log
.\scripts\windows\install-and-verify-msi-state.ps1 -SkipInstall -SkipVision *> output\live-e2e\install-and-verify-msi-state-skipinstall-current-20260706-rerun.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Non-admin install guard | Pass | Running without elevation returned `ok: false`, `requiresElevation: true`, expected version `0.5.11`, and MSI path `apps\desktop\src-tauri\target\release\bundle\msi\MergePilot_0.5.11_x64_en-US.msi`; it did not attempt to install into Program Files. Raw log: `output/live-e2e\install-and-verify-msi-state-nonadmin-20260706.log`. |
| Skip-install verifier path | Pass as diagnostic | Running `-SkipInstall -SkipVision` returned aggregated JSON and preserved failure evidence instead of aborting. It confirmed current installed runtime health is still `0.5.10`, expected version is `0.5.11`, strict verifier exit code is `1`, and verify log is `output/live-e2e\install-verify-mergepilot-0.5.11.json`. |
| Strict verifier output | Expected fail | The strict verifier reported failures: installed version `0.5.10` instead of `0.5.11`, daemon health version mismatch, installed desktop/daemon hashes differ from the `0.5.11` MSI payload, and the old `0.5.10` uninstall entry is still present. Auth/avatar still passed for `Zhou Ping`. |
| Windows PowerShell compatibility | Pass | `verify-installed-msi-state.ps1` no longer uses the PowerShell 7-only `??` operator, and `install-and-verify-msi-state.ps1` invokes child scripts through `pwsh` when available with Windows PowerShell fallback. `rg` confirmed no null-coalescing operators remain in `scripts\windows\*.ps1`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The admin install validation path is now executable and records both install/parity and live vision gates. | Info | Run `scripts\windows\install-and-verify-msi-state.ps1` from elevated PowerShell after installing or when ready to install the `0.5.11` MSI. |
| Current installed app is still the old `0.5.10` payload. | High | Install `MergePilot_0.5.11_x64_en-US.msi` as administrator, then rerun the script without `-SkipInstall`; use `-SkipInstall` only after manual admin installation. |
| The verifier can now fail cleanly and keep JSON logs. | Info | Use the generated JSON logs as release evidence rather than screenshots or manual notes. |

## Run: mp-version-bumped-typecheck-and-install-script-final-20260706-0925

| Field | Value |
|---|---|
| Date/time | 2026-07-06 09:23-09:26 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Source/package typechecks and final non-elevated install verifier dry-run |
| Resource mode | Local verification only; no Program Files install; no Git remote, ADO, pipeline, or cloud writes |
| Result | Pass for typechecks and verifier behavior; expected fail for current installed app parity |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck *> output\live-e2e\version-bumped-0.5.11-core-typecheck-20260706.log
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck *> output\live-e2e\version-bumped-0.5.11-daemon-typecheck-20260706.log
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck *> output\live-e2e\version-bumped-0.5.11-desktop-typecheck-20260706.log
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/cli typecheck *> output\live-e2e\version-bumped-0.5.11-cli-typecheck-20260706.log
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/review-agent typecheck *> output\live-e2e\version-bumped-0.5.11-review-agent-typecheck-20260706.log
.\scripts\windows\install-and-verify-msi-state.ps1 *> output\live-e2e\install-and-verify-msi-state-nonadmin-final-20260706.log
.\scripts\windows\install-and-verify-msi-state.ps1 -SkipInstall -SkipVision *> output\live-e2e\install-and-verify-msi-state-skipinstall-current-final-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Core typecheck | Pass | `@mergepilot/core` typecheck exited `0`. |
| Daemon typecheck | Pass | `@mergepilot/daemon` typecheck exited `0`. |
| Desktop typecheck | Pass | `@mergepilot/desktop` typecheck exited `0`. |
| CLI typecheck | Pass | `@mergepilot/cli` typecheck exited `0`. |
| Review agent typecheck | Pass | `@mergepilot/review-agent` typecheck exited `0`. |
| Final non-admin install guard | Pass | Running `install-and-verify-msi-state.ps1` from the non-elevated shell returned `requiresElevation: true`, expected version `0.5.11`, and the `MergePilot_0.5.11_x64_en-US.msi` path without attempting a system install. |
| Final skip-install verifier smoke | Pass as diagnostic | Running `-SkipInstall -SkipVision` returned structured JSON with `verifyExitCode: 1` because the installed app is still `0.5.10`; health/auth/avatar still passed, and strict parity failures were logged to `output/live-e2e\install-verify-mergepilot-0.5.11.json`. |
| Windows script compatibility | Pass | Final scan confirmed no PowerShell null-coalescing operators remain in `scripts\windows\*.ps1`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The `0.5.11` version bump and installer verifier changes preserve package type contracts across all MergePilot packages. | Info | Keep these typecheck logs with the release evidence. |
| The next remaining proof is external to this non-elevated shell: admin installation of `0.5.11` into Program Files. | High | Run `.\scripts\windows\install-and-verify-msi-state.ps1` from elevated PowerShell. |
| Current installed runtime remains usable but stale. | Medium | Do not use current installed `0.5.10` as evidence for fixed installed live vision streaming. |

## Run: mp-version-bumped-mocked-browser-smoke-20260706-0932

| Field | Value |
|---|---|
| Date/time | 2026-07-06 09:32 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Source browser smoke after `0.5.11` version bump and MSI verifier changes |
| Resource mode | Mocked, non-mutating browser regression; no Git remote, ADO, pipeline, or cloud writes |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium --grep "@smoke" *> output\live-e2e\version-bumped-0.5.11-mocked-smoke-20260706.log
try { (Invoke-RestMethod -Uri http://127.0.0.1:8787/healthz -TimeoutSec 5) | ConvertTo-Json -Depth 5 } catch { $_.Exception.Message }
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Release-critical mocked browser smoke | Pass | 9/9 Chromium tests passed in 27.1 seconds. Coverage includes Chat viewport shell, Settings Key Vault/local-env permission messaging, Review Queue evidence/disposition, PR insight controls, pipeline controls, missing-pipeline setup, natural-language read-only PR/pipeline routing, and project-context source references. Raw log: `output/live-e2e\version-bumped-0.5.11-mocked-smoke-20260706.log`. |
| Current installed daemon health probe | Pass as diagnostic | `http://127.0.0.1:8787/healthz` stayed healthy with Azure OpenAI `gpt-4o`, config source `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`; it still reports installed version `0.5.10`, so it is not evidence that the `0.5.11` Program Files install has occurred. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The `0.5.11` packaging/version/script changes did not break the release-critical mocked browser smoke set. | Info | Keep this as the fast release gate before packaged and installed gates. |
| The running installed daemon is healthy but still stale at `0.5.10`. | High | Install `MergePilot_0.5.11_x64_en-US.msi` as administrator before treating installed live vision or installed hash parity as fixed. |
| Computer Use is locally repaired, but this run did not use native click/pixel automation. | Medium | After admin installing `0.5.11`, rerun native installed UI smoke separately and record whether activation/screenshot/click proof is reliable. |

## Run: mp-source-preview-evidence-focused-20260706-0824

| Field | Value |
|---|---|
| Date/time | 2026-07-06 08:20-08:22 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Focused desktop/daemon/browser source preview regressions plus installed daemon probe on `http://127.0.0.1:8787` |
| Resource mode | Non-mutating local/browser regression and read-only installed daemon probe; no Git, ADO, pipeline, or cloud writes |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/artifacts/useArtifactWorkspace.test.ts src/pages/chat/artifacts/ArtifactWorkspace.test.tsx src/pages/chat/artifacts/sourcePreviewCopyState.test.ts src/pages/chat/artifacts/sourcePreviewLanguage.test.ts src/api/workspace.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/server.test.ts
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts --project=chromium --grep "source preview|source references"
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Desktop source workspace model/components | Pass | 5 files / 23 tests passed. Coverage includes source tab replacement, tab cleanup, artifact shell behavior, preview copy state, language inference, and workspace file API response/error handling. Raw log: `output/live-e2e/source-preview-desktop-focused-20260706-0824.log`. |
| Daemon workspace file route safety | Pass | 1 file / 12 tests passed. Coverage includes repository-relative preview success, outside-repository rejection, large text rejection, and binary preview rejection. Raw log: `output/live-e2e/source-preview-daemon-workspace-route-20260706-0824.log`. |
| Browser source reference workflow | Pass | 2/2 Chromium tests passed. Coverage verifies project-context source references render in the transcript, clicking a source reference opens the right-side preview for the selected file, copy actions work, and tab cleanup removes the preview tab. Raw log: `output/live-e2e/source-preview-browser-focused-20260706-0824.log`. |
| Installed daemon source preview probe | Pass | The running installed daemon read current `ClaimBot_API link`, opened `README.md` from `C:\Users\15492\Develop\ClaimBot_API`, returned `lineCount: 38`, and rejected `..\\outside.txt` with `filePath must be a repository-relative path`. Raw probe: `output/live-e2e/source-preview-runtime-probe-20260706-0824.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `CHAT-12` source preview behavior is covered from transcript reference click through right-pane preview and daemon file safety. | Info | Keep this focused gate near Chat layout changes because it protects the evidence-navigation workflow users inspect manually. |
| The installed runtime uses the persisted `ClaimBot_API link` and rejects path traversal attempts. | Info | This is the expected production boundary for file preview: repository-relative source reading only. |
| This run validates file preview/evidence navigation, not AI answer quality. | Medium | Continue using AI scorer gates for whether answers cite the right files; use this gate for whether cited files open correctly and safely. |

## Run: mp-github-release-msi-payload-smoke-20260706-1951

| Field | Value |
|---|---|
| Date/time | 2026-07-06 19:49-19:51 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | GitHub Release asset `MergePilot_0.5.11_x64_en-US.msi`, non-admin MSI administrative extraction, extracted daemon smoke on port `18911` |
| Resource mode | Published release asset validation; no Program Files install, no ADO mutation, no Azure data-plane mutation |
| Result | Pass |

### Commands

```powershell
$dest = Join-Path $PWD 'output\live-e2e\release-v0.5.11'
gh release download v0.5.11 --repo ZP151/CICD-agents --pattern 'MergePilot_0.5.11_x64_en-US.msi' --dir $dest --clobber
Get-FileHash -Algorithm SHA256 (Join-Path $dest 'MergePilot_0.5.11_x64_en-US.msi')
.\scripts\windows\packaged-msi-payload-smoke.ps1 -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.11\MergePilot_0.5.11_x64_en-US.msi') -Port 18911 *> output\live-e2e\release-v0.5.11\released-msi-payload-smoke-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Release asset download | Pass | Downloaded `MergePilot_0.5.11_x64_en-US.msi` from [MergePilot v0.5.11](https://github.com/ZP151/CICD-agents/releases/tag/v0.5.11) into `output\live-e2e\release-v0.5.11`. |
| Release MSI SHA256 | Pass | Local SHA256 `933A22FA17D479D33EAEE49A1A2FCCB6910A4D5E3F053C7675327DA5399C7E40` matches the GitHub Release asset digest `sha256:933a22fa17d479d33eaee49a1a2fccb6910a4d5e3f053c7675327da5399c7e40`. |
| Published MSI payload smoke | Pass | `packaged-msi-payload-smoke.ps1` returned `ok: true`, `legacyCleanupWixValidated: true`, `healthVersion: "0.5.11"`, `refreshFilesSeen: 1`, `refreshFilesIndexed: 1`, `workflowPhase: "inspect_environment"`, and `chatStatus: 200`. Raw log: `output\live-e2e\release-v0.5.11\released-msi-payload-smoke-20260706.log`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The published GitHub Release MSI is byte-identical to the release digest and contains a runnable `0.5.11` daemon payload. | Info | Keep this as a post-release acceptance gate after publishing new installer assets. |
| This validates the released MSI payload, not the currently installed Program Files copy. | Medium | Run `.\scripts\windows\install-and-verify-msi-state.ps1` from elevated PowerShell after installing `v0.5.11` to prove installed hash parity, auth/avatar, and installed live vision. |

## Run: mp-installed-state-vs-release-msi-20260706-2000

| Field | Value |
|---|---|
| Date/time | 2026-07-06 19:59-20:00 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Current installed `C:\Program Files\MergePilot` app and daemon on `http://127.0.0.1:8787`, compared against published `v0.5.11` GitHub Release MSI |
| Resource mode | Read-only installed-state verifier; no install, no Program Files mutation, no ADO mutation, no Azure data-plane mutation |
| Result | Partial, expected fail for strict `0.5.11` installed parity |

### Commands

```powershell
.\scripts\windows\verify-installed-msi-state.ps1 `
  -ExpectedVersion 0.5.11 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.11\MergePilot_0.5.11_x64_en-US.msi') `
  -ProbeDaemon `
  -ProbeAuth `
  -RequireAvatar `
  -RequireMsiPayloadMatch `
  -RequireLegacyCleanup `
  *> output\live-e2e\release-v0.5.11\installed-strict-against-release-msi-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Installed daemon health | Pass for current installed runtime | Installed daemon responded with `ok: true`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`, but reported version `0.5.10` instead of expected `0.5.11`. |
| Installed auth/avatar | Pass | Auth returned `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, avatar length `19339`, and JPEG data URL prefix. |
| Legacy directory cleanup | Pass | `C:\Program Files\CICD-Agent` is absent, legacy publisher shortcut folder is absent, and the current MergePilot Start Menu shortcut exists. |
| Strict installed version and payload parity | Fail as expected | The installed uninstall entry is `MergePilot 0.5.10`; installed desktop hash `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` does not match release MSI payload desktop hash `BBFB598722A67397544BDE4A6AF3B09D6337CE9817ECFCDBC866B033990D0310`; installed daemon hash `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` does not match release MSI payload daemon hash `41342D51FA85FC747629CF96DD17115CCF4E882A7F8B8721505FF5D1E5525556`. Raw log: `output\live-e2e\release-v0.5.11\installed-strict-against-release-msi-20260706.log`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The installed app remains usable and authenticated, but it is still the old `0.5.10` Program Files payload. | High | Install `MergePilot_0.5.11_x64_en-US.msi` as administrator, then rerun the same verifier with `-RequireMsiPayloadMatch`. |
| The published `0.5.11` MSI payload is healthy, so the remaining package acceptance gap is deployment into Program Files. | High | Run `.\scripts\windows\install-and-verify-msi-state.ps1` from elevated PowerShell to combine install, strict hash parity, daemon health/auth/avatar, and installed live vision. |

## Run: mp-github-release-msi-live-vision-20260706-2007

| Field | Value |
|---|---|
| Date/time | 2026-07-06 20:06-20:07 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | GitHub Release asset `MergePilot_0.5.11_x64_en-US.msi`, extracted daemon on port `18912`, Azure OpenAI `gpt-4o` vision request |
| Resource mode | Published release asset live vision validation; no Program Files install, no Git remote mutation, no ADO mutation, no Azure data-plane mutation |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\packaged-live-vision-smoke.ps1 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.11\MergePilot_0.5.11_x64_en-US.msi') `
  -Port 18912 `
  *> output\live-e2e\release-v0.5.11\released-msi-live-vision-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Published MSI extracted daemon health | Pass | Extracted daemon from the GitHub Release MSI reported `healthVersion: "0.5.11"`. |
| Live image understanding | Pass | The live `gpt-4o` answer was: `The large text is "MP VISION TEST," and the two colored shapes are a blue square and a red circle.` The test reported `matchesText: true` and `matchesShapes: true`. |
| Streaming cleanliness | Pass | `assistantDeltaCount: 24`, `leaksControlJson: false`, and `duplicateSentence: false`. Raw log: `output\live-e2e\release-v0.5.11\released-msi-live-vision-20260706.log`; SSE log: `output\live-e2e\packaged-live-vision-sse-18912.log`. |
| Cleanup | Pass | The temporary chat session was deleted with HTTP `200`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The published `v0.5.11` MSI contains the clean live vision streaming fix. | Info | Keep this as the release-asset version of the image attachment and SSE streaming gate. |
| This still does not prove the currently installed Program Files daemon, because the test runs from an extracted release MSI payload. | Medium | After administrator installation, rerun installed live vision through `install-and-verify-msi-state.ps1`. |

## Run: mp-github-actions-release-v0511-20260706-2030

| Field | Value |
|---|---|
| Date/time | 2026-07-06 19:28-19:38 +08:00 workflow runtime; recorded at 20:30 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | GitHub-hosted runners, inspected from `zhoulaptop` |
| Runtime | GitHub Actions CI on `main` and Release on tag `v0.5.11` for commit `e7fb81869c2869a3c2bb93ffa666e8f4df3c27c3` |
| Resource mode | GitHub workflow/release publication evidence; no local app mutation |
| Result | Pass |

### Evidence

| Gate | Result | Notes |
|---|---|---|
| CI workflow | Pass | [Run `28788235459`](https://github.com/ZP151/CICD-agents/actions/runs/28788235459) completed with conclusion `success` on `main`. Jobs passed: `Node 22 on ubuntu-latest`, `Node 22 on windows-latest`, `Desktop macos-latest (Tauri)`, and `Desktop windows-latest (Tauri)`. |
| Release workflow | Pass | [Run `28788247899`](https://github.com/ZP151/CICD-agents/actions/runs/28788247899) completed with conclusion `success` on tag `v0.5.11`. Jobs passed: `Installer (windows-latest)`, `Installer (macos-latest)`, and `GitHub Release`. |
| GitHub Release | Pass | [MergePilot v0.5.11](https://github.com/ZP151/CICD-agents/releases/tag/v0.5.11) is published, not draft, not prerelease. |
| Windows MSI asset | Pass | `MergePilot_0.5.11_x64_en-US.msi`, size `54,558,720`, digest `sha256:933a22fa17d479d33eaee49a1a2fccb6910a4d5e3f053c7675327da5399c7e40`. This is the MSI later validated by payload and live vision smoke. |
| Windows setup asset | Pass | `MergePilot_0.5.11_x64-setup.exe`, size `46,110,579`, digest `sha256:8072ac0e44238381adf29b937bf539372ec3fa5c746482955bbb77cd63b0b5b6`. |
| macOS DMG asset | Pass | `MergePilot_0.5.11_aarch64.dmg`, size `57,940,332`, digest `sha256:4d54447936dec557adbc0c4f138dfa18de0c72149d7ce20db1c74df4cf8e7bd4`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Commit `e7fb818` passed both source CI and release packaging workflows. | Info | Keep this workflow-level evidence paired with release-asset payload and live vision smokes. |
| Release publication is complete for `v0.5.11`; the remaining acceptance gap is local installation parity, not GitHub publication. | High | Install the published MSI as administrator and rerun strict installed verifier/live vision. |

## Run: mp-github-release-v0512-acceptance-20260706-2037

| Field | Value |
|---|---|
| Date/time | 2026-07-06 20:23-20:37 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | GitHub-hosted runners plus `zhoulaptop` |
| Runtime | GitHub Actions CI/Release for commit `d42384c4fa57db06c1c9fad9d8da7f6f9772406e`, GitHub Release asset `MergePilot_0.5.12_x64_en-US.msi`, extracted daemon on ports `18921` and `18922`, current installed daemon on `http://127.0.0.1:8787` |
| Resource mode | Release publication and read-only package validation; no Program Files install, no ADO mutation, no Azure data-plane mutation |
| Result | Pass for CI, Release, published MSI payload, and live vision; Partial for installed Program Files parity |

### Commands

```powershell
git commit -m "chore: record release evidence and bump v0.5.12"
git push origin main
git tag v0.5.12
git push origin v0.5.12
gh run watch 28791235871 --repo ZP151/CICD-agents --exit-status
gh run watch 28791251253 --repo ZP151/CICD-agents --exit-status

$dest = Join-Path $PWD 'output\live-e2e\release-v0.5.12'
gh release download v0.5.12 --repo ZP151/CICD-agents --pattern 'MergePilot_0.5.12_x64_en-US.msi' --dir $dest --clobber
Get-FileHash -Algorithm SHA256 (Join-Path $dest 'MergePilot_0.5.12_x64_en-US.msi')

.\scripts\windows\packaged-msi-payload-smoke.ps1 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.12\MergePilot_0.5.12_x64_en-US.msi') `
  -Port 18921 `
  *> output\live-e2e\release-v0.5.12\released-msi-payload-smoke-20260706-v0512.log

.\scripts\windows\packaged-live-vision-smoke.ps1 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.12\MergePilot_0.5.12_x64_en-US.msi') `
  -Port 18922 `
  *> output\live-e2e\release-v0.5.12\released-msi-live-vision-20260706-v0512.log

.\scripts\windows\verify-installed-msi-state.ps1 `
  -ExpectedVersion 0.5.12 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.12\MergePilot_0.5.12_x64_en-US.msi') `
  -ProbeDaemon `
  -ProbeAuth `
  -RequireAvatar `
  -RequireMsiPayloadMatch `
  -RequireLegacyCleanup `
  *> output\live-e2e\release-v0.5.12\installed-strict-against-release-msi-20260706-v0512.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| GitHub CI workflow | Pass | Run [`28791235871`](https://github.com/ZP151/CICD-agents/actions/runs/28791235871) completed with conclusion `success` on `main`. Jobs passed: `Node 22 on ubuntu-latest`, `Node 22 on windows-latest`, `Desktop macos-latest (Tauri)`, and `Desktop windows-latest (Tauri)`. |
| GitHub Release workflow | Pass | Run [`28791251253`](https://github.com/ZP151/CICD-agents/actions/runs/28791251253) completed with conclusion `success` on tag `v0.5.12`. Jobs passed: `Installer (windows-latest)`, `Installer (macos-latest)`, and `GitHub Release`. |
| Release assets | Pass | [MergePilot v0.5.12](https://github.com/ZP151/CICD-agents/releases/tag/v0.5.12) is published, not draft, not prerelease. Assets: `MergePilot_0.5.12_x64_en-US.msi`, `MergePilot_0.5.12_x64-setup.exe`, and `MergePilot_0.5.12_aarch64.dmg`. |
| Release MSI SHA256 | Pass | Local SHA256 `A7B3ECBDB6C7F050E0992A02B59BFD4A78A44560844FC253EB47325399D11525` matches the GitHub Release asset digest `sha256:a7b3ecbdb6c7f050e0992a02b59bfd4a78a44560844fc253eb47325399d11525`. |
| Published MSI payload smoke | Pass | `packaged-msi-payload-smoke.ps1` returned `ok: true`, `legacyCleanupWixValidated: true`, `healthVersion: "0.5.12"`, `refreshFilesSeen: 1`, `refreshFilesIndexed: 1`, `workflowPhase: "inspect_environment"`, and `chatStatus: 200`. Raw log: `output\live-e2e\release-v0.5.12\released-msi-payload-smoke-20260706-v0512.log`. |
| Published MSI live vision | Pass | Extracted daemon reported `healthVersion: "0.5.12"`. The live `gpt-4o` answer was: `The large text is "MP VISION TEST," and the two colored shapes are a blue square and a red circle.` The test reported `matchesText: true`, `matchesShapes: true`, `assistantDeltaCount: 24`, `leaksControlJson: false`, `duplicateSentence: false`, and deleted the temporary chat session with HTTP `200`. Raw log: `output\live-e2e\release-v0.5.12\released-msi-live-vision-20260706-v0512.log`; SSE log: `output\live-e2e\packaged-live-vision-sse-18922.log`. |
| Installed daemon health/auth/avatar | Pass for current installed runtime | Installed daemon responded with `ok: true`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`, but reported version `0.5.10` instead of expected `0.5.12`. Auth returned `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, avatar length `19339`, and JPEG data URL prefix. |
| Strict installed version and payload parity | Fail as expected | Current Program Files install is still `0.5.10`: uninstall entry `MergePilot 0.5.10`; installed desktop hash `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` differs from `v0.5.12` MSI desktop hash `356199C15E00F8D053F2915D4C18D1A221BDD0B94B77330388A2FAEDC22834E9`; installed daemon hash `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` differs from `v0.5.12` MSI daemon hash `507A4099E0B095137AC94107E65CCF0C1E53EDE87FE8F67B497ABCDF1F4B40AB`. Raw log: `output\live-e2e\release-v0.5.12\installed-strict-against-release-msi-20260706-v0512.log`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `v0.5.12` source CI, release packaging, published MSI payload smoke, and published MSI live vision are all green. | Info | Use `MergePilot_0.5.12_x64_en-US.msi` as the current release candidate for admin installation validation. |
| The current installed app remains usable and authenticated, but it is still the old `0.5.10` Program Files payload. | High | Install `MergePilot_0.5.12_x64_en-US.msi` as administrator, then rerun strict installed verifier with `-RequireMsiPayloadMatch` and installed live vision. |
| GitHub workflow annotations mention Node.js 20 deprecation for several actions, but the workflows completed successfully. | Low | Track action upgrades separately; this is not blocking the `v0.5.12` package acceptance path. |

## Run: mp-live-azure-permission-post-v0512-20260706-2042

| Field | Value |
|---|---|
| Date/time | 2026-07-06 20:41-20:42 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Azure CLI live permission probe through `@mergepilot/core@0.5.12` |
| Resource mode | Read-only Azure ARM/data-plane readiness probe; no resource writes |
| Result | Pass as diagnostic; access remains Partial |

### Commands

```powershell
$env:MERGEPILOT_E2E_LIVE_AZURE='1'
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts `
  *> output\live-e2e\live-azure-permissions-post-v0512-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Azure CLI account | Pass | Current account is `Zhou.Ping@totalebizsolutions.com`; default CLI subscription is `TeBS-Internal Azure Bot`, while the probe explicitly targets subscription `a99512b0-3dc5-476f-8f43-d7db40fbc923` in tenant `1f432b2e-9e7a-4aa0-ace2-53af62d309f6`. |
| Storage account ARM | Pass | Read metadata for `devagentstorage001` in `eastus`, kind `StorageV2`. |
| Storage Table list | Pass | Listed table `CicdAgentProfiles`. |
| Storage Table entity query | Fail as expected | Azure CLI reported missing data-plane permissions. Remediation: grant `Storage Table Data Reader` or `Storage Table Data Contributor` on table `CicdAgentProfiles`. |
| Cosmos account ARM | Pass | Read metadata for `devagentcosmos001`, endpoint `https://devagentcosmos001.documents.azure.com:443/`. |
| Cosmos SQL database list | Pass | Listed SQL database `cicd-agent`. |
| Cosmos SQL role assignments | Fail as expected | No Cosmos SQL data-plane role assignments were returned. Remediation: assign `Cosmos DB Built-in Data Contributor`, scoped to `devagentcosmos001/cicd-agent` where possible. |
| Key Vault ARM | Pass | Read metadata for `devagentkv001`; RBAC authorization is enabled and vault URI is `https://devagentkv001.vault.azure.net/`. |
| Key Vault secret list | Fail as expected | Azure CLI returned Forbidden for `Microsoft.KeyVault/vaults/secrets/readMetadata/action`. Remediation: grant `Key Vault Secrets User` on `devagentkv001`; `Secrets Officer` is needed only for writes. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| Azure control-plane visibility is healthy for the configured Storage, Cosmos, and Key Vault resources. | Info | Keep using explicit subscription `a99512b0-3dc5-476f-8f43-d7db40fbc923` in live gates because the CLI default subscription differs. |
| Cloud persistence success-path tests remain blocked by data-plane RBAC, not by application code. | High | Grant Storage Table entity read/write, Cosmos SQL data-plane contributor, and Key Vault secret metadata/read permissions before running cloud ReviewHistory/session persistence write gates. |
| Runtime should continue using local model secrets while `cloudSecrets` is disabled and Key Vault secret permissions are absent. | Medium | Re-enable Key Vault secret success-path testing only after `Key Vault Secrets User` is present. |

## Run: mp-live-app-business-full-post-v0512-20260706-2049

| Field | Value |
|---|---|
| Date/time | 2026-07-06 20:49-20:56 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Source desktop dev server at `http://localhost:1420`, current installed daemon at `http://127.0.0.1:8787`, persisted `ClaimBot_API link` mapped to pipeline `117 / ClaimBot_API` |
| Resource mode | Live app and live ADO read-only gate with `MERGEPILOT_E2E_DESTRUCTIVE` unset; no real PR, pipeline, or cloud data-plane mutation |
| Result | Pass |

### Commands

```powershell
$args = @(
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  (Join-Path $PWD 'scripts\windows\pnpm-project.ps1'),
  '--filter',
  '@mergepilot/desktop',
  'dev'
)
Start-Process -FilePath 'powershell.exe' -ArgumentList $args -WorkingDirectory $PWD -WindowStyle Hidden

$env:MERGEPILOT_E2E_LIVE_APP='1'
$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium `
  *> output\live-e2e\live-app-business-full-post-v0512-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Full live app business suite | Pass | 30/30 Playwright workflows passed in 6.5 minutes. Raw log: `output\live-e2e\live-app-business-full-post-v0512-20260706.log`. |
| Git workflow coverage | Pass | Covered selected-file staging, approval restoration after reload, approval denial, denial feedback replanning, stage-and-commit, commit validation failure, empty commit guard, staged-only summary, commit-message drafting, remote target redaction, secret-like diff redaction, dirty branch switch approval, explicit target merge, merge conflict recovery, branch creation, local bare remote push, pull with rebase, rebase conflict recovery, stash/apply/pop/conflict flows, selected restore, revert last commit, local tag creation, and single-tag push. |
| ADO pipeline coverage | Pass | Covered ClaimBot_API pipeline `#117` discovery-to-save, read-only failed-run evidence inspection through normal Chat input, rerun approval preparation from failure suggestions, and direct trigger approval preparation through the real Chat UI. |
| Mutation safety | Pass | `MERGEPILOT_E2E_DESTRUCTIVE` was unset, so approvals that would mutate ADO were prepared but not executed. The test operated on run-scoped temporary Git repositories for local mutation cases. |
| Cleanup probe | Pass | Follow-up checks found no `%TEMP%\mergepilot-live-*` directories. `/project-links` retained only the expected long-lived links: `ClaimBot_API link` mapped to `C:\Users\15492\Develop\ClaimBot_API`, `TeBS-ClaimBot / ClaimBot_API`, pipeline `117 / ClaimBot_API`, plus `project link2`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The post-`v0.5.12` full live app gate still aligns with the project goal: native Git/ADO workflow execution plus AI insight and approval control inside MergePilot, not external tool delegation. | Info | Keep this 30/30 gate as the release-candidate business regression baseline. |
| The run used the current installed daemon on `127.0.0.1:8787`, which still reports `0.5.10`; the UI came from the source dev server. | Medium | After installing the latest MSI as administrator, rerun the same gate against the installed desktop/runtime only. |
| Cloud Storage/Cosmos/Key Vault success-path persistence remains outside this gate because Azure data-plane RBAC is still partial. | High | Grant the documented data-plane permissions before running cloud persistence write tests. |

## Run: mp-github-release-v0513-acceptance-20260706-2113

| Field | Value |
|---|---|
| Date/time | 2026-07-06 20:59-21:13 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | GitHub-hosted runners plus `zhoulaptop` |
| Runtime | GitHub Actions CI/Release for commit `b2cba94e25f5943d8dd5d258ca27e70893048ab5`, GitHub Release asset `MergePilot_0.5.13_x64_en-US.msi`, extracted daemon on ports `18931` and `18932`, current installed daemon on `http://127.0.0.1:8787` |
| Resource mode | Release publication and read-only package validation; no Program Files install, no ADO mutation, no Azure data-plane mutation |
| Result | Pass for CI, Release, published MSI payload, and live vision; Partial for installed Program Files parity |

### Commands

```powershell
git commit -m "chore: record business gate and bump v0.5.13"
git push origin main
git tag v0.5.13
git push origin v0.5.13
gh run watch 28793316782 --repo ZP151/CICD-agents --exit-status
gh run watch 28793330330 --repo ZP151/CICD-agents --exit-status

$dest = Join-Path $PWD 'output\live-e2e\release-v0.5.13'
gh release download v0.5.13 --repo ZP151/CICD-agents --pattern 'MergePilot_0.5.13_x64_en-US.msi' --dir $dest --clobber
Get-FileHash -Algorithm SHA256 (Join-Path $dest 'MergePilot_0.5.13_x64_en-US.msi')

.\scripts\windows\packaged-msi-payload-smoke.ps1 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.13\MergePilot_0.5.13_x64_en-US.msi') `
  -Port 18931 `
  *> output\live-e2e\release-v0.5.13\released-msi-payload-smoke-20260706-v0513.log

.\scripts\windows\packaged-live-vision-smoke.ps1 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.13\MergePilot_0.5.13_x64_en-US.msi') `
  -Port 18932 `
  *> output\live-e2e\release-v0.5.13\released-msi-live-vision-20260706-v0513.log

.\scripts\windows\verify-installed-msi-state.ps1 `
  -ExpectedVersion 0.5.13 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.13\MergePilot_0.5.13_x64_en-US.msi') `
  -ProbeDaemon `
  -ProbeAuth `
  -RequireAvatar `
  -RequireMsiPayloadMatch `
  -RequireLegacyCleanup `
  *> output\live-e2e\release-v0.5.13\installed-strict-against-release-msi-20260706-v0513.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| GitHub CI workflow | Pass | Run [`28793316782`](https://github.com/ZP151/CICD-agents/actions/runs/28793316782) completed with conclusion `success` on `main`. Jobs passed: `Node 22 on ubuntu-latest`, `Node 22 on windows-latest`, `Desktop macos-latest (Tauri)`, and `Desktop windows-latest (Tauri)`. |
| GitHub Release workflow | Pass | Run [`28793330330`](https://github.com/ZP151/CICD-agents/actions/runs/28793330330) completed with conclusion `success` on tag `v0.5.13`. Jobs passed: `Installer (windows-latest)`, `Installer (macos-latest)`, and `GitHub Release`. |
| Release assets | Pass | [MergePilot v0.5.13](https://github.com/ZP151/CICD-agents/releases/tag/v0.5.13) is published, not draft, not prerelease. Assets: `MergePilot_0.5.13_x64_en-US.msi`, `MergePilot_0.5.13_x64-setup.exe`, and `MergePilot_0.5.13_aarch64.dmg`. |
| Release MSI SHA256 | Pass | Local SHA256 `9F078EB4CAE52D4B4AF423F2F5B848B8C4E659B990BCA53F67C4DB6C7B624E6C` matches the GitHub Release asset digest `sha256:9f078eb4cae52d4b4af423f2f5b848b8c4e659b990bca53f67c4db6c7b624e6c`. |
| Published MSI payload smoke | Pass | `packaged-msi-payload-smoke.ps1` returned `ok: true`, `legacyCleanupWixValidated: true`, `healthVersion: "0.5.13"`, `refreshFilesSeen: 1`, `refreshFilesIndexed: 1`, `workflowPhase: "inspect_environment"`, and `chatStatus: 200`. Raw log: `output\live-e2e\release-v0.5.13\released-msi-payload-smoke-20260706-v0513.log`. |
| Published MSI live vision | Pass | Extracted daemon reported `healthVersion: "0.5.13"`. The live `gpt-4o` answer was: `The large text is "MP VISION TEST," and the two colored shapes are a blue square and a red circle.` The test reported `matchesText: true`, `matchesShapes: true`, `assistantDeltaCount: 24`, `leaksControlJson: false`, `duplicateSentence: false`, and deleted the temporary chat session with HTTP `200`. Raw log: `output\live-e2e\release-v0.5.13\released-msi-live-vision-20260706-v0513.log`; SSE log: `output\live-e2e\packaged-live-vision-sse-18932.log`. |
| Installed daemon health/auth/avatar | Pass for current installed runtime | Installed daemon responded with `ok: true`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`, but reported version `0.5.10` instead of expected `0.5.13`. Auth returned `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, avatar length `19339`, and JPEG data URL prefix. |
| Strict installed version and payload parity | Fail as expected | Current Program Files install is still `0.5.10`: uninstall entry `MergePilot 0.5.10`; installed desktop hash `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` differs from `v0.5.13` MSI desktop hash `BE5D2E24863E9FD155E236A2721B2B2E2CE5DCBF27AD3C8BF616C6306C1B3C96`; installed daemon hash `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` differs from `v0.5.13` MSI daemon hash `AD61DB916FF43E30800D565AD34306EAA5839EC6901083B75E00CC5BB639C019`. Raw log: `output\live-e2e\release-v0.5.13\installed-strict-against-release-msi-20260706-v0513.log`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `v0.5.13` source CI, release packaging, published MSI payload smoke, and published MSI live vision are all green. | Info | Use `MergePilot_0.5.13_x64_en-US.msi` as the current release candidate for administrator installation validation. |
| The current installed app remains usable and authenticated, but it is still the old `0.5.10` Program Files payload. | High | Install `MergePilot_0.5.13_x64_en-US.msi` as administrator, then rerun strict installed verifier with `-RequireMsiPayloadMatch` and installed live vision. |
| GitHub workflow annotations mention Node.js 20 deprecation and macOS runner migration, but the workflows completed successfully. | Low | Track action/runner upgrades separately; this is not blocking the `v0.5.13` package acceptance path. |

## Run: mp-default-chromium-browser-gate-post-v0513-20260706-2119

| Field | Value |
|---|---|
| Date/time | 2026-07-06 21:19-21:21 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Source browser test app plus current installed daemon on `http://127.0.0.1:8787` |
| Resource mode | Default non-destructive Chromium browser gate; live app tests skipped by design |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium `
  *> output\live-e2e\default-chromium-browser-gate-post-v0513-20260706.log

$probe = [ordered]@{}
$probe.healthz = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/healthz' -TimeoutSec 5
$probe.projectLinks = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/project-links' -TimeoutSec 5
$probe.mergepilotLiveTempDirs = @(Get-ChildItem -Path ([System.IO.Path]::GetTempPath()) -Directory -Filter 'mergepilot-live-*' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
$probe.daemonPrInsightTempDirs = @(Get-ChildItem -Path ([System.IO.Path]::GetTempPath()) -Directory -Filter 'mergepilot-daemon-live-pr-insight-*' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
$probe | ConvertTo-Json -Depth 8 | Set-Content -Path output\live-e2e\default-chromium-browser-gate-post-v0513-probe-20260706.json -Encoding UTF8
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Default Chromium browser suite | Pass | Playwright discovered 84 Chromium tests, passed 54 default/non-live tests in 1.1 minutes, and skipped 30 gated live-app tests by design. Raw log: `output\live-e2e\default-chromium-browser-gate-post-v0513-20260706.log`. |
| Chat shell and workflow UI coverage | Pass | Covered Chat layout, onboarding, command chips, branch divergence, pinned summary dropdown exclusivity, Project Link inference and ClaimBot_API pipeline recommendation, image attachment menu/drop/paste, PR insight controls, pipeline controls, no-pipeline setup, read-only PR/pipeline/local Git routing, approval composer state, follow-up chip routing, UI stream lifecycle, source preview, artifact shells, and persisted PR insight artifact/error handling. |
| Review Queue and Settings coverage | Pass | Review Queue mocked flows passed for review-run evidence, acknowledged disposition, request-changes write-back retry, and stale review rerun. Settings permission UX passed for missing Key Vault permission messaging and switching built-in model secrets to local env. |
| Runtime and cleanup probe | Pass | `/healthz` stayed healthy with version `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. `/project-links` retained only `ClaimBot_API link` mapped to pipeline `117 / ClaimBot_API` plus `project link2`. No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories remained. Raw probe: `output\live-e2e\default-chromium-browser-gate-post-v0513-probe-20260706.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The default browser regression baseline remains green after the `v0.5.13` release publication and package acceptance work. | Info | Keep this gate as the fast non-destructive UI baseline before broader live/destructive runs. |
| The gate still runs against a healthy but stale installed daemon version `0.5.10`. | Medium | After administrator installation of `v0.5.13`, rerun this default browser gate and the full live app business gate against the installed payload. |

## Run: mp-live-ado-readonly-post-v0513-20260706-2124

| Field | Value |
|---|---|
| Date/time | 2026-07-06 21:24-21:25 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Source `@mergepilot/core@0.5.13`, source `@mergepilot/daemon@0.5.13`, installed daemon probe on `http://127.0.0.1:8787` |
| Resource mode | Live Azure DevOps read-only; `MERGEPILOT_E2E_DESTRUCTIVE` unset |
| Result | Pass |

### Commands

```powershell
$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts test/liveAdoPipeline.test.ts `
  *> output\live-e2e\live-ado-readonly-post-v0513-core-20260706.log

$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts `
  *> output\live-e2e\live-ado-readonly-post-v0513-daemon-pr-insight-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live ADO discovery | Pass | `test/liveAdoDiscovery.test.ts` passed 1/1 and discovered the ClaimBot_API project, repository, and pipeline with the current account. |
| Live ADO pipeline read-only | Pass | `test/liveAdoPipeline.test.ts` passed 2/2 read-only cases: recent pipeline runs listed, and timeline/log evidence for the latest failed pipeline run was readable. The destructive queue case was skipped because destructive mode was unset. |
| Live daemon PR insight | Pass | `test/liveAdoPrInsight.test.ts` passed 1/1. The daemon inspected a real ClaimBot_API pull request through `/chat/workflow-action` without approval or mutation. |
| Runtime and cleanup probe | Pass | `/healthz` stayed healthy with installed runtime `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. `/project-links` retained `ClaimBot_API link` mapped to repo `C:\Users\15492\Develop\ClaimBot_API`, ADO repo `TeBS-ClaimBot / ClaimBot_API`, pipeline `117 / ClaimBot_API`, plus `project link2`. No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories remained. Raw probe: `output\live-e2e\live-ado-readonly-post-v0513-probe-20260706.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The post-`v0.5.13` live ADO read-only path remains healthy for ClaimBot_API project/repo/pipeline discovery, pipeline evidence inspection, and PR insight. | Info | Keep this as the current non-mutating ADO baseline. |
| Destructive ADO mutation was deliberately not enabled in this run. | Info | Use the documented destructive gates only when a fresh PR/pipeline mutation run is required and cleanup is planned. |
| The installed daemon probe is still `0.5.10`, so this is not installed `v0.5.13` parity evidence. | Medium | After administrator installation of `v0.5.13`, rerun ADO read-only gates against the installed app stack. |

## Run: mp-github-release-v0514-acceptance-20260706-2148

| Field | Value |
|---|---|
| Date/time | 2026-07-06 21:48-21:49 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | GitHub Actions CI/Release for commit `21f203b`, GitHub Release asset `MergePilot_0.5.14_x64_en-US.msi`, extracted daemon on ports `18951` and `18952`, current installed daemon on `http://127.0.0.1:8787` |
| Resource mode | Release publication and read-only package validation; no Program Files install, no ADO mutation, no Azure data-plane mutation |
| Result | Pass for CI, Release, published MSI payload, and live vision; Partial for installed Program Files parity |

### Commands

```powershell
git commit -m "chore: record live gates and bump v0.5.14"
git push origin main
git tag v0.5.14
git push origin v0.5.14

gh release download v0.5.14 --repo ZP151/CICD-agents `
  --pattern 'MergePilot_0.5.14_x64_en-US.msi' `
  --dir output\live-e2e\release-v0.5.14 `
  --clobber

Get-FileHash -Algorithm SHA256 output\live-e2e\release-v0.5.14\MergePilot_0.5.14_x64_en-US.msi

.\scripts\windows\packaged-msi-payload-smoke.ps1 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.14\MergePilot_0.5.14_x64_en-US.msi') `
  -Port 18951 `
  *> output\live-e2e\release-v0.5.14\released-msi-payload-smoke-20260706-v0514.log

.\scripts\windows\packaged-live-vision-smoke.ps1 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.14\MergePilot_0.5.14_x64_en-US.msi') `
  -Port 18952 `
  *> output\live-e2e\release-v0.5.14\released-msi-live-vision-20260706-v0514.log

.\scripts\windows\verify-installed-msi-state.ps1 `
  -ExpectedVersion 0.5.14 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.14\MergePilot_0.5.14_x64_en-US.msi') `
  -ProbeDaemon `
  -ProbeAuth `
  -RequireAvatar `
  -RequireMsiPayloadMatch `
  -RequireLegacyCleanup `
  *> output\live-e2e\release-v0.5.14\installed-strict-against-release-msi-20260706-v0514.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| GitHub CI workflow | Pass | Run [`28795214339`](https://github.com/ZP151/CICD-agents/actions/runs/28795214339) completed with conclusion `success` on `main`. Jobs passed: `Node 22 on ubuntu-latest`, `Node 22 on windows-latest`, `Desktop macos-latest (Tauri)`, and `Desktop windows-latest (Tauri)`. |
| GitHub Release workflow | Pass | Run [`28795228506`](https://github.com/ZP151/CICD-agents/actions/runs/28795228506) completed with conclusion `success` on tag `v0.5.14`. Jobs passed: `Installer (windows-latest)`, `Installer (macos-latest)`, and `GitHub Release`. |
| Release assets | Pass | [MergePilot v0.5.14](https://github.com/ZP151/CICD-agents/releases/tag/v0.5.14) is published, not draft, not prerelease. Assets: `MergePilot_0.5.14_x64_en-US.msi`, `MergePilot_0.5.14_x64-setup.exe`, and `MergePilot_0.5.14_aarch64.dmg`. |
| Release MSI SHA256 | Pass | Local SHA256 `D0B1C83B6601000A03018D486E733468834253401E15FD61F95DCDA235158140` matches the GitHub Release asset digest `sha256:d0b1c83b6601000a03018d486e733468834253401e15fd61f95dcda235158140`. |
| Published MSI payload smoke | Pass | `packaged-msi-payload-smoke.ps1` returned `ok: true`, `legacyCleanupWixValidated: true`, `healthVersion: "0.5.14"`, `refreshFilesSeen: 1`, `refreshFilesIndexed: 1`, `workflowPhase: "inspect_environment"`, and `chatStatus: 200`. Raw log: `output\live-e2e\release-v0.5.14\released-msi-payload-smoke-20260706-v0514.log`. |
| Published MSI live vision | Pass | Extracted daemon reported `healthVersion: "0.5.14"`. The live `gpt-4o` answer was: `The large text is "MP VISION TEST," and the two colored shapes are a blue square and a red circle.` The test reported `matchesText: true`, `matchesShapes: true`, `assistantDeltaCount: 24`, `leaksControlJson: false`, `duplicateSentence: false`, and deleted the temporary chat session with HTTP `200`. Raw log: `output\live-e2e\release-v0.5.14\released-msi-live-vision-20260706-v0514.log`; SSE log: `output\live-e2e\packaged-live-vision-sse-18952.log`. |
| Installed daemon health/auth/avatar | Pass for current installed runtime | Installed daemon responded with `ok: true`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`, but reported version `0.5.10` instead of expected `0.5.14`. Auth returned `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, avatar length `19339`, and JPEG data URL prefix. |
| Strict installed version and payload parity | Fail as expected | Current Program Files install is still `0.5.10`: uninstall entry `MergePilot 0.5.10`; installed desktop hash `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` differs from `v0.5.14` MSI desktop hash `B151C8E6F75A626EC2A22C5B2E95A3014E35D7FAC615D0F5B03D49C07D605188`; installed daemon hash `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` differs from `v0.5.14` MSI daemon hash `94554F68BAAB1C1BCDD1FE4F4F68D92326884E951235D47297B56E44A6BBE041`. Raw log: `output\live-e2e\release-v0.5.14\installed-strict-against-release-msi-20260706-v0514.log`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `v0.5.14` source CI, release packaging, published MSI payload smoke, and published MSI live vision are all green. | Info | Use `MergePilot_0.5.14_x64_en-US.msi` as the current release candidate for administrator installation validation. |
| The current installed app remains usable and authenticated, but it is still the old `0.5.10` Program Files payload. | High | Install `MergePilot_0.5.14_x64_en-US.msi` as administrator, then rerun strict installed verifier with `-RequireMsiPayloadMatch` and installed live vision. |
| GitHub workflow annotations mention Node.js 20 deprecation and macOS runner migration, but the workflows completed successfully. | Low | Track action/runner upgrades separately; this is not blocking the `v0.5.14` package acceptance path. |

## Run: mp-default-chromium-browser-gate-post-v0514-20260706-2149

| Field | Value |
|---|---|
| Date/time | 2026-07-06 21:49-21:50 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Source browser test app plus current installed daemon on `http://127.0.0.1:8787` |
| Resource mode | Default non-destructive Chromium browser gate; live app tests skipped by design |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium `
  *> output\live-e2e\default-chromium-browser-gate-post-v0514-20260706.log

$probe = [ordered]@{}
$probe.healthz = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/healthz' -TimeoutSec 5
$probe.projectLinks = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/project-links' -TimeoutSec 5
$probe.mergepilotLiveTempDirs = @(Get-ChildItem -Path ([System.IO.Path]::GetTempPath()) -Directory -Filter 'mergepilot-live-*' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
$probe.daemonPrInsightTempDirs = @(Get-ChildItem -Path ([System.IO.Path]::GetTempPath()) -Directory -Filter 'mergepilot-daemon-live-pr-insight-*' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
$probe | ConvertTo-Json -Depth 12 | Set-Content -Path output\live-e2e\default-chromium-browser-gate-post-v0514-probe-20260706.json -Encoding UTF8
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Default Chromium browser suite | Pass | Playwright discovered 84 Chromium tests, passed 54 default/non-live tests in 1.2 minutes, and skipped 30 gated live-app tests by design. Raw log: `output\live-e2e\default-chromium-browser-gate-post-v0514-20260706.log`. |
| Chat shell and workflow UI coverage | Pass | Covered Chat layout, onboarding, command chips, branch divergence, pinned summary dropdown exclusivity, Project Link inference and ClaimBot_API pipeline recommendation, image attachment menu/drop/paste, PR insight controls, pipeline controls, no-pipeline setup, read-only PR/pipeline/local Git routing, approval composer state, follow-up chip routing, UI stream lifecycle, source preview, artifact shells, and persisted PR insight artifact/error handling. |
| Runtime and cleanup probe | Pass | `/healthz` stayed healthy with version `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. `/project-links` retained only `ClaimBot_API link` mapped to pipeline `117 / ClaimBot_API` plus `project link2`. No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories remained. Raw probe: `output\live-e2e\default-chromium-browser-gate-post-v0514-probe-20260706.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The default browser regression baseline remains green after the `v0.5.14` release publication and package acceptance work. | Info | Keep this gate as the fast non-destructive UI baseline before broader live/destructive runs. |
| The gate still runs against a healthy but stale installed daemon version `0.5.10`. | Medium | After administrator installation of `v0.5.14`, rerun this default browser gate and the full live app business gate against the installed payload. |

## Run: mp-live-ado-readonly-post-v0514-20260706-2150

| Field | Value |
|---|---|
| Date/time | 2026-07-06 21:50-21:51 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Source `@mergepilot/core@0.5.14`, source `@mergepilot/daemon@0.5.14`, installed daemon probe on `http://127.0.0.1:8787` |
| Resource mode | Live Azure DevOps read-only; `MERGEPILOT_E2E_DESTRUCTIVE` unset |
| Result | Pass |

### Commands

```powershell
$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts test/liveAdoPipeline.test.ts `
  *> output\live-e2e\live-ado-readonly-post-v0514-core-20260706.log

$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts `
  *> output\live-e2e\live-ado-readonly-post-v0514-daemon-pr-insight-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live ADO discovery | Pass | `test/liveAdoDiscovery.test.ts` passed 1/1 and discovered the ClaimBot_API project, repository, and pipeline with the current account. |
| Live ADO pipeline read-only | Pass | `test/liveAdoPipeline.test.ts` passed 2/2 read-only cases: recent pipeline runs listed, and timeline/log evidence for the latest failed pipeline run was readable. The destructive queue case was skipped because destructive mode was unset. |
| Live daemon PR insight | Pass | `test/liveAdoPrInsight.test.ts` passed 1/1. The daemon inspected a real ClaimBot_API pull request through `/chat/workflow-action` without approval or mutation. |
| Runtime and cleanup probe | Pass | `/healthz` stayed healthy with installed runtime `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. `/project-links` retained `ClaimBot_API link` mapped to repo `C:\Users\15492\Develop\ClaimBot_API`, ADO repo `TeBS-ClaimBot / ClaimBot_API`, pipeline `117 / ClaimBot_API`, plus `project link2`. No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories remained. Raw probe: `output\live-e2e\live-ado-readonly-post-v0514-probe-20260706.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The post-`v0.5.14` live ADO read-only path remains healthy for ClaimBot_API project/repo/pipeline discovery, pipeline evidence inspection, and PR insight. | Info | Keep this as the current non-mutating ADO baseline. |
| Destructive ADO mutation was deliberately not enabled in this run. | Info | Use the documented destructive gates only when a fresh PR/pipeline mutation run is required and cleanup is planned. |
| The installed daemon probe is still `0.5.10`, so this is not installed `v0.5.14` parity evidence. | Medium | After administrator installation of `v0.5.14`, rerun ADO read-only gates against the installed app stack. |

## Run: mp-github-release-v0515-acceptance-20260706-2219

| Field | Value |
|---|---|
| Date/time | 2026-07-06 22:19-22:21 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | GitHub Actions CI/Release for commit `e7d4ed4`, GitHub Release asset `MergePilot_0.5.15_x64_en-US.msi`, extracted daemon on ports `18961` and `18962`, current installed daemon on `http://127.0.0.1:8787` |
| Resource mode | Release publication and read-only package validation; no Program Files install, no ADO mutation, no Azure data-plane mutation |
| Result | Pass for CI, Release, published MSI payload, and live vision; Partial for installed Program Files parity |

### Commands

```powershell
gh release download v0.5.15 --repo ZP151/CICD-agents `
  --pattern 'MergePilot_0.5.15_x64_en-US.msi' `
  --dir output\live-e2e\release-v0.5.15 `
  --clobber

Get-FileHash -Algorithm SHA256 output\live-e2e\release-v0.5.15\MergePilot_0.5.15_x64_en-US.msi

.\scripts\windows\packaged-msi-payload-smoke.ps1 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.15\MergePilot_0.5.15_x64_en-US.msi') `
  -Port 18961 `
  *> output\live-e2e\release-v0.5.15\released-msi-payload-smoke-20260706-v0515.log

.\scripts\windows\packaged-live-vision-smoke.ps1 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.15\MergePilot_0.5.15_x64_en-US.msi') `
  -Port 18962 `
  *> output\live-e2e\release-v0.5.15\released-msi-live-vision-20260706-v0515.log

.\scripts\windows\verify-installed-msi-state.ps1 `
  -ExpectedVersion 0.5.15 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.15\MergePilot_0.5.15_x64_en-US.msi') `
  -ProbeDaemon `
  -ProbeAuth `
  -RequireAvatar `
  -RequireMsiPayloadMatch `
  -RequireLegacyCleanup `
  *> output\live-e2e\release-v0.5.15\installed-strict-against-release-msi-20260706-v0515.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| GitHub CI workflow | Pass | Run `28797817844` completed with conclusion `success` on `main`. Jobs passed: `Node 22 on ubuntu-latest`, `Node 22 on windows-latest`, `Desktop macos-latest (Tauri)`, and `Desktop windows-latest (Tauri)`. |
| GitHub Release workflow | Pass | Run `28797871930` completed with conclusion `success` on tag `v0.5.15`. Jobs passed: `Installer (windows-latest)`, `Installer (macos-latest)`, and `GitHub Release`. |
| Release assets | Pass | [MergePilot v0.5.15](https://github.com/ZP151/CICD-agents/releases/tag/v0.5.15) is published, not draft, not prerelease. Assets: `MergePilot_0.5.15_x64_en-US.msi`, `MergePilot_0.5.15_x64-setup.exe`, and `MergePilot_0.5.15_aarch64.dmg`. |
| Release MSI SHA256 | Pass | Local SHA256 `15C47309A636295D531069E319D4E0B394463622DCFCE1A02B61BB01D4A06668` matches the GitHub Release asset digest `sha256:15c47309a636295d531069e319d4e0b394463622dcfce1a02b61bb01d4a06668`. |
| Published MSI payload smoke | Pass | `packaged-msi-payload-smoke.ps1` returned `ok: true`, `legacyCleanupWixValidated: true`, `healthVersion: "0.5.15"`, `refreshFilesSeen: 1`, `refreshFilesIndexed: 1`, `workflowPhase: "inspect_environment"`, and `chatStatus: 200`. Raw log: `output\live-e2e\release-v0.5.15\released-msi-payload-smoke-20260706-v0515.log`. |
| Published MSI live vision | Pass | Extracted daemon reported `healthVersion: "0.5.15"`. The live `gpt-4o` answer was: `The large text is "MP VISION TEST," and the two colored shapes are a blue square and a red circle.` The test reported `matchesText: true`, `matchesShapes: true`, `assistantDeltaCount: 24`, `leaksControlJson: false`, `duplicateSentence: false`, and deleted the temporary chat session with HTTP `200`. Raw log: `output\live-e2e\release-v0.5.15\released-msi-live-vision-20260706-v0515.log`; SSE log: `output\live-e2e\packaged-live-vision-sse-18962.log`. |
| Installed daemon health/auth/avatar | Pass for current installed runtime | Installed daemon responded with `ok: true`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`, but reported version `0.5.10` instead of expected `0.5.15`. Auth returned `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, avatar length `19339`, and JPEG data URL prefix. |
| Strict installed version and payload parity | Fail as expected | Current Program Files install is still `0.5.10`: uninstall entry `MergePilot 0.5.10`; installed desktop hash `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` differs from `v0.5.15` MSI desktop hash `9BACB805E768567D1A1A040272B5557CEDBE06AD9C8FBE9640DE25E411567EEB`; installed daemon hash `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` differs from `v0.5.15` MSI daemon hash `6F9BA542DA4C9B6C7F1EB3B9D4243D2AC7A2EF8857E897016AC9FFC85CF5656D`. Raw log: `output\live-e2e\release-v0.5.15\installed-strict-against-release-msi-20260706-v0515.log`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `v0.5.15` source CI, release packaging, published MSI payload smoke, and published MSI live vision are all green. | Info | Use `MergePilot_0.5.15_x64_en-US.msi` as the current release candidate for administrator installation validation. |
| The current installed app remains usable and authenticated, but it is still the old `0.5.10` Program Files payload. | High | Install `MergePilot_0.5.15_x64_en-US.msi` as administrator, then rerun strict installed verifier with `-RequireMsiPayloadMatch` and installed daemon vision smoke. |

## Run: mp-default-chromium-browser-gate-post-v0515-20260706-2222

| Field | Value |
|---|---|
| Date/time | 2026-07-06 22:22-22:24 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Source browser test app plus current installed daemon on `http://127.0.0.1:8787` |
| Resource mode | Default non-destructive Chromium browser gate; live app tests skipped by design |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium `
  *> output\live-e2e\default-chromium-browser-gate-post-v0515-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Default Chromium browser suite | Pass | Playwright discovered 84 Chromium tests, passed 54 default/non-live tests in 1.2 minutes, and skipped 30 gated live-app tests by design. Raw log: `output\live-e2e\default-chromium-browser-gate-post-v0515-20260706.log`. |
| Runtime and cleanup probe | Pass | `/healthz` stayed healthy with version `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. `/project-links` retained `ClaimBot_API link` mapped to repo `C:\Users\15492\Develop\ClaimBot_API`, ADO repo `TeBS-ClaimBot / ClaimBot_API`, pipeline `117 / ClaimBot_API`, plus `project link2`. No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories remained. Raw probe: `output\live-e2e\default-chromium-browser-gate-post-v0515-probe-20260706.json`. |

## Run: mp-live-ado-azure-and-app-post-v0515-20260706-2224

| Field | Value |
|---|---|
| Date/time | 2026-07-06 22:24-22:32 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Source `@mergepilot/core@0.5.15`, source `@mergepilot/daemon@0.5.15`, source browser app, installed daemon probe on `http://127.0.0.1:8787` |
| Resource mode | Live Azure DevOps read-only plus non-destructive real Chat UI business workflows; `MERGEPILOT_E2E_DESTRUCTIVE` unset |
| Result | Pass for ADO read-only and live app business; Pass as diagnostic with Partial access for Azure data-plane readiness |

### Commands

```powershell
$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts test/liveAdoPipeline.test.ts `
  *> output\live-e2e\live-ado-readonly-post-v0515-core-20260706.log

$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts `
  *> output\live-e2e\live-ado-readonly-post-v0515-daemon-pr-insight-20260706.log

$env:MERGEPILOT_E2E_LIVE_AZURE='1'
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts `
  *> output\live-e2e\live-azure-permission-post-v0515-20260706.log

$env:MERGEPILOT_E2E_LIVE_APP='1'
$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium `
  *> output\live-e2e\live-app-business-full-post-v0515-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Live ADO discovery | Pass | `test/liveAdoDiscovery.test.ts` passed 1/1 and discovered the ClaimBot_API project, repository, and pipeline with the current account. |
| Live ADO pipeline read-only | Pass | `test/liveAdoPipeline.test.ts` passed 2/2 read-only cases and skipped the destructive queue case because destructive mode was unset. Recent pipeline runs, timeline, and log evidence for the latest failed pipeline run were readable. |
| Live daemon PR insight | Pass | `test/liveAdoPrInsight.test.ts` passed 1/1. The daemon inspected a real ClaimBot_API pull request through `/chat/workflow-action` without approval or mutation. |
| Live Azure permission diagnostic | Pass as diagnostic / access Partial | `test/liveAzurePermissions.test.ts` passed 1/1. ARM metadata reads passed for `devagentstorage001`, `devagentcosmos001`, and `devagentkv001`; Storage Table list found `CicdAgentProfiles`; Cosmos SQL database list found `cicd-agent`. Storage Table entity query still needs `Storage Table Data Reader/Contributor`, Cosmos SQL data-plane role assignment is still missing, and Key Vault secret metadata/list still needs `Key Vault Secrets User`. Raw log: `output\live-e2e\live-azure-permission-post-v0515-20260706.log`. |
| Full live app business gate | Pass | 30/30 real browser workflows passed in 6.6 minutes. Coverage includes selected-file staging, pending approval reload/restore, approval denial and feedback replanning, stage-and-commit, commit validation failure, empty commit guard, staged-only summary, draft commit message safety, credential and secret redaction, dirty branch switching, target merge, merge/rebase/pull/stash/restore/revert/tag workflows, safe single-tag publication, ClaimBot_API pipeline `#117` discovery-to-save, read-only failure inspection, rerun approval preparation, and direct trigger approval preparation. Raw log: `output\live-e2e\live-app-business-full-post-v0515-20260706.log`. |
| Runtime and cleanup probe | Pass | `/healthz` stayed healthy with installed runtime `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. `/project-links` retained `ClaimBot_API link` mapped to pipeline `117 / ClaimBot_API` plus `project link2`. No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories remained. Raw probe: `output\live-e2e\live-app-business-full-post-v0515-probe-20260706.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The post-`v0.5.15` live ADO read-only and real Chat UI business gates are green without mutating ADO. | Info | Keep these as the current non-destructive business baseline. |
| Azure cloud persistence remains permission-gated, not product-gated: Storage Table entity query, Cosmos SQL data-plane role assignment, and Key Vault secret metadata/list are still missing. | Medium | Grant the documented roles before running cloud write/persistence success-path gates. |
| The running app stack still probes an installed daemon version `0.5.10`; package acceptance is proven by extracted `v0.5.15` payload, not Program Files parity. | High | Install `v0.5.15` as administrator and rerun strict installed parity plus installed live vision. |

## Run: mp-github-release-v0516-acceptance-20260706-2258

| Field | Value |
|---|---|
| Date/time | 2026-07-06 22:46-23:00 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | GitHub Actions CI/Release for commit `b149256`, GitHub Release asset `MergePilot_0.5.16_x64_en-US.msi`, extracted daemon on ports `18963` and `18964`, current installed daemon on `http://127.0.0.1:8787` |
| Resource mode | Release publication and read-only package validation; no Program Files install, no ADO mutation, no Azure data-plane mutation |
| Result | Pass for CI, Release, published MSI payload, and live vision; Partial for installed Program Files parity |

### Commands

```powershell
gh release download v0.5.16 --repo ZP151/CICD-agents `
  --pattern 'MergePilot_0.5.16_x64_en-US.msi' `
  --dir output\live-e2e\release-v0.5.16 `
  --clobber

Get-FileHash -Algorithm SHA256 output\live-e2e\release-v0.5.16\MergePilot_0.5.16_x64_en-US.msi

.\scripts\windows\packaged-msi-payload-smoke.ps1 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.16\MergePilot_0.5.16_x64_en-US.msi') `
  -Port 18963 `
  *> output\live-e2e\release-v0.5.16\released-msi-payload-smoke-20260706-v0516.log

.\scripts\windows\packaged-live-vision-smoke.ps1 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.16\MergePilot_0.5.16_x64_en-US.msi') `
  -Port 18964 `
  *> output\live-e2e\release-v0.5.16\released-msi-live-vision-20260706-v0516.log

.\scripts\windows\verify-installed-msi-state.ps1 `
  -ExpectedVersion 0.5.16 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.16\MergePilot_0.5.16_x64_en-US.msi') `
  -ProbeDaemon `
  -ProbeAuth `
  -RequireAvatar `
  -RequireMsiPayloadMatch `
  -RequireLegacyCleanup `
  *> output\live-e2e\release-v0.5.16\installed-strict-against-release-msi-20260706-v0516.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| GitHub CI workflow | Pass | Run `28800239784` completed with conclusion `success` on `main`. Jobs passed: `Node 22 on ubuntu-latest`, `Node 22 on windows-latest`, `Desktop macos-latest (Tauri)`, and `Desktop windows-latest (Tauri)`. |
| GitHub Release workflow | Pass | Run `28800386795` completed with conclusion `success` on tag `v0.5.16`. Jobs passed: `Installer (windows-latest)`, `Installer (macos-latest)`, and `GitHub Release`. |
| Release assets | Pass | [MergePilot v0.5.16](https://github.com/ZP151/CICD-agents/releases/tag/v0.5.16) is published, not draft, not prerelease. Assets: `MergePilot_0.5.16_x64_en-US.msi`, `MergePilot_0.5.16_x64-setup.exe`, and `MergePilot_0.5.16_aarch64.dmg`. |
| Release MSI SHA256 | Pass | Local SHA256 `F1D358D0EEBE8B1F08029E590F786D36289F9C497B5FD59D42FCE52684B7528A` matches the GitHub Release asset digest `sha256:f1d358d0eebe8b1f08029e590f786d36289f9c497b5fd59d42fce52684b7528a`. |
| Published MSI payload smoke | Pass | `packaged-msi-payload-smoke.ps1` returned `ok: true`, `legacyCleanupWixValidated: true`, `healthVersion: "0.5.16"`, `refreshFilesSeen: 1`, `refreshFilesIndexed: 1`, `workflowPhase: "inspect_environment"`, and `chatStatus: 200`. Raw log: `output\live-e2e\release-v0.5.16\released-msi-payload-smoke-20260706-v0516.log`. |
| Published MSI live vision | Pass | Extracted daemon reported `healthVersion: "0.5.16"`. The live `gpt-4o` answer was: `The large text is "MP VISION TEST," and the two colored shapes are a blue square and a red circle.` The test reported `matchesText: true`, `matchesShapes: true`, `assistantDeltaCount: 24`, `leaksControlJson: false`, `duplicateSentence: false`, and deleted the temporary chat session with HTTP `200`. Raw log: `output\live-e2e\release-v0.5.16\released-msi-live-vision-20260706-v0516.log`; SSE log: `output\live-e2e\packaged-live-vision-sse-18964.log`. |
| Installed daemon health/auth/avatar | Pass for current installed runtime | Installed daemon responded with `ok: true`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`, but reported version `0.5.10` instead of expected `0.5.16`. Auth returned `Zhou Ping`, `Zhou.Ping@totalebizsolutions.com`, `hasAvatar: true`, avatar length `19339`, and JPEG data URL prefix. |
| Strict installed version and payload parity | Fail as expected | Current Program Files install is still `0.5.10`: uninstall entry `MergePilot 0.5.10`; installed desktop hash `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` differs from `v0.5.16` MSI desktop hash `BC34BC6166F4151C164E57D7EEC4B36225B34CD457FBE2B31E12E49A92F57401`; installed daemon hash `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` differs from `v0.5.16` MSI daemon hash `47816C09C90FD77E280C7C3F24152C91146E03FA443EB1DC6FE382B80BF2E1ED`. Raw log: `output\live-e2e\release-v0.5.16\installed-strict-against-release-msi-20260706-v0516.log`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `v0.5.16` source CI, release packaging, published MSI payload smoke, and published MSI live vision are all green. | Info | Use `MergePilot_0.5.16_x64_en-US.msi` as the current release candidate for administrator installation validation. |
| The current installed app remains usable and authenticated, but it is still the old `0.5.10` Program Files payload. | High | Install `MergePilot_0.5.16_x64_en-US.msi` as administrator, then rerun strict installed verifier with `-RequireMsiPayloadMatch` and installed daemon vision smoke. |

## Run: mp-default-chromium-and-live-ado-post-v0516-20260706-2307

| Field | Value |
|---|---|
| Date/time | 2026-07-06 23:07-23:10 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Source `@mergepilot/core@0.5.16`, source `@mergepilot/daemon@0.5.16`, source browser app, installed daemon probe on `http://127.0.0.1:8787` |
| Resource mode | Default non-destructive Chromium browser gate plus live Azure DevOps read-only gates; `MERGEPILOT_E2E_DESTRUCTIVE` unset |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium `
  *> output\live-e2e\default-chromium-browser-gate-post-v0516-20260706.log

$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts test/liveAdoPipeline.test.ts `
  *> output\live-e2e\live-ado-readonly-post-v0516-core-20260706.log

$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts `
  *> output\live-e2e\live-ado-readonly-post-v0516-daemon-pr-insight-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Default Chromium browser suite | Pass | Playwright discovered 84 Chromium tests, passed 54 default/non-live tests in 1.2 minutes, and skipped 30 gated live-app tests by design. Raw log: `output\live-e2e\default-chromium-browser-gate-post-v0516-20260706.log`. |
| Live ADO discovery and pipeline read-only | Pass | `test/liveAdoDiscovery.test.ts` and `test/liveAdoPipeline.test.ts` passed 3/3 live read-only tests with 1 destructive queue case skipped. The current account discovered ClaimBot_API project/repo/pipeline `#117`, listed recent runs, and read timeline/log evidence for the latest failed pipeline run. Raw log: `output\live-e2e\live-ado-readonly-post-v0516-core-20260706.log`. |
| Live daemon PR insight | Pass | `test/liveAdoPrInsight.test.ts` passed 1/1. The daemon inspected a real ClaimBot_API pull request through `/chat/workflow-action` without approval or mutation. Raw log: `output\live-e2e\live-ado-readonly-post-v0516-daemon-pr-insight-20260706.log`. |
| Runtime and cleanup probe | Pass | `/healthz` stayed healthy with installed runtime `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. `/project-links` retained `ClaimBot_API link` mapped to pipeline `117 / ClaimBot_API` plus `project link2`. No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories remained. Raw probes: `output\live-e2e\default-chromium-browser-gate-post-v0516-probe-20260706.json` and `output\live-e2e\live-ado-readonly-post-v0516-probe-20260706.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The post-`v0.5.16` default browser and live ADO read-only gates are green without mutating ADO. | Info | Keep this as the current non-destructive app/ADO baseline after the `v0.5.16` release. |
| The running installed daemon is still `0.5.10`, so these gates prove source/browser and ADO behavior after the release, not installed Program Files parity. | Medium | Install `v0.5.16` as administrator before claiming first-run installed parity. |

## Run: mp-live-app-business-full-post-v0516-20260706-2315

| Field | Value |
|---|---|
| Date/time | 2026-07-06 23:15-23:21 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Source browser app plus installed daemon on `http://127.0.0.1:8787`; package versions `@mergepilot/core@0.5.16` and `@mergepilot/daemon@0.5.16` in the source test process |
| Resource mode | Full live app business gate, non-destructive; `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE` unset |
| Result | Pass |

### Commands

```powershell
# First attempt used a Windows backslash path and Playwright did not match a test file.
$env:MERGEPILOT_E2E_LIVE_APP='1'
$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 exec playwright test tests\e2e\live-app-business.spec.ts --project=chromium `
  *> output\live-e2e\live-app-business-full-post-v0516-20260706.log

# Successful rerun used the forward-slash path.
$env:MERGEPILOT_E2E_LIVE_APP='1'
$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium `
  *> output\live-e2e\live-app-business-full-post-v0516-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Full live app business gate | Pass | 30/30 real browser workflows passed in 6.4 minutes. Raw log: `output\live-e2e\live-app-business-full-post-v0516-20260706.log`. |
| Git staging and commit workflows | Pass | Covered selected-file staging, pending approval reload/restore, approval denial, denial feedback replanning, stage-and-commit, commit validation failure with staged changes preserved, empty commit guard, staged-only summary, and draft commit message generation. |
| Git branch, sync, stash, restore, revert, and tag workflows | Pass | Covered credential-redacted remote target inspection, secret-like diff redaction, dirty branch switch approval, target merge, merge conflict recovery, new branch creation, local bare-remote push, pull with rebase, rebase conflict recovery, stash push/apply/pop/conflict preservation, restore, revert, local tag creation, and single-tag push. |
| ClaimBot_API pipeline workflows | Pass | Covered ClaimBot_API pipeline `#117` discovery-to-save when Project Link lacks a pipeline ID, read-only failed-run evidence inspection, rerun approval preparation, and direct trigger approval preparation. Destructive mode was unset, so no new ADO run was queued. |
| Runtime and cleanup probe | Pass | `/healthz` stayed healthy with installed runtime `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. `/project-links` retained `ClaimBot_API link` mapped to pipeline `117 / ClaimBot_API` plus `project link2`. No `%TEMP%\mergepilot-live-*` or `%TEMP%\mergepilot-daemon-live-pr-insight-*` directories remained. Raw probe: `output\live-e2e\live-app-business-full-post-v0516-probe-20260706.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The full non-destructive real Chat UI business gate is green after the `v0.5.16` release. | Info | Keep this as the current full app workflow baseline for Git, approval, pipeline discovery, and pipeline read-only insight. |
| The first run failed before execution because the Playwright test path used backslashes and matched no tests. | Low | Use `tests/e2e/live-app-business.spec.ts` in future documented commands. |
| The installed daemon remains `0.5.10`, so this gate is not installed Program Files parity proof. | Medium | Install `v0.5.16` as administrator and rerun strict installed verifier plus installed live vision. |

## Run: mp-pr-ai-insight-quality-post-v0516-20260706-2325

| Field | Value |
|---|---|
| Date/time | 2026-07-06 23:25-23:26 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Source `@mergepilot/core@0.5.16`, source `@mergepilot/daemon@0.5.16`, source browser app, live Azure DevOps read-only PR insight |
| Resource mode | Non-mutating PR/AI insight quality gate; no Git, PR, pipeline, or cloud writes |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- `
  test/aiInsightQuality.test.ts `
  test/aiInsightQualityChatPlanner.test.ts `
  test/chatPlannerGuards.test.ts `
  test/chatContext.test.ts `
  test/adoPullRequestMutationRegistry.test.ts `
  *> output\live-e2e\pr-ai-quality-post-v0516-core-20260706.log

.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- `
  test/serverPrInsightWorkflowRoutes.test.ts `
  test/serverAiInsightQualityRoutes.test.ts `
  test/serverPrInsightStorageRoutes.test.ts `
  test/serverReadOnlyGitChatRoutes.test.ts `
  test/workspaceWorkflow.test.ts `
  *> output\live-e2e\pr-ai-quality-post-v0516-daemon-20260706.log

.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/chat-layout.spec.ts --project=chromium `
  --grep "PR insight|pipeline controls|source references|secret/config review" `
  *> output\live-e2e\pr-ai-quality-post-v0516-browser-20260706.log

$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts `
  *> output\live-e2e\pr-ai-quality-post-v0516-live-ado-pr-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Core PR/AI quality contracts | Pass | 5 files / 19 tests passed. Coverage includes deterministic AI answer scoring, ChatPlanner final-answer quality, read-only planning guards, seeded ClaimBot-style chat context evidence, and PR mutation registry payload mapping. Raw log: `output\live-e2e\pr-ai-quality-post-v0516-core-20260706.log`. |
| Daemon PR/AI quality routes | Pass | 5 files / 18 tests passed. Coverage includes PR insight workflow routes, AI insight quality route scoring, PR insight storage behavior, read-only Git chat routes, and workspace workflow command planning. Raw log: `output\live-e2e\pr-ai-quality-post-v0516-daemon-20260706.log`. |
| Focused browser PR/pipeline/source UX | Pass | 7/7 Chromium tests passed. Coverage includes PR insight controls, pipeline controls, natural-language read-only PR insight without approval UI, project-context source references, saved PR insight artifact source loading, persisted PR insight lookup errors, and ordinary artifact shell handling. Raw log: `output\live-e2e\pr-ai-quality-post-v0516-browser-20260706.log`. |
| Live ADO PR insight read | Pass | 1/1 daemon live ADO PR insight test passed against a real ClaimBot_API pull request without approval or mutation. Raw log: `output\live-e2e\pr-ai-quality-post-v0516-live-ado-pr-20260706.log`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| PR/AI insight remains aligned with the product goal: native ADO-backed read-only analysis and AI readiness insight, not external MCP delegation or accidental write escalation. | Info | Keep expanding seeded PR/pipeline fixtures and LLM quality checks, but this is the current post-release PR/AI baseline. |
| The live ADO PR insight gate is read-only and does not prove Review Queue cloud persistence. | Medium | Run cloud persistence success-path tests after Azure Table data-plane permissions are granted. |

## Run: mp-github-release-v0517-acceptance-20260706-2340

| Field | Value |
|---|---|
| Date/time | 2026-07-06 23:30-23:42 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | GitHub Actions CI/Release for commit `da4d582`, GitHub Release asset `MergePilot_0.5.17_x64_en-US.msi`, extracted daemon on ports `18973` and `18974`, current installed daemon on `http://127.0.0.1:8787` |
| Resource mode | Release publication and read-only package validation; no Program Files install, no ADO mutation, no Azure data-plane mutation |
| Result | Pass for CI, Release, published MSI payload, and live vision; Partial for installed Program Files parity |

### Commands

```powershell
gh release download v0.5.17 --repo ZP151/CICD-agents `
  --pattern 'MergePilot_0.5.17_x64_en-US.msi' `
  --dir output\live-e2e\release-v0.5.17 `
  --clobber

Get-FileHash -Algorithm SHA256 output\live-e2e\release-v0.5.17\MergePilot_0.5.17_x64_en-US.msi

.\scripts\windows\packaged-msi-payload-smoke.ps1 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.17\MergePilot_0.5.17_x64_en-US.msi') `
  -Port 18973 `
  *> output\live-e2e\release-v0.5.17\released-msi-payload-smoke-20260706-v0517.log

.\scripts\windows\packaged-live-vision-smoke.ps1 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.17\MergePilot_0.5.17_x64_en-US.msi') `
  -Port 18974 `
  *> output\live-e2e\release-v0.5.17\released-msi-live-vision-20260706-v0517.log

.\scripts\windows\verify-installed-msi-state.ps1 `
  -ExpectedVersion 0.5.17 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.17\MergePilot_0.5.17_x64_en-US.msi') `
  -ProbeDaemon `
  -ProbeAuth `
  -RequireAvatar `
  -RequireMsiPayloadMatch `
  -RequireLegacyCleanup `
  *> output\live-e2e\release-v0.5.17\installed-strict-against-release-msi-20260706-v0517.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| GitHub CI workflow | Pass | Run `28803145856` completed with conclusion `success` on `main`. Jobs passed: `Node 22 on ubuntu-latest`, `Node 22 on windows-latest`, `Desktop macos-latest (Tauri)`, and `Desktop windows-latest (Tauri)`. |
| GitHub Release workflow | Pass | Run `28803158707` completed with conclusion `success` on tag `v0.5.17`. Jobs passed: `Installer (windows-latest)`, `Installer (macos-latest)`, and `GitHub Release`. |
| Release assets | Pass | [MergePilot v0.5.17](https://github.com/ZP151/CICD-agents/releases/tag/v0.5.17) is published, not draft, not prerelease. Assets: `MergePilot_0.5.17_x64_en-US.msi`, `MergePilot_0.5.17_x64-setup.exe`, and `MergePilot_0.5.17_aarch64.dmg`. |
| Release MSI SHA256 | Pass | Local SHA256 `01EF33B831BBC823FF198643C0E2682CBB893DFF01DDE0E427CE5A840F4F18F4` matches the GitHub Release asset digest `sha256:01ef33b831bbc823ff198643c0e2682cbb893dff01dde0e427ce5a840f4f18f4`. |
| Published MSI payload smoke | Pass | `packaged-msi-payload-smoke.ps1` returned `ok: true`, `legacyCleanupWixValidated: true`, `healthVersion: "0.5.17"`, `refreshFilesSeen: 1`, `refreshFilesIndexed: 1`, `workflowPhase: "inspect_environment"`, and `chatStatus: 200`. Raw log: `output\live-e2e\release-v0.5.17\released-msi-payload-smoke-20260706-v0517.log`. |
| Published MSI live vision | Pass | Extracted daemon reported `healthVersion: "0.5.17"`. The live `gpt-4o` answer was: `The large text is "MP VISION TEST," and the two colored shapes are a blue square and a red circle.` The test reported `matchesText: true`, `matchesShapes: true`, `assistantDeltaCount: 24`, `leaksControlJson: false`, `duplicateSentence: false`, and deleted the temporary chat session with HTTP `200`. Raw log: `output\live-e2e\release-v0.5.17\released-msi-live-vision-20260706-v0517.log`; SSE log: `output\live-e2e\packaged-live-vision-sse-18974.log`. |
| Installed daemon runtime | Pass for current installed runtime | Installed daemon responded with `ok: true`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, and `cloudSessions: true`, but reported version `0.5.10` instead of expected `0.5.17`. |
| Strict installed version and payload parity | Fail as expected | Current Program Files install is still `0.5.10`: uninstall entry `MergePilot 0.5.10`; installed desktop hash `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` differs from `v0.5.17` MSI desktop hash `F4B38623DFD248492746E1ACB7035B30F0BF0BC70612E1DC91672AC2419838D6`; installed daemon hash `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` differs from `v0.5.17` MSI daemon hash `20AA1EED37065EAE54B503DD59A5D7909C60205DC64F0D5DDFA38593D7A197CD`. Raw log: `output\live-e2e\release-v0.5.17\installed-strict-against-release-msi-20260706-v0517.log`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `v0.5.17` source CI, release packaging, published MSI payload smoke, and published MSI live vision are all green. | Info | Use `MergePilot_0.5.17_x64_en-US.msi` as the current release candidate for administrator installation validation. |
| The current installed app remains usable, but it is still the old `0.5.10` Program Files payload. | High | Install `MergePilot_0.5.17_x64_en-US.msi` as administrator, then rerun strict installed verifier with `-RequireMsiPayloadMatch` and installed daemon vision smoke. |

## Run: mp-default-chromium-and-live-ado-post-v0517-20260706-2351

| Field | Value |
|---|---|
| Date/time | 2026-07-06 23:51-23:52 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Source `@mergepilot/core@0.5.17`, source `@mergepilot/daemon@0.5.17`, source browser app, installed daemon probe on `http://127.0.0.1:8787` |
| Resource mode | Default non-destructive Chromium browser gate plus live Azure DevOps read-only gates; `MERGEPILOT_E2E_DESTRUCTIVE` unset |
| Result | Pass |

### Commands

```powershell
.\scripts\windows\pnpm-project.ps1 exec playwright test --project=chromium `
  *> output\live-e2e\default-chromium-browser-gate-post-v0517-20260706.log

$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAdoDiscovery.test.ts test/liveAdoPipeline.test.ts `
  *> output\live-e2e\live-ado-readonly-post-v0517-core-20260706.log

$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- test/liveAdoPrInsight.test.ts `
  *> output\live-e2e\live-ado-readonly-post-v0517-daemon-pr-insight-20260706.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Default Chromium browser suite | Pass | Playwright discovered 84 Chromium tests, passed 54 default/non-live tests in 1.2 minutes, and skipped 30 gated live-app tests by design. Raw log: `output\live-e2e\default-chromium-browser-gate-post-v0517-20260706.log`. |
| Live ADO discovery and pipeline read-only | Pass | `test/liveAdoDiscovery.test.ts` and `test/liveAdoPipeline.test.ts` passed 3/3 live read-only tests with 1 destructive queue case skipped. The current account discovered ClaimBot_API project/repo/pipeline `#117`, listed recent runs, and read timeline/log evidence for the latest failed pipeline run. Raw log: `output\live-e2e\live-ado-readonly-post-v0517-core-20260706.log`. |
| Live daemon PR insight | Pass | `test/liveAdoPrInsight.test.ts` passed 1/1. The daemon inspected a real ClaimBot_API pull request through `/chat/workflow-action` without approval or mutation. Raw log: `output\live-e2e\live-ado-readonly-post-v0517-daemon-pr-insight-20260706.log`. |
| Runtime and cleanup probe | Pass | `/healthz` stayed healthy with installed runtime `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. `/project-links` retained `ClaimBot_API link` mapped to pipeline `117 / ClaimBot_API` plus `project link2`. No `%TEMP%\mergepilot-live-*`, `%TEMP%\mergepilot-daemon-live-pr-insight-*`, or `%TEMP%\mp-installed-*` directories remained. Raw probe: `output\live-e2e\default-chromium-and-live-ado-post-v0517-probe-20260706.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The post-`v0.5.17` default browser and live ADO read-only gates are green without mutating ADO. | Info | Keep this as the current non-destructive app/ADO baseline after the `v0.5.17` release. |
| The running installed daemon is still `0.5.10`, so these gates prove source/browser and ADO behavior after the release, not installed Program Files parity. | Medium | Install `v0.5.17` as administrator before claiming first-run installed parity. |

## Run: mp-live-app-business-full-post-v0517-20260707-0003

| Field | Value |
|---|---|
| Date/time | 2026-07-06 23:57-2026-07-07 00:03 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Source browser app plus installed daemon on `http://127.0.0.1:8787`; package versions `@mergepilot/core@0.5.17` and `@mergepilot/daemon@0.5.17` in the source test process |
| Resource mode | Full live app business gate, non-destructive; `MERGEPILOT_E2E_LIVE_APP=1`, `MERGEPILOT_E2E_LIVE_ADO=1`, `MERGEPILOT_E2E_DESTRUCTIVE` unset |
| Result | Pass |

### Commands

```powershell
$env:MERGEPILOT_E2E_LIVE_APP='1'
$env:MERGEPILOT_E2E_LIVE_ADO='1'
Remove-Item Env:MERGEPILOT_E2E_DESTRUCTIVE -ErrorAction SilentlyContinue
.\scripts\windows\pnpm-project.ps1 exec playwright test tests/e2e/live-app-business.spec.ts --project=chromium `
  *> output\live-e2e\live-app-business-full-post-v0517-20260707.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Full live app business gate | Pass | 30/30 real browser workflows passed in 5.9 minutes. Raw log: `output\live-e2e\live-app-business-full-post-v0517-20260707.log`. |
| Git staging and commit workflows | Pass | Covered selected-file staging, pending approval reload/restore, approval denial, denial feedback replanning, stage-and-commit, commit validation failure with staged changes preserved, empty commit guard, staged-only summary, and draft commit message generation. |
| Git branch, sync, stash, restore, revert, and tag workflows | Pass | Covered credential-redacted remote target inspection, secret-like diff redaction, dirty branch switch approval, target merge, merge conflict recovery, new branch creation, local bare-remote push, pull with rebase, rebase conflict recovery, stash push/apply/pop/conflict preservation, restore, revert, local tag creation, and single-tag push. |
| ClaimBot_API pipeline workflows | Pass | Covered ClaimBot_API pipeline `#117` discovery-to-save when Project Link lacks a pipeline ID, read-only failed-run evidence inspection, rerun approval preparation, and direct trigger approval preparation. Destructive mode was unset, so no new ADO run was queued. |
| Runtime and cleanup probe | Pass | `/healthz` stayed healthy with installed runtime `0.5.10`, Azure OpenAI `gpt-4o`, `cloudSecrets: false`, and `cloudSessions: true`. `/project-links` retained `ClaimBot_API link` mapped to pipeline `117 / ClaimBot_API` plus `project link2`. No `%TEMP%\mergepilot-live-*`, `%TEMP%\mergepilot-daemon-live-pr-insight-*`, or `%TEMP%\mp-installed-*` directories remained. Raw probe: `output\live-e2e\live-app-business-full-post-v0517-probe-20260707.json`. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The full non-destructive real Chat UI business gate is green after the `v0.5.17` release. | Info | Keep this as the current full app workflow baseline for Git, approval, pipeline discovery, and pipeline read-only insight. |
| The installed daemon remains `0.5.10`, so this gate is not installed Program Files parity proof. | Medium | Install `v0.5.18` as administrator after publication and rerun strict installed verifier plus installed live vision. |

## Run: mp-github-release-v0518-acceptance-20260707-0027

| Field | Value |
|---|---|
| Date/time | 2026-07-07 00:21-00:27 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | GitHub Actions CI/Release for commit `a0852f6`, GitHub Release asset `MergePilot_0.5.18_x64_en-US.msi`, extracted daemon on ports `18983` and `18984`, current installed daemon on `http://127.0.0.1:8787` |
| Resource mode | Release publication and read-only package validation; no Program Files install, no ADO mutation, no Azure data-plane mutation |
| Result | Pass for CI, Release, published MSI payload, and live vision; Partial for installed Program Files parity |

### Commands

```powershell
gh release download v0.5.18 --repo ZP151/CICD-agents `
  --pattern 'MergePilot_0.5.18_x64_en-US.msi' `
  --dir output\live-e2e\release-v0.5.18 `
  --clobber

Get-FileHash -Algorithm SHA256 output\live-e2e\release-v0.5.18\MergePilot_0.5.18_x64_en-US.msi

.\scripts\windows\packaged-msi-payload-smoke.ps1 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.18\MergePilot_0.5.18_x64_en-US.msi') `
  -Port 18983 `
  *> output\live-e2e\release-v0.5.18\released-msi-payload-smoke-20260707-v0518.log

.\scripts\windows\packaged-live-vision-smoke.ps1 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.18\MergePilot_0.5.18_x64_en-US.msi') `
  -Port 18984 `
  *> output\live-e2e\release-v0.5.18\released-msi-live-vision-20260707-v0518.log

.\scripts\windows\verify-installed-msi-state.ps1 `
  -ExpectedVersion 0.5.18 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.18\MergePilot_0.5.18_x64_en-US.msi') `
  -ProbeDaemon `
  -ProbeAuth `
  -RequireAvatar `
  -RequireMsiPayloadMatch `
  -RequireLegacyCleanup `
  *> output\live-e2e\release-v0.5.18\installed-strict-against-release-msi-20260707-v0518.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| GitHub CI workflow | Pass | Run `28805793875` completed with conclusion `success` on `main`. Jobs passed: `Node 22 on ubuntu-latest`, `Node 22 on windows-latest`, `Desktop macos-latest (Tauri)`, and `Desktop windows-latest (Tauri)`. |
| GitHub Release workflow | Pass | Run `28805803973` completed with conclusion `success` on tag `v0.5.18`. Jobs passed: `Installer (windows-latest)`, `Installer (macos-latest)`, and `GitHub Release`. |
| Release assets | Pass | [MergePilot v0.5.18](https://github.com/ZP151/CICD-agents/releases/tag/v0.5.18) is published, not draft, not prerelease. Assets: `MergePilot_0.5.18_x64_en-US.msi`, `MergePilot_0.5.18_x64-setup.exe`, and `MergePilot_0.5.18_aarch64.dmg`. |
| Release MSI SHA256 | Pass | Local SHA256 `DA51874D75C1E8C4B12BA3A87512B2DD71814FF280BFAB2233D36150A4617317` matches the GitHub Release asset digest `sha256:da51874d75c1e8c4b12ba3a87512b2dd71814ff280bfab2233d36150a4617317`. |
| Published MSI payload smoke | Pass | `packaged-msi-payload-smoke.ps1` returned `ok: true`, `legacyCleanupWixValidated: true`, `healthVersion: "0.5.18"`, `refreshFilesSeen: 1`, `refreshFilesIndexed: 1`, `workflowPhase: "inspect_environment"`, and `chatStatus: 200`. Raw log: `output\live-e2e\release-v0.5.18\released-msi-payload-smoke-20260707-v0518.log`. |
| Published MSI live vision | Pass | Extracted daemon reported `healthVersion: "0.5.18"`. The live `gpt-4o` answer was: `The large text is "MP VISION TEST," and the two colored shapes are a blue square and a red circle.` The test reported `matchesText: true`, `matchesShapes: true`, `assistantDeltaCount: 24`, `leaksControlJson: false`, `duplicateSentence: false`, and deleted the temporary chat session with HTTP `200`. Raw log: `output\live-e2e\release-v0.5.18\released-msi-live-vision-20260707-v0518.log`; SSE log: `output\live-e2e\packaged-live-vision-sse-18984.log`. |
| Installed daemon runtime | Pass for current installed runtime | Installed daemon responded with `ok: true`, Azure OpenAI `gpt-4o`, config `C:\Users\15492\.mergepilot\config.toml`, `cloudSecrets: false`, `cloudSessions: true`, authenticated user `Zhou Ping`, and avatar data present, but reported version `0.5.10` instead of expected `0.5.18`. |
| Strict installed version and payload parity | Fail as expected | Current Program Files install is still `0.5.10`: uninstall entry `MergePilot 0.5.10`; installed desktop hash `5B70865DDBF05B76E9A2ED951124E664B499E89B0560F0B350DD0C76ED231B57` differs from `v0.5.18` MSI desktop hash `8B5D4B16D67B5439D5942850E5991D081229FE02A504AA029320AB5F077EDEA4`; installed daemon hash `FA4DD0775BAFAABB1E08F1E44342F36335ACCD74CDDCA84996F2CB52350E3EC8` differs from `v0.5.18` MSI daemon hash `365E2005D47E6840C772475F569D4F4042DE4E37CFCF2BB237426CF1EB6B163D`. Raw log: `output\live-e2e\release-v0.5.18\installed-strict-against-release-msi-20260707-v0518.log`. |
| Runtime cleanup | Pass after cleanup | Follow-up cleanup removed the temporary packaged vision repo and fixture image. Post-cleanup probe found `0` `%TEMP%\mergepilot-live-*`, `%TEMP%\mergepilot-daemon-live-pr-insight-*`, `%TEMP%\mp-installed-*`, `%TEMP%\mergepilot-msi-extract-*`, `%TEMP%\mergepilot-vision-msi-extract-*`, `%TEMP%\mergepilot-packaged-vision-repo-*`, and `%TEMP%\mergepilot-vision-fixture-*` directories/files. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| `v0.5.18` source CI, release packaging, published MSI payload smoke, and published MSI live vision are all green. | Info | Use `MergePilot_0.5.18_x64_en-US.msi` as the current release candidate for administrator installation validation. |
| The current installed app remains usable and has auth/avatar/config health, but it is still the old `0.5.10` Program Files payload. | High | Install `MergePilot_0.5.18_x64_en-US.msi` as administrator, then rerun strict installed verifier with `-RequireMsiPayloadMatch` and installed daemon vision smoke. |

## Run: mp-v0518-install-guard-and-azure-permission-20260707-0036

| Field | Value |
|---|---|
| Date/time | 2026-07-07 00:34-00:37 +08:00 |
| Operator/account | `Zhou.Ping@totalebizsolutions.com` |
| Machine | `zhoulaptop` |
| Runtime | Non-elevated PowerShell, published `v0.5.18` MSI, Azure CLI account `Zhou.Ping@totalebizsolutions.com` |
| Resource mode | Non-mutating install guard plus live Azure permission diagnostic; no Program Files install, no Azure data-plane write |
| Result | Pass for guard behavior and diagnostic execution; Azure access remains Partial |

### Commands

```powershell
.\scripts\windows\install-and-verify-msi-state.ps1 `
  -ExpectedVersion 0.5.18 `
  -MsiPath (Join-Path $PWD 'output\live-e2e\release-v0.5.18\MergePilot_0.5.18_x64_en-US.msi') `
  *> output\live-e2e\release-v0.5.18\install-and-verify-msi-state-nonadmin-20260707-v0518.log

$env:MERGEPILOT_E2E_LIVE_AZURE='1'
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- test/liveAzurePermissions.test.ts `
  *> output\live-e2e\live-azure-permission-post-v0518-20260707.log
```

### Tests Run

| Test | Result | Notes |
|---|---|---|
| Non-admin install guard | Pass | The current shell is not administrator. `install-and-verify-msi-state.ps1` exited `1` with structured JSON: `ok: false`, `requiresElevation: true`, `expectedVersion: "0.5.18"`, and the published `v0.5.18` MSI path. It did not attempt a system install. Raw log: `output\live-e2e\release-v0.5.18\install-and-verify-msi-state-nonadmin-20260707-v0518.log`. |
| Live Azure permission diagnostic | Pass as diagnostic | `test/liveAzurePermissions.test.ts` passed 1/1 and reported each Azure area separately. Raw log: `output\live-e2e\live-azure-permission-post-v0518-20260707.log`. |
| Storage account and Table list | Pass for ARM/list | ARM metadata is readable for `devagentstorage001`, and Storage Table list sees `CicdAgentProfiles`. |
| Storage Table entity query | Fail due permission | Entity query still fails with missing Storage data-plane roles. Required role remains `Storage Table Data Reader` or `Storage Table Data Contributor` scoped to the relevant table/account. |
| Cosmos account and database list | Pass for ARM/list | ARM metadata is readable for `devagentcosmos001`, and SQL database list sees `cicd-agent`. |
| Cosmos SQL data-plane role assignment | Fail due permission | No Cosmos SQL data-plane role assignments were returned. Required role remains `Cosmos DB Built-in Data Contributor`, scoped to `devagentcosmos001/cicd-agent` where possible. |
| Key Vault ARM | Pass | ARM metadata is readable for `devagentkv001`, and RBAC authorization is enabled. |
| Key Vault secret metadata/list | Fail due permission | Secret list fails with `Forbidden` for `Microsoft.KeyVault/vaults/secrets/readMetadata/action`. Required role remains `Key Vault Secrets User` for reads; `Secrets Officer` is needed only for writes. |

### Findings

| Finding | Severity | Follow-up |
|---|---|---|
| The `v0.5.18` install verifier is safe to run from a normal shell: it refuses to install without elevation and tells the operator how to proceed. | Info | Run the same script from elevated PowerShell to perform the actual install and strict parity checks. |
| Azure cloud persistence is still permission-gated, not product-gated. | High | Grant Storage Table data-plane, Cosmos SQL data-plane, and Key Vault secret read permissions before rerunning cloud persistence success-path gates. |
