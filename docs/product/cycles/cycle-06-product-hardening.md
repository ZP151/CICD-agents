# Cycle 06 — Product Hardening And Pilot Readiness

Expected window: 3 weeks
Primary objective: **Prove repeatable product value, safety, and operability for pilot teams.**

## Product Outcome

A new pilot user can sign in, create one Project Link, understand capability
permissions, complete supported delivery loops, recover from common failures,
and export safe diagnostics without product-team intervention.

## Entry Conditions

- At least two domain loops have passed real ADO fixture tests.
- Verified action runtime is authoritative.
- Product scope and navigation are stable enough to test comprehension.

## Scope

### 1. Onboarding

- Microsoft sign-in with explicit identity.
- Context-first Project Link creation.
- Validate local path and ADO repository mapping.
- Explain read-only versus write scopes.
- Verify built-in Azure DevOps capability health.
- Offer three outcome examples, not feature tours.

### 2. Authentication and recovery

- Correlate browser callback, app state, and token-cache entry.
- Restore focus/close sign-in modal after successful callback.
- Show selected Microsoft/ADO identity.
- Reauthenticate, sign out, clear invalid cache, and retry.
- Log auth stages without tokens or sensitive claims.

### 3. Diagnostics and supportability

- User-visible correlation ID.
- Redacted diagnostics bundle.
- Daemon, model, ADO capability, local repo, and event-stream health.
- Product-added versus provider latency report.
- Action state and verification timeout recovery.
- Support runbook and known limitations.

### 4. Installer and updates

- Reproducible Windows installer.
- Correct default `gpt-5-mini` product label and configuration template.
- No credentials, endpoint, tenant/client ID, or Key Vault URI in repository
  defaults.
- First run creates local `config.toml`; credentials remain in environment,
  credential store, or approved Key Vault reference.
- Upgrade preserves Project Links, event/action history, and token cache safely.

### 5. Performance and resilience

- Local Working visible ≤100 ms in the supported fixture.
- Client/daemon overhead P50/P95 budgets agreed from baseline.
- Slow model and unavailable network states are truthful and recoverable.
- Restart/reconnect does not duplicate writes.
- Large PR/build/work-item inputs remain bounded.

### 6. Evaluation and pilot telemetry

- Ship domain evaluation fixtures with deterministic seed/reset.
- Record verified loops, action outcomes, corrections, latency, and feedback.
- Provide opt-in/retention controls.
- Run pilot task set with developer, reviewer, and DevOps roles.

### 7. Product comprehension and simplicity

Usability tasks:

- Select/change Project Link.
- Explain what Context contains.
- Find a PR that needs the user.
- Diagnose a failed run.
- Find audit evidence for a completed action.
- Understand why an action needs approval.

Success requires users to complete tasks without being taught the old product
architecture or MCP terminology.

## Required Deletions

- Remaining compatibility UI that exposes removed page concepts.
- Dead routes and duplicated stores after migration evidence.
- Debug/raw event payloads in normal UI.
- Unused placeholder pages and stale documentation claims.
- Fixed model label or old `max_tokens` behavior for GPT-5 reasoning models.

## Test Matrix

- Fresh install and upgrade.
- Sign-in success, cancel, timeout, wrong account, expired cache.
- No network, slow model, ADO throttling, insufficient permissions.
- Daemon restart during read, tool call, approval, write, and verification.
- Duplicate Service Hook and reconnect.
- Accessibility, keyboard, high DPI, reduced motion, light/dark theme.
- Redaction and diagnostics export.
- Installer start/stop and single-app-instance behavior.

## Pilot Exit Metrics

- Weekly verified loops per active project.
- Completion and abandonment by loop type.
- Correction/reversal and duplicate-write rates.
- Four-week retained projects.
- Median supported task improvement from baseline.
- Support incidents per active project.
- At least two validated role-specific value propositions.

## Demo

From a clean installation:

1. Sign in with Microsoft.
2. Create a Project Link from Context.
3. Complete one Work Item → PR → CI loop.
4. Complete one reviewer or failure-triage loop.
5. Show verified remote state and History/Audit evidence.
6. Export a redacted diagnostic bundle.

## Non-goals

- Public GA.
- Broad non-ADO provider support.
- Enterprise billing system.
- Fully managed cloud control plane.
- Autonomous release operation.

## Exit Evidence

- Clean-machine demo succeeds without developer tools.
- Pilot users complete the task set with documented observations.
- Reliability/safety guardrails meet agreed thresholds.
- Product, engineering, security, and support readiness reviews are recorded.
- The next investment decision uses pilot outcomes, not feature completeness.
