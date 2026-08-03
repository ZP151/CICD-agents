import { describe, expect, it } from "vitest";
import {
  applyTurnTimelineEvent,
  createOptimisticTurnTranscriptBubble,
  sealTurnTranscriptExecution,
  upsertTurnStartedTranscript,
} from "./chatTurnTranscript.js";

describe("Turn transcript reducer", () => {
  it("takes over the optimistic turn without resetting its clock and only renders groups after a command starts", () => {
    const optimistic = createOptimisticTurnTranscriptBubble("local", "Review the current branch", 1_000);
    const started = upsertTurnStartedTranscript([optimistic], {
      type: "turn.started",
      turnId: "turn-1",
      emittedAt: 1_100,
      sequence: 0,
    }, () => "unused");
    const withStatement = applyTurnTimelineEvent(started, {
      type: "turn.work.statement",
      turnId: "turn-1",
      sequence: 1,
      blockId: "opening",
      message: "I’ll inspect the branch and local changes before deciding what to do next.",
      replace: true,
    });
    const pendingGroup = applyTurnTimelineEvent(withStatement, {
      type: "turn.tool_group.started",
      turnId: "turn-1",
      sequence: 2,
      groupId: "decision-1",
    });
    const withCommand = applyTurnTimelineEvent(pendingGroup, {
      type: "turn.tool.started",
      turnId: "turn-1",
      sequence: 3,
      groupId: "decision-1",
      commandId: "command-1",
      name: "git_status",
      args: { command: "git status --short --branch" },
    });

    const transcript = withCommand[0]?.turnTranscript;
    expect(transcript?.startedAt).toBe(1_000);
    expect(transcript?.blocks).toEqual([
      expect.objectContaining({ kind: "statement", id: "opening", source: "server" }),
      expect.objectContaining({ kind: "tool_group", id: "decision-1", commands: [
        expect.objectContaining({ command: "git status --short --branch", status: "running" }),
      ] }),
    ]);
  });

  it("adopts the exact optimistic Turn when server starts arrive out of order", () => {
    const first = createOptimisticTurnTranscriptBubble("first", "Inspect the branch", 1_000);
    const second = createOptimisticTurnTranscriptBubble("second", "Review the changed files", 2_000);
    const secondStarted = upsertTurnStartedTranscript([first, second], {
      type: "turn.started", turnId: "turn-second", clientTurnId: "local-turn-second", emittedAt: 2_050, sequence: 0,
    }, () => "unused");
    const bothStarted = upsertTurnStartedTranscript(secondStarted, {
      type: "turn.started", turnId: "turn-first", clientTurnId: "local-turn-first", emittedAt: 1_050, sequence: 0,
    }, () => "unused");

    expect(bothStarted.map((bubble) => ({ turnId: bubble.turnId, startedAt: bubble.turnTranscript?.startedAt }))).toEqual([
      { turnId: "turn-first", startedAt: 1_000 },
      { turnId: "turn-second", startedAt: 2_000 },
    ]);
  });

  it("does not let an old daemon adopt an arbitrary Turn when more than one is pending", () => {
    const first = createOptimisticTurnTranscriptBubble("first", "Inspect the branch", 1_000);
    const second = createOptimisticTurnTranscriptBubble("second", "Review the changed files", 2_000);
    const bubbles = upsertTurnStartedTranscript([first, second], {
      type: "turn.started", turnId: "server-turn", emittedAt: 2_100, sequence: 0,
    }, () => "server-bubble");

    expect(bubbles.map((bubble) => bubble.turnId)).toEqual(["local-turn-first", "local-turn-second", "server-turn"]);
  });

  it("renders Git tools as executable shell commands instead of internal tool identifiers", () => {
    let bubbles = upsertTurnStartedTranscript([
      createOptimisticTurnTranscriptBubble("local", "Inspect the branch", 1_000),
    ], { type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000 }, () => "unused");
    const events = [
      { type: "turn.tool.started", turnId: "turn-1", sequence: 1, groupId: "inspect", commandId: "branch", name: "git_current_branch", args: {} },
      { type: "turn.tool.started", turnId: "turn-1", sequence: 2, groupId: "inspect", commandId: "status", name: "git_status", args: { short: true, branch: true } },
      { type: "turn.tool.started", turnId: "turn-1", sequence: 3, groupId: "inspect", commandId: "log", name: "git_log", args: { limit: 1 } },
    ] as const;
    for (const event of events) bubbles = applyTurnTimelineEvent(bubbles, event);

    const group = bubbles[0]?.turnTranscript?.blocks.find((block) => block.kind === "tool_group");
    expect(group).toMatchObject({
      kind: "tool_group",
      commands: [
        { command: "git branch --show-current" },
        { command: "git status --short --branch" },
        { command: "git log --oneline -n 1" },
      ],
    });
  });

  it("does not fabricate a local work statement before the agent emits one", () => {
    const optimistic = createOptimisticTurnTranscriptBubble("local", "What's on this branch?", 1_000);

    expect(optimistic.turnTranscript?.blocks).toEqual([]);
  });

  it("renders an OpenCode-style narrative Part in place and clears only the transient slow-model diagnostic", () => {
    const started = upsertTurnStartedTranscript([
      createOptimisticTurnTranscriptBubble("local", "Inspect the branch", 1_000),
    ], { type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000 }, () => "unused");
    const waiting = applyTurnTimelineEvent(started, {
      type: "turn.waiting", turnId: "turn-1", sequence: 1, message: "Waiting for model response…",
    });
    const narrative = applyTurnTimelineEvent(waiting, {
      type: "turn.narrative.delta", turnId: "turn-1", sequence: 2, blockId: "opening",
      message: "I will verify the branch and working-tree state before deciding the scope.", replace: true,
    });

    expect(waiting[0]?.turnTranscript?.waitingForModel).toBe(true);
    expect(narrative[0]?.turnTranscript).toMatchObject({ waitingForModel: false, blocks: [
      expect.objectContaining({ kind: "statement", id: "opening", text: "I will verify the branch and working-tree state before deciding the scope." }),
    ] });
  });

  it("preserves a complete multi-sentence public narrative instead of UI-ellipsizing it", () => {
    const fullNarrative = "Check the Project Link’s active branch name, whether the working tree has staged or unstaged changes or untracked files, and the most recent commit hash with its author and commit timestamp. This will establish the exact branch and commit the project is on and whether there are any local changes that could affect decisions about building, testing, or committing.";
    const started = upsertTurnStartedTranscript([
      createOptimisticTurnTranscriptBubble("local", "Inspect the project state", 1_000),
    ], { type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000 }, () => "unused");
    const updated = applyTurnTimelineEvent(started, {
      type: "turn.narrative.delta", turnId: "turn-1", sequence: 1, blockId: "opening", message: fullNarrative, replace: true,
    });

    const statement = updated[0]?.turnTranscript?.blocks.find((block) => block.kind === "statement");
    expect(statement).toMatchObject({ text: fullNarrative });
    expect(statement?.kind === "statement" && statement.text).not.toContain("…");
  });

  it("keeps actual commands from one decision in one group and preserves the next statement after it", () => {
    let bubbles = upsertTurnStartedTranscript([
      createOptimisticTurnTranscriptBubble("local", "Inspect the repository", 1_000),
    ], { type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000 }, () => "unused");
    const events = [
      { type: "turn.work.statement", turnId: "turn-1", sequence: 1, blockId: "inspect", message: "I’ll inspect the repository state and diff before summarizing." },
      { type: "turn.tool_group.started", turnId: "turn-1", sequence: 2, groupId: "inspect" },
      { type: "turn.tool.started", turnId: "turn-1", sequence: 3, groupId: "inspect", commandId: "status", name: "git_status", args: { command: "git status --short" } },
      { type: "turn.tool.completed", turnId: "turn-1", sequence: 4, groupId: "inspect", commandId: "status", ok: true, output: "## main\n M src/chat.ts" },
      { type: "turn.tool.started", turnId: "turn-1", sequence: 5, groupId: "inspect", commandId: "diff", name: "git_diff", args: { command: "git diff --stat" } },
      { type: "turn.tool.completed", turnId: "turn-1", sequence: 6, groupId: "inspect", commandId: "diff", ok: true },
      { type: "turn.work.statement", turnId: "turn-1", sequence: 7, blockId: "summarize", message: "The checks are complete; I’ll summarize the evidence next." },
    ] as const;
    for (const event of events) bubbles = applyTurnTimelineEvent(bubbles, event);

    expect(bubbles[0]?.turnTranscript?.blocks).toEqual([
      expect.objectContaining({ kind: "statement", id: "inspect" }),
      expect.objectContaining({ kind: "tool_group", id: "inspect", commands: [
        expect.objectContaining({ id: "status", status: "succeeded" }),
        expect.objectContaining({ id: "diff", status: "succeeded" }),
      ] }),
      expect.objectContaining({ kind: "statement", id: "summarize" }),
    ]);
    const group = bubbles[0]?.turnTranscript?.blocks.find((block) => block.kind === "tool_group");
    expect(group?.kind === "tool_group" && group.commands[0]?.output).toBe("## main\n M src/chat.ts");
  });

  it("ignores stale sequence values and seals execution before the final response", () => {
    const bubble = createOptimisticTurnTranscriptBubble("local", "Inspect files", 1_000);
    const started = upsertTurnStartedTranscript([bubble], {
      type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000,
    }, () => "unused");
    const newer = applyTurnTimelineEvent(started, {
      type: "turn.work.statement", turnId: "turn-1", sequence: 2, blockId: "next", message: "Inspect the relevant files.",
    });
    const stale = applyTurnTimelineEvent(newer, {
      type: "turn.work.statement", turnId: "turn-1", sequence: 1, blockId: "stale", message: "Must not appear.",
    });
    const sealed = applyTurnTimelineEvent(stale, {
      type: "turn.execution.completed", turnId: "turn-1", sequence: 3, elapsedMs: 2_100,
    });

    expect(sealed[0]?.turnTranscript).toMatchObject({ status: "sealed", executionSealed: true, elapsedMs: 2_100 });
    expect(sealed[0]?.turnTranscript?.blocks.some((block) => block.id === "stale")).toBe(false);
  });

  it("keeps approval lifecycle inside the same Turn transcript", () => {
    const started = upsertTurnStartedTranscript([
      createOptimisticTurnTranscriptBubble("local", "Stage the selected files", 1_000),
    ], { type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000 }, () => "unused");
    const requested = applyTurnTimelineEvent(started, {
      type: "turn.approval.requested",
      turnId: "turn-1",
      sequence: 1,
      approval: {
        id: "approval-1",
        explanation: "Staging files changes the working tree index.",
        riskLevel: "medium",
        action: { tool: "git_add", args: {}, description: "Stage selected files" },
      },
    });
    const resolved = applyTurnTimelineEvent(requested, {
      type: "turn.approval.resolved",
      turnId: "turn-1",
      sequence: 2,
      approvalId: "approval-1",
      approved: true,
    });

    expect(resolved[0]?.turnTranscript?.blocks).toContainEqual(expect.objectContaining({
      kind: "approval", id: "approval-1", status: "approved",
    }));
    expect(resolved[0]?.turnTranscript?.blocks).toContainEqual(expect.objectContaining({
      kind: "approval",
      text: "Approval is needed before: Stage selected files",
    }));
  });

  it("preserves a real MCP connector on the command group", () => {
    let bubbles = upsertTurnStartedTranscript([
      createOptimisticTurnTranscriptBubble("local", "Search open issues", 1_000),
    ], { type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000 }, () => "unused");
    bubbles = applyTurnTimelineEvent(bubbles, {
      type: "turn.tool_group.started",
      turnId: "turn-1",
      sequence: 1,
      groupId: "github-search",
      connector: { kind: "mcp", id: "github", label: "github" },
    });
    bubbles = applyTurnTimelineEvent(bubbles, {
      type: "turn.tool.started",
      turnId: "turn-1",
      sequence: 2,
      groupId: "github-search",
      commandId: "search-issues",
      name: "mcp_github_search_issues",
      args: { query: "regression" },
    });

    expect(bubbles[0]?.turnTranscript?.blocks).toContainEqual(expect.objectContaining({
      kind: "tool_group",
      connector: { kind: "mcp", id: "github", label: "github" },
    }));
  });

  it("keeps Git evidence, Web Research, Azure DevOps MCP, and approval in one ordered transcript", () => {
    let bubbles = upsertTurnStartedTranscript([
      createOptimisticTurnTranscriptBubble("local", "Review PR readiness and run the pipeline after approval", 1_000),
    ], { type: "turn.started", turnId: "turn-release", sequence: 0, emittedAt: 1_000 }, () => "unused");
    const events = [
      { type: "turn.narrative.delta", turnId: "turn-release", sequence: 1, blockId: "scope", message: "I will establish the local change scope before checking PR readiness.", replace: true },
      { type: "turn.tool_group.started", turnId: "turn-release", sequence: 2, groupId: "git", connector: { kind: "built-in", id: "git", label: "Git" } },
      { type: "turn.tool.started", turnId: "turn-release", sequence: 3, groupId: "git", commandId: "status", name: "git_status", args: { short: true } },
      { type: "turn.tool.completed", turnId: "turn-release", sequence: 4, groupId: "git", commandId: "status", name: "git_status", ok: true, summary: "changes found" },
      { type: "turn.narrative.delta", turnId: "turn-release", sequence: 5, blockId: "pr", message: "Those changes are scoped, so I will now inspect the linked PR policies.", replace: true },
      { type: "turn.tool_group.started", turnId: "turn-release", sequence: 6, groupId: "ado-read", connector: { kind: "mcp", id: "azure-devops", label: "Azure DevOps" } },
      { type: "turn.tool.started", turnId: "turn-release", sequence: 7, groupId: "ado-read", commandId: "policies", name: "mcp_azure_devops_list_policy_evaluations", args: { pullRequestId: 42 } },
      { type: "turn.tool.completed", turnId: "turn-release", sequence: 8, groupId: "ado-read", commandId: "policies", name: "mcp_azure_devops_list_policy_evaluations", ok: true, summary: "pending policy" },
      { type: "turn.narrative.delta", turnId: "turn-release", sequence: 9, blockId: "contract", message: "I will verify the current policy requirement before deciding whether a pipeline run is appropriate.", replace: true },
      { type: "turn.tool_group.started", turnId: "turn-release", sequence: 10, groupId: "web", connector: { kind: "mcp", id: "web-research", label: "Web Research" } },
      { type: "turn.tool.started", turnId: "turn-release", sequence: 11, groupId: "web", commandId: "search", name: "mcp_web_research_search_policy_requirement", args: { query: "Azure DevOps policy API" } },
      { type: "turn.tool.completed", turnId: "turn-release", sequence: 12, groupId: "web", commandId: "search", name: "mcp_web_research_search_policy_requirement", ok: true, summary: "official requirement found" },
      { type: "turn.approval.requested", turnId: "turn-release", sequence: 13, approval: { id: "run", riskLevel: "high", explanation: "A pipeline run changes remote state.", action: { tool: "mcp_azure_devops_run_pipeline", args: { pipelineId: 18 }, description: "Run the linked Azure Pipeline" } } },
      { type: "turn.approval.resolved", turnId: "turn-release", sequence: 14, approvalId: "run", approved: true },
      { type: "turn.narrative.delta", turnId: "turn-release", sequence: 15, blockId: "run", message: "Approval is recorded, so I will request the configured pipeline.", replace: true },
      { type: "turn.tool_group.started", turnId: "turn-release", sequence: 16, groupId: "ado-write", connector: { kind: "mcp", id: "azure-devops", label: "Azure DevOps" } },
      { type: "turn.tool.started", turnId: "turn-release", sequence: 17, groupId: "ado-write", commandId: "pipeline", name: "mcp_azure_devops_run_pipeline", args: { pipelineId: 18 } },
      { type: "turn.tool.completed", turnId: "turn-release", sequence: 18, groupId: "ado-write", commandId: "pipeline", name: "mcp_azure_devops_run_pipeline", ok: true, summary: "queued" },
      { type: "turn.execution.completed", turnId: "turn-release", sequence: 19, elapsedMs: 8_000 },
    ] as const;
    for (const event of events) bubbles = applyTurnTimelineEvent(bubbles, event);

    const transcript = bubbles[0]?.turnTranscript;
    expect(transcript?.status).toBe("sealed");
    expect(transcript?.blocks.map((block) => `${block.kind}:${block.id}`)).toEqual([
      "statement:scope",
      "tool_group:git",
      "statement:pr",
      "tool_group:ado-read",
      "statement:contract",
      "tool_group:web",
      "approval:run",
      "statement:run",
      "tool_group:ado-write",
    ]);
    expect(transcript?.blocks.find((block) => block.kind === "tool_group" && block.id === "ado-read")).toMatchObject({
      connector: { kind: "mcp", id: "azure-devops", label: "Azure DevOps" },
    });
    expect(transcript?.blocks.find((block) => block.kind === "tool_group" && block.id === "web")).toMatchObject({
      connector: { kind: "mcp", id: "web-research", label: "Web Research" },
    });
    expect(transcript?.blocks.find((block) => block.kind === "approval" && block.id === "run")).toMatchObject({ status: "approved" });
  });

  it("removes a duplicated no-tool opening after the same text becomes the final answer", () => {
    let bubbles = upsertTurnStartedTranscript([
      createOptimisticTurnTranscriptBubble("local", "Explain a Git branch", 1_000),
    ], { type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000 }, () => "unused");
    bubbles = applyTurnTimelineEvent(bubbles, {
      type: "turn.work.statement",
      turnId: "turn-1",
      sequence: 1,
      blockId: "opening",
      message: "A Git branch is a lightweight pointer to a commit.",
    });

    const sealed = sealTurnTranscriptExecution(
      bubbles,
      "turn-1",
      "A Git branch is a lightweight pointer to a commit.",
    );

    expect(sealed[0]?.turnTranscript).toMatchObject({ status: "sealed", executionSealed: true, blocks: [] });
  });

  it("keeps a distinct no-tool action narrative inside the transcript", () => {
    let bubbles = upsertTurnStartedTranscript([
      createOptimisticTurnTranscriptBubble("local", "Explain a Git branch", 1_000),
    ], { type: "turn.started", turnId: "turn-1", sequence: 0, emittedAt: 1_000 }, () => "unused");
    bubbles = applyTurnTimelineEvent(bubbles, {
      type: "turn.work.statement",
      turnId: "turn-1",
      sequence: 1,
      blockId: "opening",
      message: "I will answer this directly without inspecting the repository.",
    });

    const sealed = sealTurnTranscriptExecution(bubbles, "turn-1", "A Git branch is a lightweight pointer to a commit.");

    expect(sealed[0]?.turnTranscript?.blocks).toContainEqual(expect.objectContaining({
      kind: "statement", id: "opening",
    }));
  });
});

describe("Turn transcript failed command details (MP-004)", () => {
  it("keeps the real exit code on a failed command card", () => {
    const optimistic = createOptimisticTurnTranscriptBubble("local", "Run tests", 1_000);
    const started = upsertTurnStartedTranscript([optimistic], {
      type: "turn.started", turnId: "turn-t", emittedAt: 1_100, sequence: 0,
    }, () => "unused");
    const withCommand = applyTurnTimelineEvent(started, {
      type: "turn.tool.started",
      turnId: "turn-t",
      sequence: 1,
      groupId: "g",
      commandId: "cmd",
      name: "npm_test",
    });
    const completed = applyTurnTimelineEvent(withCommand, {
      type: "turn.tool.completed",
      turnId: "turn-t",
      sequence: 2,
      groupId: "g",
      commandId: "cmd",
      name: "npm_test",
      ok: false,
      exitCode: 1,
      summary: "tests failed",
    });

    const command = completed[0]?.turnTranscript?.blocks
      .find((block) => block.kind === "tool_group")?.commands[0];
    expect(command).toMatchObject({ status: "failed", exitCode: 1 });
  });
});
