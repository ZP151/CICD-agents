import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LLMClient, resetSettingsForTests } from "../src/index.js";
import { buildChatContext, chatContextToPrompt, shouldInspectGit } from "../src/chatContext.js";

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
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
    expect(bundle.fallbackUsed).toBe(true);
    expect(bundle.changedFiles).toEqual([]);
    expect(bundle.projectStructure.some((item) => item.path.includes("src/chatSession.ts"))).toBe(true);
    expect(bundle.relevantChunks.some((chunk) => chunk.path === "README.md")).toBe(true);
    expect(bundle.relevantChunks.some((chunk) => chunk.path.includes("chatSession.ts"))).toBe(true);

    const prompt = chatContextToPrompt(bundle);
    expect(prompt).toContain("Repository context");
    expect(prompt).toContain("Build command: npm run build");
    expect(prompt).toContain("src/chatSession.ts");
  });
});
