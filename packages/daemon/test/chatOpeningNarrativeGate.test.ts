import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const openingGate = vi.hoisted(() => {
  let release: (() => void) | undefined;
  let entered: (() => void) | undefined;
  let gate = new Promise<void>((resolve) => { release = resolve; });
  let started = new Promise<void>((resolve) => { entered = resolve; });
  return {
    reset() {
      gate = new Promise<void>((resolve) => { release = resolve; });
      started = new Promise<void>((resolve) => { entered = resolve; });
    },
    open() { release?.(); },
    entered() { entered?.(); },
    waitUntilEntered() { return started; },
    waitUntilOpen() { return gate; },
  };
});

vi.mock("@mergepilot/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mergepilot/core")>();
  class DelayedNarrativeLlm {
    configured = true;

    actionNarrativeModel() {
      return undefined;
    }

    async *chatStream() {
      // This first useful model delta is immediately public. The second delta
      // holds the short opening stream open so the test can prove no tool
      // execution begins merely because the first delta has been painted.
      yield { type: "delta", delta: "Inspect the current " };
      openingGate.entered();
      await openingGate.waitUntilOpen();
      yield { type: "delta", delta: "branch." };
    }
  }
  return { ...actual, LLMClient: DelayedNarrativeLlm };
});

vi.mock("../src/chatRuntimeSetup.js", () => ({
  createChatRuntimeSetup: vi.fn(async () => ({ close: async () => undefined })),
}));

import { registerChatRoutes } from "../src/routes/chat.routes.js";

afterEach(() => {
  openingGate.open();
  vi.clearAllMocks();
});

describe("chat opening narrative gate", () => {
  it("starts side-effect-free planner preparation early but does not publish commands before the real opening narrative", async () => {
    openingGate.reset();
    let runStarted = false;
    const appendUserTurn = vi.fn(async () => undefined);
    let runArguments: unknown[] = [];
    const session = {
      createSession: () => "session-1",
      appendUserTurn,
      appendTurnTimelineEvent: async () => undefined,
      cancel: () => undefined,
      async *run(...args: unknown[]) {
        runStarted = true;
        runArguments = args;
        yield { type: "tool_group_start", groupId: "branch-check" };
        yield { type: "tool_start", toolCallId: "branch", name: "git_current_branch", args: {} };
        yield { type: "tool_end", toolCallId: "branch", name: "git_current_branch", ok: true, summary: "main", result: {} };
        yield {
          type: "done",
          result: {
            response: "The selected project is on main.",
            riskLevel: "low",
            actionsTaken: ["git_current_branch"],
            suggestions: [],
            toolCallsMade: [],
            usedLlm: true,
          },
        };
      },
    };
    const app = Fastify();
    registerChatRoutes(app, {
      settings: {} as never,
      chatSessions: session as never,
      buildInlineLlmSettings: () => ({} as never),
      envSourceLabel: () => "test",
    });

    const responsePromise = app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "Inspect the selected project's branch.",
        repoPath: "C:/fixture/project",
        projectLink: { name: "Fixture", repoPath: "C:/fixture/project" },
      },
    });

    await openingGate.waitUntilEntered();
    expect(runStarted).toBe(true);
    expect(appendUserTurn).toHaveBeenCalledWith(
      "session-1",
      "Inspect the selected project's branch.",
      "C:/fixture/project",
    );
    expect(runArguments.at(-2)).toBe(true);
    expect(runArguments.at(-1)).toEqual(expect.any(Promise));

    openingGate.open();
    const response = await responsePromise;

    expect(runStarted).toBe(true);
    expect(runArguments.at(-2)).toBe(true);
    expect(runArguments.at(-1)).toEqual(expect.any(Promise));
    expect(response.statusCode).toBe(200);
    const firstNarrative = response.body.indexOf("turn.narrative.delta");
    const firstCommand = response.body.indexOf("turn.tool.started");
    expect(firstNarrative).toBeGreaterThanOrEqual(0);
    expect(firstCommand).toBeGreaterThan(firstNarrative);
  });
});
