# Cycle 05 — Deployment Readiness

Expected window: 4 weeks
Primary objective: **Make deployment approval evidence complete, current, and actionable.**

## Product Outcome

A release owner can understand what will change in an environment, why the
deployment is or is not ready, which evidence is missing, and what safe action
to take. Any supported approval or deployment action is bound to the current
environment/run revision and verified in ADO.

## Entry Conditions

- Action proposal and verification are stable.
- CI/test evidence exists from Cycle 03.
- Work Item/PR/build graph coverage exists.
- ADO environment/deployment APIs and permissions have been validated against
  the target YAML pipeline model.

Classic Releases are evaluated separately and do not expand initial scope by
default.

## Baseline

- Time to assemble deployment contents and checks.
- Time from approval request to decision.
- Number of ADO pages opened.
- Missing commit/work-item/test traceability.
- Deployment retries, failed approvals, and rollbacks.

## Scope

### 1. Environment and deployment artifacts

Add:

- `EnvironmentRef`.
- `DeploymentRef`.
- Edges from build/commit/work item to deployment and environment.
- Current deployment, previous/last-good deployment, and pending deployment
  snapshots.

### 2. Readiness bundle

```ts
interface DeploymentReadiness {
  environment: EnvironmentRef;
  pendingDeployment?: DeploymentRef;
  currentDeployment?: DeploymentRef;
  lastGoodDeployment?: DeploymentRef;
  commits: CommitRef[];
  workItems: WorkItemRef[];
  pullRequests: PullRequestRef[];
  builds: BuildRef[];
  tests: TestFact[];
  checks: DeploymentCheck[];
  approvals: ApprovalFact[];
  openIncidents: ArtifactRef[];
  missingEvidence: string[];
  recommendation: "ready" | "wait" | "reject" | "insufficient_evidence";
}
```

### 3. Last-good comparison

- Compare commits and linked Work Items.
- Highlight database/schema/configuration/IaC changes where repository evidence
  supports it.
- Show test and CI changes.
- Identify open review findings or incidents associated with pending changes.
- Produce rollout considerations and a rollback candidate, not an invented
  rollback command.

### 4. Approval and checks

- Read manual approvals, business-hours/branch/check status, locks, and external
  checks supported by the target environment.
- Explain which check is blocking and who owns it.
- Do not claim readiness if required evidence cannot be read.
- Re-read immediately before presenting a critical approval action.

### 5. Controlled actions

Potentially supported after capability validation:

- Approve/reject a pending deployment approval.
- Retry/redeploy supported run/stage.
- Cancel a pending/running deployment.
- Trigger a rollback-compatible pipeline with exact parameters.
- Create/update incident or Work Item follow-up.

Production approval and rollback require critical confirmation. Unsupported
actions open the exact ADO page with the readiness evidence preserved.

### 6. Delivery UI

Add `Environments` view to Delivery:

- Environment name and current version.
- Pending action/check.
- Change count and traceability coverage.
- Readiness state and freshness.
- Inspector for full evidence/action.

Avoid a large environment dashboard. Prioritize`needs attention` and the next
decision.

## Required Avoidance

- No generic release health score.
- No automatic production approval.
- No generated rollback command without a tested pipeline/action contract.
- No Classic Release parity unless target users require it.
- No cloud-resource inventory or observability platform expansion.

## Test Fixtures

- Ready non-production deployment.
- Pending manual approval.
- Failed required check.
- Missing test evidence.
- Source build changes after readiness generation.
- Environment lock/concurrent deployment.
- Successful deployment.
- Failed deployment with last-good candidate.
- Permission denied for approval.
- Verification timeout.

## Tests

- Artifact/edge reconstruction and freshness.
- Approval/check mapping.
- Stale readiness and stale approval prevention.
- Critical action confirmation.
- Deployment action idempotency and verification.
- Missing-evidence behavior.
- ADO permission differences.
- Accessibility and evidence-source links.

## Metrics

- Traceability coverage.
- Time to readiness decision.
- Stale approval prevention.
- Verified deployment-action rate.
- Human override/correction.
- Rollback-plan usefulness and unsupported-action rate.

## Demo

1. Open a pending Test/Staging environment deployment.
2. Show pending Work Items, commits, PRs, CI/tests, and checks.
3. Compare with last successful deployment.
4. Approve after critical confirmation.
5. Verify the deployment state and environment history.
6. Demonstrate a stale proposal rejected after a new build appears.

## Non-goals

- Full release orchestration engine.
- Infrastructure provisioning.
- APM/incident replacement.
- Multi-cloud resource management.
- Autonomous rollback.

## Exit Evidence

- Real non-production environment scenario verifies end to end.
- Stale approval is prevented in an adversarial fixture.
- Production-like actions remain disabled until permissions and governance pass
  independent review.
