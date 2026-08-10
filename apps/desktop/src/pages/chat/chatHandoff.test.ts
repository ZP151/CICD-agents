import { describe, expect, it, vi } from "vitest";
import { CHAT_HANDOFF_KEY } from "../../checkpointHandoff.js";
import {
  CHAT_HANDOFF_STATUS_TEXT,
  chatHandoffDraftToState,
  consumeChatHandoff,
} from "./chatHandoff.js";

function storageWith(raw: string | null) {
  return {
    getItem: vi.fn(() => raw),
    removeItem: vi.fn(),
  };
}

describe("chat handoff", () => {
  it("normalizes handoff drafts into chat state patches", () => {
    expect(chatHandoffDraftToState({
      message: "  Prepare rollback  ",
      repoPath: " C:\\repo ",
      projectLinkId: " project-link-1 ",
    })).toEqual({
      input: "Prepare rollback",
      repoPath: "C:\\repo",
      activeProjectLinkId: "project-link-1",
      statusText: CHAT_HANDOFF_STATUS_TEXT,
      autoSubmit: false,
    });

    expect(chatHandoffDraftToState({ message: "   " })).toBeNull();
  });

  it("ignores handoff drafts without a Project Link id", () => {
    expect(chatHandoffDraftToState({
      message: "Review saved insight",
    })).toMatchObject({
      activeProjectLinkId: undefined,
    });
  });

  it("preserves the origin-specific status and auto-submit intent", () => {
    expect(chatHandoffDraftToState({
      message: "Inspect the current branch before creating a pull request",
      projectLinkId: "project-link-1",
      source: "pull-request-planning",
      statusText: "Starting pull request readiness review",
      autoSubmit: true,
    })).toMatchObject({
      statusText: "Starting pull request readiness review",
      autoSubmit: true,
    });
  });

  it("consumes storage once and ignores malformed payloads", () => {
    const valid = storageWith(JSON.stringify({ message: "Review saved insight" }));
    expect(consumeChatHandoff(valid)).toMatchObject({ input: "Review saved insight" });
    expect(valid.getItem).toHaveBeenCalledWith(CHAT_HANDOFF_KEY);
    expect(valid.removeItem).toHaveBeenCalledWith(CHAT_HANDOFF_KEY);

    const malformed = storageWith("{bad-json");
    expect(consumeChatHandoff(malformed)).toBeNull();
    expect(malformed.removeItem).toHaveBeenCalledWith(CHAT_HANDOFF_KEY);

    const empty = storageWith(null);
    expect(consumeChatHandoff(empty)).toBeNull();
    expect(empty.removeItem).not.toHaveBeenCalled();
  });
});
