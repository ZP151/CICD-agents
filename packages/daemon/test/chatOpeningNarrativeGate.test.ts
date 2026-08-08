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

const narrativeBehavior = vi.hoisted(() => ({
  // "empty" simulates a provider that completes the opening stream without
  // any public text (e.g. a reasoning-only completion). The turn must fail
  // over SSE without rejecting the first-tool gate into the void.
  // "empty-then-text" simulates the same failure followed by a corrective
  // re-prompt that produces visible text: the turn must proceed.
  // "blocked-then-text" simulates a first stream that never settles within
  // the narrative deadline; the corrective re-prompt (a fresh generation)
  // produces visible text and the turn must proceed.
  mode: "normal" as "normal" | "empty" | "empty-then-text" | "blocked-then-text",
  callCount: 0,
}));

const narrativeCalls = vi.hoisted(() => [{ messages: [] as unknown[] }]);

vi.mock("@mergepilot/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mergepilot/core")>();
  class DelayedNarrativeLlm {
    configured = true;

    actionNarrativeModel() {
      return undefined;
    }

    async *chatStream(options: { messages?: unknown[] }) {
      narrativeBehavior.callCount += 1;
      narrativeCalls[0].messages.push(options?.messages ?? []);
      if (narrativeBehavior.mode === "empty") return;
      if (narrativeBehavior.mode === "empty-then-text") {
        // First call completes inside hidden reasoning with no public text;
        // the corrective re-prompt produces a visible narrative.
        if (narrativeBehavior.callCount === 1) return;
        yield { type: "delta", delta: "The corrective narrative is visible." };
        return;
      }
      if (narrativeBehavior.mode === "blocked-then-text") {
        // First call never settles (deadline exceeded); its superseded stream
        // must not leak events after the corrective re-prompt starts. The
        // second call produces a visible narrative.
        if (narrativeBehavior.callCount === 1) {
          await new Promise<void>(() => undefined);
        }
        yield { type: "delta", delta: "The corrective narrative is visible." };
        return;
      }
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

  it("fails the turn over SSE without an unhandled rejection when the opening narrative completes with no public text", async () => {
    // Regression: rejecting the first-tool gate before the planner reaches it
    // used to surface as `processTicksAndRejections` and kill the daemon. The
    // turn must fail cleanly and the rejection must stay claimed.
    narrativeBehavior.mode = "empty";
    const unhandledRejections: unknown[] = [];
    const listener = (reason: unknown) => { unhandledRejections.push(reason); };
    process.on("unhandledRejection", listener);
    try {
      const session = {
        createSession: () => "session-empty-narrative",
        appendUserTurn: vi.fn(async () => undefined),
        appendTurnTimelineEvent: async () => undefined,
        cancel: () => undefined,
        async *run() {
          yield {
            type: "done",
            result: {
              response: "unreachable without a public narrative",
              riskLevel: "low",
              actionsTaken: [],
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

      const response = await app.inject({
        method: "POST",
        url: "/chat",
        payload: {
          message: "Inspect the selected project's branch.",
          repoPath: "C:/fixture/project",
          projectLink: { name: "Fixture", repoPath: "C:/fixture/project" },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("event: turn.failed");
      expect(response.body).toContain("public action narrative");
    } finally {
      process.off("unhandledRejection", listener);
      narrativeBehavior.mode = "normal";
    }
    expect(unhandledRejections).toEqual([]);
  });

  it("re-prompts the narrator once when the opening completes without public text and proceeds when the corrective narrative produces visible text", async () => {
    narrativeBehavior.mode = "empty-then-text";
    narrativeBehavior.callCount = 0;
    narrativeCalls[0].messages = [];
    const session = {
      createSession: () => "session-corrective-retry",
      appendUserTurn: vi.fn(async () => undefined),
      appendTurnTimelineEvent: async () => undefined,
      cancel: () => undefined,
      async *run() {
        yield { type: "tool_group_start", groupId: "branch-check" };
        yield { type: "tool_start", toolCallId: "branch", name: "git_current_branch", args: {} };
        yield { type: "tool_end", toolCallId: "branch", name: "git_current_branch", ok: true, summary: "main", result: {} };
        yield {
          type: "done",
          result: {
            response: "proceeded after the corrective narrative.",
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

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "Inspect the selected project's branch.",
        repoPath: "C:/fixture/project",
        projectLink: { name: "Fixture", repoPath: "C:/fixture/project" },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("The corrective narrative is visible.");
    expect(response.body).toContain("proceeded after the corrective narrative.");
    expect(response.body).not.toContain("turn.failed");
    // The corrective directive reached the second (and only visible) attempt.
    expect(narrativeBehavior.callCount).toBe(2);
    expect(JSON.stringify(narrativeCalls[0].messages[1])).toContain(
      "Your previous opening produced no visible public text in time",
    );
  });

  it("re-prompts the narrator once when the opening exceeds the narrative deadline and proceeds when the corrective narrative produces visible text", async () => {
    // The deadline constant is read from the environment at module load; a
    // fresh module evaluation with a short deadline exercises the real route
    // timing path instead of waiting 60s.
    process.env["MERGEPILOT_OPENING_NARRATIVE_DEADLINE_MS"] = "80";
    vi.resetModules();
    const { registerChatRoutes: registerChatRoutesShortDeadline } =
      await import("../src/routes/chat.routes.js");
    narrativeBehavior.mode = "blocked-then-text";
    narrativeBehavior.callCount = 0;
    narrativeCalls[0].messages = [];
    const session = {
      createSession: () => "session-deadline-retry",
      appendUserTurn: vi.fn(async () => undefined),
      appendTurnTimelineEvent: async () => undefined,
      cancel: () => undefined,
      async *run() {
        yield { type: "tool_group_start", groupId: "branch-check" };
        yield { type: "tool_start", toolCallId: "branch", name: "git_current_branch", args: {} };
        yield { type: "tool_end", toolCallId: "branch", name: "git_current_branch", ok: true, summary: "main", result: {} };
        yield {
          type: "done",
          result: {
            response: "proceeded after the deadline corrective narrative.",
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
    registerChatRoutesShortDeadline(app, {
      settings: {} as never,
      chatSessions: session as never,
      buildInlineLlmSettings: () => ({} as never),
      envSourceLabel: () => "test",
    });

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "Inspect the selected project's branch.",
        repoPath: "C:/fixture/project",
        projectLink: { name: "Fixture", repoPath: "C:/fixture/project" },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("The corrective narrative is visible.");
    expect(response.body).toContain("proceeded after the deadline corrective narrative.");
    expect(response.body).not.toContain("turn.failed");
    // The first stream never settled; exactly one corrective re-prompt ran.
    expect(narrativeBehavior.callCount).toBe(2);
    delete process.env["MERGEPILOT_OPENING_NARRATIVE_DEADLINE_MS"];
  });
});
