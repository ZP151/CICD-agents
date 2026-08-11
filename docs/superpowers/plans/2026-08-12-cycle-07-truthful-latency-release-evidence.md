# Cycle 07 Truthful Latency And Release Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Turn's first feedback genuinely model-authored and
measurably attributable while making verification and release provenance
reproducible without hand-editing evidence state.

**Architecture:** Add a redacted `TurnLatencyTrace` to the existing canonical
Turn event path, instrument boundaries where ownership is known, and project
the trace into the performance harness instead of estimating ownership from
two browser timestamps. Keep the implicit narrator and main agent separate,
choose narrator token policy from a controlled ClaimBot_API experiment, and
extend the single verification state with explicit runtime/provenance inputs.

**Tech Stack:** TypeScript, Node.js 22, Fastify/SSE, React, Vitest, Playwright,
Azure OpenAI Chat Completions, GitHub Actions, PowerShell release tooling.

## Global Constraints

- Released baseline is `v0.5.32`: GitHub/tag
  `b46ece039f34b9afd41492f1f45b59d618a422e9`, Azure DevOps main
  `c2e607b4605d72279aa391cbce9bc357bd4f40e4`, common tree
  `1ae01f68cc65c544f50e808bc8db8a1f40e947c0`.
- Use `C:\Users\15492\Develop\ClaimBot_API` as the Project Link fixture. Never
  substitute the MergePilot repository as the target under test.
- The product accepts English input and responds in English by default; do not
  create a Chinese-versus-English test matrix.
- `gpt-5-mini2` is an implicit narrator deployment and is never user-selectable.
  `gpt-5-mini` remains the main agent. Do not change model families in this Goal.
- Azure/provider TTFT below 500 ms is an optimization target, not an acceptance
  gate. Report application and provider P50/P95 separately.
- Never emit fixed prose as model narration, private chain-of-thought, raw model
  payloads, credentials, endpoints, tenant/client identifiers or Key Vault
  addresses.
- All ADO writes remain Proposal → Approval → Execution → Re-read →
  Verification. This Goal introduces no new mutation.
- A non-multimodal DeepSeek worker may implement code and text-observable tests
  but cannot approve visual desktop acceptance. Any visible UI change requires
  a human or multimodal checkpoint.
- Run Node and pnpm through `scripts/windows/pnpm-project.ps1`.
- Use TDD and commit each task only after its focused tests pass. Push only the
  Goal branch; never directly push, rewrite, force-push, delete or rename main.

---

## File Structure

- Create `packages/core/src/turnLatencyTrace.ts`: versioned trace types,
  monotonic timestamp validation, redacted serialization and span projection.
- Modify `packages/core/src/index.ts`: export only the public trace contract.
- Modify `packages/core/src/chatPublicOpening.ts`: accept a tested narrator
  policy instead of a hard-coded budget and mark provider boundaries.
- Modify `packages/core/src/llm.ts`: expose first-request/first-chunk hooks at
  the provider boundary without changing Chat Completions semantics.
- Modify `packages/daemon/src/routes/chat.routes.ts` and
  `packages/daemon/src/routes/chatSse.ts`: create/flush the Turn before slow
  preparation and write trace checkpoints through the canonical writer.
- Modify `packages/daemon/src/chatSessionRun.ts`: join concurrent preparation at
  the first decision that consumes it and finish the trace at the terminal.
- Modify `apps/desktop/src/pages/chat/chatTurnMetrics.ts` and
  `apps/desktop/src/pages/chat/useChatTurnRuntime.ts`: record client send/local
  visibility and consume server trace diagnostics without resetting Turn time.
- Modify `scripts/measure-turn-latency.mjs`: run a prompt set, preserve samples,
  and report owner-specific spans and narrator completeness.
- Create `scripts/fixtures/claimbot-latency-prompts.json`: 15 English prompts
  covering read-only Git/ADO-oriented user intents without write operations.
- Create `scripts/verification/verification-input.schema.json`: explicit,
  non-secret verifier input contract.
- Modify `scripts/verification/verify-run.mjs` and
  `scripts/verification/verify-run.self-test.mjs`: validate inputs and record
  source/evidence/release identities and relationships.
