import { describe, expect, it } from "vitest";
import { buildWorkflowPrInsight } from "../src/workflows/prWorkflow.js";

type PrInsightInput = Parameters<typeof buildWorkflowPrInsight>[0];

describe("prWorkflow", () => {
  it("summarizes blocked PR readiness from failed builds and blocking policies", () => {
    const insight = buildWorkflowPrInsight({
      pullRequest: {
        id: 42,
        title: "Harden validation",
        description: "",
      },
      changes: {
        fileCount: 2,
        changes: [
          { path: "/src/auth.ts" },
          { path: "/src/auth.test.ts" },
        ],
      },
      builds: [
        {
          id: 100,
          buildNumber: "20260618.1",
          definitionName: "CI",
          result: "failed",
          status: "completed",
        },
      ],
      policies: [
        {
          configurationId: 7,
          displayName: "Required reviewers",
          typeName: "Reviewer policy",
          status: "failed",
          isBlocking: true,
        },
      ],
      threads: [
        {
          id: 9,
          status: "active",
          comments: [{ content: "Please explain the auth fallback." }],
        },
      ],
      workItems: [],
    } as unknown as PrInsightInput);

    expect(insight.readiness).toBe("blocked");
    expect(insight.summary).toContain("Readiness: blocked");
    expect(insight.summary).toContain("Blocking builds: #100 20260618.1 CI: failed.");
    expect(insight.summary).toContain("Policy blockers: Required reviewers: failed (blocking).");
    expect(insight.summary).toContain("Risk signal: PR description is empty.");
    expect(insight.summary).toContain("Info: no linked work items were found.");
  });

  it("summarizes ready PR readiness when no blockers are present", () => {
    const insight = buildWorkflowPrInsight({
      pullRequest: {
        id: 77,
        title: "Refactor probe inventory",
        description: "Moves probe selection behind a workflow Module.",
      },
      changes: {
        fileCount: 1,
        changes: [{ path: "/packages/daemon/src/workflows/gitProbes.ts" }],
      },
      builds: [],
      policies: [],
      threads: [],
      workItems: [
        { id: 1234, type: "Task", state: "Active", title: "Improve agent workflow structure" },
      ],
    } as unknown as PrInsightInput);

    expect(insight.readiness).toBe("ready");
    expect(insight.summary).toContain("Readiness: ready");
    expect(insight.summary).toContain("Linked work items: #1234 Task [Active]: Improve agent workflow structure.");
  });

  it("uses readable build fallback wording when build status is missing", () => {
    const insight = buildWorkflowPrInsight({
      pullRequest: {
        id: 88,
        title: "Investigate failed pipeline",
        description: "Pipeline failed without a detailed result.",
      },
      changes: {
        fileCount: 1,
        changes: [{ path: "/azure-pipelines.yml" }],
      },
      builds: [
        {
          id: 101,
          buildNumber: "",
          definitionName: "",
          result: "failed",
          status: "",
        },
        {
          id: 102,
          buildNumber: "",
          definitionName: "",
          result: "",
          status: "failed",
        },
      ],
      policies: [],
      threads: [],
      workItems: [],
    } as unknown as PrInsightInput);

    expect(insight.summary).toContain("Blocking builds: #101: failed; #102: failed.");
    expect(insight.summary).toContain("#102: failed");
    expect(insight.summary).not.toContain("unknown");
  });
});
