import { describe, expect, it, vi } from "vitest";
import os from "node:os";
import { Readable, Writable } from "node:stream";

/**
 * The daemon's tool runtime spawns git with shell:false and a plain
 * process.env. On this Windows host the CreateProcess PATH search can fail
 * intermittently with ENOENT (slow/broken PATH entries); runCommand must
 * recover by injecting the known Git for Windows directories and retrying
 * exactly once. These tests mock the spawn surface so the recovery path is
 * exercised deterministically.
 */

const spawnState = vi.hoisted(() => ({
  calls: [] as Array<{ cmd: string; args: string[] }>,
  failCount: 0, // how many leading spawn calls fail with ENOENT
  failCode: "ENOENT" as string | null,
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (cmd: string, args: string[], opts: unknown) => {
      spawnState.calls.push({ cmd, args });
      if (spawnState.calls.length <= spawnState.failCount && spawnState.failCode) {
        const child = new actual.ChildProcess();
        child.stdout = new Readable({ read() {} });
        child.stderr = new Readable({ read() {} });
        child.stdin = new Writable({ write(_c, _e, cb) { cb(); } });
        const err = new Error(`spawn ${cmd} ENOENT`) as NodeJS.ErrnoException;
        err.code = spawnState.failCode;
        setImmediate(() => child.emit("error", err));
        return child;
      }
      return actual.spawn(cmd, args, opts);
    },
  };
});

import { runCommand, ToolError } from "../src/tools/executor.js";

const isWin32 = process.platform === "win32";

describe("runCommand git-path recovery", () => {
  it.skipIf(!isWin32)("recovers a single git ENOENT by injecting the known git directory and retrying once", async () => {
    spawnState.calls = [];
    spawnState.failCount = 1;
    spawnState.failCode = "ENOENT";
    try {
      const result = await runCommand(["git", "--version"], { cwd: os.tmpdir() });
      expect(result.returncode).toBe(0);
      expect(result.stdout).toContain("git version");
    } finally {
      spawnState.failCount = 0;
      spawnState.failCode = null;
    }
    expect(spawnState.calls).toEqual([
      { cmd: "git", args: ["--version"] },
      { cmd: "git", args: ["--version"] },
    ]);
  });

  it("does not retry non-ENOENT spawn errors", async () => {
    spawnState.calls = [];
    spawnState.failCount = 1;
    spawnState.failCode = "EACCES";
    try {
      await expect(runCommand(["git", "--version"], { cwd: os.tmpdir() })).rejects.toThrow(/failed to spawn git/);
    } finally {
      spawnState.failCount = 0;
      spawnState.failCode = null;
    }
    expect(spawnState.calls).toHaveLength(1); // exactly one spawn, never retried
  });

  it("does not retry when git keeps failing ENOENT (bounded recovery)", async () => {
    spawnState.calls = [];
    spawnState.failCount = 2;
    spawnState.failCode = "ENOENT";
    try {
      await expect(runCommand(["git", "--version"], { cwd: os.tmpdir() })).rejects.toThrow(
        /failed to spawn git.*git was still unresolvable after git-path recovery/,
      );
    } finally {
      spawnState.failCount = 0;
      spawnState.failCode = null;
    }
    expect(spawnState.calls).toHaveLength(2); // first spawn fails, retry fails, recovery gives up
  });

  it("only recovers the git executable, not other commands", async () => {
    spawnState.calls = [];
    spawnState.failCount = 1;
    spawnState.failCode = "ENOENT";
    try {
      await expect(runCommand(["dotnet", "--version"], { cwd: os.tmpdir() })).rejects.toThrow(/failed to spawn dotnet/);
    } finally {
      spawnState.failCount = 0;
      spawnState.failCode = null;
    }
    expect(spawnState.calls).toHaveLength(1); // never retried
  });
});