- Modify `scripts/windows/verify-installed-provenance.ps1`: accept provenance
  identities and verify a pristine release source.

### Task 1: Add the redacted Turn latency trace contract

**Files:**
- Create: `packages/core/src/turnLatencyTrace.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/turnLatencyTrace.test.ts`

**Interfaces:**
- Produces: `TurnLatencyMark`, `TurnLatencyTrace`, `markTurnLatency`,
  `projectTurnLatencySpans`, `redactTurnLatencyTrace`.
- Consumes: browser and daemon monotonic milliseconds plus ISO correlation
  timestamps; no prompt or credential values.

- [ ] **Step 1: Write the failing trace contract tests**

```ts
import { describe, expect, it } from "vitest";
import {
  markTurnLatency,
  projectTurnLatencySpans,
  redactTurnLatencyTrace,
  type TurnLatencyTrace,
} from "../src/turnLatencyTrace.js";

describe("TurnLatencyTrace", () => {
  it("keeps marks monotonic and projects owned spans", () => {
    let trace: TurnLatencyTrace = {
      schemaVersion: 1,
      turnId: "turn-1",
      processId: "daemon",
      marks: [],
    };
    trace = markTurnLatency(trace, "daemon.received", 10, "2026-08-12T00:00:00.010Z");
    trace = markTurnLatency(trace, "sse.flushed", 14, "2026-08-12T00:00:00.014Z");
    trace = markTurnLatency(trace, "narrator.requested", 20, "2026-08-12T00:00:00.020Z");
    trace = markTurnLatency(trace, "provider.first_token", 120, "2026-08-12T00:00:00.120Z");
    expect(projectTurnLatencySpans(trace)).toMatchObject({
      daemonToFlushMs: 4,
      narratorQueueAndProviderMs: 100,
    });
    expect(() => markTurnLatency(trace, "turn.finished", 119, "2026-08-12T00:00:00.119Z"))
      .toThrow(/monotonic/i);
  });

  it("serializes only allow-listed identifiers", () => {
    const safe = redactTurnLatencyTrace({
      schemaVersion: 1,
      turnId: "turn-1",
      processId: "daemon",
      marks: [],
      diagnostics: { model: "gpt-5-mini2", endpoint: "secret", prompt: "secret" },
    } as TurnLatencyTrace);
    expect(JSON.stringify(safe)).not.toContain("endpoint");
    expect(JSON.stringify(safe)).not.toContain("prompt");
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- turnLatencyTrace.test.ts
```

Expected: FAIL because `turnLatencyTrace.ts` does not exist.

- [ ] **Step 3: Implement the exact versioned contract**

```ts
export type TurnLatencyMarkName =
  | "client.sent" | "client.local_visible" | "daemon.received" | "sse.flushed"
  | "narrator.requested" | "provider.first_token" | "narrative.first_visible"
  | "tool.first_started" | "execution.sealed" | "final.first_token" | "turn.finished";

export interface TurnLatencyMark {
  name: TurnLatencyMarkName;
  monotonicMs: number;
  wallClockIso: string;
}

export interface TurnLatencyTrace {
  schemaVersion: 1;
  turnId: string;
  processId: "desktop" | "daemon";
  marks: TurnLatencyMark[];
  diagnostics?: { model?: string; deploymentRole?: "narrator" | "main" };
}

export interface TurnLatencySpans {
  daemonToFlushMs?: number;
  narratorQueueAndProviderMs?: number;
  firstTokenToVisibleMs?: number;
  executionMs?: number;
  finalizationMs?: number;
}
```

Implement immutable append, duplicate-name rejection, per-process monotonic
validation, named span subtraction and an allow-list serializer.

