import { describe, expect, it } from "vitest";
import { AzureAuthenticationRequiredError, ToolError } from "@mergepilot/core";
import {
  isAdoPipelineWorkflowAction,
  isAdoPullRequestWorkflowAction,
  workflowActionFailureResponse,
  workflowActionAuthMode,
} from "../src/workflows/workflowActions.js";
import type { ChatWorkflowActionPayload } from "../src/routes/chat-workflow.routes.js";

describe("workflowActions", () => {
  it("classifies ADO workflow actions by domain", () => {
    expect(isAdoPullRequestWorkflowAction("inspect_pr_insight")).toBe(true);
    expect(isAdoPullRequestWorkflowAction("inspect_pipeline")).toBe(false);
    expect(isAdoPipelineWorkflowAction("trigger_pipeline")).toBe(true);
    expect(isAdoPipelineWorkflowAction("push_branch")).toBe(false);
  });

  it("maps OAuth failures to PR workflow diagnostics", () => {
    const failure = workflowActionFailureResponse(
      payload({ action: "inspect_pr_insight", adoPat: "" }),
      new AzureAuthenticationRequiredError("Azure DevOps OAuth token is unavailable. Sign in again."),
    );

    expect(workflowActionAuthMode(payload({ action: "inspect_pr_insight", adoPat: "" }))).toBe("oauth");
    expect(failure.httpStatus).toBe(401);
    expect(failure.body).toMatchObject({
      ok: false,
      action: "inspect_pr_insight",
      authMode: "oauth",
      authStatus: "oauth_unavailable",
      workflowState: {
        status: "failed",
        workflowKind: "pr",
        workflowPhase: "auth_required",
        currentStep: "Azure DevOps OAuth unavailable",
      },
    });
  });

  it("maps PAT failures to CI workflow diagnostics", () => {
    const failure = workflowActionFailureResponse(
      payload({ action: "trigger_pipeline", adoPat: "bad-token" }),
      new ToolError("ADO PAT was rejected with HTTP 401. Check the PAT value and scopes."),
    );

    expect(workflowActionAuthMode(payload({ action: "trigger_pipeline", adoPat: "bad-token" }))).toBe("pat");
    expect(failure.httpStatus).toBe(400);
    expect(failure.body).toMatchObject({
      ok: false,
      action: "trigger_pipeline",
      authMode: "pat",
      authStatus: "pat_invalid_or_missing_scope",
      workflowState: {
        status: "failed",
        workflowKind: "ci",
        workflowPhase: "auth_required",
        currentStep: "Azure DevOps PAT rejected",
      },
    });
  });
});

function payload(overrides: {
  action: ChatWorkflowActionPayload["action"];
  adoPat: string;
}): ChatWorkflowActionPayload {
  return {
    action: overrides.action,
    repoPath: process.cwd(),
    draft: false,
    paths: [],
    includeUnstaged: true,
    projectLink: {
      repoPath: process.cwd(),
      defaultBranch: "main",
      targetBranch: "main",
      adoOrgUrl: "https://dev.azure.com/demo-org",
      adoProject: "Agents",
      adoRepoName: "mergepilot",
      adoPat: overrides.adoPat,
      adoPipelineId: "12",
      adoPipelineName: "CI",
      adoMcpEnabled: false,
      adoMcpCommand: "",
      adoMcpAuthentication: "",
      adoMcpDomains: "repositories,pipelines,work-items",
      buildCommand: "",
      testCommand: "",
      ignoredGlobs: [],
    },
  };
}
