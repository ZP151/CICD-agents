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

  it("uses a failed run as the golden failure artifact even when a newer run was canceled", () => {
    const artifacts = pipelineFailureArtifacts(
      117,
      [
        pipelineRun({ id: 4666, name: "20260705.2", state: "completed", result: "canceled", sourceBranch: "refs/heads/main" }),
        pipelineRun({ id: 4665, name: "20260705.1", state: "completed", result: "failed", sourceBranch: "refs/heads/main" }),
      ],
      failedTimelineFixture(4665),
      [failedLogExcerptFixture(4665)],
    );
    const content = artifacts[0]?.content ?? "";

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.artifactId).toBe("pipeline-117-run-4665-failed");
    expect(artifacts[0]?.title).toBe("Pipeline #117 run #4665 failure");
    expect(content).toContain("# Pipeline #117 failure");
    expect(content).toContain("| Pipeline | #117 |");
    expect(content).toContain("| Run | #4665 |");
    expect(content).toContain("## Recent failed or canceled runs");
    expect(content).toContain("- #4666 20260705.2 refs/heads/main: completed/canceled");
    expect(content).toContain("- #4665 20260705.1 refs/heads/main: completed/failed");
    expect(content).toContain("VSBuild");
    expect(content).toContain("images\\Gojek\\.DS_Store");
    expect(content).toContain("Microsoft.Web.Publishing.targets");
    expect(content).toContain("## Failure classification");
    expect(content).toContain("Classification: Likely source/configuration failure");
    expect(content).toContain("Recommended response: Inspect the referenced files/configuration and run focused local validation before committing a fix.");
    expect(content).toContain("Candidate next actions:");
    expect(content).toContain("- Analyze pipeline failure");
    expect(content).toContain("- Trigger pipeline rerun");
    expect(content).toContain("- Run focused local validation");
  });

  it("uses readable fallbacks when pipeline run metadata is incomplete", () => {
    const runs = [
      pipelineRun({
        id: undefined as unknown as number,
        name: "",
        state: "",
        result: "failed",
        sourceBranch: "",
        createdDate: "",
        finishedDate: "",
        url: "",
      }),
    ];
    const timeline: AzureBuildTimelineSummary = {
      buildId: 0,
      failedRecords: [
        {
          id: "",
          parentId: "",
          type: "",
          name: "",
          state: "",
          result: "failed",
          startTime: "",
          finishTime: "",
          logId: 0,
          logUrl: "",
          issues: [],
        },
      ],
      errorIssues: [],
      warningIssues: [],
    };

    const summary = summarizePipelineRuns(117, runs, timeline, []);
    const artifactContent = pipelineFailureArtifacts(117, runs, timeline, [])[0]?.content ?? "";
    const combined = `${summary}\n${artifactContent}`;

    expect(combined).toContain("Pipeline #117 latest run #not available run: not available/failed.");
    expect(combined).toContain("branch not available");
    expect(combined).toContain("not available");
    expect(combined).toContain("Classification: Unclassified failure");
    expect(combined).not.toContain("unknown branch");
    expect(combined).not.toContain("Unknown failure class");
    expect(combined).not.toMatch(/\bunknown\b/i);
  });

  it("redacts secrets from pipeline summaries and failure artifacts", () => {
    const runs = [
      pipelineRun({
        id: 700,
        name: "CI with secret URL",
        result: "failed",
        url: "https://mergepilot:supersecret@dev.azure.com/org/project/_build/results?buildId=700",
      }),
    ];
    const timeline: AzureBuildTimelineSummary = {
      buildId: 700,
      failedRecords: [
        {
          id: "task-secret",
          parentId: "",
          type: "Task",
          name: "Publish package",
          state: "completed",
          result: "failed",
          startTime: "",
          finishTime: "",
          logId: 91,
          logUrl: "https://dev.azure.com/org/project/_build/results?buildId=700&view=logs&j=91",
          issues: [
            {
              type: "error",
              category: "Build",
              message: "Publish failed with api_key=rawpipelinekey123 and token=rawpipelinetoken123",
            },
          ],
        },
      ],
      errorIssues: [
        {
          type: "error",
          category: "Build",
          message: "Authorization: Bearer rawbearertoken123456",
        },
      ],
      warningIssues: [],
    };
    const excerpts: AzureBuildLogExcerpt[] = [
      {
        buildId: 700,
        logId: 91,
        lineCount: 10,
        startLine: 1,
        endLine: 10,
        excerpt: [
          "##[error]Deployment failed",
          "api_key=rawlogapikey123456",
          "client_secret=rawclientsecret123456",
          "Authorization: Bearer rawlogbearer123456",
          "https://mergepilot:password123@dev.azure.com/org/project",
        ].join("\n"),
        truncated: false,
        url: "https://dev.azure.com/org/project/_build/results?buildId=700&view=logs&j=91",
      },
    ];

    const summary = summarizePipelineRuns(117, runs, timeline, excerpts);
    const artifactContent = pipelineFailureArtifacts(117, runs, timeline, excerpts)[0]?.content ?? "";
    const combined = `${summary}\n${artifactContent}`;

    expect(combined).toContain("***REDACTED***");
    expect(combined).not.toContain("rawpipelinekey123");
    expect(combined).not.toContain("rawpipelinetoken123");
    expect(combined).not.toContain("rawbearertoken123456");
    expect(combined).not.toContain("rawlogapikey123456");
    expect(combined).not.toContain("rawclientsecret123456");
    expect(combined).not.toContain("rawlogbearer123456");
    expect(combined).not.toContain("mergepilot:password123");
  });

  it("classifies transient infrastructure failures before recommending code changes", () => {
    const runs = [
      pipelineRun({
        id: 801,
        name: "CI transient infra",
        result: "failed",
      }),
    ];
    const timeline: AzureBuildTimelineSummary = {
      buildId: 801,
      failedRecords: [
        {
          id: "agent",
          parentId: "",
          type: "Task",
          name: "Initialize job",
          state: "completed",
          result: "failed",
          startTime: "",
          finishTime: "",
          logId: 21,
          logUrl: "https://dev.azure.com/org/project/_build/results?buildId=801&view=logs&j=21",
          issues: [
            {
              type: "error",
              category: "Agent",
              message: "Hosted agent became unavailable after a network timeout.",
            },
          ],
        },
      ],
      errorIssues: [
        {
          type: "error",
          category: "Agent",
          message: "Connection reset by peer while downloading package feed artifacts. Service unavailable 503.",
        },
      ],
      warningIssues: [],
    };
    const excerpts: AzureBuildLogExcerpt[] = [
      {
        buildId: 801,
        logId: 21,
        lineCount: 80,
        startLine: 20,
        endLine: 40,
        excerpt: [
          "##[error]The hosted agent lost communication with the server.",
          "npm package feed request failed: ETIMEDOUT service unavailable 503",
          "This error looks transient; retry the job.",
        ].join("\n"),
        truncated: true,
        url: "https://dev.azure.com/org/project/_build/results?buildId=801&view=logs&j=21",
      },
    ];

    const summary = summarizePipelineRuns(117, runs, timeline, excerpts);
    const artifactContent = pipelineFailureArtifacts(117, runs, timeline, excerpts)[0]?.content ?? "";

    expect(summary).toContain("Failure classification: Likely infrastructure/transient failure.");
    expect(artifactContent).toContain("Classification: Likely infrastructure/transient failure");
    expect(artifactContent).toContain("Recommended response: Prefer inspecting service health and preparing a rerun approval before proposing code changes.");
    expect(artifactContent).toContain("hosted agent lost communication");
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

function failedTimelineFixture(buildId: number): AzureBuildTimelineSummary {
  return {
    buildId,
    failedRecords: [
      {
        id: "vsbuild",
        parentId: "",
        type: "Task",
        name: "VSBuild",
        state: "completed",
        result: "failed",
        startTime: "",
        finishTime: "",
        logId: 5,
        logUrl: `https://dev.azure.com/org/project/_build/results?buildId=${buildId}&view=logs&j=5`,
        issues: [
          {
            type: "error",
            category: "Build",
            message:
              "Microsoft.Web.Publishing.targets(2672,5): Copying file images\\Gojek\\.DS_Store failed. Could not find file.",
          },
        ],
      },
    ],
    errorIssues: [
      {
        type: "error",
        category: "Build",
        message:
          "Microsoft.Web.Publishing.targets(2672,5): Copying file images\\Gojek\\.DS_Store failed.",
      },
    ],
    warningIssues: [],
  };
}

function failedLogExcerptFixture(buildId: number): AzureBuildLogExcerpt {
  return {
    buildId,
    logId: 5,
    lineCount: 300,
    startLine: 260,
    endLine: 280,
    excerpt:
      "C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\MSBuild\\Microsoft\\VisualStudio\\v17.0\\Web\\Microsoft.Web.Publishing.targets(2672,5): error : Copying file images\\Gojek\\.DS_Store failed. Could not find file.",
    truncated: true,
    url: `https://dev.azure.com/org/project/_build/results?buildId=${buildId}&view=logs&j=5`,
  };
}
