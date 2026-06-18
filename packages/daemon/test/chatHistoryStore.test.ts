import { describe, expect, it } from "vitest";
import {
  storedSessionProjectLinkId,
  type StoredSession,
} from "../src/chatHistoryStore.js";

function session(overrides: Partial<StoredSession>): StoredSession {
  return {
    id: "chat-1",
    createdAt: 1,
    repoPath: "C:/repo",
    messages: [],
    bubbles: [],
    ...overrides,
  };
}

describe("chatHistoryStore Project Link helpers", () => {
  it("reads Project Link ids", () => {
    expect(storedSessionProjectLinkId(session({
      projectLinkId: "project-link-1",
    }))).toBe("project-link-1");
  });

  it("returns undefined when no Project Link id is stored", () => {
    expect(storedSessionProjectLinkId(session({}))).toBeUndefined();
  });
});
