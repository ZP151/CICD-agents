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
});
