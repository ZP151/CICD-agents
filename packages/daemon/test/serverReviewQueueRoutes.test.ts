import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeEach(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-review-queue-"));
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

async function createProjectLink(adoRepoName = "ClaimBot_API"): Promise<string> {
  const response = await app!.inject({
    method: "POST",
    url: "/project-links",
    payload: {
      name: "ClaimBot API",
      repoPath: process.cwd(),
      targetBranch: "main",
      adoOrgUrl: "https://dev.azure.com/demo-org",
      adoProject: "Agents",
      adoRepoName,
      adoPat: "test-pat",
    },
  });
  expect(response.statusCode).toBe(201);
  return (response.json() as { id: string }).id;
}

function reviewHistoryPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pullRequestId: 2670,
    lastIterationId: 4,
    findingCount: 3,
    lastRunAt: "2026-07-07T02:16:32.000Z",
    sourceCommit: "0649066f311f",
    decisionQueue: "needs_human_review",
    decisionRiskLevel: "medium",
    decisionReason: "Warnings or policy-sensitive files need human review.",
    decisionReasonCodes: ["risk_medium", "context_whole_file_fallback"],
    contextConfidence: "low",
    autoApprovedAt: "",
    autoApprovalActor: "",
    discardedFindingCount: 0,
    hunkCoverageFiles: 0,
    wholeFileFallbackFiles: 2,
    changedHunkLines: 0,
    manualDisposition: "",
    manualDispositionAt: "",
    manualDispositionActor: "",
    manualDispositionNote: "",
    manualDispositionEvents: [],
    manualDispositionWriteBackAttempted: false,
    manualDispositionWriteBackOk: false,
    manualDispositionWriteBackError: "",
    manualDispositionWriteBackAt: "",
    manualDispositionWriteBackThreadId: "",
    manualDispositionWriteBackUrl: "",
    manualDispositionWriteBackEvents: [],
    ...overrides,
  };
}

describe("daemon review-queue routes", () => {
  it("lists local Review Queue history for the selected Project Link repository", async () => {
    app = await buildApp();
    const id = await createProjectLink();

    const blocked = await app.inject({
      method: "POST",
      url: `/project-links/${id}/review-history`,
      payload: reviewHistoryPayload({
        pullRequestId: 2671,
        lastRunAt: "2026-07-07T02:15:00.000Z",
        decisionQueue: "blocked",
        decisionRiskLevel: "high",
        decisionReason: "Blocking findings require a human.",
        decisionReasonCodes: ["risk_high"],
        findingCount: 4,
      }),
    });
    expect(blocked.statusCode).toBe(200);

    const needsReview = await app.inject({
      method: "POST",
      url: `/project-links/${id}/review-history`,
      payload: reviewHistoryPayload(),
    });
    expect(needsReview.statusCode).toBe(200);

    const queue = await app.inject({
      method: "GET",
      url: `/project-links/${id}/review-queue`,
    });

    expect(queue.statusCode).toBe(200);
    expect(queue.json()).toMatchObject({
      configured: false,
      storage: "local",
      items: [
        {
          repository: "ClaimBot_API",
          pullRequestId: 2671,
          decisionQueue: "blocked",
          decisionRiskLevel: "high",
          decisionReason: "Blocking findings require a human.",
        },
        {
          repository: "ClaimBot_API",
          pullRequestId: 2670,
          decisionQueue: "needs_human_review",
          decisionRiskLevel: "medium",
          wholeFileFallbackFiles: 2,
        },
      ],
    });
  });

  it("keeps Review Queue history scoped to the Project Link repository", async () => {
    app = await buildApp();
    const claimBotId = await createProjectLink("ClaimBot_API");
    const otherRepoId = await createProjectLink("OtherRepo");

    await app.inject({
      method: "POST",
      url: `/project-links/${claimBotId}/review-history`,
      payload: reviewHistoryPayload({ pullRequestId: 10 }),
    });
    await app.inject({
      method: "POST",
      url: `/project-links/${otherRepoId}/review-history`,
      payload: reviewHistoryPayload({ pullRequestId: 20 }),
    });

    const claimBotQueue = await app.inject({
      method: "GET",
      url: `/project-links/${claimBotId}/review-queue`,
    });
    const otherRepoQueue = await app.inject({
      method: "GET",
      url: `/project-links/${otherRepoId}/review-queue`,
    });

    expect(claimBotQueue.statusCode).toBe(200);
    expect((claimBotQueue.json() as { items: Array<{ pullRequestId: number }> }).items.map((item) => item.pullRequestId)).toEqual([10]);
    expect(otherRepoQueue.statusCode).toBe(200);
    expect((otherRepoQueue.json() as { items: Array<{ pullRequestId: number }> }).items.map((item) => item.pullRequestId)).toEqual([20]);
  });

  it("returns a not-found response for unknown Project Links", async () => {
    app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/project-links/missing-link/review-queue",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "project_link_not_found" });
  });
});
