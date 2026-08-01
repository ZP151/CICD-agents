import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-chat-intent-"));
  process.env.RUNTIME_DATA_DIR = tmp;
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
});

describe("daemon chat intent routing", () => {
  it("keeps a natural-language review request in the formal planner conversation", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-chat-formal-prompt-"));
    fs.writeFileSync(path.join(repo, "README.md"), "# demo\n", "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "Review my changes.",
        repoPath: repo,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const events = parseSse(response.body);
    expect(events.map((entry) => entry.event)).toEqual(expect.arrayContaining([
      "turn.started",
      "turn.phase",
      "turn.execution.completed",
      "turn.final.completed",
      "turn.finished",
    ]));
    expect(events.some((entry) => entry.event === "tool_start" || entry.event === "tool.started")).toBe(false);
    const turnStartedIndex = events.findIndex((entry) => entry.event === "turn.started");
    const progressIndex = events.findIndex((entry) => entry.event === "turn.phase");
    const executionCompleteIndex = events.findIndex((entry) => entry.event === "turn.execution.completed");
    expect(turnStartedIndex).toBeGreaterThanOrEqual(0);
    expect(progressIndex).toBeGreaterThan(turnStartedIndex);
    expect(executionCompleteIndex).toBeGreaterThan(progressIndex);
    // No canned opening is allowed for a no-tool/fallback turn.
    expect(events.find((entry) => entry.event === "turn.narrative.delta")).toBeUndefined();
    const workflowPhases = events
      .filter((entry) => entry.event === "workflow_state" || entry.event === "workflow.updated")
      .map((entry) => (entry.data as { state?: { workflowPhase?: string } }).state?.workflowPhase);
    expect(workflowPhases).not.toContain("inspect_changes");
  });
});

function parseSse(body: string): Array<{ event: string; data: unknown }> {
  return body
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\n/);
      const event = lines.find((line) => line.startsWith("event: "))?.slice("event: ".length) ?? "message";
      const dataLine = lines.find((line) => line.startsWith("data: "));
      return {
        event,
        data: dataLine ? JSON.parse(dataLine.slice("data: ".length)) : undefined,
      };
    });
}
