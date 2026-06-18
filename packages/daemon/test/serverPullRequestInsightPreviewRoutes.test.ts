import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-pr-insight-routes-"));
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

async function createProjectLink(): Promise<{ id: string }> {
  const response = await app!.inject({
    method: "POST",
    url: "/project-links",
    payload: {
      name: "Demo Link",
      repoPath: process.cwd(),
      adoOrgUrl: "https://dev.azure.com/demo-org",
      adoProject: "Agents",
      adoRepoName: "mergepilot",
      adoPat: "test-pat",
      adoPipelineId: "12",
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string };
}

function requestUrl(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof Request) return input.url;
  if (typeof (input as { url?: unknown }).url === "string") {
    return String((input as { url: string }).url);
  }
  return String(input);
}

describe("daemon pull request insight preview routes", () => {
  it("returns a non-mutating heuristic PR insight preview", async () => {
    app = await buildApp();
    const projectLink = await createProjectLink();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.includes("/pullrequests/42?")) {
        return new Response(
          JSON.stringify({
            pullRequestId: 42,
            title: "Improve agent",
            description: "Adds PR insight",
            status: "active",
            sourceRefName: "refs/heads/feature/agent",
            targetRefName: "refs/heads/main",
            repository: { name: "mergepilot", project: { name: "Agents" } },
            reviewers: [],
            workItemRefs: [{ id: "123", url: "https://ado/workitems/123" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pullrequests/42/threads?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 5,
                status: 1,
                comments: [
                  { id: 6, author: { displayName: "Ada" }, content: "Needs test coverage" },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pullrequests/42/iterations?")) {
        return new Response(
          JSON.stringify({
            value: [{ id: 3, sourceRefCommit: { commitId: "source-commit" } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pullrequests/42/iterations/3/changes?")) {
        return new Response(
          JSON.stringify({
            changeEntries: [
              {
                changeId: 10,
                changeType: "edit",
                item: { path: "/src/app.ts", gitObjectType: "blob", commitId: "source-commit" },
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
      if (url.includes("/_apis/policy/evaluations?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                evaluationId: "policy-1",
                status: "failed",
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
      if (url.includes("/_apis/build/builds?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 77,
                buildNumber: "20260610.1",
                definition: { name: "CI" },
                status: "completed",
                result: "failed",
                url: "https://ado/build/77",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });

    const preview = await app.inject({
      method: "POST",
      url: `/project-links/${projectLink.id}/pull-requests/42/insight-preview`,
      payload: {},
    });

    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      source: "heuristic",
      readiness: "blocked",
      risks: [
        "1 failed/canceled build(s)",
        "1 active thread(s)",
        "1 failed/error policy evaluation(s)",
      ],
      categories: {
        blocking: ["1 failed/canceled build(s)", "1 failed/error policy evaluation(s)"],
        warnings: ["1 active thread(s)"],
      },
      signals: {
        fileCount: 1,
        threadCount: 1,
        failedBuildCount: 1,
        failedPolicyCount: 1,
        workItemCount: 1,
        buildBlockers: [
          {
            id: 77,
            buildNumber: "20260610.1",
            definitionName: "CI",
            result: "failed",
          },
        ],
        policyBlockers: [
          {
            id: "policy-1",
            name: "Minimum reviewers",
            status: "failed",
            isBlocking: true,
          },
        ],
        activeThreads: [
          {
            id: 5,
            author: "Ada",
            firstComment: "Needs test coverage",
          },
        ],
        linkedWorkItems: [
          {
            id: 123,
            type: "User Story",
            title: "Improve agent insight",
            state: "Active",
          },
        ],
      },
      tokensIn: 0,
      tokensOut: 0,
    });
    expect((preview.json() as { summary: string }).summary).toContain("1 changed file");
  });
});
