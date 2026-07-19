import { afterEach, describe, expect, it, vi } from "vitest";
import { enableAzureDevOpsOAuth } from "./auth.js";
import { chatCheckpointActivityFromResponse, fetchChatCheckpointActivity, runChatWorkflowAction } from "./chat.js";
import { fetchHealth } from "./health.js";
import { listPipelineConnections, pipelineConnectionsFromResponse } from "./pipelines.js";
import {
  createProjectLink,
  discoverAdoProjectLinkOptions,
  migrateProjectLinksToCloud,
} from "./projectLinks.js";
import { fetchProjectLinkReviewQueue } from "./review.js";
import { configureDaemon, testLlmConfig } from "./settings.js";
import { fetchTask, fetchTasks, taskViewsFromResponse } from "./tasks.js";

function mockAuthFailure(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: "azure_auth_required",
          message: "Azure credential expired or missing. Please sign in again.",
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        },
      )
    ),
  );
}

function mockPlainTextFailure(message: string, status = 500): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(message, {
        status,
        headers: { "content-type": "text/plain" },
      })
    ),
  );
}

function mockEmptyFailure(status = 500): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response("", {
        status,
      })
    ),
  );
}

function mockWhitespaceFailure(status = 500): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response("   \n\t", {
        status,
        headers: { "content-type": "text/plain" },
      })
    ),
  );
}

function mockObjectErrorFailure(status = 400): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            message: "sessionId is required.",
          },
        }),
        {
          status,
          headers: { "content-type": "application/json" },
        },
      )
    ),
  );
}

async function expectNoInternalRoute(
  action: () => Promise<unknown>,
  hiddenFragments: string[],
): Promise<void> {
  await expect(action()).rejects.toThrow("Azure credential expired or missing. Please sign in again.");
  for (const fragment of hiddenFragments) {
    await expect(action()).rejects.not.toThrow(fragment);
  }
}

