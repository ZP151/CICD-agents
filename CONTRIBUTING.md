# Contributing to MergePilot

MergePilot is a local-first Azure DevOps delivery copilot. Contributions should
preserve its central contract: collect evidence, request approval for mutations,
execute the smallest intended action, and verify the resulting authoritative
state.

## Before you start

- Read the [product definition](PRODUCT.md) and
  [product plan](docs/product/README.md).
- Keep Azure DevOps as the remote system of record; do not introduce duplicate
  project-state ownership.
- Do not bypass approval, policy, or post-action verification for Git or Azure
  DevOps writes.
- Keep secrets, credentials, repositories, and user data out of commits and
  test fixtures.

## Local development

Use Node.js 22 and pnpm 9. On Windows, the repository-local runner keeps the
checked-in toolchain first on `PATH`:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test
```

Run the narrowest relevant checks while working, then run the applicable
package-level test and typecheck commands before requesting review.

## Pull requests

- Explain the user-visible outcome and the safety or verification impact.
- Keep a change scoped to one delivery outcome where possible.
- Add or update tests for planner, policy, runtime, or UI behaviour you change.
- Record evidence for changes that affect installed desktop behavior or real
  Azure DevOps interactions.
- Do not commit generated local state, credentials, installers, or unrelated
  formatting changes.

## Reporting issues

Include the affected surface, expected and actual behavior, a minimal
reproduction, and any safe-to-share logs or screenshots. For Azure DevOps
issues, redact organization identifiers, tokens, repository paths, and work
item content that should remain private.