- [ ] **Step 4: Run focused and core tests**

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- turnLatencyTrace.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build
```

Expected: focused test PASS; core remains 500+ PASS; build PASS.

- [ ] **Step 5: Commit the trace contract**

```powershell
git add packages/core/src/turnLatencyTrace.ts packages/core/src/index.ts packages/core/test/turnLatencyTrace.test.ts
git commit -m "feat(runtime): add redacted turn latency trace"
```

### Task 2: Instrument the daemon boundary and flush before slow preparation

**Files:**
- Modify: `packages/core/src/llm.ts`
- Modify: `packages/daemon/src/routes/chat.routes.ts`
- Modify: `packages/daemon/src/routes/chatSse.ts`
- Modify: `packages/daemon/src/chatSessionRun.ts`
- Test: `packages/core/test/llmRequestParameters.test.ts`
- Test: `packages/daemon/test/chatSse.test.ts`
- Test: `packages/daemon/test/chatOpeningNarrativeGate.test.ts`

**Interfaces:**
- Consumes: Task 1 `TurnLatencyTrace` and `markTurnLatency`.
- Produces: one trace checkpoint stream per `turnId`; LLM hooks
  `onRequestStarted(model)` and `onFirstChunk(model)`.

- [ ] **Step 1: Add failing event-order and provider-hook tests**

Add assertions that a delayed Project Link/context promise cannot delay
`turn.started`/SSE flush, and that the first provider chunk invokes the hook
exactly once:

```ts
expect(events.slice(0, 2).map((event) => event.type)).toEqual([
  "turn.started",
  "turn.latency.updated",
]);
expect(events.find((event) => event.type === "turn.narrative.delta")?.sequence)
  .toBeGreaterThan(events[1]!.sequence);
expect(onRequestStarted).toHaveBeenCalledTimes(1);
expect(onFirstChunk).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Verify the tests fail on current ordering/hooks**

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- llmRequestParameters.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- chatSse.test.ts chatOpeningNarrativeGate.test.ts
```

Expected: FAIL on missing hooks/latency event.

- [ ] **Step 3: Add provider hooks without altering GPT-5 parameters**

Extend `chatStream` options with:

```ts
onRequestStarted?: (model: string) => void;
onFirstChunk?: (model: string) => void;
```

Call `onRequestStarted` immediately before
`client.chat.completions.create(params)` and call `onFirstChunk` once on the
first stream chunk, including a chunk containing only reasoning metadata. Keep
`max_completion_tokens`, temperature omission, `reasoning_effort` and
`verbosity` adaptation unchanged.

- [ ] **Step 4: Make SSE flush the first daemon action**

Create the Turn writer and emit `turn.started` immediately after request
validation. Start Project Link resolution, history load, context load and tool
setup as promises after the flush, then pass those promises to
`chatSessionRun`. Await each promise only at the existing decision boundary
that consumes its value. Use the single canonical sequence writer for latency
updates; do not create a diagnostic SSE channel.

- [ ] **Step 5: Run daemon regression tests**

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test -- chatSse.test.ts chatOpeningNarrativeGate.test.ts chatSessionProjectLinkTarget.test.ts chatSessionCheckpoint.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
```

Expected: all selected tests and typecheck PASS; cancellation/recovery tests
show one terminal event and no duplicate sequence.

- [ ] **Step 6: Commit daemon instrumentation**

```powershell
git add packages/core/src/llm.ts packages/core/test/llmRequestParameters.test.ts packages/daemon/src/routes/chat.routes.ts packages/daemon/src/routes/chatSse.ts packages/daemon/src/chatSessionRun.ts packages/daemon/test/chatSse.test.ts packages/daemon/test/chatOpeningNarrativeGate.test.ts
git commit -m "perf(chat): attribute first-event and provider latency"
```

### Task 3: Make narrator budget an evidence-selected policy

**Files:**
- Modify: `packages/core/src/chatPublicOpening.ts`
- Modify: `packages/core/src/settings.ts`
- Modify: `packages/daemon/src/routes/daemon-config.routes.ts`
- Test: `packages/core/test/chatPublicOpening.test.ts`
- Test: `packages/core/test/llmTokenParameters.test.ts`

**Interfaces:**
- Produces: `ActionNarrativePolicy` and `resolveActionNarrativePolicy(settings)`.
- Consumes: explicit candidate budget from local config/environment; defaults
  to the evidence-approved value committed at the end of Task 6.

- [ ] **Step 1: Write failing policy and completeness tests**

