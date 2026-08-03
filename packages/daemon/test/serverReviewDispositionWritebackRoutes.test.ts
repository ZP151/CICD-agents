import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-review-writeback-"));
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

describe("daemon review disposition ADO write-back routes", () => {
  it("writes blocking review dispositions back to Azure DevOps PR threads", async () => {
    app = await buildApp();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 123 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const id = await createProjectLink("Disposition Writeback Link", "mergepilot-writeback");

    const disposition = await app.inject({
      method: "POST",
      url: `/project-links/${id}/review-disposition`,
      payload: {
        pullRequestId: 88,
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
        manualDispositionNote: "Please address the Review Queue findings.",
        manualDispositionEvents: [
          {
            disposition: "changes_requested",
            at: "2026-06-11T00:01:00.000Z",
            actor: "desktop-user",
            note: "Please address the Review Queue findings.",
          },
        ],
        writeBackToAdo: true,
      },
    });

    expect(disposition.statusCode).toBe(200);
    expect(disposition.json()).toMatchObject({
      ok: true,
      adoWriteBack: { attempted: true, ok: true },
      record: {
        pullRequestId: 88,
        manualDispositionWriteBackAttempted: true,
        manualDispositionWriteBackOk: true,
        manualDispositionWriteBackError: "",
        manualDispositionWriteBackThreadId: "123",
        manualDispositionWriteBackUrl:
          "https://dev.azure.com/demo-org/Agents/_git/mergepilot-writeback/pullrequest/88?_a=files&discussionId=123",
        manualDispositionWriteBackEvents: [
          {
            disposition: "changes_requested",
            ok: true,
            actor: "desktop-user",
            note: "Please address the Review Queue findings.",
            error: "",
            threadId: "123",
            url: "https://dev.azure.com/demo-org/Agents/_git/mergepilot-writeback/pullrequest/88?_a=files&discussionId=123",
          },
        ],
      },
    });
    expect(disposition.json().record.manualDispositionWriteBackAt).toMatch(/^20/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain(
      "/Agents/_apis/git/repositories/mergepilot-writeback/pullRequests/88/threads",
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      status: 1,
      comments: [
        {
          commentType: 1,
          content: expect.stringContaining("Review Queue disposition: changes requested"),
        },
      ],
    });
  });

  it("records failed Azure DevOps disposition write-back attempts", async () => {
    app = await buildApp();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ADO unavailable", {
        status: 500,
        headers: { "content-type": "text/plain" },
      }),
    );
    const id = await createProjectLink(
      "Disposition Failed Writeback Link",
      "mergepilot-writeback-failure",
    );

    const disposition = await app.inject({
      method: "POST",
      url: `/project-links/${id}/review-disposition`,
      payload: {
        pullRequestId: 89,
        lastIterationId: 2,
        findingCount: 1,
        lastRunAt: "2026-06-11T00:00:00.000Z",
        sourceCommit: "abc123",
        decisionQueue: "blocked",
        decisionRiskLevel: "high",
        decisionReason: "Blocked from Review Queue.",
        decisionReasonCodes: ["manual.marked_blocked"],
        contextConfidence: "medium",
        autoApprovedAt: "",
        autoApprovalActor: "",
        discardedFindingCount: 0,
        hunkCoverageFiles: 1,
        wholeFileFallbackFiles: 0,
        changedHunkLines: 4,
        manualDisposition: "marked_blocked",
        manualDispositionAt: "2026-06-11T00:01:00.000Z",
        manualDispositionActor: "desktop-user",
        manualDispositionNote: "Do not merge until the deployment risk is resolved.",
        manualDispositionEvents: [
          {
            disposition: "marked_blocked",
            at: "2026-06-11T00:01:00.000Z",
            actor: "desktop-user",
            note: "Do not merge until the deployment risk is resolved.",
          },
        ],
        writeBackToAdo: true,
      },
    });

    expect(disposition.statusCode).toBe(200);
    expect(disposition.json()).toMatchObject({
      ok: true,
      adoWriteBack: {
        attempted: true,
        ok: false,
        error: expect.stringContaining("createThread failed: HTTP 500"),
      },
      record: {
        pullRequestId: 89,
        manualDispositionWriteBackAttempted: true,
        manualDispositionWriteBackOk: false,
        manualDispositionWriteBackError: expect.stringContaining("createThread failed: HTTP 500"),
        manualDispositionWriteBackThreadId: "",
        manualDispositionWriteBackUrl: "",
        manualDispositionWriteBackEvents: [
          {
            disposition: "marked_blocked",
            ok: false,
            actor: "desktop-user",
            note: "Do not merge until the deployment risk is resolved.",
            error: expect.stringContaining("createThread failed: HTTP 500"),
            threadId: "",
            url: "",
          },
        ],
      },
    });
    expect(disposition.json().record.manualDispositionWriteBackAt).toMatch(/^20/);
    expect(disposition.json().record.manualDispositionWriteBackEvents[0].at).toMatch(/^20/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const queue = await app.inject({ method: "GET", url: `/project-links/${id}/review-queue` });
    expect(queue.statusCode).toBe(200);
    expect(queue.json()).toMatchObject({
      items: [
        {
          pullRequestId: 89,
          manualDispositionWriteBackOk: false,
          manualDispositionWriteBackEvents: [
            {
              disposition: "marked_blocked",
              ok: false,
              error: expect.stringContaining("createThread failed: HTTP 500"),
            },
          ],
        },
      ],
    });
  });
});

describe("review disposition audit actor (MP-009/RA-041)", () => {
  it("replaces a client placeholder actor with the signed-in user identity", async () => {
    const { persistUserCache } = await import("@mergepilot/core");
    persistUserCache(
      { oid: "example-oid", name: "Ada Example", upn: "ada@example.test" },
      process.env.RUNTIME_DATA_DIR!,
    );
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const id = await createProjectLink("Actor Test Link", "example-repo");

    const disposition = await app.inject({
      method: "POST",
      url: `/project-links/${id}/review-disposition`,
      payload: {
        pullRequestId: 99,
        lastIterationId: 1,
        findingCount: 0,
        lastRunAt: "2026-08-03T00:00:00.000Z",
        sourceCommit: "",
        decisionQueue: "blocked",
        decisionRiskLevel: "high",
        decisionReason: "Requested changes.",
        decisionReasonCodes: ["manual.changes_requested"],
        contextConfidence: "medium",
        manualDisposition: "changes_requested",
        manualDispositionAt: "2026-08-03T00:01:00.000Z",
        manualDispositionActor: "desktop-user",
        manualDispositionNote: "Please address the findings.",
        writeBackToAdo: false,
      },
    });

    expect(disposition.statusCode).toBe(200);
    const record = disposition.json().record;
    expect(record.manualDispositionActor).toBe("Ada Example");
    expect(record.manualDispositionWriteBackAttempted).toBe(false);
  });
});
