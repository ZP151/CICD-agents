import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  CHAT_FINAL_TOOL_NAME,
  evaluateAiInsightAnswer,
  LLMClient,
  resetSettingsForTests,
  type ChatStreamEvent,
} from "@mergepilot/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;
let runtimeDataDir: string | null = null;
let seededRepos: string[] = [];

const qualityExpectation = {
  requiredFiles: [
    "BotToSharePoint/Controllers/ClaimController.cs",
    "BotToSharePoint/Web.config",
  ],
  requiredCategories: ["correctness", "security", "config", "tests", "deployment"] as const,
  reviewOnly: true,
};

beforeEach(() => {
  runtimeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-ai-quality-chat-"));
  process.env.RUNTIME_DATA_DIR = runtimeDataDir;
  process.env.RUNTIME_HOST = "127.0.0.1";
  process.env.RUNTIME_PORT = "0";
  process.env.AZURE_OPENAI_ENDPOINT = "";
  process.env.AZURE_OPENAI_API_KEY = "";
  process.env.AZURE_COSMOS_ENDPOINT = "";
  process.env.AZURE_STORAGE_ACCOUNT = "";
  process.env.AZURE_KEYVAULT_URL = "";
  resetSettingsForTests();
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (app) {
    await app.close();
    app = null;
  }
  if (runtimeDataDir) {
    fs.rmSync(runtimeDataDir, { recursive: true, force: true });
    runtimeDataDir = null;
  }
  for (const repo of seededRepos) {
    fs.rmSync(repo, { recursive: true, force: true });
  }
  seededRepos = [];
});

describe("daemon Chat AI insight quality gate", () => {
  it("scores a mocked /chat final answer against seeded change-review expectations", async () => {
    mockFinalAnswer([
      "Correctness risk in BotToSharePoint/Controllers/ClaimController.cs:",
      "removing ModelState validation and using `throw ex` can change invalid-claim behavior",
      "and hide the original stack trace.",
      "",
      "Security/config risk in BotToSharePoint/Web.config: AzureOpenAIApiKey should stay in Key Vault",
      "or local secret configuration, not in committed config.",
      "",
      "Tests: add invalid-payload and exception-path regression coverage.",
      "Deployment: run the ClaimBot_API build or pipeline because Web.config changes affect packaging.",
    ].join("\n"));
    app = await buildApp();
    const repo = initSeededRiskRepo();

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "Assess changed files for correctness, security, config, tests, and deployment risk. Read-only only.",
        repoPath: repo,
        llmConfig: {
          llmProvider: "azure",
          azureEndpoint: "https://example.openai.azure.com",
          azureApiKey: "test-key",
          azureDeployment: "gpt-4o",
          azureApiVersion: "2024-08-01-preview",
        },
        projectLink: {
          repoPath: repo,
          defaultBranch: "main",
          targetBranch: "main",
          buildCommand: "msbuild BotToSharePoint.sln",
          testCommand: "vstest.console.exe BotToSharePoint.Tests.dll",
          adoPipelineName: "ClaimBot_API",
        },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const events = parseSse(response.body);
    expect(events.some((entry) => entry.event === "approval_required" || entry.event === "approval.required")).toBe(false);
    const final = finalResultFromEvents(events);
    expect(final?.approvalProposal).toBeUndefined();
    expect(final?.response).toContain("ClaimController.cs");

    const quality = evaluateAiInsightAnswer(final?.response ?? "", qualityExpectation);
    expect(quality.passed).toBe(true);
    expect(quality.score).toBe(1);
  });

  it("fails the quality scorer for a vague /chat final answer while still blocking write escalation", async () => {
    mockFinalAnswer("I found changes in ClaimController.cs and Web.config. Would you like me to stage these changes for a commit?");
    app = await buildApp();
    const repo = initSeededRiskRepo();

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "Assess changed files for correctness, security, config, tests, and deployment risk. Do not stage, commit, or push.",
        repoPath: repo,
        llmConfig: {
          llmProvider: "azure",
          azureEndpoint: "https://example.openai.azure.com",
          azureApiKey: "test-key",
          azureDeployment: "gpt-4o",
          azureApiVersion: "2024-08-01-preview",
        },
        projectLink: {
          repoPath: repo,
          defaultBranch: "main",
          targetBranch: "main",
        },
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const events = parseSse(response.body);
    expect(events.some((entry) => entry.event === "approval_required" || entry.event === "approval.required")).toBe(false);
    const final = finalResultFromEvents(events);
    expect(final?.approvalProposal).toBeUndefined();
    expect(final?.response).not.toContain("Would you like me to stage");

    const quality = evaluateAiInsightAnswer(final?.response ?? "", qualityExpectation);
    expect(quality.passed).toBe(false);
    expect(quality.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "category:security", passed: false }),
        expect.objectContaining({ id: "category:tests", passed: false }),
        expect.objectContaining({ id: "category:deployment", passed: false }),
      ]),
    );
  });
});

function mockFinalAnswer(answer: string): void {
  vi.spyOn(LLMClient.prototype, "embed").mockResolvedValue([]);
  vi.spyOn(LLMClient.prototype, "chatStream").mockImplementation(async function* (): AsyncGenerator<ChatStreamEvent> {
    yield {
      type: "tool_call",
      toolCalls: [
        {
          id: "call_final",
          name: CHAT_FINAL_TOOL_NAME,
          arguments: JSON.stringify({
            response: answer,
            risk_level: "low",
            actions_taken: ["git_status", "git_diff"],
            suggestions: [],
            approval_proposal: {
              tool: "git_add",
              args: {},
              description: "Stage all changes",
              nextHint: "commit",
            },
          }),
        },
      ],
    };
    yield { type: "done", finishReason: "tool_calls" };
  });
}

function initSeededRiskRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-ai-quality-repo-"));
  seededRepos.push(repo);
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "mergepilot@example.test"]);
  git(repo, ["config", "user.name", "MergePilot"]);
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
      "    try { return SaveClaim(request); }",
      "    catch (Exception ex) { throw ex; }",
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
  return repo;
}

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

function git(repo: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
}

function parseSse(body: string): Array<{ event: string; data: unknown }> {
  return body
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block) => {
      const event = block.match(/^event: (.+)$/m)?.[1] ?? "";
      const dataText = block.match(/^data: (.+)$/m)?.[1] ?? "null";
      return { event, data: JSON.parse(dataText) as unknown };
    });
}

function finalResultFromEvents(events: Array<{ event: string; data: unknown }>): { response?: string; approvalProposal?: unknown } | undefined {
  const final = events.findLast((entry) => entry.event === "final")?.data as
    | { result?: { response?: string; approvalProposal?: unknown } }
    | undefined;
  return final?.result;
}
