import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it, afterEach } from "vitest";
import { resetSettingsForTests, ToolDeniedError } from "@cicd-agent/core";
import { upsertLocalPrInsightArtifact } from "@cicd-agent/core";
import {
  ChatSessionManager,
  buildPrInsightContextBundle,
  buildPrInsightContextPrompt,
  checkpointMetadataFromToolResult,
  createChatToolExecutors,
  extractPrInsightArtifactIdFromMessage,
  extractPullRequestIdFromMessage,
  formatPrInsightArtifactsForChat,
} from "../src/chatSession.js";

let runtime: Awaited<ReturnType<typeof createChatToolExecutors>> | null = null;
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

function setupRepo(): { repo: string; dataDir: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-checkpoint-repo-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-checkpoint-data-"));
  git(repo, ["init"]);
  fs.writeFileSync(path.join(repo, "README.md"), "before\n", "utf8");
  git(repo, ["add", "README.md"]);
  git(repo, ["-c", "user.email=test@example.com", "-c", "user.name=Test User", "commit", "-m", "initial"]);
  fs.writeFileSync(path.join(repo, "README.md"), "before\nafter\n", "utf8");
  return { repo, dataDir };
}

function checkpointFiles(dataDir: string): string[] {
  const dir = path.join(dataDir, "checkpoints");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith(".json")) : [];
}

async function waitForSession(manager: ChatSessionManager, sessionId: string): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    if ((await manager.listRecent(10)).some((item) => item.sessionId === sessionId)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`session ${sessionId} was not persisted`);
}

