import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AzureAuthenticationRequiredError, resetSettingsForTests } from "@mergepilot/core";
import { buildApp, workflowActionFailureResponse } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-"));
  process.env.RUNTIME_DATA_DIR = tmp;
  process.env.RUNTIME_HOST = "127.0.0.1";
  process.env.RUNTIME_PORT = "0";
  process.env.AZURE_OPENAI_ENDPOINT = "";
  process.env.AZURE_OPENAI_API_KEY = "";
  process.env.AZURE_COSMOS_ENDPOINT = "";
  process.env.AZURE_STORAGE_ACCOUNT = "";
  process.env.AZURE_KEYVAULT_URL = "";
  resetSettingsForTests();
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (app) {
    await app.close();
    app = null;
  }
});

describe("daemon PR workflow routes", () => {
  it("checks PR policy and linked work items through latest active PR fallback", async () => {
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url =
        typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.includes("/_apis/git/repositories/mergepilot/pullrequests?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                pullRequestId: 42,
                title: "Improve agent",
                status: "active",
                sourceRefName: "refs/heads/feature/agent",
                targetRefName: "refs/heads/main",
                repository: { name: "mergepilot" },
                reviewers: [],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pullrequests/42?")) {
        return new Response(
          JSON.stringify({
            pullRequestId: 42,
            codeReviewId: 420,
            title: "Improve agent",
            sourceRefName: "refs/heads/feature/agent",
            targetRefName: "refs/heads/main",
            repository: { name: "mergepilot", project: { id: "project-guid", name: "Agents" } },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/policy/evaluations?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                evaluationId: "policy-1",
                status: "queued",
                configuration: {
                  id: 9,
                  isBlocking: true,
                  settings: { displayName: "Minimum reviewers" },
                  type: { displayName: "Reviewer policy" },
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pullrequests/42/workitems?")) {
        return new Response(
          JSON.stringify({
            value: [{ id: "123", url: "https://ado/workItems/123" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/wit/workitems?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 123,
                url: "https://ado/workItems/123",
                fields: {
                  "System.WorkItemType": "User Story",
                  "System.Title": "Improve agent insight",
                  "System.State": "Active",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });
    const profile = {
      repoPath: process.cwd(),
      defaultBranch: "main",
      targetBranch: "main",
      adoOrgUrl: "https://dev.azure.com/demo-org",
      adoProject: "Agents",
      adoRepoName: "mergepilot",
      adoPat: "test-pat",
    };

    const policy = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "check_pr_policy",
        repoPath: process.cwd(),
        profile,
      },
    });
    expect(policy.statusCode, policy.body).toBe(200);
    expect(policy.json()).toMatchObject({
      workflowState: { status: "done", workflowKind: "pr", workflowPhase: "policy_checked" },
    });
    expect(policy.json().summary).toContain("1 blocking");

    const workItems = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "list_pr_work_items",
        repoPath: process.cwd(),
        profile,
      },
    });
    expect(workItems.statusCode, workItems.body).toBe(200);
    expect(workItems.json()).toMatchObject({
      workflowState: { status: "done", workflowKind: "pr", workflowPhase: "work_items_listed" },
    });
    expect(workItems.json().summary).toContain("#123 User Story [Active]: Improve agent insight");
  });

  it("returns a clear failed workflow state when PR follow-up actions lack ADO mapping", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_pr_insight",
        repoPath: process.cwd(),
        projectLink: {
          repoPath: process.cwd(),
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "",
          adoProject: "",
          adoRepoName: "",
          adoPat: "",
        },
      },
    });

    expect(response.statusCode, response.body).toBe(500);
    expect(response.json()).toMatchObject({
      ok: false,
      action: "inspect_pr_insight",
      workflowState: {
        status: "failed",
        currentStep: "Workflow action failed",
      },
    });
    expect(response.json().summary).toContain(
      "Project Link is missing Azure DevOps organization URL, ADO project, ADO repository",
    );
    expect(response.json().summary).toContain("before PR workflow actions can run");
  });

  it("returns structured OAuth diagnostics for PR workflow action auth failures", () => {
    const failure = workflowActionFailureResponse(
      {
        action: "inspect_pr_insight",
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
          adoPat: "",
          adoPipelineId: "",
          adoPipelineName: "",
          adoMcpEnabled: false,
          adoMcpCommand: "",
          adoMcpAuthentication: "",
          adoMcpDomains: "repositories,pipelines,work-items",
          buildCommand: "",
          testCommand: "",
        },
      },
      new AzureAuthenticationRequiredError(
        "Azure DevOps OAuth token is unavailable for the signed-in account. Sign in again with the account that has Azure DevOps access, then retry Azure DevOps consent.",
      ),
    );

    expect(failure.httpStatus).toBe(401);
    expect(failure.body).toMatchObject({
      ok: false,
      action: "inspect_pr_insight",
      authMode: "oauth",
      authStatus: "oauth_unavailable",
      retryable: true,
      workflowState: {
        status: "failed",
        workflowKind: "pr",
        workflowPhase: "auth_required",
        currentStep: "Azure DevOps OAuth unavailable",
        authMode: "oauth",
        authStatus: "oauth_unavailable",
        retryable: true,
      },
    });
    expect(failure.body.authMessage).toContain(
      "Sign in again with the account that has Azure DevOps access",
    );
    expect(failure.body.authMessage).not.toContain("PAT fallback");
  });
});
