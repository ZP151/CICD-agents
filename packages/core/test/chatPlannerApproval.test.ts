import { describe, expect, it } from "vitest";
import { ChatPlanner } from "../src/chatPlanner.js";
import type { ChatStreamEvent, LLMClient } from "../src/llm.js";
import { ToolExecutor } from "../src/tools/executor.js";

function fakeLlm(json: string): LLMClient {
  return {
    configured: true,
    async *chatStream(): AsyncGenerator<ChatStreamEvent> {
      yield { type: "delta", delta: json };
      yield { type: "done", finishReason: "stop" };
    },
  } as unknown as LLMClient;
}

async function runPlanner(json: string) {
  const executor = new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
  const planner = new ChatPlanner(fakeLlm(json), executor, { maxSteps: 1 });
  const events = [];
  for await (const event of planner.run("continue", [], ".", async () => true)) {
    events.push(event);
  }
  const done = events.find((event) => event.type === "done");
  if (!done || done.type !== "done") throw new Error("missing done event");
  return done.result;
}

describe("ChatPlanner approval proposal parsing", () => {
  it("parses approval_proposal from the current JSON protocol", async () => {
    const result = await runPlanner(
      JSON.stringify({
        response: "Shall I stage everything?",
        risk_level: "medium",
        actions_taken: [],
        suggestions: [],
        approval_proposal: {
          tool: "git_add",
          args: {},
          description: "Stage all changes",
          nextHint: "commit",
        },
      }),
    );

    expect(result.approvalProposal?.tool).toBe("git_add");
    expect(result.approvalProposal?.description).toBe("Stage all changes");
  });

  it("keeps legacy pending_action output as parser fallback", async () => {
    const result = await runPlanner(
      JSON.stringify({
        response: "Shall I push this branch?",
        risk_level: "high",
        actions_taken: [],
        suggestions: [],
        pending_action: {
          tool: "git_push",
          args: { branch: "feature/x" },
          description: "Push branch",
        },
      }),
    );

    expect(result.approvalProposal?.tool).toBe("git_push");
    expect(result.approvalProposal?.args).toEqual({ branch: "feature/x" });
  });
});
