import { describe, expect, it } from "vitest";
import { ChatPlanner } from "../src/chatPlanner.js";
import type { Tool } from "../src/tools/executor.js";
import {
  createToolExecutor,
  fakeSequenceLlm,
  runPlannerWithToolCall,
  unavailableLlm,
} from "./chatPlannerTestDoubles.js";
import { guardApprovalProposal, prohibitsStaging } from "../src/chatPlannerGuards.js";

describe("ChatPlanner approval guards", () => {
  it("requires change inspection before approving direct git_add calls", async () => {
    const executor = createToolExecutor();
    executor.register({
      name: "git_add",
      description: "Stage files",
      parameters: { type: "object", properties: {} },
      handler: async () => ({ ok: true }),
    });
    const planner = new ChatPlanner(
      fakeSequenceLlm([
        [
          {
            type: "tool_call",
            toolCalls: [{
              id: "call_add",
              name: "git_add",
              arguments: "{}",
            }],
          },
          { type: "done", finishReason: "tool_calls" },
        ],
        [
          {
            type: "tool_call",
            toolCalls: [{
              id: "call_final",
              name: "agent_final",
              arguments: JSON.stringify({
                response: "I need to inspect the current diff before staging anything.",
                risk_level: "low",
                actions_taken: [],
                suggestions: [],
              }),
            }],
          },
          { type: "done", finishReason: "tool_calls" },
        ],
      ]),
      executor,
      { maxSteps: 2 },
    );
    const events = [];

    for await (const event of planner.run("stage changes, commit and push", [], ".", async () => true)) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "tool_start" && event.name === "git_add")).toBe(false);
    expect(events.some((event) => event.type === "progress" && event.message.includes("git_status"))).toBe(true);
    const done = events.find((event) => event.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.approvalProposal).toBeUndefined();
      expect(done.result.response).toContain("inspect the current diff");
    }
  });

  it("does not stage or approve an empty commit when staging is explicitly forbidden", async () => {
    const executor = createToolExecutor();
    let staged = false;
    let committed = false;
    for (const tool of [
      {
        name: "git_add",
        description: "Stage files",
        parameters: { type: "object", properties: {} },
        handler: async () => {
          staged = true;
          return { ok: true, stdout: "", returncode: 0 };
        },
      },
      {
        name: "git_status",
        description: "Show working-tree status",
        parameters: { type: "object", properties: {} },
        handler: async () => ({ ok: true, stdout: "## main\n", returncode: 0 }),
      },
      {
        name: "git_diff",
        description: "Show Git diffs",
        parameters: { type: "object", properties: { staged: { type: "boolean" } } },
        handler: async () => ({ ok: true, stdout: "", returncode: 0 }),
      },
      {
        name: "git_commit",
        description: "Commit staged changes",
        parameters: { type: "object", properties: { message: { type: "string" } } },
        handler: async () => {
          committed = true;
          return { ok: true, stdout: "[main deadbeef] empty", returncode: 0 };
        },
      },
    ]) {
      executor.register(tool);
    }

    const planner = new ChatPlanner(
      fakeSequenceLlm([
        [
          {
            type: "tool_call",
            toolCalls: [{ id: "call_add", name: "git_add", arguments: "{\"all\":true}" }],
          },
          { type: "done", finishReason: "tool_calls" },
        ],
        [
          {
            type: "tool_call",
            toolCalls: [
              { id: "call_status", name: "git_status", arguments: "{}" },
              { id: "call_staged_diff", name: "git_diff", arguments: "{\"staged\":true}" },
            ],
          },
          { type: "done", finishReason: "tool_calls" },
        ],
        [
          {
            type: "tool_call",
            toolCalls: [{ id: "call_commit", name: "git_commit", arguments: "{\"message\":\"chore: should not happen\"}" }],
          },
          { type: "done", finishReason: "tool_calls" },
        ],
      ]),
      executor,
      { maxSteps: 4 },
    );
    const events = [];

    for await (const event of planner.run(
      'Commit staged changes with message "chore: should not happen". Do not stage anything. If nothing is staged, explain and stop.',
      [],
      ".",
      async () => true,
    )) {
      events.push(event);
    }

    const done = events.find((event) => event.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.approvalProposal).toBeUndefined();
      expect(done.result.response).toMatch(/no staged changes|nothing staged/i);
      expect(done.result.toolCallsMade.map((call) => call.name)).toEqual(["git_status", "git_diff"]);
    }
    expect(staged).toBe(false);
    expect(committed).toBe(false);
  });

  it("does not treat stale executed actions as the current turn's Git preflight", async () => {
    const executor = createToolExecutor();
    let committed = false;
    executor.register({
      name: "git_commit",
      description: "Commit staged changes",
      parameters: { type: "object", properties: { all: { type: "boolean" } } },
      handler: async () => {
        committed = true;
        return { ok: true };
      },
    });
    const planner = new ChatPlanner(
      fakeSequenceLlm([
        [
          {
            type: "tool_call",
            toolCalls: [{ id: "call_commit", name: "git_commit", arguments: "{\"all\":true}" }],
          },
          { type: "done", finishReason: "tool_calls" },
        ],
        [
          {
            type: "tool_call",
            toolCalls: [{
              id: "call_final",
              name: "agent_final",
              arguments: JSON.stringify({
                response: "I need current-turn staged evidence first.",
                risk_level: "low",
                actions_taken: [],
                suggestions: [],
              }),
            }],
          },
          { type: "done", finishReason: "tool_calls" },
        ],
      ]),
      executor,
      { maxSteps: 2 },
    );
    const events = [];
    for await (const event of planner.run(
      "Stage all changes and commit them with message chore: current turn",
      [{ role: "assistant", content: "[executed] git_add({\"all\":true})", timestamp: 1 }],
      ".",
      async () => true,
    )) {
      events.push(event);
    }

    const done = events.find((event) => event.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.approvalProposal).toBeUndefined();
      expect(done.result.response).toContain("current-turn staged evidence");
    }
    expect(committed).toBe(false);
  });

  it("normalizes final approval proposals that would stage implicitly", () => {
    const result = guardApprovalProposal({
      response: "I will stage and commit the changes.",
      finalizationMode: "plain_json",
      riskLevel: "medium",
      actionsTaken: [],
      suggestions: [],
      toolCallsMade: [],
      usedLlm: true,
      approvalProposal: {
        tool: "git_commit",
        args: { all: true, message: "chore: fixture" },
        description: "Commit all changes",
        nextHint: "done",
      },
    }, "Stage all changes and commit them with message chore: fixture", []);

    expect(result.approvalProposal).toMatchObject({
      tool: "git_add",
      args: { all: true },
    });
  });

  it("removes final staging proposals when the user explicitly forbids staging", () => {
    const result = guardApprovalProposal({
      response: "I can stage everything now.",
      finalizationMode: "plain_json",
      riskLevel: "medium",
      actionsTaken: [],
      suggestions: [],
      toolCallsMade: [],
      usedLlm: true,
      approvalProposal: {
        tool: "git_add",
        args: { all: true },
        description: "Stage all changes",
        nextHint: "commit staged changes",
      },
    }, "Commit staged changes. Do not stage anything. If nothing is staged, explain and stop.", []);

    expect(result.approvalProposal).toBeUndefined();
    expect(result.response).toMatch(/no staged changes/i);
  });

  it("keeps path-scoped staging requests distinct from a global staging prohibition", () => {
    expect(prohibitsStaging("Stage only README.md. Do not stage notes.txt.", [])).toBe(false);
    expect(prohibitsStaging("Commit staged changes. Do not stage anything.", [])).toBe(true);
    expect(prohibitsStaging("Commit staged changes without staging.", [])).toBe(true);
  });

  it("blocks direct git_add calls for review-only change requests", async () => {
    const tool: Tool = {
      name: "git_add",
      description: "Stage files",
      parameters: { type: "object", properties: {} },
      handler: async () => ({ ok: true }),
    };

    const { called, result, events } = await runPlannerWithToolCall(
      tool,
      { paths: ["src/a.ts"] },
      "review my changes",
    );

    expect(called).toBe(false);
    expect(events.some((event) => event.type === "tool_start")).toBe(false);
    expect(result.approvalProposal).toBeUndefined();
    expect(result.response).toContain("review-only request");
    expect(result.response).toContain("without proposing staging");
  });

  it("does not surface an approval for a write tool in an explicit read-only turn", async () => {
    const tool: Tool = {
      name: "git_merge",
      description: "Merge branch",
      parameters: { type: "object", properties: {} },
      handler: async () => ({ ok: true }),
    };

    const { called, result, events } = await runPlannerWithToolCall(
      tool,
      { ref: "feature/example" },
      "Only inspect the current Project Link repository branch, working tree, and recent commits. Do not modify any files.",
    );

    expect(called).toBe(false);
    expect(events.some((event) => event.type === "tool_start")).toBe(false);
    expect(result.approvalProposal).toBeUndefined();
    expect(result.response).toContain("explicitly read-only");
  });

  it.each([
    ["git_fetch", { remote: "origin", prune: true }, "medium"],
    ["git_commit", { message: "feat: test approval" }, "medium"],
    ["git_push", { branch: "feature/x" }, "high"],
    ["git_rebase", { onto: "origin/main", autostash: true }, "high"],
  ])("blocks direct approval-required tool calls for %s", async (name, args, riskLevel) => {
    const tool: Tool = {
      name,
      description: `Execute ${name}`,
      parameters: { type: "object", properties: {} },
      handler: async () => ({ ok: true }),
    };

    const { called, result, events } = await runPlannerWithToolCall(tool, args);

    expect(called).toBe(false);
    expect(events.some((event) => event.type === "tool_start")).toBe(false);
    expect(events.some((event) => event.type === "work_statement")).toBe(false);
    expect(result.riskLevel).toBe(riskLevel);
    expect(result.approvalProposal).toEqual({
      tool: name,
      args,
      description: `Execute ${name}`,
      nextHint: "continue workflow",
    });
    expect(result.response).toContain("requires approval");
  });

  it.each([
    ["ado_create_pr", { source_branch: "feature/x", title: "Test PR" }, "create a PR", "high"],
    ["ado_trigger_pipeline", { branch: "feature/x" }, "trigger the pipeline", "high"],
  ])("allows explicitly requested Azure DevOps approval-required tool calls for %s", async (
    name,
    args,
    message,
    riskLevel,
  ) => {
    const tool: Tool = {
      name,
      description: `Execute ${name}`,
      parameters: { type: "object", properties: {} },
      handler: async () => ({ ok: true }),
    };

    const { called, result, events } = await runPlannerWithToolCall(tool, args, message);

    expect(called).toBe(false);
    expect(events.some((event) => event.type === "tool_start")).toBe(false);
    expect(result.riskLevel).toBe(riskLevel);
    expect(result.approvalProposal).toEqual({
      tool: name,
      args,
      description: `Execute ${name}`,
      nextHint: "continue workflow",
    });
    expect(result.response).toContain("requires approval");
  });

  it("blocks out-of-scope Azure DevOps write actions", async () => {
    const tool: Tool = {
      name: "ado_create_pr",
      description: "Create pull request",
      parameters: { type: "object", properties: {} },
      handler: async () => ({ ok: true }),
    };

    const { called, result } = await runPlannerWithToolCall(
      tool,
      { source_branch: "feature/x", title: "Test PR" },
      "stage changes, commit and push",
    );

    expect(called).toBe(false);
    expect(result.approvalProposal).toBeUndefined();
    expect(result.response).toContain("does not include creating a pull request");
  });

  it("does not turn offline fallback into a deterministic Git workflow plan", async () => {
    const planner = new ChatPlanner(unavailableLlm(), createToolExecutor(), { maxSteps: 1 });
    const events = [];

    for await (const event of planner.run("push and create PR for branch feature/chat-agent", [], ".", async () => true)) {
      events.push(event);
    }

    const done = events.find((event) => event.type === "done");
    if (!done || done.type !== "done") throw new Error("missing done event");

    expect(done.result.usedLlm).toBe(false);
    expect(done.result.toolCallsMade).toEqual([]);
    expect(done.result.actionsTaken).toEqual([]);
    expect(done.result.approvalProposal).toBeUndefined();
    expect(done.result.response).toContain("did not infer or execute a Git/PR workflow");
    expect(done.result.response).not.toContain("git_push");
    expect(done.result.response).not.toContain("ado_create_pr");
    expect(done.result.suggestions).toEqual([
      "Review changes",
      "Check branch status",
      "Restore model connection",
    ]);
  });
});
