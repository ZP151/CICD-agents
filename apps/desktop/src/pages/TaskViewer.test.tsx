import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PrInsightArtifactRecord } from "../api.js";
import { PrInsightReadinessBlockers } from "./TaskViewer.js";

function prInsightArtifact(
  overrides: Partial<PrInsightArtifactRecord> = {},
): PrInsightArtifactRecord {
  return {
    id: "project-link-1/demo/42/review_run/2026-06-13T00%3A00%3A00.000Z",
    projectLinkId: "project-link-1",
    repository: "demo",
    pullRequestId: 42,
    title: "Improve PR insight",
    kind: "review_run",
    at: "2026-06-13T00:00:00.000Z",
    summary: "Saved PR insight summary.",
    readiness: "blocked",
    risks: ["Failed CI"],
    tokensIn: 100,
    tokensOut: 30,
    ...overrides,
  };
}

describe("TaskViewer PR insight readiness blockers", () => {
  it("renders structured build, policy, thread, and work item blocker details", () => {
    const html = renderToStaticMarkup(
      <PrInsightReadinessBlockers
        item={prInsightArtifact({
          signals: {
            fileCount: 4,
            threadCount: 1,
            failedBuildCount: 1,
            failedPolicyCount: 1,
            workItemCount: 1,
            buildBlockers: [
              {
                id: 77,
                buildNumber: "20260610.1",
                definitionName: "CI",
                status: "completed",
                result: "failed",
                url: "https://ado/build/77",
              },
            ],
            policyBlockers: [
              {
                id: "policy-1",
                name: "Minimum reviewers",
                typeName: "Reviewer policy",
                status: "failed",
                isBlocking: true,
              },
            ],
            activeThreads: [
              {
                id: 5,
                status: 1,
                author: "Ada",
                firstComment: "Needs tests",
              },
            ],
            linkedWorkItems: [
              {
                id: 123,
                type: "User Story",
                title: "Improve agent insight",
                state: "Active",
                url: "https://ado/workItems/123",
              },
            ],
          },
        })}
      />,
    );

    expect(html).toContain("Readiness blockers");
    expect(html).toContain("Build blockers");
    expect(html).toContain("#77 20260610.1 CI: failed");
    expect(html).toContain("Policy blockers");
    expect(html).toContain("Minimum reviewers: failed (blocking)");
    expect(html).toContain("Active threads");
    expect(html).toContain("#5 Ada: Needs tests");
    expect(html).toContain("Linked work items");
    expect(html).toContain("#123 User Story [Active]: Improve agent insight");
  });

  it("renders nothing when no structured blocker metadata is available", () => {
    expect(renderToStaticMarkup(<PrInsightReadinessBlockers item={prInsightArtifact()} />)).toBe(
      "",
    );
  });
});
