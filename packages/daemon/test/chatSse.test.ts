import { describe, expect, it } from "vitest";
import { createChatSseWriter } from "../src/routes/chatSse.js";

describe("chat SSE timeline projection", () => {
  it("echoes a browser optimistic Turn id only on the start acknowledgement", () => {
    const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const reply = {
      raw: {
        setHeader: () => undefined,
        flushHeaders: () => undefined,
        write: (wire: string) => {
          const event = wire.match(/^event: ([^\n]+)/m)?.[1] ?? "";
          const payload = JSON.parse(wire.match(/^data: (.+)$/m)?.[1] ?? "{}");
          sent.push({ event, payload });
        },
        end: () => undefined,
      },
    } as never;
    const writer = createChatSseWriter(reply);
    writer.startTurn("turn-1", undefined, "local-turn-1");
    writer.sendChatEvent({ type: "tool_start", toolCallId: "status", name: "git_status", args: {} });

    expect(sent[0]?.payload).toMatchObject({ type: "turn.started", turnId: "turn-1", clientTurnId: "local-turn-1" });
    expect(sent[1]?.payload).not.toHaveProperty("clientTurnId");
  });

  it("keeps actual commands from a single read-only decision in one group", () => {
    const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const reply = {
      raw: {
        setHeader: () => undefined,
        flushHeaders: () => undefined,
        write: (wire: string) => {
          const event = wire.match(/^event: ([^\n]+)/m)?.[1] ?? "";
          const payload = JSON.parse(wire.match(/^data: (.+)$/m)?.[1] ?? "{}");
          sent.push({ event, payload });
        },
        end: () => undefined,
      },
    } as never;
    const writer = createChatSseWriter(reply);
    writer.startTurn("turn-1");
    writer.sendChatEvent({ type: "tool_group_start", groupId: "decision-1" });
    writer.sendChatEvent({ type: "tool_start", toolCallId: "status", name: "git_status", args: {} });
    writer.sendChatEvent({ type: "tool_end", toolCallId: "status", name: "git_status", ok: true, summary: "clean", output: "## main", result: {} });
    writer.sendChatEvent({ type: "tool_start", toolCallId: "diff", name: "git_diff", args: {} });
    writer.sendChatEvent({ type: "tool_end", toolCallId: "diff", name: "git_diff", ok: true, summary: "empty", result: {} });
    writer.sendChatEvent({ type: "tool_group_end", groupId: "decision-1" });

    const commandGroups = sent
      .filter((entry) => entry.payload.type === "turn.tool.started" || entry.payload.type === "turn.tool.completed")
      .map((entry) => entry.payload.groupId);
    expect(commandGroups).toEqual(["decision-1", "decision-1", "decision-1", "decision-1"]);
    expect(sent.find((entry) => entry.payload.type === "turn.tool.completed")?.payload.output).toBe("## main");
  });

  it("projects a realistic Git → Web Research → Azure DevOps MCP → approval workflow as one ordered Turn", () => {
    const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const reply = {
      raw: {
        setHeader: () => undefined,
        flushHeaders: () => undefined,
        write: (wire: string) => {
          const event = wire.match(/^event: ([^\n]+)/m)?.[1] ?? "";
          const payload = JSON.parse(wire.match(/^data: (.+)$/m)?.[1] ?? "{}");
          sent.push({ event, payload });
        },
        end: () => undefined,
      },
    } as never;
    const writer = createChatSseWriter(reply);
    writer.startTurn("turn-release");

    writer.sendChatEvent({ type: "work_statement", blockId: "scope", text: "I will confirm the local change scope before checking the linked pull request and its policies.", replace: true });
    writer.sendChatEvent({ type: "tool_group_start", groupId: "git-evidence", connector: { kind: "built-in", id: "git", label: "Git" } });
    writer.sendChatEvent({ type: "tool_start", toolCallId: "status", name: "git_status", args: { short: true, branch: true } });
    writer.sendChatEvent({ type: "tool_end", toolCallId: "status", name: "git_status", ok: true, summary: "two modified files", output: "## feature/release\n M src/app.ts", result: {} });
    writer.sendChatEvent({ type: "tool_group_end", groupId: "git-evidence" });

    writer.sendChatEvent({ type: "work_statement", blockId: "service-contract", text: "The local scope is clear, so I will verify the current policy requirement before comparing it with the linked pull request.", replace: true });
    writer.sendChatEvent({ type: "tool_group_start", groupId: "web-contract", connector: { kind: "mcp", id: "web-research", label: "Web Research" } });
    writer.sendChatEvent({ type: "tool_start", toolCallId: "policy-docs", name: "mcp_web_research_search_policy_requirements", args: { query: "Azure DevOps pull request policy API" } });
    writer.sendChatEvent({ type: "tool_end", toolCallId: "policy-docs", name: "mcp_web_research_search_policy_requirements", ok: true, summary: "official API requirement found", output: "https://learn.microsoft.com/azure/devops", result: {} });
    writer.sendChatEvent({ type: "tool_group_end", groupId: "web-contract" });

    writer.sendChatEvent({ type: "work_statement", blockId: "pr-risk", text: "The local scope is clear, so I will read the linked pull request and policy state before deciding whether a pipeline run is appropriate.", replace: true });
    writer.sendChatEvent({ type: "tool_group_start", groupId: "ado-read", connector: { kind: "mcp", id: "azure-devops", label: "Azure DevOps" } });
    writer.sendChatEvent({ type: "tool_start", toolCallId: "pr", name: "mcp_azure_devops_get_pull_request", args: { pullRequestId: 42 } });
    writer.sendChatEvent({ type: "tool_end", toolCallId: "pr", name: "mcp_azure_devops_get_pull_request", ok: true, summary: "PR is active", output: "active", result: {} });
    writer.sendChatEvent({ type: "tool_start", toolCallId: "policies", name: "mcp_azure_devops_list_policy_evaluations", args: { pullRequestId: 42 } });
    writer.sendChatEvent({ type: "tool_end", toolCallId: "policies", name: "mcp_azure_devops_list_policy_evaluations", ok: true, summary: "one pending policy", output: "pending", result: {} });
    writer.sendChatEvent({ type: "tool_group_end", groupId: "ado-read" });

    writer.sendChatEvent({ type: "work_statement", blockId: "pipeline-decision", text: "The policy is pending; a new pipeline run changes remote state, so I need approval before requesting it.", replace: true });
    writer.sendChatEvent({
      type: "approval_required",
      approval: {
        id: "run-pipeline",
        riskLevel: "high",
        action: { tool: "mcp_azure_devops_run_pipeline", args: { pipelineId: 18, branch: "feature/release" }, description: "Run the linked Azure Pipeline" },
      },
    });
    writer.sendChatEvent({ type: "approval_resolved", approvalId: "run-pipeline", approved: true });
    writer.sendChatEvent({ type: "work_statement", blockId: "pipeline-run", text: "Approval is recorded, so I will request the configured pipeline and report its run identifier.", replace: true });
    writer.sendChatEvent({ type: "tool_group_start", groupId: "ado-write", connector: { kind: "mcp", id: "azure-devops", label: "Azure DevOps" } });
    writer.sendChatEvent({ type: "tool_start", toolCallId: "run", name: "mcp_azure_devops_run_pipeline", args: { pipelineId: 18, branch: "feature/release" } });
    writer.sendChatEvent({ type: "tool_end", toolCallId: "run", name: "mcp_azure_devops_run_pipeline", ok: true, summary: "run 908 queued", output: "908", result: {} });
    writer.sendChatEvent({ type: "tool_group_end", groupId: "ado-write" });
    writer.sendChatEvent({ type: "done", result: { response: "Findings: the pull request remains active, one policy was pending, and approved pipeline run 908 was queued.", riskLevel: "high", actionsTaken: [], suggestions: [], toolCallsMade: [], usedLlm: true } });

    const projected = sent.filter((entry) => entry.payload.type?.startsWith("turn."));
    const sequences = projected.map((entry) => Number(entry.payload.sequence));
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(projected.map((entry) => entry.payload.type)).toEqual(expect.arrayContaining([
      "turn.narrative.delta",
      "turn.tool_group.started",
      "turn.tool.started",
      "turn.tool.completed",
      "turn.approval.requested",
      "turn.approval.resolved",
      "turn.execution.completed",
      "turn.final.completed",
      "turn.finished",
    ]));
    expect(projected.filter((entry) => entry.payload.groupId === "ado-read")[0]?.payload.connector).toEqual({ kind: "mcp", id: "azure-devops", label: "Azure DevOps" });
    expect(projected.filter((entry) => entry.payload.groupId === "web-contract")[0]?.payload.connector).toEqual({ kind: "mcp", id: "web-research", label: "Web Research" });
    expect(projected.findIndex((entry) => entry.payload.type === "turn.execution.completed")).toBeLessThan(projected.findIndex((entry) => entry.payload.type === "turn.final.delta"));
    expect(projected.findIndex((entry) => entry.payload.type === "turn.approval.requested")).toBeLessThan(projected.findIndex((entry) => entry.payload.groupId === "ado-write" && entry.payload.type === "turn.tool.started"));
  });

  it("emits a public Timeline payload without provider results or approval explanations", () => {
    const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const reply = {
      raw: {
        setHeader: () => undefined,
        flushHeaders: () => undefined,
        write: (wire: string) => {
          const event = wire.match(/^event: ([^\n]+)/m)?.[1] ?? "";
          const payload = JSON.parse(wire.match(/^data: (.+)$/m)?.[1] ?? "{}");
          sent.push({ event, payload });
        },
        end: () => undefined,
      },
    } as never;
    const writer = createChatSseWriter(reply);
    writer.startTurn("turn-1");
    writer.sendChatEvent({
      type: "done",
      result: {
        response: "The review is complete.",
        riskLevel: "low",
        actionsTaken: [],
        suggestions: [],
        toolCallsMade: [],
        usedLlm: true,
      },
    });
    writer.sendChatEvent({
      type: "approval_required",
      approval: {
        id: "approval-1",
        riskLevel: "medium",
        explanation: "A long internal explanation that does not belong in the transcript.",
        action: { tool: "git_push", args: { branch: "main" }, description: "Push the current branch" },
      },
    });

    const approval = sent.find((entry) => entry.event === "turn.approval.requested")?.payload;
    expect(approval).toMatchObject({
      phase: "working",
      approval: { id: "approval-1", action: { tool: "git_push", args: { branch: "main" }, description: "Push the current branch" } },
    });
    expect(JSON.stringify(approval)).not.toContain("long internal explanation");
    const final = sent.find((entry) => entry.event === "turn.final.completed")?.payload;
    expect(final).toMatchObject({ phase: "final", finalText: "The review is complete." });
    expect(final).not.toHaveProperty("result");
  });

  it("redacts and bounds nested approval metadata before persisting the Timeline", () => {
    const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const reply = {
      raw: {
        setHeader: () => undefined,
        flushHeaders: () => undefined,
        write: (wire: string) => {
          const event = wire.match(/^event: ([^\n]+)/m)?.[1] ?? "";
          const payload = JSON.parse(wire.match(/^data: (.+)$/m)?.[1] ?? "{}");
          sent.push({ event, payload });
        },
        end: () => undefined,
      },
    } as never;
    const writer = createChatSseWriter(reply);
    writer.startTurn("turn-1");
    writer.sendChatEvent({
      type: "approval_required",
      approval: {
        id: "approval-1",
        riskLevel: "medium",
        action: {
          tool: "mcp_publish",
          args: { branch: "main", api_key: "should-not-leak", nested: { access_token: "also-secret", path: "src/app.ts" } },
          description: "Publish the branch",
          readiness: { providerPayload: { hidden: true }, reason: "Review passes" },
        },
      },
    });

    const approval = sent.find((entry) => entry.event === "turn.approval.requested")?.payload;
    expect(approval).toMatchObject({
      approval: { action: { args: { branch: "main", nested: { path: "src/app.ts" } }, readiness: { reason: "Review passes" } } },
    });
    expect(JSON.stringify(approval)).not.toContain("should-not-leak");
    expect(JSON.stringify(approval)).not.toContain("also-secret");
    expect(JSON.stringify(approval)).not.toContain("providerPayload");
  });

  it("maps the real model narrative onto an updatable Part event and keeps a slow-model notice transient", async () => {
    const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const reply = {
      raw: {
        setHeader: () => undefined,
        flushHeaders: () => undefined,
        write: (wire: string) => {
          const event = wire.match(/^event: ([^\n]+)/m)?.[1] ?? "";
          const payload = JSON.parse(wire.match(/^data: (.+)$/m)?.[1] ?? "{}");
          sent.push({ event, payload });
        },
        end: () => undefined,
      },
    } as never;
    const persisted: Record<string, unknown>[] = [];
    const writer = createChatSseWriter(reply, undefined, (event) => persisted.push(event as unknown as Record<string, unknown>));
    writer.startTurn("turn-1");
    writer.sendWaitingForModel();
    writer.sendChatEvent({ type: "work_statement", blockId: "opening", text: "I will confirm the change scope before reading the branch status.", replace: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(sent.find((entry) => entry.event === "turn.waiting")?.payload.message).toBe("Waiting for model response…");
    expect(sent.find((entry) => entry.event === "turn.narrative.delta")?.payload).toMatchObject({
      blockId: "opening", message: "I will confirm the change scope before reading the branch status.", replace: true,
    });
    expect(persisted.some((event) => event.type === "turn.waiting")).toBe(false);
  });

  it("keeps a continuation model-wait notice available after evidence is visible", () => {
    const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const reply = {
      raw: {
        setHeader: () => undefined,
        flushHeaders: () => undefined,
        write: (wire: string) => {
          const event = wire.match(/^event: ([^\n]+)/m)?.[1] ?? "";
          const payload = JSON.parse(wire.match(/^data: (.+)$/m)?.[1] ?? "{}");
          sent.push({ event, payload });
        },
        end: () => undefined,
      },
    } as never;
    const writer = createChatSseWriter(reply);
    writer.startTurn("turn-1");
    writer.sendChatEvent({ type: "work_statement", blockId: "opening", text: "I will inspect the branch before deciding what comes next.", replace: true });

    writer.sendWaitingForModel("Synthesizing the completed checks into the next decision…");

    expect(sent.find((entry) => entry.event === "turn.waiting")?.payload.message)
      .toBe("Synthesizing the completed checks into the next decision…");
  });

  it("closes the live stream without waiting for a slow transcript store", async () => {
    let endCalls = 0;
    let releasePersistence: (() => void) | undefined;
    const persistence = new Promise<void>((resolve) => { releasePersistence = resolve; });
    const reply = {
      raw: {
        setHeader: () => undefined,
        flushHeaders: () => undefined,
        write: () => undefined,
        end: () => { endCalls += 1; },
      },
    } as never;
    const writer = createChatSseWriter(reply, undefined, () => persistence);

    writer.startTurn("turn-1");
    await Promise.resolve();
    writer.end();

    expect(endCalls).toBe(1);
    releasePersistence?.();
  });

  it("does not invent a narrative when resuming an approved Turn", () => {
    const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const reply = {
      raw: {
        setHeader: () => undefined,
        flushHeaders: () => undefined,
        write: (wire: string) => {
          const event = wire.match(/^event: ([^\n]+)/m)?.[1] ?? "";
          const payload = JSON.parse(wire.match(/^data: (.+)$/m)?.[1] ?? "{}");
          sent.push({ event, payload });
        },
        end: () => undefined,
      },
    } as never;

    createChatSseWriter(reply).resumeTurn("turn-1", { startedAt: Date.now() - 300 });

    expect(sent.some((entry) => entry.event === "turn.narrative.delta")).toBe(false);
  });

  it("replays genuine final model text in readable chunks only after execution has sealed", () => {
    const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const reply = {
      raw: {
        setHeader: () => undefined,
        flushHeaders: () => undefined,
        write: (wire: string) => {
          const event = wire.match(/^event: ([^\n]+)/m)?.[1] ?? "";
          const payload = JSON.parse(wire.match(/^data: (.+)$/m)?.[1] ?? "{}");
          sent.push({ event, payload });
        },
        end: () => undefined,
      },
    } as never;
    const writer = createChatSseWriter(reply);
    writer.startTurn("turn-1");
    writer.sendChatEvent({ type: "assistant_delta", delta: "The branch is " });
    writer.sendChatEvent({ type: "assistant_delta", delta: "ready for review." });

    expect(sent.some((entry) => entry.event === "turn.final.delta")).toBe(false);

    writer.sendChatEvent({
      type: "done",
      result: {
        response: "The branch is ready for review.",
        riskLevel: "low",
        actionsTaken: [],
        suggestions: [],
        toolCallsMade: [],
        usedLlm: true,
      },
    });

    const eventNames = sent.map((entry) => entry.event);
    expect(eventNames.indexOf("turn.execution.completed")).toBeLessThan(eventNames.indexOf("turn.final.delta"));
    expect(sent.filter((entry) => entry.event === "turn.final.delta").map((entry) => entry.payload.delta)).toEqual([
      "The branch is ready for review.",
    ]);
  });
});

describe("chat SSE typed terminal failures (MP-011)", () => {
  function captureWriter() {
    const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const reply = {
      raw: {
        setHeader: () => undefined,
        flushHeaders: () => undefined,
        write: (wire: string) => {
          const event = wire.match(/^event: ([^\n]+)/m)?.[1] ?? "";
          const payload = JSON.parse(wire.match(/^data: (.+)$/m)?.[1] ?? "{}");
          sent.push({ event, payload });
        },
        end: () => undefined,
      },
    } as never;
    return { sent, writer: createChatSseWriter(reply) };
  }

  it("classifies a cancelled event as cancelled_by_user with resume recovery", () => {
    const { sent, writer } = captureWriter();
    writer.startTurn("turn-1");
    writer.sendChatEvent({ type: "cancelled", failure: { kind: "cancelled_by_user", retryable: false } });

    const terminal = sent.find((entry) => entry.event === "turn.cancelled")?.payload;
    expect(terminal).toMatchObject({
      type: "turn.cancelled",
      status: "cancelled",
      failureKind: "cancelled_by_user",
      recoveryAction: "resume",
      retryable: false,
    });
    const finalText = sent.find((entry) => entry.event === "turn.final.completed")?.payload.finalText;
    expect(String(finalText)).toContain("Cancelled by you");
  });

  it("maps a typed deadline failure to timeout text and retry recovery", () => {
    const { sent, writer } = captureWriter();
    writer.startTurn("turn-2");
    writer.sendChatEvent({
      type: "error",
      message: "request timed out",
      failure: { kind: "deadline_exceeded", retryable: true },
    });

    const terminal = sent.find((entry) => entry.event === "turn.failed")?.payload;
    expect(terminal).toMatchObject({
      type: "turn.failed",
      status: "failed",
      failureKind: "deadline_exceeded",
      recoveryAction: "retry",
      retryable: true,
    });
    expect(String(sent.find((entry) => entry.event === "turn.final.completed")?.payload.finalText)).toContain(
      "time limit",
    );
  });

  it("keeps legacy error text when no typed failure is attached", () => {
    const { sent, writer } = captureWriter();
    writer.startTurn("turn-3");
    writer.sendChatEvent({ type: "error", message: "No approval proposal for this session" });

    const terminal = sent.find((entry) => entry.event === "turn.failed")?.payload;
    expect(terminal).toMatchObject({ type: "turn.failed", failureKind: "internal" });
    expect(String(terminal?.diagnosticId)).toMatch(/^dia_/);
    expect(String(sent.find((entry) => entry.event === "turn.final.completed")?.payload.finalText)).toContain(
      "No approval proposal for this session",
    );
  });

  it("never leaks the raw message for typed internal failures", () => {
    const { sent, writer } = captureWriter();
    writer.startTurn("turn-4");
    writer.sendChatEvent({
      type: "error",
      message: "secret payload detail",
      failure: { kind: "internal", retryable: false, diagnosticId: "dia_abc123" },
    });

    const finalText = String(sent.find((entry) => entry.event === "turn.final.completed")?.payload.finalText);
    expect(finalText).toContain("diagnostic id dia_abc123");
    expect(finalText).not.toContain("secret payload detail");
  });

  it("reports active turn state for the disconnect path", () => {
    const { writer } = captureWriter();
    expect(writer.hasActiveTurn()).toBe(false);
    writer.startTurn("turn-5");
    expect(writer.hasActiveTurn()).toBe(true);
  });
});

describe("chat SSE final evidence references (MP-003)", () => {
  it("carries bounded evidence references on turn.final.completed", () => {
    const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const reply = {
      raw: {
        setHeader: () => undefined,
        flushHeaders: () => undefined,
        write: (wire: string) => {
          const event = wire.match(/^event: ([^\n]+)/m)?.[1] ?? "";
          const payload = JSON.parse(wire.match(/^data: (.+)$/m)?.[1] ?? "{}");
          sent.push({ event, payload });
        },
        end: () => undefined,
      },
    } as never;
    const writer = createChatSseWriter(reply);
    writer.startTurn("turn-9");
    writer.sendChatEvent({
      type: "done",
      result: {
        response: "The branch is ready.",
        riskLevel: "low",
        actionsTaken: [],
        suggestions: [],
        toolCallsMade: [{ name: "git_status", args: {}, ok: true }],
        usedLlm: true,
        evidence: [
          { tool: "git_status", ok: true, callId: "call-1", summary: "Working tree: clean." },
        ],
      },
    });

    const final = sent.find((entry) => entry.event === "turn.final.completed")?.payload;
    expect(final?.finalText).toBe("The branch is ready.");
    expect(final?.evidence).toEqual([
      { tool: "git_status", ok: true, callId: "call-1", summary: "Working tree: clean." },
    ]);
  });
});

describe("chat SSE tool completion exit codes (MP-004)", () => {
  it("carries the real process exit code on failed tool completion", () => {
    const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const reply = {
      raw: {
        setHeader: () => undefined,
        flushHeaders: () => undefined,
        write: (wire: string) => {
          const event = wire.match(/^event: ([^\n]+)/m)?.[1] ?? "";
          const payload = JSON.parse(wire.match(/^data: (.+)$/m)?.[1] ?? "{}");
          sent.push({ event, payload });
        },
        end: () => undefined,
      },
    } as never;
    const writer = createChatSseWriter(reply);
    writer.startTurn("turn-10");
    writer.sendChatEvent({
      type: "tool_start",
      toolCallId: "npm-test",
      name: "npm_test",
      args: {},
    });
    writer.sendChatEvent({
      type: "tool_end",
      toolCallId: "npm-test",
      name: "npm_test",
      ok: false,
      summary: "tests failed",
      output: "1 failing",
      result: { returncode: 1, stdout: "", stderr: "1 failing" },
    });

    const completed = sent.find((entry) => entry.event === "turn.tool.completed")?.payload;
    expect(completed).toMatchObject({ ok: false, exitCode: 1 });
  });
});
