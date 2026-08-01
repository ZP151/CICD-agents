# Turn Transcript acceptance matrix

This matrix treats a user instruction as a continuous Turn, rather than a
collection of adjacent chat bubbles. It is the QA contract for the public
transcript: public action narrative, actual activity groups, approval, and
final conclusion must remain in one strict event sequence.

## Shared starting conditions

- A signed-in developer has selected a Project Link fixture. Fixtures are
  isolated test repositories and mocked Azure DevOps/MCP services; they never
  use the MergePilot working tree as the target.
- The selected language is English. English is the default for all prompts and
  replies; input language is not a test dimension unless a user explicitly
  asks for another language.
- The desktop has a running daemon and an available GPT-5 main deployment. A
  separate narrator deployment is optional; no case accepts a canned opening
  in place of an actual model response.

## Scenarios

### TS-01 — Review a changed Project Link in two evidence rounds

**User role:** Developer reviewing a change before commit.

**Prompt:**

```text
Review the selected Project Link's changed configuration file for deployment risk. First establish the change scope, then inspect only the relevant diff; do not modify files.
```

**Expected Turn:**

1. `Working for 0s` is visible locally before remote context construction.
2. A real, complete public action narrative states the unknown scope and the
   immediate read-only evidence to collect.
3. One Git group contains only the actually-started independent status/branch
   reads. It is followed by a second narrative based on those results.
4. A second Git group contains the relevant diff only. No future command is
   visible before its `tool.started` event.
5. Working seals and collapses; Final contains the risk conclusion and
   relevant facts only. Copy/time appear only after `turn.finished`.

### TS-02 — Azure DevOps PR readiness with MCP provenance

**User role:** Release engineer deciding whether a PR is ready.

**Prompt:**

```text
Inspect PR 42 for the selected Azure DevOps Project Link. Check policy status, unresolved threads, and the latest linked build; explain any release blocker without changing the PR.
```

**Fixture:** an authenticated mocked Azure DevOps service or a fake
`azure-devops` MCP server exposing PR, policy, thread, and build read tools.

**Expected Turn:**

1. The first public narrative names the PR-readiness question and the facts
   required to answer it, without a command list.
2. One or more actual groups are labelled with MCP provenance (`Azure DevOps`)
   only after their first real call starts.
3. A later narrative is emitted only if returned policy/build evidence changes
   the next question. The final reports blockers, not the MCP tool ledger.
4. Raw REST payloads, access tokens, and approval explanations never enter the
   public Timeline or session history.

### TS-03 — PR remediation with remote-write approval and resume

**User role:** Release engineer who explicitly wants a pipeline run.

**Prompt:**

```text
Check PR 42 policy failures and, if the configured pipeline is the appropriate remediation, ask before queuing one run. Do not make any other remote changes.
```

**Expected Turn:**

1. Git/ADO evidence groups complete before the write decision.
2. The next narrative explains why a run is considered; `approval.requested`
   stays inside the same Working transcript and does not reset its timer.
3. Rejecting approval seals the Turn with a concise final reason. Approving it
   resumes the same Turn, emits a fresh action narrative, then shows a new
   actual pipeline group.
4. The final reports the queued run or failure summary; no duplicate
   `Planned evidence`, `Evidence collected`, or tool names are printed there.

### TS-04 — External documentation / web research through a connector

**User role:** Developer checking a time-sensitive integration constraint.

**Prompt:**

```text
Find the current Azure DevOps REST requirement for updating pull-request policies, compare it with this Project Link's intended workflow, and cite the source. Do not change configuration.
```

**Fixture:** a deterministic `web-research` MCP server returning source URL,
title, and bounded excerpt. Live internet is reserved for manual smoke tests.

**Expected Turn:**

1. The working narrative says the agent will verify an external requirement
   and compare it to Project Link context; it never invents a current rule.
2. The group has `connector.kind = "mcp"` and `connector.label = "Web research"`.
3. The final includes only the conclusion and source URL metadata; raw search
   page bodies and connector payloads remain in the command detail boundary.

### TS-05 — Failure, cancellation, reconnect, and history replay

**User role:** Developer interrupted during investigation.

**Prompt:**

```text
Trace why the selected Project Link's latest pipeline failed, then stop once the first actionable failure is verified.
```

**Expected Turn:**

1. Slow narrator shows only the transient model-wait state after its timeout;
   it never creates a fake public plan.
2. Tool failure produces a subsequent evidence-based narrative or a concise
   failure conclusion, not a blind retry.
3. Cancel/reconnect preserve `turnId`, elapsed time, sequence ordering, and
   independent Turn state. Restored historical Working sections begin
   collapsed.

## Automated coverage mapping

| Requirement | Automated level |
| --- | --- |
| Git → narrative → Git ordering | `ChatPlanner` and desktop transcript reducer |
| Mixed Git/MCP/approval/Final event order | daemon `chatSse` projection and desktop transcript reducer |
| MCP protocol, read/write risk policy | core `mcpTools` and capability tests |
| Azure DevOps native tool semantics | core ADO registry/client tests |
| Existing Project Link ADO MCP registration | currently disabled by design; covered as a compatibility gap, not claimed as live support |
| External web research | generic MCP transcript fixture; live search is manual-only until a bundled connector is introduced |
| Copy/time/automatic collapse | desktop component and Playwright desktop smoke tests |
