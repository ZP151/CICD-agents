import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

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

describe("daemon review-run routes", () => {
  it("returns full AI insight metadata and compression boundaries from review-run", async () => {
    app = await buildApp();
    let requestedFileDiffs = false;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url =
        typeof input === "string"
          ? input
          : typeof (input as { url?: unknown }).url === "string"
            ? String((input as { url: string }).url)
            : String(input);
      if (url.includes("/pullrequests/42/iterations?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 3,
                description: "latest",
                sourceRefCommit: { commitId: "source-commit" },
                commonRefCommit: { commitId: "base-commit" },
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
              { changeType: "edit", item: { path: "/src/auth/tokenService.ts" } },
              { changeType: "edit", item: { path: "/docs/generated-api.md" } },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/git/repositories/mergepilot/items?")) {
        const parsed = new URL(url);
        const pathInRepo = parsed.searchParams.get("path");
        const body = pathInRepo?.includes("generated-api")
          ? "x".repeat(14000)
          : "export function validateToken() { return true; }\n";
        return new Response(body, { status: 200, headers: { "content-type": "text/plain" } });
      }
      if (url.includes("/diffs/filediffs?")) {
        requestedFileDiffs = true;
        return new Response(
          JSON.stringify([
            {
              path: "src/auth/tokenService.ts",
              lineDiffBlocks: [
                {
                  changeType: "edit",
                  originalLineNumberStart: 1,
                  originalLinesCount: 1,
                  modifiedLineNumberStart: 1,
                  modifiedLinesCount: 1,
                  originalLines: ["export function validateToken() { return false; }"],
                  modifiedLines: ["export function validateToken() { return true; }"],
                },
              ],
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pullrequests/42?")) {
        return new Response(
          JSON.stringify({
            pullRequestId: 42,
            codeReviewId: 420,
            title: "Harden token validation",
            status: "active",
            isDraft: false,
            sourceRefName: "refs/heads/auth-hardening",
            targetRefName: "refs/heads/main",
            createdBy: { displayName: "Ada Lovelace" },
            creationDate: "2026-06-11T00:00:00Z",
            repository: { name: "mergepilot", project: { name: "Agents" } },
            description: "Tightens token validation rules.",
            reviewers: [{ vote: 10 }, { vote: 0 }, { vote: -10 }],
            _links: {
              web: { href: "https://dev.azure.com/demo-org/Agents/_git/mergepilot/pullrequest/42" },
            },
            workItemRefs: [
              { id: "123", url: "https://dev.azure.com/demo-org/_apis/wit/workItems/123" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pullrequests/42/threads?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 1,
                status: 1,
                comments: [
                  {
                    id: 1,
                    content: "Please verify token expiry.",
                    author: { displayName: "Reviewer", uniqueName: "reviewer@example.com" },
                  },
                ],
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
                id: 99,
                buildNumber: "20260611.1",
                status: "completed",
                result: "failed",
                sourceBranch: "refs/heads/auth-hardening",
                definition: { name: "CI" },
                repository: { name: "mergepilot" },
                _links: {
                  web: { href: "https://dev.azure.com/demo-org/Agents/_build/results?buildId=99" },
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/connectionData?")) {
        return new Response(
          JSON.stringify({
            authenticatedUser: {
              id: "reviewer-1",
              displayName: "Review Bot",
              uniqueName: "review@example.com",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });

    const review = await app.inject({
      method: "POST",
      url: "/project-links/demo-link/review-run",
      payload: {
        pullRequestId: 42,
        projectLink: {
          name: "Demo Link",
          repoPath: process.cwd(),
          targetBranch: "main",
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoProject: "Agents",
          adoRepoName: "mergepilot",
          adoPat: "test-pat",
          adoPipelineId: "77",
        },
      },
    });

    expect(review.statusCode).toBe(200);
    expect(requestedFileDiffs).toBe(true);
    expect(review.json()).toMatchObject({
      ok: true,
      pullRequestId: 42,
      repository: "mergepilot",
      iterationId: 3,
      decisionQueue: "needs_human_review",
      decisionReasonCodes: ["review.no_llm", "context.whole_file_fallback"],
      contextConfidence: "low",
      readiness: "needs_attention",
      metadata: {
        estimatedEffort: 1,
        testsRequired: false,
        securityConcern: false,
        canBeSplit: false,
        keyIssues: [],
      },
      compression: {
        compressed: false,
        includedFiles: ["/src/auth/tokenService.ts", "/docs/generated-api.md"],
        omittedFiles: [],
      },
      coverage: {
        totalFiles: 2,
        filesWithHunks: 1,
        wholeFileOnlyFiles: 1,
        hunkCount: 1,
        changedHunkLines: 1,
      },
    });
  });

  it("persists review-run outcomes into the Review Queue for the same Project Link", async () => {
    app = await buildApp();
    const projectLinkId = await createProjectLink("ClaimBot API", "ClaimBot_API");

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url =
        typeof input === "string"
          ? input
          : typeof (input as { url?: unknown }).url === "string"
            ? String((input as { url: string }).url)
            : String(input);
      if (url.includes("/pullrequests/84/iterations?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 5,
                sourceRefCommit: { commitId: "feature-commit-84" },
                commonRefCommit: { commitId: "main-base-84" },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pullrequests/84/iterations/5/changes?")) {
        return new Response(
          JSON.stringify({
            changeEntries: [
              { changeType: "edit", item: { path: "/BotToSharePoint/Controllers/ClaimController.cs" } },
              { changeType: "edit", item: { path: "/BotToSharePoint/Common/CommonFunctions.cs" } },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/git/repositories/ClaimBot_API/items?")) {
        const parsed = new URL(url);
        const pathInRepo = parsed.searchParams.get("path") ?? "";
        const body = pathInRepo.includes("ClaimController")
          ? "using BotToSharePoint.Common;\npublic class ClaimController { }\n"
          : "namespace BotToSharePoint.Common { public class CommonFunctions { } }\n";
        return new Response(body, { status: 200, headers: { "content-type": "text/plain" } });
      }
      if (url.includes("/diffs/filediffs?")) {
        return new Response(
          JSON.stringify([
            {
              path: "BotToSharePoint/Controllers/ClaimController.cs",
              lineDiffBlocks: [
                {
                  changeType: "edit",
                  originalLineNumberStart: 12,
                  originalLinesCount: 2,
                  modifiedLineNumberStart: 12,
                  modifiedLinesCount: 3,
                  originalLines: ["throw ex;", "}"],
                  modifiedLines: ["throw;", "return;", "}"],
                },
              ],
            },
            {
              path: "BotToSharePoint/Common/CommonFunctions.cs",
              lineDiffBlocks: [
                {
                  changeType: "edit",
                  originalLineNumberStart: 44,
                  originalLinesCount: 1,
                  modifiedLineNumberStart: 44,
                  modifiedLinesCount: 1,
                  originalLines: ["clientContext.ExecuteQuery();"],
                  modifiedLines: ["clientContext?.ExecuteQuery();"],
                },
              ],
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pullrequests/84?")) {
        return new Response(
          JSON.stringify({
            pullRequestId: 84,
            codeReviewId: 840,
            title: "Stabilize ClaimBot error handling",
            status: "active",
            isDraft: false,
            sourceRefName: "refs/heads/feature/claimbot-error-handling",
            targetRefName: "refs/heads/main",
            createdBy: { displayName: "Zhou Ping" },
            creationDate: "2026-07-05T00:00:00Z",
            repository: { name: "ClaimBot_API", project: { name: "Agents" } },
            description: "Tightens exception handling and SharePoint cleanup paths.",
            reviewers: [{ vote: 10 }, { vote: 0 }],
            _links: {
              web: { href: "https://dev.azure.com/demo-org/Agents/_git/ClaimBot_API/pullrequest/84" },
            },
            workItemRefs: [
              { id: "501", url: "https://dev.azure.com/demo-org/_apis/wit/workItems/501" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pullrequests/84/threads?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 7,
                status: 1,
                comments: [
                  {
                    id: 1,
                    content: "Confirm SharePoint disposal path.",
                    author: { displayName: "Reviewer", uniqueName: "reviewer@example.com" },
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/build/builds?")) {
        return new Response(JSON.stringify({ value: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/_apis/connectionData?")) {
        return new Response(
          JSON.stringify({
            authenticatedUser: {
              id: "reviewer-claimbot",
              displayName: "Review Bot",
              uniqueName: "review@example.com",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });

    const review = await app.inject({
      method: "POST",
      url: `/project-links/${projectLinkId}/review-run`,
      payload: {
        pullRequestId: 84,
        targetBranch: "main",
      },
    });

    expect(review.statusCode).toBe(200);
    expect(review.json()).toMatchObject({
      ok: true,
      pullRequestId: 84,
      repository: "ClaimBot_API",
      iterationId: 5,
      findingCount: 0,
      decisionQueue: "needs_human_review",
      decisionRiskLevel: "low",
      decisionReasonCodes: ["review.no_llm"],
      contextConfidence: "low",
      coverage: {
        totalFiles: 2,
        filesWithHunks: 2,
        wholeFileOnlyFiles: 0,
        hunkCount: 2,
        changedHunkLines: 4,
      },
    });

    const queue = await app.inject({
      method: "GET",
      url: `/project-links/${projectLinkId}/review-queue`,
    });

    expect(queue.statusCode).toBe(200);
    expect(queue.json()).toMatchObject({
      configured: false,
      storage: "local",
      items: [
        {
          repository: "ClaimBot_API",
          pullRequestId: 84,
          lastIterationId: 5,
          findingCount: 0,
          sourceCommit: "feature-commit-84",
          decisionQueue: "needs_human_review",
          decisionRiskLevel: "low",
          decisionReason: "The review model did not run, so approval needs a human.",
          decisionReasonCodes: ["review.no_llm"],
          contextConfidence: "low",
          discardedFindingCount: 0,
          hunkCoverageFiles: 2,
          wholeFileFallbackFiles: 0,
          changedHunkLines: 4,
          manualDisposition: "",
          manualDispositionEvents: [],
          manualDispositionWriteBackAttempted: false,
        },
      ],
    });
  });
});
