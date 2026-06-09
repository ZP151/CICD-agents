# OpenHarness Source Intake

Upstream repository: https://github.com/MaxGfeller/open-harness

Upstream commit: c45c9343962a3832bf3eb3456170a59414bf18d9

License: MIT

Vendored paths:

- `LICENSE`
- `README.md`
- `package.json`
- `packages/core/**`

Reuse reason:

The Dev Agent roadmap prioritizes source-first reuse. OpenHarness is the
closest TypeScript-native reference for typed agent events, middleware, MCP
integration, and approval-before-tool-execution behavior.

Current local reuse:

- The approval-before-execute pattern from
  `packages/core/src/agent.ts` has been ported into this project's
  `ToolExecutor` as `ToolApproveFn` and `ToolDeniedError`.

Current integration mode:

- Vendored source for audit and selective porting.
- No runtime dependency has been added yet.

Important compatibility note:

`@openharness/core` depends on `zod@4`, while this project currently uses
`zod@3`. Direct dependency integration should wait until there is an explicit
wrapper boundary or a planned zod migration.

