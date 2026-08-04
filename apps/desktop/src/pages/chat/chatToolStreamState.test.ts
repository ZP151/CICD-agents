import { describe, expect, it } from "vitest";
import {
  makeToolCallId,
  toolPartStateFromResult,
} from "./chatToolStreamState.js";

describe("chat tool stream state", () => {
  it("maps tool results to conversation part states", () => {
    expect(toolPartStateFromResult(true)).toBe("result");
    expect(toolPartStateFromResult(false)).toBe("error");
    expect(toolPartStateFromResult(undefined)).toBe("running");
  });

  it("derives stable tool call ids from args", () => {
    const first = makeToolCallId("git_status", { short: true });
    const second = makeToolCallId("git_status", { short: true });
    expect(first).toBe(second);
    expect(first.startsWith("tool-git_status-")).toBe(true);
  });
});
