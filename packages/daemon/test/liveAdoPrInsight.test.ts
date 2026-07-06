import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

const LIVE_ADO = process.env.MERGEPILOT_E2E_LIVE_ADO === "1";
const ORG_URL = process.env.MERGEPILOT_E2E_ADO_ORG_URL || "https://tebssg.visualstudio.com/";
const PROJECT = process.env.MERGEPILOT_E2E_ADO_PROJECT || "TeBS-ClaimBot";
const REPOSITORY = process.env.MERGEPILOT_E2E_ADO_REPOSITORY || "ClaimBot_API";
const PULL_REQUEST_ID = Number(process.env.MERGEPILOT_E2E_ADO_PR_ID || 2655);
const REPO_PATH =
  process.env.MERGEPILOT_E2E_REPO_PATH || "C:\\Users\\15492\\Develop\\ClaimBot_API Nov 2025\\ClaimBot_API";

const runLive = LIVE_ADO ? it : it.skip;
let app: Awaited<ReturnType<typeof buildApp>> | null = null;
let runtimeDataDir: string | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-live-pr-insight-"));
  runtimeDataDir = tmp;
  process.env.RUNTIME_DATA_DIR = tmp;
  process.env.RUNTIME_HOST = "127.0.0.1";
  process.env.RUNTIME_PORT = "0";
  process.env.AZURE_COSMOS_ENDPOINT = "";
  process.env.AZURE_STORAGE_ACCOUNT = "";
  process.env.AZURE_KEYVAULT_URL = "";
  resetSettingsForTests();
});

afterAll(() => {
  if (!runtimeDataDir) return;
  fs.rmSync(runtimeDataDir, { recursive: true, force: true });
  runtimeDataDir = null;
});

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

describe("live Azure DevOps PR insight workflow", () => {
  runLive("inspects a real ClaimBot_API pull request without approval or mutation", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "inspect_pr_insight",
        repoPath: REPO_PATH,
        pullRequestId: PULL_REQUEST_ID,
        projectLink: {
          repoPath: REPO_PATH,
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: ORG_URL,
          adoProject: PROJECT,
          adoRepoName: REPOSITORY,
          adoPat: "",
          adoPipelineId: "117",
          adoPipelineName: "ClaimBot_API",
        },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as {
      ok: boolean;
      summary: string;
      workflowState: {
        status: string;
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: unknown;
        completedTools: string[];
      };
      tools: Array<{ name: string; stdout: string }>;
    };

    expect(body.ok).toBe(true);
    expect(body.workflowState).toMatchObject({
      status: "done",
      workflowKind: "pr",
      workflowPhase: "inspected",
    });
    expect(body.workflowState.pendingApproval).toBeUndefined();
    expect(body.workflowState.completedTools).toEqual(expect.arrayContaining([
      "ado_get_pull_request_by_id",
      "ado_list_pull_request_threads",
      "ado_get_pull_request_changes",
      "ado_pipelines_get_builds",
      "ado_list_pull_request_work_items",
      "ado_list_pull_request_policy_evaluations",
    ]));
    expect(body.summary).toContain(`PR #${PULL_REQUEST_ID}`);

    const changes = JSON.parse(
      body.tools.find((tool) => tool.name === "ado_get_pull_request_changes")?.stdout ?? "{}",
    ) as { fileCount?: number; changes?: Array<{ path?: string }> };
    expect(changes.fileCount ?? 0).toBeGreaterThan(0);
    expect((changes.changes ?? []).some((change) => Boolean(change.path))).toBe(true);
  }, 120_000);
});
