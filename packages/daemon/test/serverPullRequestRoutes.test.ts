import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-pull-request-routes-"));
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
  const profileResponse = await app!.inject({
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
  expect(profileResponse.statusCode).toBe(201);
  return profileResponse.json() as { id: string };
}

function requestUrl(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof Request) return input.url;
  if (typeof (input as { url?: unknown }).url === "string") {
    return String((input as { url: string }).url);
  }
  return String(input);
}

describe("daemon pull request routes", () => {
  it("returns internal pull request context for a Project Link", async () => {
    app = await buildApp();
    const profile = await createProjectLink();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.includes("/pullrequests/42?")) {
        return new Response(
          JSON.stringify({
            pullRequestId: 42,
            codeReviewId: 1001,
            title: "Improve agent",
            description: "Detailed body",
            status: "active",
            sourceRefName: "refs/heads/feature/agent",
            targetRefName: "refs/heads/main",
            repository: { name: "mergepilot", project: { name: "Agents" } },
            reviewers: [{ vote: 10 }],
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
                  {
                    id: 6,
                    author: { displayName: "Ada", uniqueName: "ada@example.com" },
                    content: "Looks good",
                  },
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
            value: [
              {
                id: 3,
                sourceRefCommit: { commitId: "source-commit" },
                targetRefCommit: { commitId: "target-commit" },
                commonRefCommit: { commitId: "common-commit" },
              },
            ],
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
      if (url.includes("/_apis/build/builds?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 77,
                buildNumber: "20260610.1",
                status: "completed",
                result: "succeeded",
                sourceBranch: "refs/heads/feature/agent",
                definition: { name: "CI" },
                _links: { web: { href: "https://ado/build/77" } },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });

    const context = await app.inject({
      method: "GET",
      url: `/project-links/${profile.id}/pull-requests/42/context`,
    });

    expect(context.statusCode).toBe(200);
    expect(context.json()).toMatchObject({
      source: "internal",
      pullRequest: {
        id: 42,
        title: "Improve agent",
        sourceBranch: "feature/agent",
        workItemRefs: [{ id: "123", url: "https://ado/workitems/123" }],
      },
      threads: [{ id: 5, comments: [{ id: 6, content: "Looks good" }] }],
      changes: { iterationId: 3, fileCount: 1, changes: [{ path: "/src/app.ts" }] },
      builds: [{ id: 77, buildNumber: "20260610.1", result: "succeeded" }],
    });
  });

  it("lists pull requests using an inline browser-local Project Link", async () => {
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url.includes("/_apis/git/repositories/mergepilot/pullrequests?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                pullRequestId: 42,
                title: "Improve agent",
                status: "active",
                isDraft: false,
                sourceRefName: "refs/heads/feature/agent",
                targetRefName: "refs/heads/main",
                creationDate: "2026-06-10T00:00:00.000Z",
                createdBy: { displayName: "Ada" },
                repository: { name: "mergepilot" },
                reviewers: [{ vote: 10 }, { vote: 0 }],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/pipelines/12/runs?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 77,
                name: "20260610.1",
                state: "completed",
                result: "succeeded",
                createdDate: "2026-06-10T00:00:00.000Z",
                finishedDate: "2026-06-10T00:05:00.000Z",
                resources: { repositories: { self: { refName: "refs/heads/feature/agent" } } },
                _links: { web: { href: "https://ado/build/77" } },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });

    const r = await app.inject({
      method: "POST",
      url: "/project-links/browser-only-profile/pull-requests?status=active",
      payload: {
        projectLink: {
          name: "Browser Link",
          repoPath: process.cwd(),
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoProject: "Agents",
          adoRepoName: "mergepilot",
          adoPat: "test-pat",
          adoPipelineId: "12",
        },
      },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      pullRequests: [
        {
          id: 42,
          title: "Improve agent",
          sourceBranch: "feature/agent",
          pipelineRun: {
            id: 77,
            result: "succeeded",
            sourceBranch: "feature/agent",
          },
        },
      ],
    });
  });

});
