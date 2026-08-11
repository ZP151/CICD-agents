import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLink } from "@mergepilot/core";
import {
  detectPullRequestValidationPlan,
  PullRequestValidationCache,
  runPullRequestValidation,
} from "../src/pullRequestValidation.js";

const cleanup: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of cleanup.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const projectLink = {
  id: "claimbot",
  name: "ClaimBot_API",
  repoPath: "C:/work/ClaimBot_API",
} as ProjectLink;

describe("pull request current-SHA validation", () => {
  it("selects MSBuild for a full-framework solution without accepting a client command", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-pr-validation-"));
    cleanup.push(fixture);
    fs.writeFileSync(path.join(fixture, "ClaimBot.sln"), "fixture", "utf8");
    fs.mkdirSync(path.join(fixture, "Web"));
    fs.writeFileSync(path.join(fixture, "Web", "packages.config"), "<packages />", "utf8");
    const msbuild = path.join(fixture, "MSBuild.exe");
    fs.writeFileSync(msbuild, "fixture", "utf8");
    vi.stubEnv("MSBUILD_EXE_PATH", msbuild);

    const plan = detectPullRequestValidationPlan(fixture);

    expect(plan).toMatchObject({ kind: "msbuild" });
    expect(plan?.command[0]).toBe(msbuild);
    expect(plan?.command).toContain(path.join(fixture, "ClaimBot.sln"));
    expect(plan?.command).toContain("/t:Build");
  });

  it("binds a passing result to the exact HEAD and stores a bounded public excerpt", async () => {
    const result = await runPullRequestValidation({
      projectLink,
      expectedHeadSha: "abc1234",
      dependencies: {
        readHead: vi.fn(async () => "abc1234"),
        detectPlan: () => ({ command: ["fixture-test"], displayCommand: "fixture-test", kind: "node" }),
        execute: vi.fn(async () => ({ returncode: 0, stdout: "all tests passed", stderr: "", durationMs: 1_250 })),
        now: () => 1_786_000_000_000,
      },
    });

    expect(result).toMatchObject({
      status: "passed",
      sourceSha: "abc1234",
      durationMs: 1_250,
      outputExcerpt: "all tests passed",
      completedAt: 1_786_000_000_000,
    });
    expect(result.summary).toContain("passed for abc1234");
    const cache = new PullRequestValidationCache();
    cache.set(result);
    expect(cache.get("claimbot", "abc1234")).toEqual(result);
    expect(cache.get("claimbot", "different")).toBeUndefined();
  });

  it("discards a command success if HEAD moves during the run", async () => {
    const readHead = vi.fn()
      .mockResolvedValueOnce("abc1234")
      .mockResolvedValueOnce("def5678");
    const result = await runPullRequestValidation({
      projectLink,
      expectedHeadSha: "abc1234",
      dependencies: {
        readHead,
        detectPlan: () => ({ command: ["fixture-test"], displayCommand: "fixture-test", kind: "node" }),
        execute: vi.fn(async () => ({ returncode: 0, stdout: "passed", stderr: "", durationMs: 10 })),
        now: () => 1,
      },
    });

    expect(result.status).toBe("failed");
    expect(result.summary).toContain("HEAD moved");
  });

  it("reports a missing local build component as unavailable rather than a code failure", async () => {
    const result = await runPullRequestValidation({
      projectLink,
      expectedHeadSha: "abc1234",
      dependencies: {
        readHead: vi.fn(async () => "abc1234"),
        detectPlan: () => ({ command: ["MSBuild.exe"], displayCommand: "MSBuild.exe fixture.sln", kind: "msbuild" }),
        execute: vi.fn(async () => ({
          returncode: 1,
          stdout: "",
          stderr: "error MSB4226: WebApplications\\Microsoft.WebApplication.targets was not found",
          durationMs: 50,
        })),
        now: () => 1,
      },
    });

    expect(result.status).toBe("unavailable");
    expect(result.summary).toContain("toolchain components are unavailable");
    expect(result.outputExcerpt).toContain("MSB4226");
  });
});
