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

### Outcome 7: Fast feedback is truthful and attributable

Enable developers to see prompt-specific, model-authored action narration
quickly while operators can distinguish application delay from Azure/model
delay, so performance work improves the product without hiding provider
behavior behind canned text.

Measures:

- Local Working state remains visible within 100 ms.
- First SSE, narrator-request start, first provider token, first public
  narrative, first tool start, and terminal timestamps are present for every
  measured Turn.
- Application-owned P50/P95 and provider-owned P50/P95 are reported separately.
- The 15-turn English ClaimBot_API fixture completes without fixed openings,
  empty narratives, truncated public notes, or duplicate action narration.
- Release verification accepts no manually enriched runtime metadata.

Dependencies: released v0.5.32 canonical Turn/Action runtime and evidence
ledger.

Cycle: [Cycle 07](cycles/cycle-07-truthful-latency-and-evidence.md)

### Outcome 8: Governed value survives real pilot variation

Enable pilot developers, reviewers, and delivery owners to complete supported
Git, Azure DevOps, built-in MCP, and web-research tasks against isolated
fixtures so that the product can be evaluated outside the development team's
happy path without creating another business-state model.

Measures:

- At least two external pilot users complete the primary read and governed
  write loops with no operator intervention beyond documented approval.
- A non-production deployment fixture proves readiness, approval, retry, and
  verification while production-like destructive actions remain disabled.
- Verified-loop completion, abandonment, correction, reversal, and support
  incidents are observable by workflow and role.
- Every remote write follows Proposal → Approval → Execution → Re-read →
  Verification and remains idempotent under reconnect/retry.

Dependencies: Outcome 7 measurement and evidence contracts.

Cycle: [Cycle 08](cycles/cycle-08-governed-pilot-expansion.md)

### Outcome 9: Release and adoption decisions are repeatable

Enable release owners and pilot sponsors to install, verify, support, and
evaluate MergePilot from signed, accessible artifacts so that continued
investment is based on reproducible operational and product evidence.

Measures:

- Windows release assets are signed and signature-verified, or the release is
  explicitly blocked rather than silently published unsigned.
- CI and release workflows run on supported action runtimes without deprecation
  annotations.
- Clean install, upgrade, rollback guidance, diagnostics export, and artifact
  provenance pass from a pristine worktree.
- Keyboard, screen-reader, narrow-window, and visual acceptance checkpoints
  pass; visual acceptance is performed by a human or multimodal reviewer.
- Pilot retention and validated-value-proposition evidence supports an explicit
  continue/change/stop decision.

Dependencies: Outcomes 7 and 8.

Cycle: [Cycle 09](cycles/cycle-09-release-confidence-and-adoption.md)

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
- Truthful latency and deterministic evidence: immediately after v0.5.32.
- Governed external pilot expansion: after the Cycle 07 trace and verifier
  contracts are stable.
- Signed release confidence and adoption decision: after pilot tasks produce
  enough evidence to make the decision meaningful.

No date-based GA commitment is made until Cycle 01 proves verified write-back
and Cycle 03 proves useful CI classification on target-team failures.
