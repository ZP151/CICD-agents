import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SqliteDeliveryActionStore,
  runCommand,
  type PendingToolAction,
  type ToolCallStreamEvent,
  type ToolExecutor,
} from "@mergepilot/core";
import {
  runVerifiedChatAction,
  verifiedActionsForSession,
} from "../src/chatVerifiedActionRuntime.js";

/**
 * End-to-end verified runtime tests against REAL git repositories: the mock
 * ToolExecutor runs actual git writes, and verification re-reads the
 * repository (git is the authoritative source), exactly as in production.
 */

let tempRoot: string;
let repoPath: string;
let store: SqliteDeliveryActionStore;
let bubbles: Array<Record<string, unknown>>;
let messages: Array<{ role: string; content: string }>;

const adapters = {
  appendBubble: async (sessionId: string, bubble: Record<string, unknown>) => {
    bubbles.push(bubble);
  },
  appendMessage: async (sessionId: string, role: "assistant", content: string) => {
    messages.push({ role, content });
  },
};

beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chat-verified-"));
  repoPath = path.join(tempRoot, "repo");
  fs.mkdirSync(repoPath);
  await git(repoPath, ["init"]);
  await git(repoPath, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  await git(repoPath, ["config", "user.email", "test@example.com"]);
  await git(repoPath, ["config", "user.name", "Test User"]);
  store = new SqliteDeliveryActionStore(path.join(tempRoot, "actions.db"));
  bubbles = [];
  messages = [];
});