```ts
expect(resolveActionNarrativePolicy({ budget: 320 })).toEqual({
  maxCompletionTokens: 320,
  reasoningEffort: "minimal",
  verbosity: "low",
  minimumCompleteTurns: 14,
  sampleSize: 15,
});
expect(streamOptions.model).toBe("gpt-5-mini2");
expect(streamOptions.maxTokens).toBe(320);
expect(renderedNarrative).toMatch(/[.!?]$/);
expect(renderedNarrative).not.toContain("...");
```

Also retain the existing test that fallback to `gpt-5-mini` is allowed only
when the narrator emitted no public token.

- [ ] **Step 2: Run the focused tests and observe hard-coded 1024 failure**

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- chatPublicOpening.test.ts llmTokenParameters.test.ts
```

Expected: FAIL because the budget is currently a module constant.

- [ ] **Step 3: Implement policy resolution**

Add:

```ts
export interface ActionNarrativePolicy {
  maxCompletionTokens: number;
  reasoningEffort: "minimal";
  verbosity: "low";
  minimumCompleteTurns: 14;
  sampleSize: 15;
}
```

Accept only integer budgets from 128 through 2048. Do not expose the narrator
deployment or policy in the desktop model selector. Report the resolved role,
deployment alias and budget in the redacted daemon diagnostics route; report no
endpoint or authentication identity.

- [ ] **Step 4: Verify streaming behavior and GPT-5 compatibility**

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- chatPublicOpening.test.ts llmTokenParameters.test.ts llmRequestParameters.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build
```

Expected: GPT-5 requests use `max_completion_tokens`, never `max_tokens`; the
first genuine token is emitted immediately and the final narrative is not
ellipsized.

- [ ] **Step 5: Commit the configurable experiment policy**

```powershell
git add packages/core/src/chatPublicOpening.ts packages/core/src/settings.ts packages/core/test/chatPublicOpening.test.ts packages/core/test/llmTokenParameters.test.ts packages/daemon/src/routes/daemon-config.routes.ts
git commit -m "perf(narrator): make completion budget evidence-selected"
```

### Task 4: Preserve desktop-local visibility and consume trace diagnostics

**Files:**
- Modify: `apps/desktop/src/pages/chat/chatTurnMetrics.ts`
- Modify: `apps/desktop/src/pages/chat/chatStreamDispatcher.ts`
- Modify: `apps/desktop/src/pages/chat/useChatTurnRuntime.ts`
- Test: `apps/desktop/src/pages/chat/chatTurnMetrics.test.ts`
- Test: `apps/desktop/src/pages/chat/chatStreamDispatcher.test.ts`
- Test: `apps/desktop/src/pages/chat/layout/TurnTranscript.test.tsx`

**Interfaces:**
- Consumes: canonical latency update event and server trace.
- Produces: one merged diagnostic trace keyed by `turnId`; no new transcript
  block or user-visible fixed text.

- [ ] **Step 1: Add failing tests for local timing and no extra UI**

```ts
expect(metrics.startedAt).toBe(clientSendTime);
expect(metrics.localVisibleAt - clientSendTime).toBeLessThanOrEqual(100);
expect(metrics.startedAt).not.toBe(serverTurnStartedTime);
expect(screen.queryByText(/opening conversation|preparing conversation/i)).toBeNull();
expect(screen.getAllByTestId("working-narrative")).toHaveLength(1);
```

- [ ] **Step 2: Run the focused desktop tests**

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatTurnMetrics.test.ts src/pages/chat/chatStreamDispatcher.test.ts src/pages/chat/layout/TurnTranscript.test.tsx
```

Expected: FAIL until trace merge and local visibility mark exist.

- [ ] **Step 3: Merge diagnostics without changing the transcript reducer**

Record `client.sent` before network dispatch and `client.local_visible` in the
state update that creates Working. Merge server marks by `turnId` and mark name;
never reset `startedAt` when `turn.started` arrives. Latency events update the
developer diagnostic model only and must not create narrative, command or final
blocks.

- [ ] **Step 4: Run desktop regression tests and build**

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/pages/chat/chatTurnMetrics.test.ts src/pages/chat/chatStreamDispatcher.test.ts src/pages/chat/layout/TurnTranscript.test.tsx src/pages/chat/useChatRuntime.test.ts
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop build
```

Expected: all PASS; Copy/time still appears only after `turn.finished`.

- [ ] **Step 5: Commit desktop trace consumption**

