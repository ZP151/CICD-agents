# Cycle 09 — Release Confidence And Adoption Decision

Expected window: 3 weeks

Primary objective: **Make installation, upgrade, accessibility, support and the
pilot investment decision reproducible from signed release evidence.**

## Entry Conditions

- Cycle 08 has external pilot evidence and a governed non-production fixture.
- Release signing ownership and secret-storage policy are approved outside the
  repository.
- A human or multimodal reviewer is available for visual desktop acceptance.

## Outcome Gate

- Windows MSI/EXE artifacts are signed and signature-verified in the release
  workflow, or release publication fails closed.
- GitHub Actions uses supported action runtimes without Node 20 deprecation
  annotations.
- Clean install, upgrade, configuration preservation, diagnostics export and
  documented recovery pass from a pristine tagged source tree.
- Keyboard, screen-reader semantics, focus order, narrow-window layout and
  visual regression checkpoints pass.
- Product, support and pilot evidence supports an explicit continue, change or
  stop decision with named assumptions.

## Scope

- Integrate organization-approved Windows signing references without placing
  certificates, secrets, endpoints or identity values in Git.
- Upgrade workflow action versions and add a release-policy test for unsigned
  or deprecated execution paths.
- Add accessible names, keyboard/focus coverage and narrow-window automation;
  retain human/multimodal review for appearance.
- Verify support diagnostics are redacted, correlated and sufficient to
  distinguish auth, app, provider, ADO and installer failures.
- Compare verified-loop completion, retained projects, corrections, support
  incidents and validated value propositions against product hypotheses.

## Non-goals

- Silent auto-update without an approved update trust model.
- Storing signing material or cloud identity configuration in the repository.
- Declaring GA from automated tests alone.

## Exit Evidence

- Signed release asset digests and signature verification logs.
- Clean install/upgrade/recovery and support runbook evidence.
- Accessibility automation plus human/multimodal visual sign-off.
- Pilot outcome report and explicit investment decision.
