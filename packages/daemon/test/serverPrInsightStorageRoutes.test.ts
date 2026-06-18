import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-pr-insight-storage-"));
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
  const response = await app!.inject({
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
  expect(response.statusCode).toBe(201);
  const { id } = response.json() as { id: string };
  return id;
}

describe("daemon PR insight storage routes", () => {
  it("persists and lists PR insight artifacts for a Project Link repository", async () => {
    app = await buildApp();
    const id = await createProjectLink("Insight Link", "mergepilot-insights");

    const saved = await app.inject({
      method: "POST",
      url: `/project-links/${id}/pr-insights`,
      payload: {
        kind: "review_run",
        at: "2026-06-11T00:10:00.000Z",
        pullRequestId: 88,
        title: "#88 Review run",
        summary: "Full review summary.",
        readiness: "needs_attention",
        decisionQueue: "needs_human_review",
        decisionRiskLevel: "medium",
        contextConfidence: "high",
        iterationId: 5,
        sourceCommit: "abc123",
        risks: ["Missing tests"],
        categories: {
          blocking: [],
          warnings: ["Missing tests"],
          info: ["Small PR"],
        },
        signals: {
          fileCount: 4,
          threadCount: 1,
          failedBuildCount: 1,
          workItemCount: 1,
          failedPolicyCount: 1,
          buildBlockers: [
            {
              id: 77,
              buildNumber: "20260610.1",
              definitionName: "CI",
              status: "completed",
              result: "failed",
              url: "https://ado/build/77",
            },
          ],
          policyBlockers: [
            {
              id: "policy-1",
              name: "Minimum reviewers",
              typeName: "Reviewer policy",
              status: "failed",
              isBlocking: true,
            },
          ],
          activeThreads: [
            {
              id: 5,
              status: 1,
              author: "Ada",
              firstComment: "Needs tests",
            },
          ],
          linkedWorkItems: [
            {
              id: 123,
              type: "User Story",
              title: "Improve agent insight",
              state: "Active",
              url: "https://ado/workItems/123",
            },
          ],
        },
        findingCount: 2,
        discardedFindingCount: 1,
        tokensIn: 1000,
        tokensOut: 300,
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      ok: true,
      storage: "local",
      record: {
        projectLinkId: id,
        repository: "mergepilot-insights",
        pullRequestId: 88,
        kind: "review_run",
        summary: "Full review summary.",
        iterationId: 5,
        sourceCommit: "abc123",
        signals: {
          failedPolicyCount: 1,
          policyBlockers: [
            {
              name: "Minimum reviewers",
              status: "failed",
              isBlocking: true,
            },
          ],
          linkedWorkItems: [
            {
              id: 123,
              title: "Improve agent insight",
            },
          ],
        },
      },
    });

    const listed = await app.inject({
      method: "GET",
      url: `/project-links/${id}/pr-insights?pullRequestId=88`,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      storage: "local",
      items: [
        {
          projectLinkId: id,
          repository: "mergepilot-insights",
          pullRequestId: 88,
          kind: "review_run",
          decisionQueue: "needs_human_review",
          iterationId: 5,
          sourceCommit: "abc123",
          signals: {
            failedBuildCount: 1,
            failedPolicyCount: 1,
            activeThreads: [
              {
                id: 5,
                firstComment: "Needs tests",
              },
            ],
          },
        },
      ],
      history: [
        {
          index: 0,
          total: 1,
          latest: true,
        },
      ],
    });

    const savedBody = saved.json() as { record: { id: string } };
    const byId = await app.inject({
      method: "GET",
      url: `/project-links/${id}/pr-insights/artifact?artifactId=${encodeURIComponent(savedBody.record.id)}`,
    });
    expect(byId.statusCode).toBe(200);
    expect(byId.json()).toMatchObject({
      storage: "local",
      record: {
        id: savedBody.record.id,
        projectLinkId: id,
        repository: "mergepilot-insights",
        pullRequestId: 88,
        summary: "Full review summary.",
        signals: {
          buildBlockers: [
            {
              id: 77,
              result: "failed",
            },
          ],
          policyBlockers: [
            {
              name: "Minimum reviewers",
              status: "failed",
            },
          ],
        },
      },
    });
  });
});
