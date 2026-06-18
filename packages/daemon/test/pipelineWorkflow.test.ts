import { describe, expect, it } from "vitest";
import type { AzureBuildLogExcerpt, AzureBuildTimelineSummary, AzurePipelineRunSummary } from "@mergepilot/core";
import { pipelineFailureArtifacts, summarizePipelineRuns } from "../src/workflows/pipelineWorkflow.js";

describe("pipelineWorkflow", () => {
  it("summarizes latest run readiness and failed run counts", () => {
    const summary = summarizePipelineRuns(31, [
      pipelineRun({ id: 501, name: "CI 501", state: "completed", result: "failed", sourceBranch: "refs/heads/feature/a" }),
      pipelineRun({ id: 500, name: "CI 500", state: "completed", result: "succeeded", sourceBranch: "refs/heads/main" }),
      pipelineRun({ id: 499, name: "CI 499", state: "cancelling", result: "canceled", sourceBranch: "refs/heads/feature/b" }),
    ]);

    expect(summary).toContain("Pipeline #31 latest run #501 CI 501: completed/failed.");
    expect(summary).toContain("Recent runs: 3. Failed or canceled: 2.");
    expect(summary).toContain("- #500 CI 500 refs/heads/main: completed/succeeded");
  });

  it("builds a failure artifact with timeline evidence and log excerpts", () => {
    const artifacts = pipelineFailureArtifacts(
      31,
      [
        pipelineRun({ id: 501, name: "CI 501", state: "completed", result: "failed", sourceBranch: "refs/heads/feature/a" }),
      ],
      {
        buildId: 501,
        failedRecords: [
          {
            id: "task-1",
            parentId: "",
            type: "Task",
            name: "Run unit tests",
            state: "completed",
            result: "failed",
            startTime: "",
            finishTime: "",
            logId: 12,
            logUrl: "https://dev.azure.com/org/project/_build/results?buildId=501&view=logs&j=12",
            issues: [
              {
                type: "error",
                category: "Build",
                message: "Tests failed in ClaimControllerTests.ShouldAuthorizeReviewer",
              },
            ],
          },
        ],
        errorIssues: [
          {
            type: "error",
            category: "Build",
            message: "One or more tests failed.",
          },
        ],
        warningIssues: [],
      } satisfies AzureBuildTimelineSummary,
      [
        {
          buildId: 501,
          logId: 12,
          lineCount: 200,
          startLine: 120,
          endLine: 140,
          excerpt: "Expected reviewer to be authorized\nActual: forbidden",
          truncated: true,
          url: "https://dev.azure.com/org/project/_build/results?buildId=501&view=logs&j=12",
        } satisfies AzureBuildLogExcerpt,
      ],
    );

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.artifactId).toBe("pipeline-31-run-501-failed");
    expect(artifacts[0]?.content).toContain("## Failed timeline records");
    expect(artifacts[0]?.content).toContain("Run unit tests");
    expect(artifacts[0]?.content).toContain("ClaimControllerTests.ShouldAuthorizeReviewer");
    expect(artifacts[0]?.content).toContain("```text\nExpected reviewer to be authorized");
    expect(artifacts[0]?.content).toContain("## Recovery guidance");
  });
});

function pipelineRun(overrides: Partial<AzurePipelineRunSummary>): AzurePipelineRunSummary {
  return {
    id: 0,
    name: "CI",
    state: "completed",
    result: "succeeded",
    createdDate: "2026-06-18T00:00:00Z",
    finishedDate: "2026-06-18T00:05:00Z",
    sourceBranch: "refs/heads/main",
    url: "https://dev.azure.com/org/project/_build/results?buildId=1",
    ...overrides,
  };
}
