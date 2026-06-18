import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getSettings, resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-checkpoint-index-"));
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

describe("daemon checkpoint and index routes", () => {
  it("previews stored Git checkpoints without requiring a repo mutation", async () => {
    app = await buildApp();
    const checkpointId = "git-2026-06-11T00-00-00-000Z";
    const checkpointDir = path.join(getSettings().dataDir, "checkpoints");
    fs.mkdirSync(checkpointDir, { recursive: true });
    fs.writeFileSync(
      path.join(checkpointDir, `${checkpointId}.json`),
      JSON.stringify({
        id: checkpointId,
        kind: "git_checkpoint",
        createdAt: "2026-06-11T00:00:00.000Z",
        repoPath: "C:/repo",
        reason: "before git_add",
        branch: "main",
        head: "abc123",
        status: "## main\n M README.md",
        diff: "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1,2 @@\n before\n+after\n",
      }),
      "utf8",
    );

    const preview = await app.inject({
      method: "GET",
      url: `/chat/checkpoints/${checkpointId}/preview?maxDiffChars=30`,
    });

    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.json()).toMatchObject({
      ok: true,
      checkpointId,
      repoPath: "C:/repo",
      reason: "before git_add",
      statusLines: ["## main", " M README.md"],
      files: ["README.md"],
      diffTruncated: true,
    });
  });

  it("returns chat index status and triggers index refresh", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-chat-index-repo-"));
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(repo, "src", "chatSession.ts"),
      "export const ready = true;\n",
      "utf8",
    );

    const status = await app.inject({
      method: "POST",
      url: "/chat/index-status",
      payload: { repoPath: repo },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      repoPath: repo,
      indexed: false,
      semanticReady: false,
      retrievalMode: "quick-scan",
    });

    const refresh = await app.inject({
      method: "POST",
      url: "/chat/index-refresh",
      payload: { repoPath: repo },
    });
    expect(refresh.statusCode, refresh.body).toBe(200);

    const refreshBody = refresh.json() as {
      ok: boolean;
      refresh: { filesSeen: number; filesIndexed: number; embedded: number };
      status: {
        indexed: boolean;
        semanticReady: boolean;
        stats: { filesIndexed: number; chunksIndexed: number };
      };
    };

    expect(refreshBody.ok).toBe(true);
    expect(refreshBody.refresh.filesSeen).toBeGreaterThan(0);
    expect(refreshBody.refresh.filesIndexed).toBeGreaterThan(0);
    expect(refreshBody.refresh.embedded).toBe(0);
    expect(refreshBody.status.indexed).toBe(true);
    expect(refreshBody.status.stats.filesIndexed).toBe(refreshBody.refresh.filesIndexed);

    const after = await app.inject({
      method: "POST",
      url: "/chat/index-status",
      payload: { repoPath: repo },
    });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toMatchObject({
      repoPath: repo,
      indexed: true,
      retrievalMode: "quick-scan",
    });
  });

  it("returns 400 for malformed chat index request payload", async () => {
    app = await buildApp();

    const status = await app.inject({
      method: "POST",
      url: "/chat/index-status",
      payload: { repoPath: 123 },
    });
    expect(status.statusCode).toBe(400);

    const refresh = await app.inject({
      method: "POST",
      url: "/chat/index-refresh",
      payload: { projectLink: "bad" },
    });
    expect(refresh.statusCode).toBe(400);
  });

  it("plans checkpoint rollback without executing it", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-checkpoint-plan-repo-"));
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
    };
    git(["init"]);
    fs.writeFileSync(path.join(repo, "README.md"), "before\n", "utf8");
    git(["add", "README.md"]);
    git([
      "-c",
      "user.email=test@example.com",
      "-c",
      "user.name=Test User",
      "commit",
      "-m",
      "initial",
    ]);

    const checkpointId = "git-2026-06-11T00-00-00-001Z";
    const checkpointDir = path.join(getSettings().dataDir, "checkpoints");
    fs.mkdirSync(checkpointDir, { recursive: true });
    fs.writeFileSync(
      path.join(checkpointDir, `${checkpointId}.json`),
      JSON.stringify({
        id: checkpointId,
        kind: "git_checkpoint",
        createdAt: "2026-06-11T00:00:00.001Z",
        repoPath: repo,
        reason: "clean baseline",
        branch: "main",
        head: "abc123",
        status: "## main",
        diff: "",
      }),
      "utf8",
    );
    fs.writeFileSync(path.join(repo, "README.md"), "before\nafter\n", "utf8");

    const plan = await app.inject({
      method: "GET",
      url: `/chat/checkpoints/${checkpointId}/rollback-plan`,
    });

    expect(plan.statusCode, plan.body).toBe(200);
    expect(plan.json()).toMatchObject({
      ok: true,
      checkpointId,
      supported: true,
      mode: "restore_tracked_to_clean_checkpoint",
      currentTrackedPaths: ["README.md"],
      proposal: {
        tool: "git_restore",
        args: { paths: ["README.md"], staged: false },
      },
    });
    expect(fs.readFileSync(path.join(repo, "README.md"), "utf8")).toContain("after");
  });
});
