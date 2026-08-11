# Cycle 08 — Governed Pilot Expansion

Expected window: 3 weeks

Primary objective: **Prove that external pilot users can complete supported
delivery loops and a non-production deployment decision without operator
reconciliation or unsafe remote writes.**

## Entry Conditions

- Cycle 07 latency traces and verifier inputs are stable.
- v0.5.32 or its verified successor installs cleanly on pilot machines.
- ClaimBot_API remains the mutable fixture; all test branches use
  `mergepilot-e2e/` and test resources include `[MergePilot Fixture]`.
- The Azure DevOps MCP client, config path, local launch command, environment
  variable names and minimum read-only permissions are documented without
  storing credentials in Git or chat.

## Outcome Gate

- At least two external users complete the developer, reviewer or delivery
  owner task set and at least one governed write loop.
- A seeded non-production environment proves readiness, explicit approval,
  execution, authoritative re-read, retry safety and rollback advice.
- Git, Azure DevOps MCP and web-research actions appear in the same canonical
  Turn/Action ledger; no connector creates another product state.
- Failures, abandonment, correction and support needs are recorded as product
  evidence, not rewritten as passing tests.

## Scope

- Seed deterministic Work Item, PR, failed build/test and non-production
  deployment scenarios in isolated ADO resources.
- Exercise prompt-realistic multi-step tasks with interleaved public narrative,
  command/MCP groups, approvals and final conclusions.
- Add pilot telemetry for verified loops, abandonment, correction, reversal,
  latency ownership and role/task outcome.
- Test authentication renewal, browser callback, token cache, cancellation,
  reconnect and recovery on fresh installed profiles.
- Observe user comprehension of Context, Work, Changes, Delivery and approval
  evidence; change the smallest product surface supported by findings.

## Non-goals

- Production deployment, destructive environment actions or broader ADO
  permissions.
- An MCP marketplace or user-managed connector catalog.
- A general coding agent or Azure DevOps portal clone.
- Language-specific test matrices; the product default remains English input
  and response.

## Exit Evidence

- Redacted pilot task records and outcome metrics.
- Authoritative ADO before/after revisions for every write.
- Non-production deployment evidence and retry/idempotency results.
- Ranked product findings with continue/change/stop recommendations for Cycle
  09 investment.
