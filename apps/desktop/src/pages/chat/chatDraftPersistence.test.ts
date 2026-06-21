import { afterEach, describe, expect, it, vi } from "vitest";
import { conversationPartsFromAssistantBubble } from "../../chatBubbles.js";
import {
  clearChatDraft,
  loadChatDraft,
  sanitizeChatDraft,
  saveChatDraft,
  type ChatDraftState,
} from "./chatDraftPersistence.js";

function installSessionStorageMock() {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  });
}

function draft(overrides: Partial<ChatDraftState> = {}): ChatDraftState {
  return {
    repoPath: "C:\\repo",
    input: "",
    bubbles: [],
    sessionId: "session-1",
    statusText: null,
    workflowState: null,
    customTitle: null,
    activeProjectLinkId: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chat draft persistence", () => {
  it("restores interrupted assistant streams as non-streaming text bubbles", () => {
    const sanitized = sanitizeChatDraft(draft({
      statusText: "Thinking",
      bubbles: [{
        id: "assistant-1",
        kind: "assistant",
        streaming: true,
        parts: conversationPartsFromAssistantBubble({ text: "partial answer" }),
      }],
    }));

    expect(sanitized.statusText).toBeNull();
    expect(sanitized.bubbles).toEqual([
      expect.objectContaining({
        kind: "assistant",
        text: "partial answer",
        streaming: false,
      }),
    ]);
  });

  it("keeps status text when an active workflow draft is still resumable", () => {
    const sanitized = sanitizeChatDraft(draft({
      statusText: "Waiting for approval",
      workflowState: {
        status: "waiting_for_approval",
        currentStep: "Confirm git push",
        completedTools: ["git_status"],
      },
      bubbles: [{
        id: "assistant-1",
        kind: "assistant",
        text: "Review exact args",
        streaming: true,
      }],
    }));

    expect(sanitized.statusText).toBe("Waiting for approval");
    expect(sanitized.bubbles[0]).toMatchObject({ streaming: false });
  });

  it("loads, saves, clears, and ignores malformed drafts", () => {
    installSessionStorageMock();

    const saved = draft({ input: "review my changes" });
    saveChatDraft(saved);

    expect(loadChatDraft()).toEqual(saved);

    clearChatDraft();
    expect(loadChatDraft()).toBeNull();

    sessionStorage.setItem("dev_agent_chat_draft_v1", "{not-json");
    expect(loadChatDraft()).toBeNull();
  });

  it("strips transient image payloads before persisting drafts", () => {
    installSessionStorageMock();

    saveChatDraft(draft({
      bubbles: [{
        id: "user-with-image",
        kind: "user",
        text: "What is in this screenshot?",
        transientImageAttachments: [{
          id: "image-1",
          name: "composer-screenshot.png",
          mimeType: "image/png",
          size: 68,
          dataUrl: "data:image/png;base64,secret-image-bytes",
        }],
      }],
    }));

    const raw = sessionStorage.getItem("dev_agent_chat_draft_v1") ?? "";
    expect(raw).not.toContain("secret-image-bytes");
    expect(raw).not.toContain("data:image/png");
    expect(raw).toContain("[image: composer-screenshot.png]");
    expect(loadChatDraft()?.bubbles[0]).toEqual({
      id: "user-with-image",
      kind: "user",
      text: "What is in this screenshot?\n\n[image: composer-screenshot.png]",
    });
  });

  it("loads legacy activeProfileId drafts as activeProjectLinkId", () => {
    installSessionStorageMock();
    sessionStorage.setItem("dev_agent_chat_draft_v1", JSON.stringify({
      ...draft({ activeProjectLinkId: null }),
      activeProjectLinkId: undefined,
      activeProfileId: "project-link-1",
    }));

    expect(loadChatDraft()).toMatchObject({
      activeProjectLinkId: "project-link-1",
      activeProfileId: undefined,
    });
  });
});
