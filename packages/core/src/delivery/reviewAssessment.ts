/**
 * Canonical Review Assessment (Cycle 02).
 *
 * Replaces the preview/run/stored-insight/queue decision paths with one
 * projection bound to a PR source commit, iteration, policy snapshot and
 * coverage. A new PR revision marks the assessment stale; incremental
 * re-review re-evaluates previous findings against the new commit range and
 * surfaces only new or materially changed risks.
 */
import type { ReviewFinding } from "../review/types.js";
import type { ArtifactRef } from "./artifactRef.js";

export type ReviewRecommendation =
  | "approve"
  | "approve_with_suggestions"
  | "wait_for_author"
  | "reject"
  | "insufficient_evidence";

export interface ReviewAssessment {
  pr: ArtifactRef & { kind: "pull_request" };
  /** PR source commit this assessment was generated against. */
  sourceCommit: string;
  generatedAt: number;
  summary: string;
  changeMap: Array<{ area: string; files: string[]; risk: "low" | "medium" | "high" }>;
  findings: ReviewFinding[];
  /** Deterministic policy facts (branch policies, votes, build state). */
  policyFacts: Array<{ name: string; status: string; detail?: string }>;
  /** Deterministic test facts attached to the PR build. */
  testFacts: Array<{ name: string; status: string; detail?: string }>;
  recommendation: ReviewRecommendation;
  missingEvidence: string[];
  /** Max three high-value findings by default; nits suppressed. */
  findingLimit: number;
}

export function findingKey(finding: ReviewFinding): string {
  return `${finding.file}:${finding.line}:${finding.category}:${finding.message.slice(0, 80)}`;
}

export interface FindingVerdict {
  finding: ReviewFinding;
  verdict: "unchanged" | "stale" | "resolved";
  /** Why (line remapped, file changed, or message changed). */
  reason: string;
}

export interface IncrementalReReview {
  /** Previous findings that still apply to the current source commit. */
  reEvaluated: FindingVerdict[];
  /** Findings from the previous pass that no longer apply. */
  stale: FindingVerdict[];
  /** Risks present in the new pass but not in the previous assessment. */
  newRisks: ReviewFinding[];
  /** Files changed between the last-reviewed commit and now. */
  changedFiles: string[];
}

/**
 * Compare the previous assessment (bound to lastReviewedSourceCommit) with
 * the current full-pass findings. Line-based findings on changed files are
 * re-derived by the model pass; this comparator decides what to show without
 * duplicating the whole previous output.
 */
export function incrementalReReview(
  previous: Pick<ReviewAssessment, "findings" | "sourceCommit">,
  current: { sourceCommit: string; findings: ReviewFinding[]; changedFiles: string[] },
): IncrementalReReview {
  const previousKeys = new Map(previous.findings.map((finding) => [findingKey(finding), finding]));
  const currentKeys = new Set(current.findings.map(findingKey));
  const changed = new Set(current.changedFiles.map((file) => normalizePath(file)));

  const reEvaluated: FindingVerdict[] = [];
  const stale: FindingVerdict[] = [];
  for (const [key, finding] of previousKeys) {
    if (!currentKeys.has(key)) {
      const fileChanged = changed.has(normalizePath(finding.file));
      if (fileChanged) {
        reEvaluated.push({
          finding,
          verdict: "stale",
          reason: `file ${finding.file} changed after the last reviewed commit ${previous.sourceCommit.slice(0, 8)}`,
        });
      } else {
        stale.push({ finding, verdict: "resolved", reason: "no longer present in the current pass" });
      }
    } else {
      reEvaluated.push({ finding, verdict: "unchanged", reason: "still applies to the current source commit" });
    }
  }

  const newRisks = current.findings.filter((finding) => !previousKeys.has(findingKey(finding)));
  return { reEvaluated, stale, newRisks, changedFiles: current.changedFiles };
}

/** Default policy: at most three high-value findings. */
export function applyFindingLimit(
  findings: ReviewFinding[],
  limit = 3,
): { retained: ReviewFinding[]; suppressed: ReviewFinding[] } {
  const ranked = [...findings].sort((left, right) => severityRank(left) - severityRank(right));
  return {
    retained: ranked.slice(0, limit),
    suppressed: ranked.slice(limit),
  };
}

function severityRank(finding: ReviewFinding): number {
  if (finding.severity === "blocking") return 0;
  if (finding.severity === "warning") return 1;
  return 2;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}
