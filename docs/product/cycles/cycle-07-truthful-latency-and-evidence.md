# Cycle 07 — Truthful Latency And Deterministic Evidence

Expected window: 2 weeks

Primary objective: **Make prompt-specific first feedback fast enough to trust,
attribute every part of Turn latency, and produce release evidence without
manual enrichment.**

## Why This Cycle Is Next

MergePilot v0.5.32 proves the installed developer loop and canonical action
runtime, but its exact-SHA baseline reports first SSE P95 3.76 seconds and
first real narrative P95 10.99 seconds. Health and Project Link reads are much
faster, so a single end-to-end number cannot tell the team which delay it owns.
The same release required a separate evidence-closure commit and manual
metadata enrichment. Optimizing model size or hiding the wait behind fixed
copy would make both problems less observable, not more correct.

## Outcome Gate

The cycle closes only when all of the following are true on an English,
15-turn ClaimBot_API Project Link run:

- every Turn records client send, local visibility, daemon receive/SSE flush,
  narrator request, first provider token, first public narrative, first tool,
  execution seal, first final token and terminal time;
- P50/P95 tables report app-owned, provider-owned, tool/ADO and total spans
  separately, with Azure/provider latency below 500 ms treated only as an
  optimization target;
- the UI shows no fixed opening, empty narrator block, duplicated narrative or
  truncated public note, and every action group follows its model-authored
  public decision;
- a fresh verifier run receives version, model deployments, remotes,
  credential-audit evidence and source identities as explicit inputs;
- the verifier distinguishes product source, evidence closure, main merge,
  release tag, workflow run and release assets, and verifies their required
  tree/hash relationships without editing canonical state by hand.

## Scope

### 1. Turn latency trace

- Introduce a versioned, redacted `TurnLatencyTrace` with monotonic process
  timestamps and wall-clock correlation fields.
- Measure client and daemon ownership at their actual boundaries instead of
  deriving provider time by subtracting two browser observations.
- Persist aggregate evidence only; do not put private prompts, model reasoning,
  credentials or raw tool output into performance artifacts.

### 2. Narrator policy experiment

- Keep `gpt-5-mini2` implicit and separate from the user-selectable main model.
- Keep `reasoning_effort: minimal`, low verbosity and the main
  `gpt-5-mini` fallback only when the narrator fails before any public token.
- Compare candidate completion budgets, including 320 and the current 1024,
  using visible-completion rate, first-token P50/P95, total narrator duration
  and token use. Select the lowest budget that produces a complete, truthful
  note in at least 14/15 turns with no empty output; do not change the default
  from preference alone.
- Stream the first genuine provider token immediately into one replaceable
  narrative block. No deterministic text may impersonate model output.

### 3. App-owned startup reduction

- Flush the canonical `turn.started` event before Project Link hydration,
  history loading, context preparation or tool registration slow paths.
- Run independent preparation concurrently and join it only at the first
  decision that needs the result.
- Preserve one `TurnRuntime`, one sequence writer and the existing approval,
  cancellation and recovery semantics.

### 4. Explicit verification inputs

- Define a schema for product version, main/narrator deployment names, GitHub
  and ADO remote identities, credential-audit artifact and expected source
  identities.
- Make `verify-run.mjs --fresh` fail closed when required inputs are missing;
  projections remain outputs and cannot be edited to repair the state.
- Keep all endpoints, tenant/client identifiers, Key Vault addresses and
  credentials in local config/environment references, never in Git evidence.

### 5. Release provenance identities

- Record `productSourceSha`, `evidenceClosureSha`, `githubMainSha`,
  `adoMainSha`, common tree, tag target, workflow run and release asset digests.
- Verify that the product-code tree used by tests is the released product-code
  tree even when evidence-only files close later.
- Run packaging from a pristine tag checkout. Never use a dirty developer
  worktree as the release source.

## Test And Evidence Matrix

- Core unit tests: GPT-5 parameter adaptation, narrator budget/policy,
  first-token streaming, no-text retry and pre-token-only fallback.
- Daemon contract tests: event ordering, early SSE flush, concurrent slow
  context, cancellation, timeout and trace redaction.
- Verifier self-tests: missing inputs, mismatched trees, stale artifacts,
  product/evidence identity separation and projection immutability.
- Desktop tests: local Working within 100 ms, one narrative block per decision,
  no fixed copy and footer only after `turn.finished`.
- Source-live: 15 English turns against
  `C:\Users\15492\Develop\ClaimBot_API`, with Project Link targeting that
  repository rather than MergePilot.
- Release rehearsal: pristine worktree → verifier → installer → asset hashes;
  no tag or main write is part of this cycle until the evidence gate passes.

## Non-goals

- Replacing GPT-5-mini because provider TTFT is high.
- Exposing `gpt-5-mini2` in the model selector.
- Showing private chain-of-thought or fabricating an opening sentence.
- Treating Azure TTFT below 500 ms as a release blocker.
- Adding a second chat state, planner, verifier or release evidence store.
- Visual acceptance by the non-multimodal implementation model.

## Exit Evidence

- Before/after P50/P95 with raw redacted trace samples and configuration
  identity, not credentials.
- A recorded narrator budget decision with completeness and latency evidence.
- Passing unit, contract, desktop, source-live and verifier gates on one product
  SHA.
- A clean credential persistence audit.
- A reproducible release rehearsal proving all provenance relationships.
- Human or multimodal review of any visible desktop change.
