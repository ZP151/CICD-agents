import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { gitTools } from "../src/tools/git.js";
import type { ToolContext } from "../src/tools/executor.js";
import { toolCapability } from "../src/tools/capabilities.js";

function context(repo: string): ToolContext {
  return { repoPath: repo, env: {}, timeoutSec: 30, extra: {} };
}

function tool(name: string) {
  const found = gitTools().find((candidate) => candidate.name === name);
  expect(found).toBeDefined();
  return found!;
}

describe("read_text_file tool", () => {
  it("reads an untracked file and applies secret redaction", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-read-text-"));
    fs.writeFileSync(
      path.join(repo, ".env.sample"),
      [
        "AZURE_OPENAI_ENDPOINT=https://example.openai.azure.com/",
        "AZURE_OPENAI_API_KEY=mp_live_secret_1234567890abcdef",
        "",
      ].join("\n"),
      "utf8",
    );
    const result = await tool("read_text_file").handler(context(repo), { path: ".env.sample" });
    expect(result).toMatchObject({ returncode: 0 });
    const stdout = String(result["stdout"] ?? "");
    expect(stdout).toContain("https://example.openai.azure.com/");
    expect(stdout).toContain("AZURE_OPENAI_API_KEY=***REDACTED***");
    expect(stdout).not.toContain("mp_live_secret_1234567890abcdef");
  });

  it("reads tracked files in nested directories", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-read-text-"));
    fs.mkdirSync(path.join(repo, "src", "deep"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "deep", "notes.txt"), "hello world\n", "utf8");
    const result = await tool("read_text_file").handler(context(repo), { path: "src/deep/notes.txt" });
    expect(String(result["stdout"] ?? "")).toBe("hello world\n");
  });

  it("rejects path traversal out of the repository", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-read-text-"));
    fs.writeFileSync(path.join(repo, "inside.txt"), "in", "utf8");
    fs.writeFileSync(path.join(os.tmpdir(), "cicd-read-text-outside.txt"), "out", "utf8");
    await expect(
      tool("read_text_file").handler(context(repo), { path: `..${path.sep}cicd-read-text-outside.txt` }),
    ).rejects.toThrow(/outside the repository/);
    await expect(
      tool("read_text_file").handler(context(repo), { path: "sub/../../cicd-read-text-outside.txt" }),
    ).rejects.toThrow(/outside the repository/);
  });

  it("rejects absolute paths outside the repository", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-read-text-"));
    const outside = path.join(os.tmpdir(), "cicd-read-text-absolute.txt");
    fs.writeFileSync(outside, "out", "utf8");
    await expect(
      tool("read_text_file").handler(context(repo), { path: outside }),
    ).rejects.toThrow(/outside the repository/);
  });

  it("rejects binary files", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-read-text-"));
    fs.writeFileSync(path.join(repo, "blob.bin"), Buffer.from([0, 1, 2, 3, 0, 255]));
    await expect(tool("read_text_file").handler(context(repo), { path: "blob.bin" })).rejects.toThrow(
      /binary file/,
    );
  });

  it("rejects files exceeding max_bytes", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-read-text-"));
    fs.writeFileSync(path.join(repo, "big.txt"), "x".repeat(2048), "utf8");
    await expect(
      tool("read_text_file").handler(context(repo), { path: "big.txt", max_bytes: 1024 }),
    ).rejects.toThrow(/exceeding the 1024-byte limit/);
  });

  it("reports a clear error for missing files", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-read-text-"));
    await expect(
      tool("read_text_file").handler(context(repo), { path: "nope.txt" }),
    ).rejects.toThrow(/cannot stat 'nope\.txt'/);
  });

  it("classifies as low risk and read-only", () => {
    const capability = toolCapability(tool("read_text_file"));
    expect(capability.riskLevel).toBe("low");
    expect(capability.requiresApproval).toBe(false);
  });

  it("git_show guides the planner to read_text_file for untracked files", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-git-show-hint-"));
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
    fs.writeFileSync(path.join(repo, "tracked.txt"), "tracked content\n", "utf8");
    execFileSync("git", ["add", "tracked.txt"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "-q", "-m", "init"], {
      cwd: repo,
    });
    fs.writeFileSync(path.join(repo, ".env.sample"), "AZURE_OPENAI_API_KEY=mp_live_secret_1234567890abcdef\n", "utf8");

    await expect(
      tool("git_show").handler(context(repo), { revision: "HEAD", path: ".env.sample" }),
    ).rejects.toThrow(/untracked or newly added file/);
    await expect(
      tool("git_show").handler(context(repo), { revision: "HEAD", path: ".env.sample" }),
    ).rejects.toThrow(/Use read_text_file/);

    const tracked = await tool("git_show").handler(context(repo), { revision: "HEAD", path: "tracked.txt" });
    expect(String(tracked["stdout"] ?? "")).toContain("tracked content");
  });
});
