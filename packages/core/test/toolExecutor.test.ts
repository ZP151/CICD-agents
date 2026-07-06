import { describe, expect, it } from "vitest";
import os from "node:os";
import {
  redact,
  runCommand,
  splitCommand,
  ToolDeniedError,
  ToolError,
  ToolExecutor,
} from "../src/tools/executor.js";

describe("redact", () => {
  it("masks bearer tokens", () => {
    const out = redact("Authorization: Bearer abc123");
    expect(out).toContain("REDACTED");
    expect(out).not.toContain("abc123");
  });

  it("masks api_key style assignments", () => {
    const out = redact("api_key='supersecretvalue1234'");
    expect(out).not.toContain("supersecretvalue1234");
  });

  it("masks common token and client secret assignments", () => {
    const out = redact([
      "AZURE_OPENAI_API_KEY=aoai_secret_1234567890",
      "ADO_PAT=pat_secret_1234567890abcdef",
      "access_token=access.secret.1234567890",
      "client_secret=client-secret-1234567890",
      "password=P@ssw0rd!",
    ].join("\n"));

    expect(out).toContain("AZURE_OPENAI_API_KEY=***REDACTED***");
    expect(out).toContain("ADO_PAT=***REDACTED***");
    expect(out).toContain("access_token=***REDACTED***");
    expect(out).toContain("client_secret=***REDACTED***");
    expect(out).toContain("password=***REDACTED***");
    expect(out).not.toContain("aoai_secret_1234567890");
    expect(out).not.toContain("pat_secret_1234567890abcdef");
    expect(out).not.toContain("access.secret.1234567890");
    expect(out).not.toContain("client-secret-1234567890");
    expect(out).not.toContain("P@ssw0rd!");
  });

  it("masks credentials embedded in remote URLs", () => {
    const out = redact(
      "origin https://mergepilot:supersecrettoken@example.visualstudio.com/Claims/_git/Repo (push)",
    );
    expect(out).toContain("https://***REDACTED***@example.visualstudio.com/Claims/_git/Repo");
    expect(out).not.toContain("mergepilot");
    expect(out).not.toContain("supersecrettoken");
  });
});

describe("runCommand", () => {
  it("rejects commands outside the allowlist", async () => {
    await expect(
      runCommand(["echo", "hi"], { cwd: os.tmpdir(), allowed: ["git"] }),
    ).rejects.toBeInstanceOf(ToolError);
  });

  it("redacts secret-like stdout and stderr in streamed and final command output", async () => {
    const streamed: string[] = [];
    const result = await runCommand(
      [
        process.execPath,
        "-e",
        [
          "console.log('AZURE_OPENAI_API_KEY=aoai_secret_1234567890')",
          "console.error('client_secret=client-secret-1234567890')",
        ].join(";"),
      ],
      {
        cwd: os.tmpdir(),
        allowed: [process.execPath],
        onOutput: (chunk) => streamed.push(`${chunk.stream}:${chunk.text}`),
      },
    );

    const combined = [result.stdout, result.stderr, ...streamed].join("\n");
    expect(combined).toContain("AZURE_OPENAI_API_KEY=***REDACTED***");
    expect(combined).toContain("client_secret=***REDACTED***");
    expect(combined).not.toContain("aoai_secret_1234567890");
    expect(combined).not.toContain("client-secret-1234567890");
  });
});

describe("splitCommand", () => {
  it("splits and returns empty for blanks", () => {
    expect(splitCommand("dotnet build")).toEqual(["dotnet", "build"]);
    expect(splitCommand("   ")).toEqual([]);
  });
});

