import { describe, expect, it } from "vitest";
import { shouldApplyChatSessionLoad } from "./useChatSessionLifecycle.js";

describe("chat history session loading", () => {
  it("keeps the most recently requested conversation when an earlier request resolves late", () => {
    const firstRequest = 1;
    const latestRequest = 2;

    expect(shouldApplyChatSessionLoad(firstRequest, latestRequest)).toBe(false);
    expect(shouldApplyChatSessionLoad(latestRequest, latestRequest)).toBe(true);
  });
});
