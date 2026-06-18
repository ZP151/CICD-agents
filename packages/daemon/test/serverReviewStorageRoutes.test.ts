import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-review-storage-"));
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

async function createProjectLink(name: string, adoRepoName: string): Promise<string> {
  const profile = await app!.inject({
    method: "POST",
    url: "/project-links",
    payload: {
      name,
      repoPath: process.cwd(),
      targetBranch: "main",
      adoOrgUrl: "https://dev.azure.com/demo-org",
      adoProject: "Agents",
      adoRepoName,
      adoPat: "test-pat",
    },
  });
  expect(profile.statusCode).toBe(201);
  const { id } = profile.json() as { id: string };
  return id;
}

describe("daemon review storage routes", () => {
  it("persists review disposition audit events without ADO write-back", async () => {
    app = await buildApp();
    const id = await createProjectLink("Disposition Link", "mergepilot-disposition");

    const disposition = await app.inject({
      method: "POST",
      url: `/project-links/${id}/review-disposition`,
      payload: {
        pullRequestId: 77,
        lastIterationId: 2,
        findingCount: 1,
        lastRunAt: "2026-06-11T00:00:00.000Z",
        sourceCommit: "abc123",
        decisionQueue: "blocked",
        decisionRiskLevel: "high",
        decisionReason: "Changes requested from Review Queue.",
        decisionReasonCodes: ["manual.changes_requested"],
        contextConfidence: "medium",
        autoApprovedAt: "",
        autoApprovalActor: "",
        discardedFindingCount: 0,
        hunkCoverageFiles: 1,
        wholeFileFallbackFiles: 0,
        changedHunkLines: 4,
        manualDisposition: "changes_requested",
        manualDispositionAt: "2026-06-11T00:01:00.000Z",
        manualDispositionActor: "desktop-user",
        manualDispositionNote: "Changes requested",
        manualDispositionEvents: [
          {
            disposition: "changes_requested",
            at: "2026-06-11T00:01:00.000Z",
            actor: "desktop-user",
            note: "Changes requested",
          },
        ],
        writeBackToAdo: false,
      },
    });
    expect(disposition.statusCode).toBe(200);
    expect(disposition.json()).toMatchObject({
      ok: true,
      adoWriteBack: { attempted: false, ok: false },
      record: {
        pullRequestId: 77,
        manualDisposition: "changes_requested",
        manualDispositionWriteBackAttempted: false,
        manualDispositionWriteBackOk: false,
        manualDispositionWriteBackError: "",
        manualDispositionWriteBackAt: "",
        manualDispositionWriteBackThreadId: "",
        manualDispositionWriteBackUrl: "",
        manualDispositionWriteBackEvents: [],
        manualDispositionEvents: [
          {
            disposition: "changes_requested",
            actor: "desktop-user",
            note: "Changes requested",
          },
        ],
      },
    });

    const queue = await app.inject({ method: "GET", url: `/project-links/${id}/review-queue` });
    expect(queue.statusCode).toBe(200);
    expect(queue.json()).toMatchObject({
      items: [
        {
          pullRequestId: 77,
          manualDisposition: "changes_requested",
          manualDispositionWriteBackAttempted: false,
          manualDispositionWriteBackOk: false,
          manualDispositionWriteBackEvents: [],
          manualDispositionEvents: [
            {
              disposition: "changes_requested",
              actor: "desktop-user",
              note: "Changes requested",
            },
          ],
        },
      ],
    });
  });

  it("persists and lists review operation activity for a Project Link repository", async () => {
    app = await buildApp();
    const id = await createProjectLink("Activity Link", "mergepilot-activity");

    const saved = await app.inject({
      method: "POST",
      url: `/project-links/${id}/review-operations`,
      payload: {
        kind: "rerun",
        at: "2026-06-11T00:00:00.000Z",
        pullRequestId: 88,
        actor: "desktop-user",
        label: "Rerun review",
        ok: true,
        details: "needs human review",
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      ok: true,
      storage: "local",
      record: {
        repository: "mergepilot-activity",
        pullRequestId: 88,
        kind: "rerun",
        label: "Rerun review",
      },
    });

    const reviewRun = await app.inject({
      method: "POST",
      url: `/project-links/${id}/review-operations`,
      payload: {
        kind: "review_run",
        at: "2026-06-11T00:01:00.000Z",
        pullRequestId: 88,
        actor: "desktop-user",
        label: "#88 Review run",
        ok: true,
        details: "queue=needs_human_review; risk=medium",
      },
    });
    expect(reviewRun.statusCode).toBe(200);
    expect(reviewRun.json()).toMatchObject({
      record: {
        repository: "mergepilot-activity",
        pullRequestId: 88,
        kind: "review_run",
        details: "queue=needs_human_review; risk=medium",
      },
    });

    const listed = await app.inject({ method: "GET", url: `/project-links/${id}/review-operations` });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      storage: "local",
      items: [
        {
          repository: "mergepilot-activity",
          pullRequestId: 88,
          kind: "review_run",
          ok: true,
        },
        {
          repository: "mergepilot-activity",
          pullRequestId: 88,
          kind: "rerun",
          ok: true,
        },
      ],
    });
  });

});