```powershell
git add apps/desktop/src/pages/chat/chatTurnMetrics.ts apps/desktop/src/pages/chat/chatStreamDispatcher.ts apps/desktop/src/pages/chat/useChatTurnRuntime.ts apps/desktop/src/pages/chat/chatTurnMetrics.test.ts apps/desktop/src/pages/chat/chatStreamDispatcher.test.ts apps/desktop/src/pages/chat/layout/TurnTranscript.test.tsx
git commit -m "feat(desktop): preserve local turn timing diagnostics"
```

### Task 5: Build the 15-turn ClaimBot_API performance experiment

**Files:**
- Create: `scripts/fixtures/claimbot-latency-prompts.json`
- Modify: `scripts/measure-turn-latency.mjs`
- Create: `scripts/measure-turn-latency.self-test.mjs`

**Interfaces:**
- Consumes: daemon trace events and Project Link path from
  `MERGEPILOT_PERF_REPO`.
- Produces: schema-version 3 JSON with per-turn samples, completeness flags,
  resolved non-secret model policy and aggregate owner spans.

- [ ] **Step 1: Create the fixture with exactly 15 English prompts**

The file must include realistic read-only prompts such as:

```json
[
  "Report the active branch, complete working-tree state, and latest commit for the selected Project Link. Do not modify files.",
  "Identify the changed file types and explain which validation entry points are relevant. Do not run writes.",
  "Trace the most relevant test entry point for the changed module and state what evidence is still missing.",
  "Summarize the relationship between the selected repository, its current branch, and the latest local commit.",
  "Inspect the current diff at a high level and identify the smallest next read-only check needed to assess risk."
]
```

Add ten more prompts covering branch divergence, PR readiness evidence, test
discovery, configuration risk and linked ADO context. No prompt may request a
write, use MergePilot as the target, or assert unverified facts.

- [ ] **Step 2: Write a failing self-test for span ownership and completeness**

Feed synthetic SSE containing all marks and assert:

```js
assert.equal(report.schemaVersion, 3);
assert.equal(report.turns.length, 15);
assert.equal(report.summary.completeNarratives, 15);
assert.equal(report.summary.emptyNarratives, 0);
assert.ok(report.metrics["provider-first-token"].p95 >= 0);
assert.ok(report.metrics["app-daemon-to-flush"].p95 >= 0);
assert.equal(JSON.stringify(report).includes("api-key"), false);
```

- [ ] **Step 3: Run the self-test and verify schema 2 fails**

```powershell
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
node scripts/measure-turn-latency.self-test.mjs
```

Expected: FAIL on current schema and single prompt.

- [ ] **Step 4: Implement schema 3 reporting**

Store each prompt id, terminal status, mark set, narrative character count,
sentence-complete boolean and redacted model policy. Compute P50/P95 only from
successful samples and separately report missing marks, empty narratives,
incomplete narratives and no-terminal turns. Exit non-zero for missing
required marks or fewer than 14 complete narratives; do not fail because Azure
TTFT exceeds 500 ms.

- [ ] **Step 5: Run the self-test**

```powershell
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
node scripts/measure-turn-latency.self-test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the performance harness**

```powershell
git add scripts/fixtures/claimbot-latency-prompts.json scripts/measure-turn-latency.mjs scripts/measure-turn-latency.self-test.mjs
git commit -m "test(perf): add attributed ClaimBot turn baseline"
```

### Task 6: Select the narrator budget from live evidence

**Files:**
- Modify: `packages/core/src/chatPublicOpening.ts` only if the selected default
  differs from the current default.
- Modify: `docs/product/next-iteration-known-gaps.md`
- Create: `docs/manual-testing/2026-08-12/narrator-budget-decision.md`

**Interfaces:**
- Consumes: Task 5 schema 3 reports for budget 320 and current 1024.
- Produces: one evidence-backed default budget and decision record.

- [ ] **Step 1: Start the local daemon with ClaimBot_API selected**

Use local configuration references; do not print environment values:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon dev
```

- [ ] **Step 2: Run 15 turns with budget 320**

In a separate shell:

