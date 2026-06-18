import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LLMClient, resetSettingsForTests } from "@mergepilot/core";
import { createChatToolExecutors } from "../src/chatSession.js";

describe("chat session repository index refresh workflow", () => {
  it("returns follow-up repository context after refreshing the index", async () => {
    process.env.AZURE_OPENAI_ENDPOINT = "";
    process.env.AZURE_OPENAI_API_KEY = "";
    process.env.RUNTIME_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-index-tool-"));
    resetSettingsForTests();

    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-index-repo-"));
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(path.join(repo, "README.md"), "# Demo Architecture\n\nThe daemon streams chat events.\n", "utf8");
    fs.writeFileSync(path.join(repo, "src", "server.ts"), "export function startServer() { return 'daemon api'; }\n", "utf8");

    const executors = await createChatToolExecutors(
      {
        repoPath: repo,
        env: {},
        timeoutSec: 10,
        extra: { chat_message: "Explain this project architecture" },
      },
      new LLMClient(),
    );
    try {
      const result = await executors.plannerExecutor.call("repo_refresh_index", {});
      expect(result.ok).toBe(true);
      expect(Number(result.filesSeen)).toBeGreaterThanOrEqual(1);
      expect(Number(result.totalFilesIndexed)).toBeGreaterThanOrEqual(1);
      expect(String(result.summary)).toContain("Current index");
      expect(String(result.summary)).toContain("Follow-up repository context");
      expect(String(result.contextSummary)).toContain("index is available");
      expect(String(result.repositoryContextPrompt)).toContain("Demo Architecture");
      expect(String(result.repositoryContextPrompt)).toContain("src/server.ts");
      expect(String(result.instruction)).toContain("answer the user's original request");
      expect(String(result.instruction)).toContain("contextSources");
      expect(String(result.instruction)).toContain("incremental update count");
      const contextSources = result.contextSources as Array<{ type?: string; file?: string; title?: string; snippet?: string }>;
      expect(contextSources.some((source) =>
        source.type === "source_document" &&
        source.file === "src/server.ts",
      )).toBe(true);
    } finally {
      await executors.close();
    }
  });
});