afterEach(() => {
  store.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

async function git(cwd: string, args: string[]): Promise<void> {
  const result = await runCommand(["git", ...args], { cwd, allowed: ["git"] });
  if (result.returncode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
}

/** Executor that actually performs the write it is asked to confirm. */
function realExecutor(script: (args: Record<string, unknown>) => Promise<void> | void): ToolExecutor {
  return {
    callStream: async function* (name: string, payload: Record<string, unknown>): AsyncGenerator<ToolCallStreamEvent> {
      try {
        await script(payload);
        yield { type: "result", result: { ok: true } };
      } catch (err) {
        yield { type: "result", result: { ok: false, error: err instanceof Error ? err.message : String(err) } };
      }
    },
  } as unknown as ToolExecutor;
}

/** Executor that claims success but performs no write (tool self-report only). */
const lyingExecutor: ToolExecutor = {
  callStream: async function* (): AsyncGenerator<ToolCallStreamEvent> {
    yield { type: "result", result: { ok: true } };
  },
} as unknown as ToolExecutor;

function pending(tool: string, args: Record<string, unknown>): PendingToolAction {
  return { tool, args, description: `Run ${tool}` };
}

async function run(args: { pending: PendingToolAction; executor: ToolExecutor; sessionId?: string }) {
  const sessionId = args.sessionId ?? "session-1";
  const events: string[] = [];
  const result = await drain(
    runVerifiedChatAction({
      sessionId,
      repoPath,
      projectLinkId: "pl-chat-1",
      pending: args.pending,
      actionExecutor: args.executor,
      toolCallId: `approval_${args.pending.tool}_abc123def0`,
      adapters,
      store,
    }),
    events,
  );
  return { result, events };
}

async function drain(
  generator: AsyncGenerator<unknown, { ok: boolean; executed: boolean }, void>,
  events: string[],
): Promise<{ ok: boolean; executed: boolean }> {
  const iterator = generator[Symbol.asyncIterator]();
  while (true) {
    const step = await iterator.next();
    if (step.done) return step.value;
    const type = (step.value as { type?: string }).type;
    if (type) events.push(type);
  }
}

describe("runVerifiedChatAction — git_add", () => {
  it("verifies the staged write through the canonical lifecycle", async () => {
    const file = "notes.txt";
    fs.writeFileSync(path.join(repoPath, file), "hello\n");
    const executor = realExecutor(async (args) => {
      await git(repoPath, ["add", ...((args["paths"] as string[]) ?? [file])]);
    });

    const { result, events } = await run({
      pending: pending("git_add", { paths: [file] }),
      executor,
    });

    expect(result.ok).toBe(true);
    expect(result.executed).toBe(true);
    expect(result.record.status).toBe("verified");
    expect(result.record.audit.map((entry) => entry.event)).toEqual([
      "awaiting_approval", "approved", "executed", "verified",
    ]);
    expect(events).toContain("tool_group_start");
    expect(events).toContain("tool_end");
    // The bubble is persisted through the same boundary as before.
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0]["toolName"]).toBe("git_add");
    expect(messages).toHaveLength(1);
    // The staged file is re-read from git — the authoritative source.
    expect(result.evidence.join(" ")).toContain("staged");

    // The record is bound to the turn and projected into the workflow state.
    const projected = await verifiedActionsForSession(store, "session-1");
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({ kind: "git_add", status: "verified" });
    expect(projected[0].evidence.join(" ")).toContain("staged");
  });

  it("replays a verified record without re-executing (duplicate approval)", async () => {
    const file = "notes.txt";
    fs.writeFileSync(path.join(repoPath, file), "hello\n");
    let calls = 0;
    const executor = realExecutor(async () => {
      calls += 1;
      await git(repoPath, ["add", file]);
    });

    const first = await run({ pending: pending("git_add", { paths: [file] }), executor });
    expect(first.result.record.status).toBe("verified");
    expect(calls).toBe(1);

    const second = await run({ pending: pending("git_add", { paths: [file] }), executor });
    expect(calls).toBe(1); // no second execution
    expect(second.result.ok).toBe(true);
    expect(second.result.executed).toBe(false);
    expect(second.result.record.id).toBe(first.result.record.id);
    expect(second.result.summary).toContain("Already verified");
    // The replay must not append another tool bubble.
    expect(bubbles).toHaveLength(1);
  });

  it("fails verification when the tool's success report is not backed by the repository", async () => {
    const file = "notes.txt";
    fs.writeFileSync(path.join(repoPath, file), "hello\n");

    const { result } = await run({
      pending: pending("git_add", { paths: [file] }),
      executor: lyingExecutor,
    });

    // HTTP-style success is never verification: git still shows nothing staged.
    expect(result.ok).toBe(false);
    expect(result.record.status).toBe("failed");
    expect(result.record.failure?.kind).toBe("verification");
    expect(result.executed).toBe(true);
    expect(result.summary).toContain("verification");
  });
});

describe("runVerifiedChatAction — git_commit", () => {
  it("verifies HEAD moved and the subject matches the approved message", async () => {
    const file = "code.ts";
    fs.writeFileSync(path.join(repoPath, file), "let x = 1;\n");
    await git(repoPath, ["add", file]);
    await git(repoPath, ["commit", "-m", "initial"]);
    const before = (await runCommand(["git", "rev-parse", "HEAD"], { cwd: repoPath, allowed: ["git"] })).stdout.trim();

    // The commit needs real content changes between the initial commit and
    // the approved write.
    fs.writeFileSync(path.join(repoPath, file), "let x = 2;\n");
    const executor = realExecutor(async (args) => {
      await git(repoPath, ["add", file]);
      await git(repoPath, ["commit", "-m", String(args["message"])]);
    });

    const { result } = await run({
      pending: pending("git_commit", { message: "second commit" }),
      executor,
    });

    expect(result.ok).toBe(true);
    expect(result.record.status).toBe("verified");
    const evidence = result.evidence.join(" ");
    expect(evidence).toContain("sha");
    expect(evidence).toContain("second commit");

    const after = (await runCommand(["git", "rev-parse", "HEAD"], { cwd: repoPath, allowed: ["git"] })).stdout.trim();
    expect(after).not.toBe(before);
  });
});

describe("runVerifiedChatAction — git_push", () => {
  it("verifies the remote tip landed on the local HEAD", async () => {
    const file = "feature.ts";
    fs.writeFileSync(path.join(repoPath, file), "feature\n");
    await git(repoPath, ["add", file]);
    await git(repoPath, ["commit", "-m", "feature work"]);
    await git(repoPath, ["branch", "-M", "feature/x"]);

    const originPath = path.join(tempRoot, "origin.git");
    await git(tempRoot, ["init", "--bare", "origin.git"]);
    await git(repoPath, ["remote", "add", "origin", originPath]);

    const executor = realExecutor(async (args) => {
      const branch = String(args["branch"] ?? "feature/x");
      await git(repoPath, ["push", "--set-upstream", "origin", branch]);
    });

    const { result } = await run({
      pending: pending("git_push", { branch: "feature/x", setUpstream: true }),
      executor,
    });

    expect(result.ok).toBe(true);
    expect(result.record.status).toBe("verified");
    const evidence = result.evidence.join(" ");
    expect(evidence).toContain("remoteTip");
    expect(evidence).toContain("feature/x");
  });
});

describe("runVerifiedChatAction — lifecycle guards", () => {
  it("refuses a record that already executed and failed verification", async () => {
    const file = "notes.txt";
    fs.writeFileSync(path.join(repoPath, file), "hello\n");
    // First run: the lying executor "succeeds" but nothing is staged.
    const first = await run({ pending: pending("git_add", { paths: [file] }), executor: lyingExecutor });
    expect(first.result.record.status).toBe("failed");
    expect(first.result.executed).toBe(true);

    // Second run: the write already executed — it must never run again.
    let calls = 0;
    const second = await run({
      pending: pending("git_add", { paths: [file] }),
      executor: realExecutor(async () => {
        calls += 1;
        await git(repoPath, ["add", file]);
      }),
    });
    expect(calls).toBe(0);
    expect(second.result.ok).toBe(false);
    expect(second.result.executed).toBe(false);
    expect(second.result.summary).toContain("refusing to re-run");
  });

  it("retries a proposal that failed before any write when the write was never executed", async () => {
    const file = "notes.txt";
    fs.writeFileSync(path.join(repoPath, file), "hello\n");
    // First attempt: the executor throws before doing anything; no write.
    const failing = realExecutor(() => {
      throw new Error("simulated tool failure");
    });
    const first = await run({ pending: pending("git_add", { paths: [file] }), executor: failing });
    expect(first.result.record.status).toBe("failed");
    expect(first.result.executed).toBe(false);

    // A corrected retry with the same approval id runs once and verifies.
    const second = await run({
      pending: pending("git_add", { paths: [file] }),
      executor: realExecutor(async (args) => {
        await git(repoPath, ["add", ...((args["paths"] as string[]) ?? [file])]);
      }),
    });
    expect(second.result.ok).toBe(true);
    expect(second.result.record.status).toBe("verified");
    expect(second.result.executed).toBe(true);
  });
});
