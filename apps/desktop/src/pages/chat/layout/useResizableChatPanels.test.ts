import { describe, expect, it } from "vitest";
import { DEFAULT_SUMMARY_PINNED_OPEN } from "./useResizableChatPanels.js";

describe("useResizableChatPanels defaults", () => {
  it("keeps the pinned summary closed until the user opens it", () => {
    expect(DEFAULT_SUMMARY_PINNED_OPEN).toBe(false);
  });
});
