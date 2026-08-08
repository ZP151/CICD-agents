# Delivery Graph And Verified Action Runtime

Status: Target architecture

## Goal

Represent the minimum set of delivery facts needed to connect planning, code,
review, validation, and deployment without creating a second system of record.
Use that graph to produce evidence-backed proposals and verify actions written
to Azure DevOps.

## Architectural Principle

```text
Azure DevOps + local repository
  → immutable/versioned observations
  → canonical artifact snapshots
  → delivery relationships
  → deterministic detectors
  → model synthesis
  → proposed action
  → policy and user approval
  → ADO MCP/REST write-back
  → authoritative re-read
  → verification and audit
```

The model never writes directly to ADO. It can only propose a typed action.

## Canonical Artifact Identities

```ts
type ArtifactRef =
  | { kind: "work_item"; projectLinkId: string; id: number; revision: number }
  | { kind: "branch"; projectLinkId: string; repositoryId: string; name: string; objectId: string }
  | { kind: "commit"; projectLinkId: string; repositoryId: string; commitId: string }
  | { kind: "pull_request"; projectLinkId: string; repositoryId: string; id: number; sourceCommit: string; iterationId: number }
  | { kind: "build"; projectLinkId: string; definitionId: number; buildId: number }
  | { kind: "test_result"; projectLinkId: string; runId: number; resultId: number }
  | { kind: "environment"; projectLinkId: string; environmentId: number }
  | { kind: "deployment"; projectLinkId: string; environmentId: number; deploymentId: number };
```

Revision is part of identity for an analysis result. A new revision does not
erase historical evidence; it invalidates actions based on the old revision.

## Delivery Relationships

```ts
type DeliveryEdgeKind =
  | "implements"
  | "parent_of"
  | "depends_on"
  | "contains_commit"
  | "proposed_by"
  | "validated_by"
  | "reviewed_by"
  | "built_by"
  | "tested_by"
  | "deployed_by"
  | "deployed_to"
  | "caused_by"
  | "followed_up_by";

interface DeliveryEdge {
  from: ArtifactRef;
  to: ArtifactRef;
  kind: DeliveryEdgeKind;
  source: "ado" | "git" | "derived";
  observedAt: number;
  evidenceUrl?: string;
}
```

An inferred edge must never be serialized as an ADO fact. Its `source` remains
`derived`, includes confidence, and is recomputed when inputs change.

## Observation And Snapshot Model

Proposed core modules:

```text
packages/core/src/delivery/
├─ artifactRef.ts
├─ observations.ts
├─ snapshotStore.ts
├─ deliveryEdges.ts
├─ freshness.ts
├─ detectors/
│  ├─ prReadiness.ts
│  ├─ workItemDrift.ts
│  ├─ pipelineFailure.ts
│  ├─ testQuality.ts
│  └─ deploymentReadiness.ts
├─ actions/
│  ├─ actionTypes.ts
│  ├─ actionPolicy.ts
│  ├─ actionExecutor.ts
│  └─ actionVerifier.ts
└─ audit.ts
```

ADO transport remains behind adapters:

```text
packages/core/src/ado/
├─ transport.ts
├─ restTransport.ts
├─ mcpTransport.ts
├─ artifactReaders.ts
└─ artifactWriters.ts
```

Existing internal ADO clients and tools can implement these ports. Upstream MCP
types must not escape into delivery-domain interfaces.

## Event Ingestion

Sources:

- Explicit user refresh.
- ADO Service Hooks for work item, PR, build, release, and approval events.
- Local Git changes that affect the selected Project Link.
- Recovery polling after offline time or missed hooks.

```ts
interface DeliveryObservationEvent {
  id: string;
  projectLinkId: string;
  artifact: ArtifactRef;
  eventType: string;
  observedAt: number;
  source: "service_hook" | "poll" | "user" | "local_git";
  correlationId?: string;
}
```

Service Hook delivery is at-least-once. Event IDs and artifact revisions must be
deduplicated. Hook payloads are hints; the runtime re-reads the artifact before
making a decision.

