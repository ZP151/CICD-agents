import { describe, expect, it } from "vitest";
import { deriveYourTurn, type YourTurnFacts } from "../src/index.js";

const pr = { kind: "pull_request" as const, projectLinkId: "pl-1", repositoryId: "repo-1", id: 42, sourceCommit: "abc123", iterationId: 1 };

function facts(overrides: Partial<YourTurnFacts> = {}): YourTurnFacts {
  return {
    pr,
    sourceCommit: "abc123",
    waitingReviewers: [],
    currentUserName: "Reviewer",
    authorRepliesOnUnresolvedThreads: false,
    policyFailing: false,
    buildState: "none",
    isAuthor: false,
    ...overrides,
  };
}

describe("your-turn projection", () => {
  it("flags a review request for the current user", () => {
    const signals = deriveYourTurn(facts({ waitingReviewers: ["Reviewer"] }));
    expect(signals.map((s) => s.kind)).toContain("reviewer_requested");
  });

  it("flags new commits after the last reviewed commit", () => {
    const signals = deriveYourTurn(facts({ lastReviewedCommit: "abc122" }));
    expect(signals.map((s) => s.kind)).toContain("source_changed");
  });

  it("flags author action required when CI fails", () => {
    const signals = deriveYourTurn(facts({ isAuthor: true, buildState: "failed" }));
    expect(signals.map((s) => s.kind)).toContain("author_action_required");
  });

  it("flags a stale vote when the source has not changed and the user already voted", () => {
    const signals = deriveYourTurn(facts({ lastReviewedCommit: "abc123", waitingReviewers: [] }));
    expect(signals.map((s) => s.kind)).toContain("vote_stale");
  });

  it("does not emit signals for a clean PR", () => {
    const signals = deriveYourTurn(facts({ waitingReviewers: [], policyFailing: false, buildState: "succeeded", isAuthor: false }));
    expect(signals).toHaveLength(0);
  });
});
