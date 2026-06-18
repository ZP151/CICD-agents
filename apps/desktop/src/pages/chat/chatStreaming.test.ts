import { describe, expect, it } from "vitest";
import { shouldIgnoreLegacyStreamEvent } from "./chatStreaming.js";

describe("shouldIgnoreLegacyStreamEvent", () => {
  it("blocks legacy render events once canonical ui chunks are available", () => {
    expect(shouldIgnoreLegacyStreamEvent("assistant_delta", true)).toBe(true);
    expect(shouldIgnoreLegacyStreamEvent("tool_start", true)).toBe(true);
    expect(shouldIgnoreLegacyStreamEvent("tool.output.delta", true)).toBe(true);
    expect(shouldIgnoreLegacyStreamEvent("message", true)).toBe(true);
  });

  it("keeps workflow and approval legacy events active for compatibility", () => {
    expect(shouldIgnoreLegacyStreamEvent("workflow_state", true)).toBe(false);
    expect(shouldIgnoreLegacyStreamEvent("approval_required", true)).toBe(false);
  });

  it("allows legacy render events before canonical ui chunks arrive", () => {
    expect(shouldIgnoreLegacyStreamEvent("assistant_delta", false)).toBe(false);
    expect(shouldIgnoreLegacyStreamEvent("tool_end", false)).toBe(false);
  });
});
