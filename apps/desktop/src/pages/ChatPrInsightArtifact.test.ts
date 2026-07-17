import { describe, expect, it } from "vitest";
import type { PrInsightArtifactRecord } from "../api.js";
import { prInsightArtifactRecordToMarkdown } from "./Chat.js";

function artifact(): PrInsightArtifactRecord {
  return {
    id: "project-link-1/demo/42/review_run/2026-06-13T00%3A00%3A00.000Z",
    projectLinkId: "project-link-1",
    repository: "demo",
    pullRequestId: 42,
    title: "Improve PR insight",
    kind: "review_run",
    at: "2026-06-13T00:00:00.000Z",
    summary: "Readiness is blocked by CI and policy.",
    readiness: "blocked",
    decisionQueue: "blocked",
    decisionRiskLevel: "high",
    contextConfidence: "high",
    risks: ["Failed CI", "Required policy failed"],
    signals: {
      fileCount: 4,
      threadCount: 1,
      failedBuildCount: 1,
      failedPolicyCount: 1,
      workItemCount: 1,
      buildBlockers: [{
        id: 77,
        buildNumber: "20260610.1",
        definitionName: "CI",
        status: "completed",
        result: "failed",
        url: "https://ado/build/77",
      }],
      policyBlockers: [{
        id: "policy-1",
        name: "Minimum reviewers",
        typeName: "Reviewer policy",
        status: "failed",
        isBlocking: true,
      }],
      activeThreads: [{
        id: 5,
        status: 1,
        author: "Ada",
        firstComment: "Needs tests",
      }],
      linkedWorkItems: [{
        id: 123,
        type: "User Story",
        title: "Improve agent insight",
        state: "Active",
        url: "https://ado/workItems/123",
      }],
    },
    tokensIn: 100,
    tokensOut: 30,
  };
}

describe("prInsightArtifactRecordToMarkdown", () => {
  it("includes structured blocker metadata for saved PR insight workspaces", () => {
    const markdown = prInsightArtifactRecordToMarkdown(artifact());

    expect(markdown).toContain("- Failed policies: 1");
    expect(markdown).toContain("### Build blockers");
    expect(markdown).toContain("- #77 20260610.1 CI: failed (https://ado/build/77)");
    expect(markdown).toContain("### Policy blockers");
    expect(markdown).toContain("- Minimum reviewers: failed (blocking)");
    expect(markdown).toContain("### Active threads");
    expect(markdown).toContain("- #5 Ada: Needs tests");
    expect(markdown).toContain("### Linked work items");
    expect(markdown).toContain("- #123 User Story [Active]: Improve agent insight (https://ado/workItems/123)");
  });

  it("uses readable unavailable labels for missing saved insight metadata", () => {
    const markdown = prInsightArtifactRecordToMarkdown({
      ...artifact(),
      readiness: undefined,
      decisionQueue: undefined,
      decisionRiskLevel: undefined,
      contextConfidence: "",
      signals: {
        fileCount: 1,
        threadCount: 0,
        failedBuildCount: 1,
        failedPolicyCount: 0,
        workItemCount: 0,
        buildBlockers: [
          {
            id: 88,
            buildNumber: "",
            definitionName: "CI",
            status: "",
            result: "",
            url: "",
          },
        ],
      },
    });

    expect(markdown).toContain("| Readiness | Not available |");
    expect(markdown).toContain("| Decision queue | Not available |");
    expect(markdown).toContain("| Risk | Not available |");
    expect(markdown).toContain("| Confidence | Not available |");
    expect(markdown).toContain("- #88 CI: Not available");
    expect(markdown).not.toContain("unknown");
  });
});
