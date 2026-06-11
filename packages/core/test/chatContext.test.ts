import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { LLMClient, resetSettingsForTests } from "../src/index.js";
import { buildChatContext, chatContextToPrompt, describeChatContext, getChatIndexStatus, refreshChatIndex, shouldInspectGit } from "../src/chatContext.js";

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

function git(repo: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
}

describe("chat context", () => {
  beforeEach(() => {
    process.env.AZURE_OPENAI_ENDPOINT = "";
    process.env.AZURE_OPENAI_API_KEY = "";
    process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-context-data-"));
    resetSettingsForTests();
  });

  it("does not treat general project understanding as a Git-state request", () => {
    expect(shouldInspectGit("Explain how this project is structured")).toBe(false);
    expect(shouldInspectGit("What changed on this branch?")).toBe(true);
  });

  it("adds interpretation and diff context for Git-state questions", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-context-git-repo-"));
    git(repo, ["init"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test User"]);
    write(path.join(repo, "src", "ClaimsController.cs"), "public class ClaimsController { string Status() => \"old\"; }\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "initial"]);
    write(
      path.join(repo, "src", "ClaimsController.cs"),
      "public class ClaimsController { string Status() => \"new\"; string Retry() => \"fallback\"; }\n",
    );

    const llm = new LLMClient();
    const bundle = await buildChatContext({
      repoPath: repo,
      message: "What are the current workspace changes about?",
      llm,
      profile: { targetBranch: "main" },
    });

    expect(bundle.changedFiles).toHaveLength(1);
    expect(bundle.changeSummary).toContain("API/controller behavior");
    expect(bundle.changeDiffExcerpt).toContain("Retry");

    const prompt = chatContextToPrompt(bundle);
    expect(prompt).toContain("Change interpretation");
    expect(prompt).toContain("Diff excerpt for understanding the change");
  });

  it("builds repository context without embeddings", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-context-repo-"));
    write(path.join(repo, "README.md"), "# Demo Agent\n\nThis project streams chat events.");
    write(path.join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: { test: "vitest" } }, null, 2));
    write(
      path.join(repo, "src", "chatSession.ts"),
      "export class ChatSession { run() { return 'stream chat events'; } }\n",
    );
    write(path.join(repo, "src", "chatPlanner.ts"), "export function planChat() { return 'plan'; }\n");
    write(path.join(repo, "test", "chatSession.test.ts"), "import '../src/chatSession';\n");

    const llm = new LLMClient();
    const bundle = await buildChatContext({
      repoPath: repo,
      message: "Where is the chat session flow implemented?",
      llm,
      profile: { buildCommand: "npm run build", testCommand: "npm test", targetBranch: "main" },
    });

    expect(bundle.indexed).toBe(false);
    expect(bundle.indexStats.filesIndexed).toBe(0);
    expect(bundle.fallbackUsed).toBe(true);
    expect(bundle.changedFiles).toEqual([]);
    expect(bundle.projectStructure.some((item) => item.path.includes("src/chatSession.ts"))).toBe(true);
    expect(bundle.relevantChunks.some((chunk) => chunk.path === "README.md")).toBe(true);
    expect(bundle.relevantChunks.some((chunk) => chunk.path.includes("chatSession.ts"))).toBe(true);

    const prompt = chatContextToPrompt(bundle);
    expect(prompt).toContain("Repository context");
    expect(prompt).toContain("Build command: npm run build");
    expect(prompt).toContain("src/chatSession.ts");
    expect(describeChatContext(bundle)).toContain("quick scan used");
  });

  it("reports when a repository index is available", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-context-indexed-repo-"));
    write(path.join(repo, "src", "chatSession.ts"), "export function runChat() { return 'indexed chat'; }\n");

    const llm = new LLMClient();
    const before = getChatIndexStatus(repo);
    expect(before.indexed).toBe(false);
    expect(before.semanticReady).toBe(false);
    expect(before.retrievalMode).toBe("quick-scan");

    await refreshChatIndex({ repoPath: repo, llm });
    const after = getChatIndexStatus(repo);
    expect(after.indexed).toBe(true);
    expect(after.semanticReady).toBe(false);
    expect(after.stats.filesIndexed).toBe(1);
    expect(after.summary).toContain("Index exists");

    const bundle = await buildChatContext({
      repoPath: repo,
      message: "Where is chat implemented?",
      llm,
    });

    expect(bundle.indexed).toBe(true);
    expect(bundle.indexStats.filesIndexed).toBe(1);
    expect(bundle.indexStats.chunksIndexed).toBeGreaterThan(0);
    expect(bundle.embedded).toBe(false);
    expect(describeChatContext(bundle)).toContain("index is available");

    const prompt = chatContextToPrompt(bundle);
    expect(prompt).toContain("indexed (1 files");
  });

  it("keeps the file index usable when embedding generation fails", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-context-embedding-fallback-"));
    write(path.join(repo, "src", "server.ts"), "export function startServer() { return 'api'; }\n");

    const llm = {
      configured: true,
      embed: async () => {
        throw new Error("embedding deployment missing");
      },
    } as unknown as LLMClient;

    const stats = await refreshChatIndex({ repoPath: repo, llm });
    expect(stats.filesIndexed).toBe(1);
    expect(stats.embedded).toBe(0);
    expect(stats.embeddingError).toContain("embedding deployment missing");

    const status = getChatIndexStatus(repo);
    expect(status.indexed).toBe(true);
    expect(status.semanticReady).toBe(false);
  });
});
