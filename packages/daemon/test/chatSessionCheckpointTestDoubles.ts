import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect } from "vitest";
import { resetSettingsForTests } from "@mergepilot/core";
import {
  ChatSessionManager,
  createChatToolExecutors,
} from "../src/chatSession.js";

export let runtime: Awaited<ReturnType<typeof createChatToolExecutors>> | null = null;

const originalRuntimeDataDir = process.env.RUNTIME_DATA_DIR;

afterEach(async () => {
  await runtime?.close();
  runtime = null;
  if (originalRuntimeDataDir === undefined) {
    delete process.env.RUNTIME_DATA_DIR;
  } else {
    process.env.RUNTIME_DATA_DIR = originalRuntimeDataDir;
  }
  resetSettingsForTests();
});

function git(repo: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
}

export function setupRepo(): { repo: string; dataDir: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-checkpoint-repo-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-checkpoint-data-"));
  git(repo, ["init"]);
  fs.writeFileSync(path.join(repo, "README.md"), "before\n", "utf8");
  git(repo, ["add", "README.md"]);
  git(repo, ["-c", "user.email=test@example.com", "-c", "user.name=Test User", "commit", "-m", "initial"]);
  fs.writeFileSync(path.join(repo, "README.md"), "before\nafter\n", "utf8");
  return { repo, dataDir };
}

export function checkpointFiles(dataDir: string): string[] {
  const dir = path.join(dataDir, "checkpoints");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith(".json")) : [];
}

export async function waitForSession(manager: ChatSessionManager, sessionId: string): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    if ((await manager.listRecent(10)).some((item) => item.sessionId === sessionId)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`session ${sessionId} was not persisted`);
}

export async function createRuntime(repo: string, dataDir: string): Promise<NonNullable<typeof runtime>> {
  runtime = await createChatToolExecutors({
    repoPath: repo,
    env: {},
    timeoutSec: 30,
    extra: { data_dir: dataDir },
  });
  return runtime;
}
