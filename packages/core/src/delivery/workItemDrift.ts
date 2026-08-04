/**
 * Work-item drift detector (Cycle 04).
 *
 * Supported cases — each lists deterministic evidence and a proposed
 * follow-up; no global health score:
 * - PR merged but the item remains in an early active state.
 * - CI repeatedly failing with no item comment/blocker.
 * - Item marked done but its linked PR/build is incomplete.
 * - Item active without delivery evidence beyond an agreed age.
 * - Acceptance criteria materially disagree with the linked change
 *   (reported as a review question, never as fact).
 * - Child work crosses iterations unexpectedly.
 */
import type { ArtifactRef } from "./artifactRef.js";

export type DriftKind =
  | "merged_but_active"
  | "ci_failing_without_comment"
  | "done_but_incomplete"
  | "active_without_evidence"
  | "acceptance_criteria_mismatch"
  | "child_crosses_iteration";

export interface DriftFinding {
  kind: DriftKind;
  workItem: ArtifactRef & { kind: "work_item" };
  deterministicEvidence: string[];
  proposedFollowUp: string;
  /** True when the signal is a question for the user, not a fact. */
  question?: boolean;
}

export interface WorkItemDriftInput {
  workItem: ArtifactRef & { kind: "work_item" };
  state: string;
  /** Active states that are "early" (not done/closed). */
  activeStates: string[];
  ageMs: number;
  /** PR edges: { pr, merged } for linked PRs. */
  linkedPullRequests: Array<{ pr: ArtifactRef & { kind: "pull_request" }; merged: boolean }>;
  /** Build facts for the linked change. */
  buildResults: Array<{ result: string; buildNumber: string }>;
  /** Comments already present on the work item. */
  comments: string[];
  /** Acceptance criteria text (System.AcceptanceCriteria). */
  acceptanceCriteria?: string;
  /** Changed file paths of the linked change. */
  changedFiles: string[];
  /** Child work items: { id, iterationPath } — child crossing iterations. */
  children: Array<{ workItem: ArtifactRef & { kind: "work_item" }; iterationPath?: string; parentIterationPath?: string }>;
  /** Age after which an active item without evidence is flagged. */
  evidenceAgeMs: number;
}

export function detectWorkItemDrift(input: WorkItemDriftInput): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const isActive = input.activeStates.includes(input.state);
  const hasEvidence = input.linkedPullRequests.length > 0 || input.buildResults.length > 0;
  const merged = input.linkedPullRequests.find((entry) => entry.merged);

  if (merged && isActive) {
    findings.push({
      kind: "merged_but_active",
      workItem: input.workItem,
      deterministicEvidence: [
        `PR ${merged.pr.id} is merged`,
        `work item state is still "${input.state}"`,
      ],
      proposedFollowUp: "Propose a state transition to the completed state with a revision check.",
    });
  }

  const failingBuilds = input.buildResults.filter((build) => build.result === "failed");
  const hasFailureComment = input.comments.some((comment) => /blocked|failure|failing|ci/i.test(comment));
  if (failingBuilds.length > 0 && !hasFailureComment && isActive) {
    findings.push({
      kind: "ci_failing_without_comment",
      workItem: input.workItem,
      deterministicEvidence: failingBuilds.map((build) => `build ${build.buildNumber} failed`),
      proposedFollowUp: "Propose a blocker comment on the work item or a Bug linked to the failing build.",
    });
  }

  const done = !isActive;
  const incomplete = merged === undefined
    || input.buildResults.some((build) => build.result === "failed")
    || input.buildResults.length === 0;
  if (done && incomplete) {
    findings.push({
      kind: "done_but_incomplete",
      workItem: input.workItem,
      deterministicEvidence: [
        merged ? `PR ${merged.pr.id} merged` : "no linked PR is merged",
        input.buildResults.length > 0
          ? `builds: ${input.buildResults.map((build) => build.result).join(", ")}`
          : "no linked build evidence",
      ],
      proposedFollowUp: "Review the item's completed state against the incomplete delivery evidence.",
    });
  }

  if (isActive && !hasEvidence && input.ageMs > input.evidenceAgeMs) {
    findings.push({
      kind: "active_without_evidence",
      workItem: input.workItem,
      deterministicEvidence: [
        `active for ${Math.round(input.ageMs / 86_400_000)} days without linked branch/PR/build evidence`,
      ],
      proposedFollowUp: "Ask whether the item is still in scope or needs a linked change.",
    });
  }

  if (input.acceptanceCriteria && input.acceptanceCriteria.trim()) {
    const criteria = input.acceptanceCriteria.toLowerCase();
    const mentionsCoverage = /test|coverage|verify/.test(criteria);
    const hasTests = input.changedFiles.some((file) => /test|spec/i.test(file));
    if (mentionsCoverage && !hasTests && input.changedFiles.length > 0) {
      findings.push({
        kind: "acceptance_criteria_mismatch",
        workItem: input.workItem,
        deterministicEvidence: [
          "acceptance criteria mention tests/coverage",
          "linked change contains no test files",
        ],
        proposedFollowUp: "Ask the author whether tests are expected for this change.",
        question: true,
      });
    }
  }

  for (const child of input.children) {
    const parent = child.parentIterationPath;
    if (parent && child.iterationPath && child.iterationPath !== parent) {
      findings.push({
        kind: "child_crosses_iteration",
        workItem: child.workItem,
        deterministicEvidence: [
          `child iteration "${child.iterationPath}" differs from parent "${parent}"`,
        ],
        proposedFollowUp: "Confirm the child belongs to another iteration.",
        question: true,
      });
    }
  }

  return findings;
}