describe("ToolExecutor", () => {
  it("dispatches a registered tool by name", async () => {
    const exec = new ToolExecutor({
      repoPath: os.tmpdir(),
      env: {},
      timeoutSec: 5,
      extra: {},
    });
    exec.register({
      name: "echo",
      description: "echo",
      parameters: { type: "object", properties: {} },
      handler: async (_ctx, payload) => ({ echoed: payload }),
    });
    const out = await exec.call("echo", { foo: 1 });
    expect(out).toEqual({ echoed: { foo: 1 } });
  });

  it("throws ToolError for unknown tool", async () => {
    const exec = new ToolExecutor({ repoPath: os.tmpdir(), env: {}, timeoutSec: 5, extra: {} });
    await expect(exec.call("nope", {})).rejects.toBeInstanceOf(ToolError);
  });

  it("runs the approval callback before executing a tool", async () => {
    let called = false;
    const exec = new ToolExecutor(
      { repoPath: os.tmpdir(), env: {}, timeoutSec: 5, extra: {} },
      async ({ toolName, payload }) => {
        expect(toolName).toBe("echo");
        expect(payload).toEqual({ foo: 1 });
        return true;
      },
    );
    exec.register({
      name: "echo",
      description: "echo",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        called = true;
        return { ok: true };
      },
    });

    await expect(exec.call("echo", { foo: 1 })).resolves.toEqual({ ok: true });
    expect(called).toBe(true);
  });

  it("throws ToolDeniedError and skips handler when approval denies execution", async () => {
    let called = false;
    const exec = new ToolExecutor(
      { repoPath: os.tmpdir(), env: {}, timeoutSec: 5, extra: {} },
      () => false,
    );
    exec.register({
      name: "danger",
      description: "danger",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        called = true;
        return { ok: true };
      },
    });

    await expect(exec.call("danger", {})).rejects.toBeInstanceOf(ToolDeniedError);
    expect(called).toBe(false);
  });

  it("runs beforeExecute after approval and before the handler", async () => {
    const order: string[] = [];
    const exec = new ToolExecutor(
      { repoPath: os.tmpdir(), env: {}, timeoutSec: 5, extra: {} },
      () => {
        order.push("approve");
        return true;
      },
      ({ toolName }) => {
        order.push(`before:${toolName}`);
      },
    );
    exec.register({
      name: "echo",
      description: "echo",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        order.push("handler");
        return { ok: true };
      },
    });

    await expect(exec.call("echo", {})).resolves.toEqual({ ok: true });
    expect(order).toEqual(["approve", "before:echo", "handler"]);
  });

  it("does not run beforeExecute when approval denies the tool", async () => {
    let beforeCalled = false;
    const exec = new ToolExecutor(
      { repoPath: os.tmpdir(), env: {}, timeoutSec: 5, extra: {} },
      () => false,
      () => {
        beforeCalled = true;
      },
    );
    exec.register({
      name: "danger",
      description: "danger",
      parameters: { type: "object", properties: {} },
      handler: async () => ({ ok: true }),
    });

    await expect(exec.call("danger", {})).rejects.toBeInstanceOf(ToolDeniedError);
    expect(beforeCalled).toBe(false);
  });

  it("returns beforeExecute metadata with the tool result", async () => {
    const exec = new ToolExecutor(
      { repoPath: os.tmpdir(), env: {}, timeoutSec: 5, extra: {} },
      undefined,
      () => ({ checkpointId: "cp-1" }),
    );
    exec.register({
      name: "write",
      description: "write",
      parameters: { type: "object", properties: {} },
      handler: async () => ({ ok: true }),
    });

    await expect(exec.call("write", {})).resolves.toEqual({
      ok: true,
      execution_metadata: {
        beforeExecute: { checkpointId: "cp-1" },
      },
    });
  });

  it("streams tool runtime events before the final result", async () => {
    const exec = new ToolExecutor({ repoPath: os.tmpdir(), env: {}, timeoutSec: 5, extra: {} });
    exec.register({
      name: "streaming",
      description: "streaming",
      parameters: { type: "object", properties: {} },
      handler: async (ctx) => {
        ctx.emitToolEvent?.({ type: "output", stream: "stdout", text: "line 1\n" });
        ctx.emitToolEvent?.({ type: "output", stream: "stderr", text: "warn\n" });
        return { ok: true };
      },
    });

    const events = [];
    for await (const event of exec.callStream("streaming", {})) events.push(event);

    expect(events).toEqual([
      { type: "output", stream: "stdout", text: "line 1\n" },
      { type: "output", stream: "stderr", text: "warn\n" },
      { type: "result", result: { ok: true } },
    ]);
  });
});
