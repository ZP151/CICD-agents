import { describe, expect, it } from "vitest";
import {
  CHAT_AUTO_SCROLL_THRESHOLD_PX,
  isNearChatBottom,
  shouldFollowIncomingChatContent,
  type ChatScrollMetrics,
} from "./chatScroll.js";

const metrics = (overrides: Partial<ChatScrollMetrics> = {}): ChatScrollMetrics => ({
  scrollTop: 0,
  scrollHeight: 1000,
  clientHeight: 400,
  ...overrides,
});

describe("chat scroll intent", () => {
  it("follows incoming content when the viewport is close to the bottom", () => {
    expect(shouldFollowIncomingChatContent(metrics({ scrollTop: 520 }))).toBe(true);
  });

  it("does not follow incoming content when the user is reading earlier messages", () => {
    expect(shouldFollowIncomingChatContent(metrics({ scrollTop: 300 }))).toBe(false);
  });

  it("treats the configured threshold as inclusive", () => {
    expect(isNearChatBottom(metrics({ scrollTop: 1000 - 400 - CHAT_AUTO_SCROLL_THRESHOLD_PX }))).toBe(true);
  });

  it("defaults to following when the scroll container is not mounted yet", () => {
    expect(shouldFollowIncomingChatContent(null)).toBe(true);
  });
});
