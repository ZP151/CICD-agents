import { describe, expect, it } from "vitest";
import { ToolCallAssembler } from "../src/llm.js";

describe("ToolCallAssembler", () => {
  it("reconstructs a tool call from fragmented OpenAI deltas", () => {
    const assembler = new ToolCallAssembler();
    // Simulate four streaming deltas for the same call (index 0).
    assembler.ingest([{ index: 0, id: "call_abc", function: { name: "git_diff" } }]);
    assembler.ingest([{ index: 0, function: { arguments: "{\"target" } }]);
    assembler.ingest([{ index: 0, function: { arguments: "_branch\": " } }]);
    assembler.ingest([{ index: 0, function: { arguments: "\"main\"}" } }]);

    const calls = assembler.finalize();
    expect(calls.length).toBe(1);
    const call = calls[0]!;
    expect(call.id).toBe("call_abc");
    expect(call.name).toBe("git_diff");
    expect(JSON.parse(call.arguments)).toEqual({ target_branch: "main" });
  });

  it("preserves call order by index when multiple calls overlap", () => {
    const assembler = new ToolCallAssembler();
    assembler.ingest([
      { index: 1, id: "call_2", function: { name: "git_status" } },
      { index: 0, id: "call_1", function: { name: "git_diff", arguments: "{}" } },
    ]);
    assembler.ingest([{ index: 1, function: { arguments: "{}" } }]);

    const calls = assembler.finalize();
    expect(calls.map((c) => c.id)).toEqual(["call_1", "call_2"]);
    expect(calls.map((c) => c.name)).toEqual(["git_diff", "git_status"]);
  });

  it("returns an empty array when nothing was ingested", () => {
    const assembler = new ToolCallAssembler();
    expect(assembler.finalize()).toEqual([]);
    expect(assembler.size).toBe(0);
  });
});