describe("user-facing API errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("formats workflow action auth errors without internal route noise", async () => {
    mockAuthFailure();

    await expectNoInternalRoute(
      () => runChatWorkflowAction("inspect_changes", "C:\\repo", "project-link-1"),
      ["/chat/workflow-action", "HTTP 401"],
    );
  });

  it("formats Project Link auth errors without internal route noise", async () => {
    mockAuthFailure();

    await expectNoInternalRoute(
      () =>
        createProjectLink({
          name: "ClaimBot_API link",
          repoPath: "C:\\repo",
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "https://tebssg.visualstudio.com/",
          adoProject: "TeBS-ClaimBot",
          adoRepoName: "ClaimBot_API",
          adoPat: "",
          adoPipelineId: "117",
          adoPipelineName: "ClaimBot_API",
          adoMcpEnabled: false,
          adoMcpCommand: "",
          adoMcpAuthentication: "",
          adoMcpDomains: "repositories,pipelines,work-items",
          projectTemplate: "",
          buildCommand: "",
          testCommand: "",
        }),
      ["/project-links", "createProjectLink", "HTTP 401"],
    );
  });

  it("formats Project Link discovery errors without internal route noise", async () => {
    mockAuthFailure();

    await expectNoInternalRoute(
      () =>
        discoverAdoProjectLinkOptions("projects", {
          name: "ClaimBot_API link",
          repoPath: "C:\\repo",
          adoOrgUrl: "https://tebssg.visualstudio.com/",
        }),
      ["/project-links/discover", "discover projects", "HTTP 401"],
    );
  });

  it("formats Project Link migration errors without internal route noise", async () => {
    mockEmptyFailure(500);

    await expect(migrateProjectLinksToCloud()).rejects.toThrow("Project Link migration failed.");
    await expect(migrateProjectLinksToCloud()).rejects.not.toThrow("/project-links/migrate");
    await expect(migrateProjectLinksToCloud()).rejects.not.toThrow("HTTP 500");
  });

  it("formats pipeline auth errors without internal route noise", async () => {
    mockAuthFailure();

    await expectNoInternalRoute(
      () => listPipelineConnections("project-link-1"),
      ["/pipeline-connections", "HTTP 401"],
    );
  });

  it("accepts pipeline connection collection responses from current and wrapped daemon shapes", () => {
    const connection = {
      id: "pipeline-1",
      projectLinkId: "project-link-1",
      pipelineId: "117",
      pipelineName: "ClaimBot_API",
      purpose: "ci" as const,
      isDefault: true,
      createdAt: 1,
      updatedAt: 1,
    };

    expect(pipelineConnectionsFromResponse([connection])).toEqual([connection]);
    expect(pipelineConnectionsFromResponse({ items: [connection] })).toEqual([connection]);
  });

  it("rejects malformed pipeline connection responses with a product error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(listPipelineConnections()).rejects.toThrow(
      "Pipeline connections could not be loaded",
    );
    await expect(listPipelineConnections()).rejects.not.toThrow("connections.filter");
  });

  it("formats Settings save errors without daemon route noise", async () => {
    mockPlainTextFailure("Key Vault permission denied.", 403);

    await expect(configureDaemon({ secretSource: "key_vault" })).rejects.toThrow(
      "Key Vault permission denied.",
    );
    await expect(configureDaemon({ secretSource: "key_vault" })).rejects.not.toThrow(
      "/daemon/configure",
    );
    await expect(configureDaemon({ secretSource: "key_vault" })).rejects.not.toThrow("HTTP 403");
  });

  it("formats Settings model test errors without daemon route noise", async () => {
    mockPlainTextFailure("Azure OpenAI endpoint rejected the request.", 400);

    await expect(
      testLlmConfig({
        llmProvider: "azure",
        azureEndpoint: "https://example.openai.azure.com",
        azureDeployment: "gpt-4o",
        azureApiVersion: "2024-08-01-preview",
      }),
    ).rejects.toThrow("Azure OpenAI endpoint rejected the request.");
    await expect(
      testLlmConfig({
        llmProvider: "azure",
        azureEndpoint: "https://example.openai.azure.com",
        azureDeployment: "gpt-4o",
        azureApiVersion: "2024-08-01-preview",
      }),
    ).rejects.not.toThrow("/daemon/test-llm");
  });

  it("formats Activity task errors without task route noise", async () => {
    mockPlainTextFailure("Activity service is unavailable.", 503);

    await expect(fetchTasks()).rejects.toThrow("Activity service is unavailable.");
    await expect(fetchTasks()).rejects.not.toThrow("/tasks");
    await expect(fetchTask("task-1")).rejects.toThrow("Activity service is unavailable.");
    await expect(fetchTask("task-1")).rejects.not.toThrow("/tasks/task-1");
  });

  it("accepts Git checkpoint collection responses from current and wrapped daemon shapes", () => {
    const checkpoint = {
      id: "checkpoint-1",
      sessionId: "chat_1",
      repoPath: "C:\\repo",
      at: 1,
      toolName: "git_add",
      toolSummary: "M README.md",
      toolOk: true,
      checkpointId: "git-1",
      checkpointPath: "C:\\Users\\15492\\.mergepilot\\checkpoints\\git-1.json",
    };

    expect(chatCheckpointActivityFromResponse([checkpoint])).toEqual([checkpoint]);
    expect(chatCheckpointActivityFromResponse({ items: [checkpoint] })).toEqual([checkpoint]);
  });

  it("rejects malformed Git checkpoint responses with a product error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(fetchChatCheckpointActivity()).rejects.toThrow(
      "Git checkpoints could not be loaded",
    );
    await expect(fetchChatCheckpointActivity()).rejects.not.toThrow("checkpointActivity.find");
  });

  it("accepts Activity run collection responses from current and wrapped daemon shapes", () => {
    const task = {
      id: "task-1",
      kind: "submit-pipeline",
      status: "succeeded",
      steps: [],
      result: {},
      error: "",
      createdAt: 1,
    };

    expect(taskViewsFromResponse([task])).toEqual([task]);
    expect(taskViewsFromResponse({ items: [task] })).toEqual([task]);
  });

  it("rejects malformed Activity run responses with a product error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(fetchTasks()).rejects.toThrow("Activity runs could not be loaded");
    await expect(fetchTasks()).rejects.not.toThrow("tasks.filter");
  });

  it("formats Review Queue cloud fallback warnings without Project Link route noise", async () => {
    mockEmptyFailure(503);

    const result = await fetchProjectLinkReviewQueue("project-link-1");

    expect(result.warning).toBe("Review history cloud storage is unavailable.");
    expect(result.warning).not.toContain("/project-links");
    expect(result.warning).not.toContain("HTTP 503");
  });

  it("formats daemon health errors without health route noise", async () => {
    mockEmptyFailure(503);

    await expect(fetchHealth()).rejects.toThrow("Daemon health failed.");
    await expect(fetchHealth()).rejects.not.toThrow("/healthz");
    await expect(fetchHealth()).rejects.not.toThrow("HTTP 503");
  });

  it("formats Azure DevOps OAuth fallback errors without protocol noise", async () => {
    mockPlainTextFailure("Azure DevOps sign-in failed.", 401);

    await expect(enableAzureDevOpsOAuth()).rejects.toThrow("Azure DevOps sign-in failed.");
    await expect(enableAzureDevOpsOAuth()).rejects.not.toThrow("ADO OAuth HTTP");
    await expect(enableAzureDevOpsOAuth()).rejects.not.toThrow("HTTP 401");
  });

  it("formats empty error bodies without leaking fallback HTTP status", async () => {
    mockEmptyFailure(500);

    await expect(fetchTasks()).rejects.toThrow("Activity runs failed.");
    await expect(fetchTasks()).rejects.not.toThrow("HTTP 500");
    await expect(
      runChatWorkflowAction("inspect_changes", "C:\\repo", "project-link-1"),
    ).rejects.toThrow("Workflow action failed.");
    await expect(
      runChatWorkflowAction("inspect_changes", "C:\\repo", "project-link-1"),
    ).rejects.not.toThrow("/chat/workflow-action");
    await expect(
      runChatWorkflowAction("inspect_changes", "C:\\repo", "project-link-1"),
    ).rejects.not.toThrow("HTTP 500");
  });

  it("formats whitespace-only error bodies as friendly fallback messages", async () => {
    mockWhitespaceFailure(502);

    await expect(fetchTasks()).rejects.toThrow("Activity runs failed.");
    await expect(fetchTasks()).rejects.not.toThrow("HTTP 502");
  });

  it("extracts nested JSON object error messages", async () => {
    mockObjectErrorFailure(400);

    await expect(
      runChatWorkflowAction("inspect_changes", "C:\\repo", "project-link-1"),
    ).rejects.toThrow("sessionId is required.");
    await expect(
      runChatWorkflowAction("inspect_changes", "C:\\repo", "project-link-1"),
    ).rejects.not.toThrow("[object Object]");
  });

  it("formats validation field errors without leaking Zod container names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: {
              formErrors: [],
              fieldErrors: {
                sessionId: ["Expected string, received null"],
                repoPath: ["Required"],
              },
            },
          }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          },
        )
      ),
    );

    await expect(
      runChatWorkflowAction("inspect_changes", "C:\\repo", "project-link-1"),
    ).rejects.toThrow("sessionId: Expected string, received null; repoPath: Required");
    await expect(
      runChatWorkflowAction("inspect_changes", "C:\\repo", "project-link-1"),
    ).rejects.not.toThrow("fieldErrors");
  });

  it("formats Project Link repo-path validation errors as product messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: "repo_path_not_git_repository",
            message: "Local repository path must be a valid Git repository.",
          }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          },
        )
      ),
    );

    await expect(
      createProjectLink({
        name: "Broken link",
        repoPath: "C:\\not-a-repo",
        defaultBranch: "main",
        targetBranch: "main",
        adoOrgUrl: "",
        adoProject: "",
        adoRepoName: "",
        adoPat: "",
        adoPipelineId: "",
        adoPipelineName: "",
        adoMcpEnabled: false,
        adoMcpCommand: "",
        adoMcpAuthentication: "",
        adoMcpDomains: "",
        projectTemplate: "",
        buildCommand: "",
        testCommand: "",
      }),
    ).rejects.toThrow("Local repository path must be a valid Git repository.");
    await expect(
      createProjectLink({
        name: "Broken link",
        repoPath: "C:\\not-a-repo",
        defaultBranch: "main",
        targetBranch: "main",
        adoOrgUrl: "",
        adoProject: "",
        adoRepoName: "",
        adoPat: "",
        adoPipelineId: "",
        adoPipelineName: "",
        adoMcpEnabled: false,
        adoMcpCommand: "",
        adoMcpAuthentication: "",
        adoMcpDomains: "",
        projectTemplate: "",
        buildCommand: "",
        testCommand: "",
      }),
    ).rejects.not.toThrow("repo_path_not_git_repository");
  });
});
