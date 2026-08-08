/**
 * Your-turn projection (Cycle 02).
 *
 * Derived purely from current ADO facts — never a second PR persistence
 * model. Attention signals: reviewer requested, author replied to an
 * unresolved thread, source branch changed, policy/build state changed,
 * vote became stale, author must respond or update.
 */
import type { ArtifactRef } from "./artifactRef.js";

export type YourTurnSignalKind =
  | "reviewer_requested"
  | "author_replied"
  | "source_changed"
  | "policy_changed"
  | "vote_stale"
  | "author_action_required";

export interface YourTurnSignal {
  kind: YourTurnSignalKind;
  pr: ArtifactRef & { kind: "pull_request" };
  detail: string;
}

export interface YourTurnFacts {
  pr: ArtifactRef & { kind: "pull_request" };
  /** Current source commit of the PR. */
  sourceCommit: string;
  /** Commit the current user last reviewed (empty = never). */
  lastReviewedCommit?: string;
  /** Reviewer display names with vote 0 (waiting). */
  waitingReviewers: string[];
  /** The authenticated user's display name. */
  currentUserName?: string;
  /** Threads where the author replied and the thread is unresolved. */
  authorRepliesOnUnresolvedThreads: boolean;
  /** Whether any branch policy evaluation is failing. */
  policyFailing: boolean;
  /** Build state: succeeded | failed | running | none. */
  buildState: "succeeded" | "failed" | "running" | "none";
  /** Whether the current user is the PR author. */
  isAuthor: boolean;
}

export function deriveYourTurn(facts: YourTurnFacts): YourTurnSignal[] {
  const signals: YourTurnSignal[] = [];
  const pr = facts.pr;

  if (facts.waitingReviewers.includes(facts.currentUserName ?? "")) {
    signals.push({
      kind: "reviewer_requested",
      pr,
      detail: `review requested from ${facts.currentUserName}`,
    });
  }

  if (!facts.isAuthor && facts.authorRepliesOnUnresolvedThreads) {
    signals.push({
      kind: "author_replied",
      pr,
      detail: "author replied on an unresolved thread",
    });
  }

  if (facts.lastReviewedCommit && facts.lastReviewedCommit !== facts.sourceCommit) {
    signals.push({
      kind: "source_changed",
      pr,
      detail: `new commits since ${facts.lastReviewedCommit.slice(0, 8)}`,
    });
  }

  if (facts.policyFailing) {
    signals.push({ kind: "policy_changed", pr, detail: "a branch policy is failing" });
  }

  if (facts.lastReviewedCommit && facts.sourceCommit === facts.lastReviewedCommit) {
    const myVotePending = facts.waitingReviewers.includes(facts.currentUserName ?? "");
    if (!myVotePending) {
      signals.push({ kind: "vote_stale", pr, detail: "vote may be stale after review changes" });
    }
  }

  if (facts.isAuthor && (facts.policyFailing || facts.buildState === "failed")) {
    signals.push({
      kind: "author_action_required",
      pr,
      detail: `author must respond: build ${facts.buildState}${facts.policyFailing ? ", policy failing" : ""}`,
    });
  }

  return signals;
}
