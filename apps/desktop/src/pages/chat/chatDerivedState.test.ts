import { describe, expect, it } from "vitest";
import type { ChatIndexStatus, ProjectLink } from "../../api.js";
import {
  branchListFromBubbles,
  conversationTitleFromBubbles,
  currentBranchFromBubbles,
  diffStatsFromBubbles,
  pendingApprovalFromBubbles,
  welcomeSuggestionsForProjectLink,
} from "./chatDerivedState.js";
import type { Bubble, WorkflowEventState } from "./chat.types.js";

function projectLink(overrides: Partial<ProjectLink> = {}): ProjectLink {
  return {
    id: "project-link-1",
    name: "Project Link",
    repoPath: "C:\\repo",
    defaultBranch: "main",
    targetBranch: "main",
    adoOrgUrl: "",
    adoProject: "",
    adoRepoName: "",
    adoPat: "",
    adoMcpEnabled: false,
    adoMcpCommand: "",
    adoMcpAuthentication: "",
    adoMcpDomains: "",
    projectTemplate: "",
    buildCommand: "",
    testCommand: "",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("chat derived state", () => {
  it("derives title, current branch, branch list, and diff stats from bubbles", () => {
    const bubbles: Bubble[] = [
      { id: "u1", kind: "user", text: "Review this very long branch change and summarize the important implementation risks please" },
      {
        id: "branches",
        kind: "tool",
        toolName: "git_branch_list",
        toolOk: true,
        toolResult: { stdout: "* feature/demo\nmain\nrelease" },
      },
      {
        id: "status",
        kind: "tool",
        toolName: "git_status",
        toolOk: true,
        toolResult: { stdout: "## feature/demo...origin/feature/demo\n M src/app.ts" },
      },
      {
        id: "diff",
        kind: "tool",
        toolName: "git_diff",
        toolOk: true,
        toolResult: {
          stdout: [
            "diff --git a/src/app.ts b/src/app.ts",
            "--- a/src/app.ts",
            "+++ b/src/app.ts",
            "@@ -1,2 +1,3 @@",
            " keep",
            "-old",
            "+new",
            "+extra",
          ].join("\n"),
        },
      },
    ];

    expect(conversationTitleFromBubbles(bubbles)).toBe("Review this very long branch change and summarize the i…");
    expect(currentBranchFromBubbles(bubbles)).toBe("feature/demo");
    expect(branchListFromBubbles(bubbles)).toEqual(["feature/demo", "main", "release"]);
    expect(diffStatsFromBubbles(bubbles)).toEqual({ files: 1, added: 2, removed: 1 });
  });

  it("derives welcome suggestions and pending approval priority", () => {
    const indexed: ChatIndexStatus = {
      repoPath: "C:\\repo",
      indexed: false,
      semanticReady: false,
      retrievalMode: "quick-scan",
      stats: {
        filesIndexed: 0,
        chunksIndexed: 0,
        chunksEmbedded: 0,
        chunksPendingEmbedding: 0,
      },
      summary: "",
    };
    const workflowState: WorkflowEventState = {
      status: "waiting_for_approval",
      currentStep: "Approve push",
      completedTools: [],
      pendingApproval: {
        id: "approval-1",
        riskLevel: "medium",
        explanation: "Push branch",
        action: {
          tool: "git_push",
          args: { branch: "main" },
          description: "Push branch",
        },
      },
    };

    expect(welcomeSuggestionsForProjectLink(projectLink({
      adoOrgUrl: "https://dev.azure.com/org",
      adoProject: "Project",
      adoRepoName: "Repo",
    }), indexed)).toEqual(expect.arrayContaining([
      "Understand this project",
      "Analyze PR insight for this repo",
      "Open Pipelines workspace",
      "Push and create PR",
    ]));
    expect(pendingApprovalFromBubbles([
      { id: "pending", kind: "pending_confirm", pendingStatus: "waiting", pendingTool: "git_add" },
    ], workflowState)).toBe(workflowState.pendingApproval);
  });
});