```powershell
$env:MERGEPILOT_PERF_REPO = "C:\Users\15492\Develop\ClaimBot_API"
$env:MERGEPILOT_PERF_TURNS = "15"
$env:MERGEPILOT_NARRATIVE_MAX_COMPLETION_TOKENS = "320"
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
node scripts/measure-turn-latency.mjs
```

- [ ] **Step 3: Run the same 15 prompts with budget 1024**

Repeat only the budget value. Keep deployment, prompt order, daemon build and
Project Link constant.

- [ ] **Step 4: Apply the selection rule**

Choose the lowest candidate whose run has at least 14/15 complete narratives,
zero empty narratives, zero fixed/fallback copy, and no material P95 regression
in app-owned spans. If 320 fails, retain 1024 and record the exact failure
counts; do not lower the budget to satisfy a preference. If both fail, leave
the production default unchanged and keep Cycle 07 open.

- [ ] **Step 5: Run focused tests after changing the default**

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test -- chatPublicOpening.test.ts llmTokenParameters.test.ts llmRequestParameters.test.ts
```

- [ ] **Step 6: Commit the measured policy decision**

```powershell
git add packages/core/src/chatPublicOpening.ts docs/product/next-iteration-known-gaps.md docs/manual-testing/2026-08-12/narrator-budget-decision.md
git commit -m "perf(narrator): select budget from live completeness evidence"
```

### Task 7: Make verifier inputs and release provenance deterministic

**Files:**
- Create: `scripts/verification/verification-input.schema.json`
- Modify: `scripts/verification/verify-run.mjs`
- Modify: `scripts/verification/verify-run.self-test.mjs`
- Modify: `scripts/windows/verify-installed-provenance.ps1`
- Test: `scripts/verification/verify-run.self-test.mjs`

**Interfaces:**
- Produces: `--inputs <path>` verifier option and provenance schema version 4.
- Consumes: a local JSON file containing non-secret identities and evidence
  artifact paths.

- [ ] **Step 1: Define the explicit input schema**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["productVersion", "models", "remotes", "source", "credentialAudit"],
  "properties": {
    "productVersion": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "models": {
      "type": "object",
      "required": ["main", "narrator"],
      "properties": {
        "main": { "type": "string", "minLength": 1 },
        "narrator": { "type": "string", "minLength": 1 }
      },
      "additionalProperties": false
    },
    "remotes": {
      "type": "object",
      "required": ["github", "ado"],
      "properties": {
        "github": { "type": "string", "minLength": 1 },
        "ado": { "type": "string", "minLength": 1 }
      },
      "additionalProperties": false
    },
    "source": {
      "type": "object",
      "required": ["productSourceSha"],
      "properties": {
        "productSourceSha": { "type": "string", "pattern": "^[0-9a-f]{40}$" },
        "evidenceClosureSha": { "type": "string", "pattern": "^[0-9a-f]{40}$" }
      }
    },
    "credentialAudit": { "type": "string", "minLength": 1 }
  },
  "additionalProperties": false
}
```

The runtime input file itself remains untracked when it contains organization
remote identifiers; committed fixtures use inert example identifiers.

- [ ] **Step 2: Add failing verifier self-tests**

Cover missing input, extra secret-like fields, nonexistent credential audit,
product/evidence commits with different product trees, tag mismatch, workflow
head mismatch and asset digest mismatch. Assert that projection files are
unchanged after a failed input validation.

- [ ] **Step 3: Run the self-test and verify failure**

```powershell
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
node scripts/verification/verify-run.self-test.mjs
```

Expected: FAIL before `--inputs` and schema 4 exist.

- [ ] **Step 4: Implement fail-closed input validation and identities**

Add fields:

```ts
interface VerificationProvenanceV4 {
  schemaVersion: 4;
  productSourceSha: string;
  productSourceTree: string;
  evidenceClosureSha: string;
  evidenceClosureProductTree: string;
  githubMainSha?: string;
  adoMainSha?: string;
  commonMainTree?: string;
  releaseTag?: string;
  releaseTagSha?: string;
  workflowRunId?: string;
  assets: Array<{ name: string; sha256: string; size: number }>;
}
```

Compare a declared product path set rather than the entire evidence closure
tree when proving code equivalence. Never make historical PASS outrank a later
failed provenance check.

