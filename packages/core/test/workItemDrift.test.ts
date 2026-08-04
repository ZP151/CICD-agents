import { describe, expect, it } from "vitest";
import { detectWorkItemDrift, type WorkItemDriftInput } from "../src/index.js";

const wi = { kind: "work_item" as const, projectLinkId: "pl-1", id: 101, revision: 3 };
const pr = { kind: "pull_request" as const, projectLinkId: "pl-1", repositoryId: "repo-1", id: 42, sourceCommit: "abc", iterationId: 1 };

function input(overrides: Partial<WorkItemDriftInput> = {}): WorkItemDriftInput {
  return {
    workItem: wi,
    state: "Active",
    activeStates: ["Active", "Committed", "In Progress"],
    ageMs: 1,
    linkedPullRequests: [],
    buildResults: [],
    comments: [],
    changedFiles: [],
    children: [],
    evidenceAgeMs: 86_400_000 * 7,
    ...overrides,
  };
}

describe("work item drift detector", () => {
  it("flags merged PR with an active state", () => {
    const findings = detectWorkItemDrift(input({ linkedPullRequests: [{ pr, merged: true }] }));
    expect(findings.map((f) => f.kind)).toContain("merged_but_active");
  });

  it("flags failing CI without a blocker comment", () => {
    const findings = detectWorkItemDrift(input({ buildResults: [{ result: "failed", buildNumber: "20260805.7" }] }));
    expect(findings.map((f) => f.kind)).toContain("ci_failing_without_comment");
  });

  it("does not flag failing CI when a blocker comment exists", () => {
    const findings = detectWorkItemDrift(input({ buildResults: [{ result: "failed", buildNumber: "20260805.7" }], comments: ["CI is failing; blocked"] }));
    expect(findings.map((f) => f.kind)).not.toContain("ci_failing_without_comment");
  });

  it("flags done items without merged PR or build evidence", () => {
    const findings = detectWorkItemDrift(input({ state: "Done", activeStates: ["Active"], linkedPullRequests: [{ pr, merged: false }] }));
    expect(findings.map((f) => f.kind)).toContain("done_but_incomplete");
  });

  it("flags stale active items without evidence", () => {
    const findings = detectWorkItemDrift(input({ ageMs: 86_400_000 * 10 }));
    expect(findings.map((f) => f.kind)).toContain("active_without_evidence");
  });

  it("reports acceptance criteria mismatch as a question", () => {
    const findings = detectWorkItemDrift(input({
      acceptanceCriteria: "Add tests and verify coverage",
      changedFiles: ["src/App.cs"],
    }));
    const mismatch = findings.find((f) => f.kind === "acceptance_criteria_mismatch");
    expect(mismatch?.question).toBe(true);
  });

  it("flags child work crossing iterations as a question", () => {
    const child = { kind: "work_item" as const, projectLinkId: "pl-1", id: 102, revision: 1 };
    const findings = detectWorkItemDrift(input({
      children: [{ workItem: child, iterationPath: "Sprint 30", parentIterationPath: "Sprint 29" }],
    }));
    expect(findings.map((f) => f.kind)).toContain("child_crosses_iteration");
  });
});
