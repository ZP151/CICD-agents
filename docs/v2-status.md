# Dev Agent v2 - implementation status

This document tracks which roadmap items are delivered as code in the
repository vs. which still require **owner-driven** runtime actions
(Azure deployment, signed installers, real PR validation, etc).

| Phase | Item | Code | Owner action required |
| ----- | ---- | ---- | --------------------- |
| 0 | ADRs 0001-0007 + production-architecture diagram | YES - [docs/adr/](adr/), [docs/architecture.md](architecture.md) | review & merge |
| 0 | POC validation against real ADO repo | partial - checklist in [docs/poc-validation.md](poc-validation.md) | run the 6 scenarios on a real ADO repo and fill in lessons |
| 1 | pnpm monorepo (packages/core, daemon, cli, review-agent; apps/desktop) | YES | `pnpm install` to materialise lockfile |
| 1 | Port queue, indexer, vector, llm, planner, context, executor, memory, 5 tools to TS | YES | --- |
| 1 | Fastify daemon (parity routes + SSE) + commander CLI with auto-start | YES | --- |
| 1 | Vitest port of the 18 Python tests | YES (core + cli + review-agent test/) | run `pnpm test` |
| 1 | Tag Python tree as `python-poc-final`; freeze main | partial - [runtime/NOTICE.md](../runtime/NOTICE.md), CI exclusion in [ci.yml](../.github/workflows/ci.yml) | run `git tag python-poc-final && git push origin python-poc-final` |
| 2 | ink TUI shell + init wizard + profile editor | YES - [packages/cli/src/tui/](../packages/cli/src/tui/) | --- |
| 2 | `dev-agent ai` + `git_intent_translator` + dry-run + 3 canned scenarios | YES - [packages/core/src/tools/gitIntent.ts](../packages/core/src/tools/gitIntent.ts), [packages/cli/test/scenarios/canned.test.ts](../packages/cli/test/scenarios/canned.test.ts) | --- |
| 2 | SSE `/tasks/{id}/events`, streaming chat, fragmented tool_call assembler | YES - daemon route + [LLMClient.chatStream](../packages/core/src/llm.ts), `ToolCallAssembler` unit-tested | --- |
| 3 | Review Agent service + ADO webhook (signature validation + idempotent queue) | YES - [packages/review-agent/](../packages/review-agent/) | provision Container App + push image |
| 3 | Cloud-mode context + review planner + `ado.git.createThread` | YES - [cloudContext.ts](../packages/review-agent/src/cloudContext.ts), [reviewPlanner.ts](../packages/review-agent/src/reviewPlanner.ts), [reviewService.ts](../packages/review-agent/src/reviewService.ts) | --- |
| 3 | Table Storage state + Key Vault secrets + `dev-agent review enable` | YES - [stateStore.ts](../packages/review-agent/src/stateStore.ts), [secrets.ts](../packages/review-agent/src/secrets.ts), [reviewEnable.ts](../packages/cli/src/reviewEnable.ts), [containerapp.bicep](../packages/review-agent/deploy/containerapp.bicep) | provision storage + Key Vault + register subscription |
| 3 | Evaluation harness for 20-PR labelled set + App Insights cost emitters | YES - [evaluation.ts](../packages/review-agent/src/evaluation.ts), [telemetry.ts](../packages/core/src/telemetry.ts) | label 20 real PRs and run `eval/run.ts` |
| 4 | Tauri + React + shadcn scaffold with SSE wiring | YES - [apps/desktop/](../apps/desktop/) | install Rust toolchain; produce signed installers (needs cert secrets) |
| X | `.github/workflows/ci.yml` lint/test/build + Tauri matrix | YES - [.github/workflows/ci.yml](../.github/workflows/ci.yml) | add `TAURI_SIGNING_*` secrets to enable signed installers |
| X | pino logs + App Insights wiring + per-task token/tool metrics + opt-in toggle | YES - [logger.ts](../packages/core/src/logger.ts), [telemetry.ts](../packages/core/src/telemetry.ts), `dev-agent settings --telemetry on` | provision Application Insights resource(s) |

## Owner-driven follow-up checklist

1. `pnpm install`
2. Optional: install Rust toolchain for `tauri:dev` / `tauri:build`
3. Run `pnpm -r --filter "./packages/*" run typecheck` and `pnpm -r --filter "./packages/*" run test` to verify the local build
4. Execute the 6 scenarios in [docs/poc-validation.md](poc-validation.md)
   against a real ADO repo and update the document with any lessons
5. Tag and push: `git tag python-poc-final && git push origin python-poc-final`
6. Provision Azure resources per [packages/review-agent/deploy/README.md](../packages/review-agent/deploy/README.md)
7. Push the review-agent image and deploy via the Bicep template
8. Register PR webhooks with `dev-agent review enable ...`
9. Add CI secrets if/when you want signed installers from the desktop matrix
