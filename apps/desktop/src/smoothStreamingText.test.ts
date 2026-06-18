import { describe, expect, it } from "vitest";
import { smoothStreamingTextTakeLength } from "./smoothStreamingText.js";

describe("smoothStreamingTextTakeLength", () => {
  it("reveals at least one character while pending text exists", () => {
    expect(smoothStreamingTextTakeLength(25, 0)).toBe(1);
  });

  it("uses dynamic catch-up without exceeding the pending buffer", () => {
    const small = smoothStreamingTextTakeLength(20, 100);
    const large = smoothStreamingTextTakeLength(200, 100);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(200);
  });

  it("drains final pending text faster than normal display", () => {
    const normal = smoothStreamingTextTakeLength(200, 100, false);
    const draining = smoothStreamingTextTakeLength(200, 100, true);
    expect(draining).toBeGreaterThan(normal);
  });
});
