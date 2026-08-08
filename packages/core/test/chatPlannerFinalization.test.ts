import { describe, expect, it } from "vitest";
import { CHAT_CONTROL_JSON_MARKER, CHAT_FINAL_TOOL_NAME, ChatPlanner } from "../src/chatPlanner.js";
import {
  createToolExecutor,
  fakeChunkedLlm,
  fakeLlm,
  fakeSequenceLlm,
  fakeStreamingToolCallLlm,
  runPlanner,
} from "./chatPlannerTestDoubles.js";

describe("ChatPlanner finalization and visible streaming", () => {
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

  it("streams only the response field, never structured planner JSON", async () => {
    const plannerJson = JSON.stringify({
      response: "I checked the project context.",
      risk_level: "low",
      actions_taken: [],
      suggestions: [],
    });
    const planner = new ChatPlanner(fakeLlm(plannerJson), createToolExecutor(), { maxSteps: 1 });
    const events = [];

    for await (const event of planner.run("understand project", [], ".", async () => true)) {
      events.push(event);
    }

    const deltas = events
      .filter((event): event is Extract<typeof event, { type: "assistant_delta" }> => event.type === "assistant_delta")
      .map((event) => event.delta)
      .join("");
    expect(deltas).toBe("I checked the project context.");
    expect(deltas).not.toContain("\"response\"");
    expect(deltas).not.toContain("risk_level");
    const done = events.find((event) => event.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.response).toBe("I checked the project context.");
      expect(done.result.streamedResponse).toBe("I checked the project context.");
      expect(done.result.finalizationMode).toBe("plain_json");
    }
    const controlIndex = events.findIndex((event) => event.type === "assistant_control");
    const doneIndex = events.findIndex((event) => event.type === "done");
    expect(controlIndex).toBeGreaterThanOrEqual(0);
    expect(controlIndex).toBeLessThan(doneIndex);
    const control = events[controlIndex];
    if (control?.type === "assistant_control") {
      expect(control.control.response).toBe("I checked the project context.");
      expect(control.control.riskLevel).toBe("low");
    }
  });

  it("streams response text incrementally across JSON chunks", async () => {
    const chunks = [
      "{\"response\":\"Hel",
      "lo\\npro",
      "ject\",\"risk_level\":\"low\",\"actions_taken\":[],\"suggestions\":[]}",
    ];
    const planner = new ChatPlanner(fakeChunkedLlm(chunks), createToolExecutor(), { maxSteps: 1 });
    const deltas: string[] = [];

    for await (const event of planner.run("understand project", [], ".", async () => true)) {
      if (event.type === "assistant_delta") deltas.push(event.delta);
    }

    expect(deltas.join("")).toBe("Hello\nproject");
    expect(deltas.length).toBeGreaterThan(1);
  });

  it("streams response text from finalization tool-call argument deltas", async () => {
    const chunks = [
      "{\"response\":\"Hel",
      "lo from ",
      "agent final\",\"risk_level\":\"low\",\"actions_taken\":[],\"suggestions\":[]}",
    ];
    const planner = new ChatPlanner(fakeStreamingToolCallLlm(CHAT_FINAL_TOOL_NAME, chunks), createToolExecutor(), {
      maxSteps: 1,
    });
    const events = [];

    for await (const event of planner.run("understand project", [], ".", async () => true)) {
      events.push(event);
    }

    const deltas = events
      .filter((event): event is Extract<typeof event, { type: "assistant_delta" }> => event.type === "assistant_delta")
      .map((event) => event.delta);
    expect(deltas.join("")).toBe("Hello from agent final");
    expect(deltas.length).toBeGreaterThan(1);
    const firstDeltaIndex = events.findIndex((event) => event.type === "assistant_delta");
    const doneIndex = events.findIndex((event) => event.type === "done");
    expect(firstDeltaIndex).toBeGreaterThanOrEqual(0);
    expect(firstDeltaIndex).toBeLessThan(doneIndex);
    const done = events[doneIndex];
    if (done?.type !== "done") throw new Error("missing done");
    expect(done.result.response).toBe("Hello from agent final");
    expect(done.result.streamedResponse).toBe("Hello from agent final");
    expect(done.result.finalizationMode).toBe("agent_final");
  });

  it("stops finalization tool-call streaming before malformed duplicate control text", async () => {
    const response = "The large text is \"MP VISION TEST,\" and the two colored shapes are a blue square and a red circle.";
    const escapedResponse = JSON.stringify(response).slice(1, -1);
    const chunks = [
      `{"response":"${escapedResponse}`,
      `{\\"response`,
      `text is \\"MP VISION TEST,\\" and the two colored shapes are a blue square and a red circle.`,
      "\",\"risk_level\":\"low\",\"actions_taken\":[],\"suggestions\":[]}",
    ];
    const planner = new ChatPlanner(fakeStreamingToolCallLlm(CHAT_FINAL_TOOL_NAME, chunks), createToolExecutor(), {
      maxSteps: 1,
    });
    const events = [];

    for await (const event of planner.run("describe image", [], ".", async () => true)) {
      events.push(event);
    }

    const deltas = events
      .filter((event): event is Extract<typeof event, { type: "assistant_delta" }> => event.type === "assistant_delta")
      .map((event) => event.delta)
      .join("");
    expect(deltas).toBe(response);
    expect(deltas).not.toContain("{\"response");
    expect(deltas).not.toContain("responsetext");
  });

  it("does not duplicate visible text when prose and agent_final tool deltas arrive together", async () => {
    const response = "The large text is \"MP VISION TEST,\" and the shapes are a blue square and a red circle.";
    const finalArgs = JSON.stringify({
      response,
      risk_level: "low",
      actions_taken: [],
      suggestions: [],
    });
    const planner = new ChatPlanner(
      fakeSequenceLlm([
        [
          { type: "delta", delta: response },
          {
            type: "tool_call_delta",
            toolCalls: [{ id: "call_1", name: CHAT_FINAL_TOOL_NAME, arguments: finalArgs }],
          },
          {
            type: "tool_call",
            toolCalls: [{ id: "call_1", name: CHAT_FINAL_TOOL_NAME, arguments: finalArgs }],
          },
          { type: "done", finishReason: "tool_calls" },
        ],
      ]),
      createToolExecutor(),
      { maxSteps: 1 },
    );
    const events = [];

    for await (const event of planner.run("describe image", [], ".", async () => true)) {
      events.push(event);
    }

    const deltas = events
      .filter((event): event is Extract<typeof event, { type: "assistant_delta" }> => event.type === "assistant_delta")
      .map((event) => event.delta)
      .join("");
    expect(deltas).toBe(response);
    expect(deltas).not.toContain("{\"response");

    const done = events.find((event) => event.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.response).toBe(response);
      expect(done.result.streamedResponse).toBe(response);
      expect(done.result.finalizationMode).toBe("agent_final");
    }
  });

  it("does not restream prior prose when a nudged second step returns agent_final", async () => {
    const response = "The large text is \"MP VISION TEST,\" and the shapes are a blue square and a red circle.";
    const finalArgs = JSON.stringify({
      response,
      risk_level: "low",
      actions_taken: [],
      suggestions: [],
    });
    const planner = new ChatPlanner(
      fakeSequenceLlm([
        [
          { type: "delta", delta: response },
          { type: "done", finishReason: "stop" },
        ],
        [
          {
            type: "tool_call_delta",
            toolCalls: [{ id: "call_1", name: CHAT_FINAL_TOOL_NAME, arguments: finalArgs }],
          },
          {
            type: "tool_call",
            toolCalls: [{ id: "call_1", name: CHAT_FINAL_TOOL_NAME, arguments: finalArgs }],
          },
          { type: "done", finishReason: "tool_calls" },
        ],
      ]),
      createToolExecutor(),
      { maxSteps: 2 },
    );
    const events = [];

    for await (const event of planner.run("describe image", [], ".", async () => true)) {
      events.push(event);
    }

    const deltas = events
      .filter((event): event is Extract<typeof event, { type: "assistant_delta" }> => event.type === "assistant_delta")
      .map((event) => event.delta)
      .join("");
    expect(deltas).toBe(response);

    const done = events.find((event) => event.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.response).toBe(response);
      expect(done.result.streamedResponse).toBe(response);
      expect(done.result.finalizationMode).toBe("agent_final");
    }
  });

  it("streams visible prose before the control JSON marker", async () => {
    const chunks = [
      "I checked ",
      "the project.",
      `\n${CHAT_CONTROL_JSON_MARKER}`,
      "{\"response\":\"I checked the project.\",\"risk_level\":\"low\",\"actions_taken\":[\"repo_refresh_index\"],\"suggestions\":[]}",
    ];
    const planner = new ChatPlanner(fakeChunkedLlm(chunks), createToolExecutor(), { maxSteps: 1 });
    const events = [];

    for await (const event of planner.run("understand project", [], ".", async () => true)) {
      events.push(event);
    }

    const deltas = events
      .filter((event): event is Extract<typeof event, { type: "assistant_delta" }> => event.type === "assistant_delta")
      .map((event) => event.delta)
      .join("");
    expect(deltas).toBe("I checked the project.\n");
    expect(deltas).not.toContain(CHAT_CONTROL_JSON_MARKER);
    expect(deltas).not.toContain("risk_level");

    const done = events.find((event) => event.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.response).toBe("I checked the project.");
      // Canonical rule: control-JSON actions_taken is model self-report, not
      // execution fact — it must never surface as actionsTaken.
      expect(done.result.actionsTaken).toEqual([]);
      expect(done.result.finalizationMode).toBe("control_marker");
    }
  });

  it("stops visible streaming before unmarked compatibility control JSON", async () => {
    const chunks = [
      "The large text is \"MP VISION TEST,\"",
      " and the two colored shapes are a blue square and a red circle.",
      "{\"",
      "response\":\"The large text is \\\"MP VISION TEST,\\\" and the two colored shapes are a blue square and a red circle.\",",
      "\"risk_level\":\"low\",\"actions_taken\":[],\"suggestions\":[]}",
    ];
    const planner = new ChatPlanner(fakeChunkedLlm(chunks), createToolExecutor(), { maxSteps: 1 });
    const events = [];

    for await (const event of planner.run("describe image", [], ".", async () => true)) {
      events.push(event);
    }

    const deltas = events
      .filter((event): event is Extract<typeof event, { type: "assistant_delta" }> => event.type === "assistant_delta")
      .map((event) => event.delta)
      .join("");
    expect(deltas).toBe(
      "The large text is \"MP VISION TEST,\" and the two colored shapes are a blue square and a red circle.",
    );
    expect(deltas).not.toContain("{\"response\"");
    expect(deltas).not.toContain("risk_level");

    const done = events.find((event) => event.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.result.response).toBe(
        "The large text is \"MP VISION TEST,\" and the two colored shapes are a blue square and a red circle.",
      );
      expect(done.result.streamedResponse).toBe(
        "The large text is \"MP VISION TEST,\" and the two colored shapes are a blue square and a red circle.",
      );
      expect(done.result.finalizationMode).toBe("plain_json");
    }
  });

  it("does not leak partial control marker chunks into visible prose", async () => {
    const chunks = [
      "Ready.",
      "\n__CON",
      "TROL_JSON__",
      "{\"response\":\"Ready.\",\"risk_level\":\"low\",\"actions_taken\":[],\"suggestions\":[]}",
    ];
    const planner = new ChatPlanner(fakeChunkedLlm(chunks), createToolExecutor(), { maxSteps: 1 });
    const deltas: string[] = [];

    for await (const event of planner.run("continue", [], ".", async () => true)) {
      if (event.type === "assistant_delta") deltas.push(event.delta);
    }

    expect(deltas.join("")).toBe("Ready.\n");
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
