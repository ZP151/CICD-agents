# Goal Ledger — MergePilot Cycle 00–06 (2026-08-05)

Authoritative source: `docs/product/README.md` and its referenced documents.
Goal: complete Cycles 00–06 in order, each gated by acceptance evidence.

## Initial State (recorded 2026-08-05 before any work)

### MergePilot repo (`C:\Users\15492\Develop\Agents\CICD-agents`)

- Branch: `claudecode/optimize-bugfix` — clean working tree, up to date with
  `origin/claudecode/optimize-bugfix`.
- HEAD: `0cb84d6 chore: align product strategy and ADO MCP config`.
- Branch is 21 commits ahead of `origin/main` (contains the 2026-08-03
  iteration work: MP-001..MP-016).
- Remotes: `origin` = github.com/ZP151/mergepilot.git; `ado` =
  tebssg.visualstudio.com/MyTeBS/_git/DevAgent_CICD.
- Toolchain: Node v22.11.0, pnpm 9.0.0.

### ClaimBot_API fixture repo (`C:\Users\15492\Develop\ClaimBot_API`)

- Branch: `main`, up to date with `origin/main`.
- Remote: https://tebssg.visualstudio.com/TeBS-ClaimBot/_git/ClaimBot_API
- Pre-existing local changes (snapshot, untouched):
  - modified: `BotToSharePoint/Properties/PublishProfiles/FolderProfile.pubxml`
  - modified: `BotToSharePoint/Web.config`
  - untracked: `BotToSharePoint/Web - Copy.config`
- Existing remote branches: `main`, `DevelopAPIAA`.
- Last commit: `dffeecd fix: harden web package content validation`

## Cycle Tracking

| Cycle | Status | Evidence |
| --- | --- | --- |
| 00 — Reset and foundation | **completed 2026-08-05** | `cycle00-acceptance-evidence.md`; commits 1377c2a, 8e05713, 280ea97, e8d3f11, MP-PROD-001..003 commits; real-ADO E2E verified |
| 01 — Work Item → PR → CI → write-back | **completed 2026-08-05** | `cycle01-acceptance-evidence.md` + `cycle01-evidence.json`; commits 9e3ea93 (graph), 293762d (kinds/target resolution); real-ADO Fixtures A+B verified |
| 02 — Changes lifecycle | **completed 2026-08-05** | `cycle02-acceptance-evidence.md` + `cycle02-reviewer-evidence.json`; commits 81d139f (workspace), 1d624c5 (assessment/reviewer/your-turn) |
| 03 — Delivery CI/test | **completed 2026-08-05** | `cycle03-acceptance-evidence.md` + `cycle03-evidence.json`; evidence bundle + classification + Inspector; real run 4834 classified code_regression |
| 04 — Work intelligence | pending | — |
| 05 — Deployment readiness | pending | — |
| 06 — Hardening and pilot | pending | — |

## Cycle 00 real-ADO write ledger

| Date | Resource | ID | Operation | Result | Cleanup |
| --- | --- | --- | --- | --- | --- |
| 2026-08-05 | Work Item | 7912 | Create `[MergePilot Fixture] Cycle00 demo work item` | ok, revision 1 | delete after all cycles |
| 2026-08-05 | Action record | act-d3d0cz | work_item.comment demo run 1 (key cycle00-demo-msf4g7b8) | verified (revision 3) | keep as audit evidence |
| 2026-08-05 | Action record | act-gek1mz | work_item.comment demo run 2 (key cycle00-demo-mqf7s89) | verified (revision 4) | keep as audit evidence |
| 2026-08-05 | Work Item comments | WI-7912 | 3 demo comments (2 verified runs + 1 earlier unverified run) | each written exactly once | removed with WI-7912 |

## Cycle 01 real-ADO write ledger

| Date | Resource | ID | Operation | Result | Cleanup |
| --- | --- | --- | --- | --- | --- |
| 2026-08-05 | Work Item | 7913 | Create `[MergePilot Fixture] Cycle01 demo work item` | ok | delete after all cycles |
| 2026-08-05 | Branch | mergepilot-e2e/cycle01-fixture-1785876925 | doc-only fixture (commit 6ae18f8) | pushed | delete branch |
| 2026-08-05 | Branch | mergepilot-e2e/cycle01-fixture-1785878166 | fixture run 2 (484865a) | pushed | delete branch |
| 2026-08-05 | Branch | mergepilot-e2e/cycle01-fixture-1785878231 | fixture run 3 (4b4b07f) | pushed | delete branch |
| 2026-08-05 | Branch | mergepilot-e2e/cycle01-fixture-1785878322 | fixture run 4 (f1ddd07) | pushed | delete branch |
| 2026-08-05 | Branch | mergepilot-e2e/cycle01-fail-1785878302 | deterministic compile failure (160a517) | pushed | delete branch |
| 2026-08-05 | PR | 2798 | [MergePilot Fixture] PR (run 2, chat attempt) | created | abandon |
| 2026-08-05 | PR | 2799 | [MergePilot Fixture] PR (run 3) | created | abandon |
| 2026-08-05 | PR | 2801 | [MergePilot Fixture] PR (run 4, verified) | created | abandon |
| 2026-08-05 | Pipeline run | 4830 | fixture run 3 (passing) | **completed succeeded** | n/a |
| 2026-08-05 | Pipeline run | 4831/4832 | first fail branch (file not in csproj -> passed) | observed | n/a |
| 2026-08-05 | Pipeline run | 4834 | **deterministic compile failure** (BundleConfig.cs syntax error) | **completed failed** | n/a |
| 2026-08-05 | Pipeline run | 4833 | fixture run 4 (passing) | triggered+verified | n/a (run completes) |
| 2026-08-05 | Action records | act-1hrkgtx, act-92i10t, act-10b2mgz, act-1lljl2v | verified Fixture A/B writes | verified | keep as audit evidence |
| 2026-08-05 | Action record | act-1thxfgc / act-1u45z0 | duplicate PR refused (TF401179) | failed (correct) | keep as safety evidence |
| 2026-08-05 | Action record | act-1ukj2y | stale write-back refused (rev 1 vs 3) | failed (correct) | keep as safety evidence |

## Write/Resource Rules (recap)

- MergePilot: push only `claudecode/optimize-bugfix` (Goal branch).
- ClaimBot_API: push only `mergepilot-e2e/` prefixed branches.
- Remote `main` (both repos): never force-push, never rewrite, never delete.
- Test resources marked `[MergePilot Fixture]`; cleanup recorded in this
  ledger with IDs before deletion.
