import { describe, expect, it } from "vitest";
import { ChatPlanner } from "../src/chatPlanner.js";
import type { ChatStreamEvent, LLMClient } from "../src/llm.js";
import { createToolExecutor } from "./chatPlannerTestDoubles.js";

describe("ChatPlanner public narrative barrier", () => {
  it("can finish a first planning decision while holding the real command until the opening narrative releases", async () => {
    let signalToolDecision: (() => void) | undefined;
    const toolDecisionReady = new Promise<void>((resolve) => { signalToolDecision = resolve; });
    let releaseNarrative: (() => void) | undefined;
    const publicNarrativeReady = new Promise<void>((resolve) => { releaseNarrative = resolve; });
    let executed = false;

    const llm = {
      configured: true,
      async *chatStream(): AsyncGenerator<ChatStreamEvent> {
        signalToolDecision?.();
        yield {
          type: "tool_call",
          toolCalls: [{ id: "status", name: "git_status", arguments: "{}" }],
        };
        yield { type: "done", finishReason: "tool_calls" };
      },
    } as unknown as LLMClient;
    const executor = createToolExecutor();
    executor.register({
      name: "git_status",
      description: "Inspect working tree status",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        executed = true;
        return { ok: true, stdout: "## main" };
      },
    });
    const planner = new ChatPlanner(llm, executor, { maxSteps: 1 });
    const consume = (async () => {
      const events = [];
      for await (const event of planner.run(
        "Read-only: inspect the working tree.",
        [],
        ".",
        async () => true,
        undefined,
        [],
        undefined,
        true,
        true,
        publicNarrativeReady,
      )) events.push(event);
      return events;
    })();

    await toolDecisionReady;
    // The planner must not execute before the public narrative barrier is
    // released. Yield several macro-tasks so any pending continuation that
    // ignored the barrier would have run the tool by now; a single tick is
    // order-sensitive under a loaded event loop.
    for (let tick = 0; tick < 5; tick += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    expect(executed).toBe(false);

    releaseNarrative?.();
    const events = await consume;
    expect(executed).toBe(true);
    expect(events.some((event) => event.type === "tool_start" && event.name === "git_status")).toBe(true);
  });
});
