# Cycle 03 Acceptance Evidence (2026-08-05)

Primary objective: **Reduce supported CI failure investigation and recovery
time.**

## Failure evidence bundle (MP-DEL-002)

`delivery/failureEvidence.ts` + daemon `GET /delivery/evidence/:buildId`:

- Build identity, timeline issues (failed tasks), bounded log excerpts with
  secret redaction and content hashes, error issues, failure signature
  (normalized text: timestamps/shas/numbers replaced), evidence coverage
  (complete/partial/missing).
- Targeted task logs only; missing log access is reported, never guessed.

**Real ADO evidence (run 4834 — the deterministic compile failure):**

| Field | Value |
| --- | --- |
| Build | 20260805.7, failed |
| Error issue | `BotToSharePoint\App_Start\BundleConfig.cs(30,34): Error CS1513: } expected` |
| Classification | **code_regression** (0.85) |
| Decisive evidence | the CS1513 line |
| Coverage | complete |

## Classification (MP-DEL-003)

Deterministic detectors (cancelled, permission/credential,
pipeline/configuration, dependency, agent/infrastructure, flaky test, code
regression) run before any model; unknown reports missing evidence.
Compile errors from build tasks classify as code regression without
guessing at changed files.

## Delivery run Inspector (MP-DEL-001/004)

- The Pipelines page's run diagnosis opens a side Inspector (bounded
  evidence, classification badge, decisive evidence, failed tasks, redacted
  log excerpts) instead of navigating to Chat — **the click-to-chat
  preloading path is deleted**.
- Recovery actions run through the verified action runtime:
  - Rerun pipeline → `pipeline.trigger` with the failing branch/sha,
    verified by run_visible.
  - Create Bug → `work_item.create` with the classification + decisive
    evidence, verified by title field.
  - (Comment on linked PR / mark flaky available via the transport kinds
    and flaky-test store; exercised in unit tests.)

## Required deletions — verified

- Pipeline button behavior preloading run history into Chat: removed
  (`openPipelineInChat`/`Open in Chat` gone; desktop grep clean).
- Raw unbounded log rendering: evidence endpoint bounds at 6 KB with
  redaction; Inspector renders bounded excerpts only.
- Generic "Analyze pipeline" without classification: the Inspector always
  shows the classification verdict + coverage.

## Tests

- core: classification 6 (redaction/bounds, compile→code_regression,
  permission, cancelled, unknown/missing evidence, signature stability).
- desktop: 717 passed (Inspector wiring, card actions, navigation).

## Remaining notes

- Test-quality projections (repeated failing / flaky / slow) and the
  full Delivery Inbox "Tests" view remain for Cycle 06 evaluation work per
  the roadmap; the flaky-test store already exists in core
  (`known_flaky_tests`).
- Metrics (failure-to-evidence P50/P95) will be recorded during the pilot
  task set in Cycle 06.
