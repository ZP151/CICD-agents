import { describe, expect, it } from "vitest";
import os from "node:os";
import {
  redact,
  runCommand,
  splitCommand,
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
});

describe("runCommand", () => {
  it("rejects commands outside the allowlist", async () => {
    await expect(
      runCommand(["echo", "hi"], { cwd: os.tmpdir(), allowed: ["git"] }),
    ).rejects.toBeInstanceOf(ToolError);
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
});