## Deterministic Versus Model Responsibilities

Deterministic:

- Artifact existence and revision.
- Work-item fields and links.
- PR status, reviewers, votes, policies, threads, and source commit.
- Build status, timeline, task result, and test result.
- Environment approvals/checks and deployment history.
- Local Git merge-base, commit range, changed files, and test execution result.
- Permission and action-policy evaluation.
- Verification after write-back.

Model-assisted:

- Intent and impact summary.
- Risk hypotheses.
- Failure classification when deterministic rules are insufficient.
- Proposed PR description, work-item content, comment, and next action.
- Evidence prioritization.

The UI labels facts, inferences, and recommendations separately.

## Proposed Action Contract

```ts
interface ProposedAction<TPayload = unknown> {
  id: string;
  turnId: string;
  projectLinkId: string;
  kind: string;
  target: ArtifactRef;
  basedOn: ArtifactRef[];
  payload: TPayload;
  risk: "low" | "medium" | "high" | "critical";
  reason: string;
  expectedResult: VerificationPredicate[];
  idempotencyKey: string;
  expiresAt: number;
}
```

Examples:

- Create PR from exact source and target object IDs.
- Update PR description if source commit is unchanged.
- Publish selected review comments against a PR iteration.
- Cast a reviewer vote if source commit and policy snapshot are unchanged.
- Queue a pipeline with exact definition, branch, and variables.
- Create a Bug linked to a build and failing test.
- Update a Work Item if its revision still matches.

## Approval And Execution

1. Re-read the target before presenting approval when freshness is uncertain.
2. Show exact target, payload, side effects, evidence, and expected result.
3. User approves the stored action, not a regenerated model action.
4. Executor validates identity, revision, permissions, and idempotency.
5. Transport performs the ADO operation.
6. Verifier re-reads the authoritative artifact until success, terminal
   contradiction, or timeout.
7. Audit records proposed, approved, executed, and verified states.

```ts
type ActionStatus =
  | "proposed"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "verifying"
  | "verified"
  | "rejected"
  | "stale"
  | "failed"
  | "cancelled";
```

HTTP success is not verification. For example, a work-item update is verified
when the returned/current revision contains the expected field or link; a
pipeline trigger is verified when a new run with the expected definition,
branch, and correlation is visible.

## Turn Integration

The canonical Turn timeline references delivery artifacts and actions:

```ts
type TurnPart =
  | NarrativePart
  | ToolGroupPart
  | EvidencePart
  | ApprovalPart
  | ArtifactLinkPart
  | FinalPart;
```

The Turn event log is presentation/runtime history. The delivery graph is
artifact truth and evidence. Neither is reconstructed from assistant prose.

## Persistence

Local SQLite stores:

- Project Link identities.
- Immutable observations and snapshot metadata.
- Derived edges and detector outputs.
- Turn events.
- Proposed actions, approvals, execution, and verification records.
- User feedback on recommendations.

Secrets, raw access tokens, and unredacted sensitive logs are excluded. Large
ADO content is cached with retention limits and content hashes.

## Migration

1. Add canonical artifact identities beside existing PR insight and pipeline
   records.
2. Write adapters from current PR/pipeline routes into snapshots.
3. Make new Changes and Delivery inspectors read snapshots.
4. Map current review operations and workflow actions to `ProposedAction`.
5. Add verification before declaring current actions complete.
6. Replace Review Queue storage with a derived `Your turn` projection.
7. Delete duplicate insight/artifact stores only after replay and parity tests.

## Architecture Acceptance

- A PR source update makes old review actions stale before execution.
- Replaying observations reconstructs the same current snapshot and views.
- Duplicate hook delivery does not duplicate actions or artifacts.
- Every mutation has approval, execution, and verification evidence.
- A generic MCP tool cannot bypass local risk policy.
- Disabling the model still permits deterministic artifact reading and status
  verification.
- No UI component directly calls an ADO writer.