- [ ] **Step 5: Update installed provenance to consume identities**

Add explicit PowerShell parameters for the input JSON and pristine source
directory. Resolve and verify the source directory stays within the named
checkout before any clean/build action. Record MSI/EXE and installed payload
hashes; do not read identity values from the developer's dirty worktree.

- [ ] **Step 6: Run verifier tests and artifact validation**

```powershell
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
node scripts/verification/verify-run.self-test.mjs
node scripts/verification/verify-run.mjs --verify-artifacts
```

Expected: self-tests PASS and all currently bound artifacts verify.

- [ ] **Step 7: Commit deterministic verification**

```powershell
git add scripts/verification/verification-input.schema.json scripts/verification/verify-run.mjs scripts/verification/verify-run.self-test.mjs scripts/windows/verify-installed-provenance.ps1
git commit -m "feat(verification): make runtime and release provenance explicit"
```

### Task 8: Run the complete Cycle 07 gate and prepare handoff

**Files:**
- Modify: `docs/product/cycles/cycle-07-truthful-latency-and-evidence.md`
- Modify: `docs/product/next-iteration-known-gaps.md`
- Create: `docs/manual-testing/2026-08-12/cycle07-acceptance-evidence.md`
- Generated: verification state/projections and redacted performance artifacts.

**Interfaces:**
- Consumes: Tasks 1–7 and local verification-input JSON.
- Produces: one Cycle 07 evidence ledger and a clean Goal branch ready for PR.

- [ ] **Step 1: Run package verification**

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop build
```

Expected: all PASS with no unexpected skip.

- [ ] **Step 2: Run a fresh canonical verifier from explicit inputs**

```powershell
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
node scripts/verification/verify-run.mjs --fresh --inputs $env:MERGEPILOT_VERIFY_INPUTS
node scripts/verification/verify-run.mjs --resume --inputs $env:MERGEPILOT_VERIFY_INPUTS
node scripts/verification/verify-run.mjs --verify-artifacts --inputs $env:MERGEPILOT_VERIFY_INPUTS
```

Expected: all required gates PASS and no manual state enrichment.

- [ ] **Step 3: Run source-live and desktop acceptance**

Use the documented source-live harness against ClaimBot_API. Required
observations: local Working ≤100 ms, one prompt-specific opening narrative,
narrative/action-group alternation, terminal auto-collapse, final stream, then
Copy/time. A non-multimodal worker records text/state evidence only; a human or
multimodal reviewer records the visual checkpoint.

- [ ] **Step 4: Run the pristine release rehearsal**

Create a separate pristine checkout at the Goal SHA, execute verifier and
installer build there, and record product/evidence identities and hashes. Do
not publish a tag in this task.

- [ ] **Step 5: Update the evidence ledger and known gaps**

Record exact SHA, tree, test counts, P50/P95 tables, narrator budget decision,
credential audit, verifier input digest and release-rehearsal hashes. Move only
unproven items to Cycle 08; do not label them complete.

- [ ] **Step 6: Commit and push the completed Goal branch**

```powershell
git diff --check
git status --short --branch
git add docs/product/cycles/cycle-07-truthful-latency-and-evidence.md docs/product/next-iteration-known-gaps.md docs/manual-testing/2026-08-12
git commit -m "docs(evidence): close Cycle 07 acceptance"
git push origin claudecode/mergepilot-cycle07
git push ado claudecode/mergepilot-cycle07
```

Before each push, verify branch, remote, tests and outgoing commits. After each
push, compare local and remote SHA. Do not create or merge a PR until the user
reviews the evidence.

---

## Self-Review Results

- Spec coverage: latency ownership, truthful narration, 320-versus-1024
  evidence, implicit narrator, GPT-5 parameter compatibility, ClaimBot_API,
  verifier inputs, release provenance, credentials, desktop timing and
  non-multimodal constraints each map to a task.
- Placeholder scan: no deferred or content-free implementation instruction remains.
- Type consistency: `TurnLatencyTrace`, `ActionNarrativePolicy` and
  `VerificationProvenanceV4` are defined before downstream use.
- Scope: external pilots, signing and visual approval remain in Cycles 08–09;
  Cycle 07 can ship and be reviewed independently.
