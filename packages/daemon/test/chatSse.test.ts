import { describe, expect, it } from "vitest";
import { createChatSseWriter } from "../src/routes/chatSse.js";

describe("chat SSE timeline projection", () => {
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
});
