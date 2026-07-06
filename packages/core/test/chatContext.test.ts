import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { LLMClient, resetSettingsForTests } from "../src/index.js";
import {
  buildChatContext,
  chatContextSources,
  chatContextToPrompt,
  describeChatContext,
  getChatIndexStatus,
  refreshChatIndex,
  shouldInspectGit,
} from "../src/chatContext.js";

let tempPaths: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempPaths.push(dir);
  return dir;
}

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

function writeBinary(file: string, bytes: number[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(bytes));
}

function git(repo: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
}

describe("chat context", () => {
  beforeEach(() => {
    process.env.AZURE_OPENAI_ENDPOINT = "";
    process.env.AZURE_OPENAI_API_KEY = "";
    process.env.RUNTIME_DATA_DIR = makeTempDir("cicd-chat-context-data-");
    resetSettingsForTests();
  });

  afterEach(() => {
    for (const tempPath of tempPaths) {
      fs.rmSync(tempPath, { recursive: true, force: true });
    }
    tempPaths = [];
  });

  it("does not treat general project understanding as a Git-state request", () => {
    expect(shouldInspectGit("Explain how this project is structured")).toBe(false);
    expect(shouldInspectGit("What changed on this branch?")).toBe(true);
  });

  it("adds interpretation and diff context for Git-state questions", async () => {
    const repo = makeTempDir("cicd-chat-context-git-repo-");
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
      projectLink: { targetBranch: "main" },
    });

    expect(bundle.changedFiles).toHaveLength(1);
    expect(bundle.changeSummary).toContain("API/controller behavior");
    expect(bundle.changeDiffExcerpt).toContain("Retry");

    const prompt = chatContextToPrompt(bundle);
    expect(prompt).toContain("Change interpretation");
    expect(prompt).toContain("Diff excerpt for understanding the change");

    const sources = chatContextSources(bundle);
    expect(sources[0]).toMatchObject({
      type: "source_document",
      title: "src/ClaimsController.cs:1",
      file: "src/ClaimsController.cs",
      line: 1,
    });
    expect(sources[0]?.type === "source_document" ? sources[0].snippet : "").toContain("Retry");
  });

  it("builds a seeded change-review context with risk, test, and security evidence", async () => {
    const repo = makeTempDir("cicd-chat-context-risk-golden-");
    git(repo, ["init"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test User"]);
    write(
      path.join(repo, "BotToSharePoint", "Controllers", "ClaimController.cs"),
      [
        "public class ClaimController",
        "{",
        "  public string SubmitClaim(Claim request)",
        "  {",
        "    if (!ModelState.IsValid) return \"invalid\";",
        "    return SaveClaim(request);",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
    write(
      path.join(repo, "BotToSharePoint", "Common", "CommonFunctions.cs"),
      [
        "public static class CommonFunctions",
        "{",
        "  public static string ConnectToSharePoint() => \"ok\";",
        "}",
        "",
      ].join("\n"),
    );
    write(
      path.join(repo, "BotToSharePoint", "Web.config"),
      [
        "<configuration>",
        "  <appSettings>",
        "    <add key=\"SharePointSite\" value=\"https://example\" />",
        "  </appSettings>",
        "</configuration>",
        "",
      ].join("\n"),
    );
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "initial"]);

    write(
      path.join(repo, "BotToSharePoint", "Controllers", "ClaimController.cs"),
      [
        "public class ClaimController",
        "{",
        "  public string SubmitClaim(Claim request)",
        "  {",
        "    try",
        "    {",
        "      return SaveClaim(request);",
        "    }",
        "    catch (Exception ex)",
        "    {",
        "      throw ex;",
        "    }",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
    write(
      path.join(repo, "BotToSharePoint", "Web.config"),
      [
        "<configuration>",
        "  <appSettings>",
        "    <add key=\"SharePointSite\" value=\"https://example\" />",
        "    <add key=\"AzureOpenAIApiKey\" value=\"TODO_SET_IN_KEY_VAULT\" />",
        "  </appSettings>",
        "</configuration>",
        "",
      ].join("\n"),
    );

    const llm = new LLMClient();
    const bundle = await buildChatContext({
      repoPath: repo,
      message: "Review my current changes for correctness, security, and test risk. Read-only only.",
      llm,
      projectLink: {
        buildCommand: "msbuild BotToSharePoint.sln",
        testCommand: "vstest.console.exe BotToSharePoint.Tests.dll",
        pipelineName: "ClaimBot_API",
        targetBranch: "main",
      },
      maxChunks: 8,
    });

    expect(bundle.changedFiles.map((file) => file.path).sort()).toEqual([
      "BotToSharePoint/Controllers/ClaimController.cs",
      "BotToSharePoint/Web.config",
    ]);
    expect(bundle.changeSummary).toContain("API/controller behavior");
    expect(bundle.changeSummary).toContain("configuration or CI/CD");
    expect(bundle.changeSummary).toContain("error handling or diagnostics");
    expect(bundle.changeSummary).toContain("secret/configuration risk");
    expect(bundle.changeDiffExcerpt).toContain("throw ex");
    expect(bundle.changeDiffExcerpt).toContain("AzureOpenAIApiKey");

    const prompt = chatContextToPrompt(bundle, 20000);
    expect(prompt).toContain("Change interpretation");
    expect(prompt).toContain("Changed files");
    expect(prompt).toContain("Diff excerpt for understanding the change");
    expect(prompt).toContain("Build command: msbuild BotToSharePoint.sln");
    expect(prompt).toContain("Test command: vstest.console.exe BotToSharePoint.Tests.dll");
    expect(prompt).toContain("if (!ModelState.IsValid)");
    expect(prompt).toContain("throw ex");
    expect(prompt).toContain("AzureOpenAIApiKey");

    const sources = chatContextSources(bundle, 12);
    expect(sources.some((source) =>
      source.type === "source_document" &&
      source.file === "BotToSharePoint/Controllers/ClaimController.cs" &&
      source.snippet?.includes("throw ex"),
    )).toBe(true);
    expect(sources.some((source) =>
      source.type === "source_document" &&
      source.file === "BotToSharePoint/Web.config" &&
      source.snippet?.includes("AzureOpenAIApiKey"),
    )).toBe(true);
  });

  it("builds repository context without embeddings", async () => {
    const repo = makeTempDir("cicd-chat-context-repo-");
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
      projectLink: { buildCommand: "npm run build", testCommand: "npm test", targetBranch: "main" },
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

    const sources = chatContextSources(bundle);
    expect(sources.some((source) => source.type === "source_document" && source.file === "README.md")).toBe(true);
    expect(sources.some((source) => source.type === "source_document" && source.file === "src/chatSession.ts")).toBe(true);
    expect(sources.some((source) =>
      source.type === "source_document" &&
      source.file === "src/chatSession.ts" &&
      source.title.includes("(source)") &&
      source.snippet?.includes("Project structure signal"),
    )).toBe(true);
  });

  it("excludes binary media files from quick-scan source evidence", async () => {
    const repo = makeTempDir("cicd-chat-context-binary-repo-");
    write(path.join(repo, "README.md"), "# ClaimBot API\n\nClaim handling runs through BotToSharePoint controllers.");
    write(
      path.join(repo, "BotToSharePoint", "Controllers", "OtherClaimsController.cs"),
      "public class ClaimController { public string ListClaims() => \"claims\"; }\n",
    );
    writeBinary(path.join(repo, "BotToSharePoint", "images", "icons", "otherClaims.png"), [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
    ]);
    write(
      path.join(repo, "BotToSharePoint", "Scripts", "otherClaims.min.js"),
      "function otherClaims(){return 'minified vendor bundle should not ground architecture answers';}\n",
    );

    const llm = new LLMClient();
    const bundle = await buildChatContext({
      repoPath: repo,
      message: "Explain the otherClaims ClaimBot project architecture.",
      llm,
    });

    expect(bundle.relevantChunks.some((chunk) => chunk.path.endsWith(".png"))).toBe(false);
    expect(bundle.relevantChunks.some((chunk) => chunk.path.endsWith(".min.js"))).toBe(false);
    expect(bundle.relevantChunks.some((chunk) => chunk.path.includes("OtherClaimsController.cs"))).toBe(true);
    const sources = chatContextSources(bundle, 12);
    expect(sources.some((source) => source.type === "source_document" && source.file?.endsWith(".png"))).toBe(false);

    const prompt = chatContextToPrompt(bundle);
    expect(prompt).toContain("OtherClaimsController.cs");
    expect(prompt).not.toContain("otherClaims.png");
    expect(prompt).not.toContain("otherClaims.min.js");
    expect(prompt).not.toContain("\uFFFD");
  });

  it("builds a golden architecture context from concrete project evidence", async () => {
    const repo = makeTempDir("cicd-chat-context-architecture-golden-");
    write(
      path.join(repo, "README.md"),
      [
        "# ClaimBot SharePoint API",
        "",
        "A .NET Framework Web API for claim submission, OCR extraction, and SharePoint integration.",
        "Claims enter through BotToSharePoint controllers and are rendered through ASP.NET views.",
      ].join("\n"),
    );
    write(
      path.join(repo, "azure-pipelines.yml"),
      [
        "trigger:",
        "- main",
        "steps:",
        "- task: VSBuild@1",
        "  inputs:",
        "    solution: BotToSharePoint.sln",
      ].join("\n"),
    );
    write(
      path.join(repo, "Web.config"),
      "<configuration><appSettings><add key=\"SharePointSite\" value=\"https://example\" /></appSettings></configuration>\n",
    );
    write(
      path.join(repo, "BotToSharePoint", "Controllers", "ClaimController.cs"),
      "public class ClaimController { public string SubmitClaim() => \"claim request accepted\"; }\n",
    );
    write(
      path.join(repo, "BotToSharePoint", "Models", "Project.cs"),
      "public class Project { public string ClaimNumber { get; set; } = string.Empty; }\n",
    );
    write(
      path.join(repo, "BotToSharePoint", "Views", "Home", "Index.cshtml"),
      "@model Project\n<h1>Claim intake</h1>\n",
    );
    write(
      path.join(repo, "legacy", "InvoiceClaimsChatbot", "server.py"),
      "print('stale invoice chatbot context should not explain ClaimBot architecture')\n",
    );

    const llm = new LLMClient();
    const bundle = await buildChatContext({
      repoPath: repo,
      message: "Explain the ClaimBot claim request flow, views, configuration, pipeline, and project architecture.",
      llm,
      projectLink: {
        buildCommand: "msbuild BotToSharePoint.sln",
        testCommand: "vstest.console.exe BotToSharePoint.Tests.dll",
        pipelineName: "ClaimBot_API",
        targetBranch: "main",
      },
      maxChunks: 10,
    });

    const prompt = chatContextToPrompt(bundle, 20000);
    expect(prompt).toContain("ClaimBot SharePoint API");
    expect(prompt).toContain("BotToSharePoint/Controllers/ClaimController.cs");
    expect(prompt).toContain("BotToSharePoint/Models/Project.cs");
    expect(prompt).toContain("BotToSharePoint/Views/Home/Index.cshtml");
    expect(prompt).toContain("Web.config");
    expect(prompt).toContain("azure-pipelines.yml");
    expect(prompt).toContain("Pipeline: ClaimBot_API");
    expect(prompt).toContain("Build command: msbuild BotToSharePoint.sln");
    expect(prompt).not.toContain("InvoiceClaimsChatbot");
    expect(prompt).not.toContain("stale invoice chatbot");

    const sourceFiles = chatContextSources(bundle, 16)
      .filter((source) => source.type === "source_document")
      .map((source) => source.file);
    expect(sourceFiles).toContain("README.md");
    expect(sourceFiles).toContain("BotToSharePoint/Controllers/ClaimController.cs");
    expect(sourceFiles).toContain("BotToSharePoint/Models/Project.cs");
    expect(sourceFiles).toContain("BotToSharePoint/Views/Home/Index.cshtml");
    expect(sourceFiles).toContain("Web.config");
    expect(sourceFiles).not.toContain("legacy/InvoiceClaimsChatbot/server.py");
  });

  it("reports when a repository index is available", async () => {
    const repo = makeTempDir("cicd-chat-context-indexed-repo-");
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
    const repo = makeTempDir("cicd-chat-context-embedding-fallback-");
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