describe("chat session Git checkpoints", () => {
  it("extracts PR ids and formats saved PR insights for chat context", () => {
    expect(extractPullRequestIdFromMessage("what did PR #42 conclude?")).toBe(42);
    expect(extractPullRequestIdFromMessage("summarize pull request 99")).toBe(99);
    expect(extractPullRequestIdFromMessage("hello world")).toBeUndefined();
    expect(extractPrInsightArtifactIdFromMessage("open artifact profile-1/demo/42/review_run/run-old.")).toBe("profile-1/demo/42/review_run/run-old");

    const prompt = formatPrInsightArtifactsForChat([{
      id: "profile-1/demo/42/review_run",
      profileId: "profile-1",
      repository: "demo",
      pullRequestId: 42,
      title: "Improve pipeline",
      kind: "review_run",
      at: "2026-06-11T00:10:00.000Z",
      summary: "Full review summary.",
      readiness: "needs_attention",
      decisionQueue: "needs_human_review",
      decisionRiskLevel: "medium",
      contextConfidence: "high",
      risks: ["Missing tests"],
      categories: {
        blocking: ["Required policy failed"],
        warnings: [],
        info: [],
      },
      signals: {
        fileCount: 4,
        threadCount: 1,
        failedBuildCount: 1,
        workItemCount: 0,
      },
      findingCount: 2,
      discardedFindingCount: 1,
      tokensIn: 1000,
      tokensOut: 300,
    }]);

    expect(prompt).toContain("## Saved PR AI Insights");
    expect(prompt).toContain("## PR Readiness Context");
    expect(prompt).toContain("readiness=needs_attention");
    expect(prompt).toContain("failedBuilds=1");
    expect(prompt).toContain("workItems=0");
    expect(prompt).toContain("Required policy failed");
    expect(prompt).toContain("Do not rerun analysis unless the user asks for a fresh result");
    expect(prompt).toContain("Artifact id: profile-1/demo/42/review_run");
    expect(prompt).toContain("PR #42");
    expect(prompt).toContain("Full review summary.");
    expect(prompt).toContain("queue=needs_human_review");
    expect(prompt).toContain("Missing tests");
  });

  it("builds chat PR insight context from persisted artifacts", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-pr-insight-data-"));
    upsertLocalPrInsightArtifact(dataDir, {
      profileId: "profile-1",
      repository: "demo",
      pullRequestId: 42,
      title: "Improve pipeline",
      kind: "review_run",
      at: "2026-06-11T00:10:00.000Z",
      summary: "Saved review summary.",
      readiness: "needs_attention",
      decisionQueue: "needs_human_review",
      decisionRiskLevel: "medium",
      contextConfidence: "high",
      risks: ["Missing tests"],
      findingCount: 2,
      discardedFindingCount: 1,
      tokensIn: 1000,
      tokensOut: 300,
    });
    upsertLocalPrInsightArtifact(dataDir, {
      profileId: "profile-1",
      repository: "demo",
      pullRequestId: 7,
      title: "Other PR",
      kind: "insight_preview",
      at: "2026-06-11T00:00:00.000Z",
      summary: "Other summary.",
      readiness: "ready",
      risks: [],
      tokensIn: 50,
      tokensOut: 10,
    });

    const prompt = buildPrInsightContextPrompt({
      dataDir,
      profileId: "profile-1",
      repository: "demo",
      message: "What did PR #42 need before approval?",
    });

    expect(prompt).toContain("Saved review summary.");
    expect(prompt).toContain("PR #42");
    expect(prompt).not.toContain("Other summary.");
    expect(buildPrInsightContextPrompt({
      dataDir,
      profileId: "profile-1",
      repository: "demo",
      message: "Hello there",
    })).toBeUndefined();
  });

  it("builds PR readiness context from readiness and policy wording", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-pr-readiness-data-"));
    upsertLocalPrInsightArtifact(dataDir, {
      profileId: "profile-1",
      repository: "demo",
      pullRequestId: 42,
      title: "Improve pipeline",
      kind: "review_run",
      at: "2026-06-11T00:10:00.000Z",
      summary: "Saved readiness summary.",
      readiness: "blocked",
      decisionQueue: "blocked",
      decisionRiskLevel: "high",
      contextConfidence: "high",
      risks: ["Failed CI"],
      signals: {
        fileCount: 2,
        threadCount: 0,
        failedBuildCount: 1,
        workItemCount: 1,
      },
      tokensIn: 1000,
      tokensOut: 300,
    });

    const prompt = buildPrInsightContextPrompt({
      dataDir,
      profileId: "profile-1",
      repository: "demo",
      message: "Is this ready for approval or blocked by policy?",
    });

    expect(prompt).toContain("## PR Readiness Context");
    expect(prompt).toContain("readiness=blocked");
    expect(prompt).toContain("queue=blocked");
    expect(prompt).toContain("failedBuilds=1");
    expect(prompt).toContain("Failed CI");
  });

  it("returns precise saved PR insight artifact notes for chat metadata", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-pr-insight-notes-"));
    const saved = upsertLocalPrInsightArtifact(dataDir, {
      profileId: "profile-1",
      repository: "demo",
      pullRequestId: 42,
      title: "Improve pipeline",
      kind: "review_run",
      at: "2026-06-11T00:10:00.000Z",
      summary: "Saved review summary.",
      readiness: "needs_attention",
      risks: ["Missing tests"],
      tokensIn: 1000,
      tokensOut: 300,
    });

    const bundle = buildPrInsightContextBundle({
      dataDir,
      profileId: "profile-1",
      repository: "demo",
      message: "What changed in PR #42?",
    });

    expect(bundle.prompt).toContain(saved.id);
    expect(bundle.artifactIds).toEqual([saved.id]);
    expect(bundle.notes).toEqual([
      `Used saved PR AI insight artifact ${saved.id} for PR #42 (review_run, 2026-06-11T00:10:00.000Z).`,
    ]);
  });

  it("prefers an explicit saved PR insight artifact id over the latest PR artifact", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-pr-insight-artifact-id-"));
    upsertLocalPrInsightArtifact(dataDir, {
      id: "profile-1/demo/42/review_run/old-run",
      profileId: "profile-1",
      repository: "demo",
      pullRequestId: 42,
      title: "Improve pipeline",
      kind: "review_run",
      at: "2026-06-11T00:00:00.000Z",
      summary: "Old saved review summary.",
      readiness: "needs_attention",
      risks: ["Old risk"],
      tokensIn: 100,
      tokensOut: 20,
    });
    upsertLocalPrInsightArtifact(dataDir, {
      id: "profile-1/demo/42/review_run/new-run",
      profileId: "profile-1",
      repository: "demo",
      pullRequestId: 42,
      title: "Improve pipeline",
      kind: "review_run",
      at: "2026-06-11T00:10:00.000Z",
      summary: "New saved review summary.",
      readiness: "ready",
      risks: ["New risk"],
      tokensIn: 200,
      tokensOut: 30,
    });

    const bundle = buildPrInsightContextBundle({
      dataDir,
      profileId: "profile-1",
      repository: "demo",
      message: "Explain artifact profile-1/demo/42/review_run/old-run for PR #42.",
    });

    expect(bundle.prompt).toContain("Old saved review summary.");
    expect(bundle.prompt).not.toContain("New saved review summary.");
    expect(bundle.artifactIds).toEqual(["profile-1/demo/42/review_run/old-run"]);
  });

  it("extracts checkpoint metadata from confirmed tool results", () => {
    expect(checkpointMetadataFromToolResult({
      ok: true,
      execution_metadata: {
        beforeExecute: {
          checkpointId: "checkpoint-123",
          checkpointPath: "C:/tmp/checkpoints/checkpoint-123.json",
        },
      },
    })).toEqual({
      checkpointId: "checkpoint-123",
      checkpointPath: "C:/tmp/checkpoints/checkpoint-123.json",
    });

    expect(checkpointMetadataFromToolResult({ ok: true })).toBeUndefined();
    expect(checkpointMetadataFromToolResult({
      execution_metadata: { beforeExecute: { checkpointId: "checkpoint-123" } },
    })).toBeUndefined();
  });

  it("creates a checkpoint before confirmed Git write actions", async () => {
    const { repo, dataDir } = setupRepo();
    runtime = await createChatToolExecutors({
      repoPath: repo,
      env: {},
      timeoutSec: 30,
      extra: { data_dir: dataDir },
    });

    const result = await runtime.actionExecutor.call("git_add", { paths: ["README.md"] });

    const files = checkpointFiles(dataDir);
    expect(files).toHaveLength(1);
    expect(result["execution_metadata"]).toMatchObject({
      beforeExecute: {
        checkpointId: expect.any(String),
        checkpointPath: expect.stringContaining("checkpoints"),
      },
    });
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, "checkpoints", files[0]!), "utf8")) as {
      reason: string;
      diff: string;
    };
    expect(saved.reason).toBe("before git_add");
    expect(saved.diff).toContain("+after");
  });

  it("does not create a checkpoint when planner Git writes are denied", async () => {
    const { repo, dataDir } = setupRepo();
    runtime = await createChatToolExecutors({
      repoPath: repo,
      env: {},
      timeoutSec: 30,
      extra: { data_dir: dataDir },
    });

    await expect(runtime.plannerExecutor.call("git_add", { paths: ["README.md"] }))
      .rejects.toBeInstanceOf(ToolDeniedError);
    expect(checkpointFiles(dataDir)).toEqual([]);
  });

  it("lists checkpoint activity from persisted tool bubbles", async () => {
    const { repo, dataDir } = setupRepo();
    process.env.RUNTIME_DATA_DIR = dataDir;
    resetSettingsForTests();
    const manager = new ChatSessionManager();
    const sessionId = manager.createSession(repo, "profile-1");
    await waitForSession(manager, sessionId);

    await manager.appendBubble(sessionId, {
      role: "tool",
      content: "added",
      timestamp: 1234,
      toolName: "git_add",
      toolOk: true,
      toolSummary: "added",
      toolResult: { ok: true },
      checkpointId: "checkpoint-1",
      checkpointPath: path.join(dataDir, "checkpoints", "checkpoint-1.json"),
    });

    expect(await manager.listCheckpointActivity(10)).toMatchObject([
      {
        sessionId,
        repoPath: repo,
        profileId: "profile-1",
        at: 1234,
        toolName: "git_add",
        checkpointId: "checkpoint-1",
      },
    ]);
  });

  it("includes checkpoint apply target metadata in checkpoint activity", async () => {
    const { repo, dataDir } = setupRepo();
    process.env.RUNTIME_DATA_DIR = dataDir;
    resetSettingsForTests();
    const manager = new ChatSessionManager();
    const sessionId = manager.createSession(repo, "profile-1");
    await waitForSession(manager, sessionId);

    await manager.appendBubble(sessionId, {
      role: "tool",
      content: "applied",
      timestamp: 1235,
      toolName: "git_checkpoint_apply",
      toolOk: true,
      toolSummary: "applied checkpoint",
      toolResult: {
        ok: true,
        checkpointId: "target-checkpoint",
        mode: "applied_checkpoint_patch",
        restoredFiles: ["README.md"],
      },
      checkpointId: "safety-checkpoint",
      checkpointPath: path.join(dataDir, "checkpoints", "safety-checkpoint.json"),
    });

    expect(await manager.listCheckpointActivity(10)).toMatchObject([
      {
        sessionId,
        toolName: "git_checkpoint_apply",
        checkpointId: "safety-checkpoint",
        safetyCheckpointId: "safety-checkpoint",
        targetCheckpointId: "target-checkpoint",
        applyMode: "applied_checkpoint_patch",
        restoredFiles: ["README.md"],
      },
    ]);
  });

  it("creates a safety checkpoint before confirmed checkpoint apply", async () => {
    const { repo, dataDir } = setupRepo();
    runtime = await createChatToolExecutors({
      repoPath: repo,
      env: {},
      timeoutSec: 30,
      extra: { data_dir: dataDir },
    });

    const target = await runtime.actionExecutor.call("git_checkpoint", { reason: "target snapshot" });
    fs.writeFileSync(path.join(repo, "README.md"), "mutated\n", "utf8");

    const result = await runtime.actionExecutor.call("git_checkpoint_apply", {
      checkpointId: target["checkpointId"],
    });

    expect(result).toMatchObject({
      ok: true,
      mode: "applied_checkpoint_patch",
      execution_metadata: {
        beforeExecute: {
          checkpointId: expect.any(String),
          checkpointPath: expect.stringContaining("checkpoints"),
        },
      },
    });
    expect(checkpointFiles(dataDir)).toHaveLength(2);
    expect(fs.readFileSync(path.join(repo, "README.md"), "utf8").replace(/\r\n/g, "\n")).toBe("before\nafter\n");
  });
});
