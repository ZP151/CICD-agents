# MergePilot Outcome Roadmap 2026

Status: Canonical
Planning model: sequential evidence-driven cycles, not fixed-date feature
commitments

## Strategic Outcome

Enable ADO developers and delivery owners to move from a work goal or blocker
to a verified Azure DevOps outcome with less investigation, less duplicated
state, and fewer unsafe actions.

## Previous Output Roadmap Versus Outcome Roadmap

| Previous output orientation | New outcome orientation |
| --- | --- |
| Build Review Queue | Help reviewers know when they must act without creating another PR list |
| Add automated review | Reduce time to a defensible review decision with evidence-bound findings |
| Build Pipelines page | Reduce time from failed run to trusted next action |
| Add Boards tools | Keep work-item state aligned with actual delivery evidence |
| Add environment UI | Make release approval evidence complete, current, and actionable |
| Add more MCP connectors | Safely access only the built-in capabilities required by the current goal |
| Improve Activity page | Make every mutation explainable and replayable without a primary audit workspace |

## Roadmap Sequence

### Outcome 0: One authoritative and safe execution path

Enable developers to understand and control every agent action so that later
ADO workflows can be trusted.

Measures:

- 100% of supported mutations use proposal → approval → execution →
  verification.
- No duplicate transcript or artifact rendering in new routes.
- User-visible Working state appears locally within 100 ms.
- Client overhead and Azure/model TTFT are measured separately.

Dependencies: none. This is the release gate for all other outcomes.

Cycle: [Cycle 00](cycles/cycle-00-reset-and-foundation.md)

### Outcome 1: Prove one complete delivery loop

Enable a developer to move one Work Item through PR creation and CI follow-up so
that MergePilot demonstrates cross-artifact value rather than isolated pages.

Measures:

- One real fixture completes Work Item → PR → CI → verified ADO update.
- Every relationship is traceable to an exact artifact revision.
- No manual copy/paste into ADO is required after user approval.
- Zero duplicate writes in retry and reconnect tests.

Dependencies: Outcome 0.

Cycle: [Cycle 01](cycles/cycle-01-workitem-pr-ci-slice.md)

### Outcome 2: Faster PR preparation and review decisions

Enable authors and reviewers to create, understand, and update PRs with less
repeated context reconstruction so that review cycle time decreases without
increasing low-value AI feedback.

Measures:

- Median time to prepare required PR fields.
- Median reviewer orientation and re-review time.
- Finding accept/edit/dismiss rate.
- Percentage of review actions blocked because evidence became stale.
- PR descriptions remaining current after later commits.

Dependencies: Outcomes 0 and 1.

Cycle: [Cycle 02](cycles/cycle-02-changes-lifecycle.md)

### Outcome 3: Faster CI failure recovery

Enable developers to classify supported CI failures and take the smallest
useful next action so that repeated log and diff investigation decreases.

Measures:

- Failure-to-classification P50/P95.
- Classification agreement with human resolution.
- Failure-to-verified-next-action time.
- Repeated incident aggregation rate.
- Incorrect rerun/retry recommendation rate.

Dependencies: Outcomes 0 and 1.

Cycle: [Cycle 03](cycles/cycle-03-delivery-ci-test.md)

### Outcome 4: Work state matches delivery reality

Enable developers and leads to identify and correct work-item drift so that
Boards reflects what has actually been implemented, reviewed, validated, and
delivered.

Measures:

- Percentage of active items with branch/PR/build traceability.
- Work-item drift detected and confirmed.
- Suggested refinement acceptance/edit rate.
- Time spent preparing progress updates.
- Incorrect state/priority recommendation rate.

Dependencies: delivery graph coverage from Outcomes 1–3.

Cycle: [Cycle 04](cycles/cycle-04-work-intelligence.md)

### Outcome 5: Release decisions use complete, current evidence

Enable release owners to understand pending change, checks, risk, and rollback
before approving deployment so that CD actions are faster and safer.

Measures:

- Environment traceability coverage.
- Readiness brief completeness.
- Time from approval request to decision.
- Stale approval prevention.
- Deployment action verification and rollback-plan accuracy.

Dependencies: CI/test evidence and action verification.

Cycle: [Cycle 05](cycles/cycle-05-deployment-readiness.md)

### Outcome 6: Repeatable pilot value

Enable pilot teams to adopt MergePilot safely and measure value so that product
investment decisions are based on usage and outcome evidence.

Measures:

- Weekly verified loops per active project.
- Supported-loop success and abandonment rates.
- Correction/reversal and support incident rates.
- Four-week retained active projects.
- At least two validated value propositions across target roles.

Dependencies: successful completion of at least two domain outcomes.

Cycle: [Cycle 06](cycles/cycle-06-product-hardening.md)

## Sequencing Rules

- Do not build broad Boards or CD UI before the minimal artifact graph and
  verified action path exist.
- Do not add more insight types; extend the canonical artifact analysis.
- Do not carry Review Queue storage into the new Changes workspace.
- Do not claim an outcome from unit tests alone; use a real isolated ADO fixture.
- If a cycle misses its metric without a clear quality problem, investigate the
  problem hypothesis before adding more features.

## Flexible Release Windows

- Foundation and first vertical slice: first two cycles.
- Changes and CI/test product wedge: following two cycles.
- Work and deployment expansion: next two cycles.
- Pilot hardening: after at least two end-to-end loops are reliable.

No date-based GA commitment is made until Cycle 01 proves verified write-back
and Cycle 03 proves useful CI classification on target-team failures.
