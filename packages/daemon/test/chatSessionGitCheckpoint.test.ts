import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resetSettingsForTests, ToolDeniedError } from "@mergepilot/core";
import {
  ChatSessionManager,
  checkpointMetadataFromToolResult,
} from "../src/chatSession.js";
import {
  checkpointFiles,
  createRuntime,
  setupRepo,
  waitForSession,
} from "./chatSessionCheckpointTestDoubles.js";

describe("chat session Git checkpoints", () => {
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
    const runtime = await createRuntime(repo, dataDir);

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
    const runtime = await createRuntime(repo, dataDir);

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
        projectLinkId: "profile-1",
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
    const runtime = await createRuntime(repo, dataDir);

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
