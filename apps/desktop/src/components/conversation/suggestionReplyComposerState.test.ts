import { describe, expect, it } from "vitest";
import {
  deriveComposerInputState,
  deriveComposerStateNotice,
} from "./SuggestionReplyBar.js";

describe("deriveComposerStateNotice", () => {
  it("prioritizes approval state", () => {
    expect(deriveComposerStateNotice({
      busy: true,
      pendingApproval: true,
      pendingApprovalDescription: "Approve staging selected files",
      queuedLabel: "Review changes",
    })).toEqual({
      tone: "approval",
      label: "Approval pending",
      detail: "Approve staging selected files",
    });
  });

  it("shows queued state before busy state", () => {
    expect(deriveComposerStateNotice({
      busy: true,
      queuedLabel: "Review changes",
      statusText: "Running git status",
    })).toEqual({
      tone: "queued",
      label: "Queued follow-up",
      detail: "Review changes",
    });
  });

  it("shows busy state and falls back to a helpful detail", () => {
    expect(deriveComposerStateNotice({ busy: true })).toEqual({
      tone: "busy",
      label: "Thinking",
      detail: "You can queue a follow-up while the current action finishes.",
    });
  });

  it("treats running workflow state as busy even after restoring a session", () => {
    expect(deriveComposerStateNotice({
      workflowStatus: "running",
      statusText: "Inspecting workspace",
    })).toEqual({
      tone: "busy",
      label: "Thinking",
      detail: "Inspecting workspace",
    });
  });

  it("does not show a notice while idle", () => {
    expect(deriveComposerStateNotice({ busy: false })).toBeNull();
  });
});

describe("deriveComposerInputState", () => {
  it("blocks new input while an approval is pending", () => {
    expect(deriveComposerInputState({
      pendingApproval: true,
      inputValue: "review this too",
    })).toEqual({
      inputDisabled: true,
      sendDisabled: true,
      controlsDisabled: true,
      placeholder: "Approve or cancel the pending action before starting another request.",
      inputTitle: "Finish the current approval first.",
      sendTitle: "Finish the current approval first.",
    });
  });

  it("blocks input while the agent is thinking", () => {
    expect(deriveComposerInputState({
      busy: true,
      inputValue: "review this too",
    })).toEqual({
      inputDisabled: true,
      sendDisabled: true,
      controlsDisabled: true,
      placeholder: "MergePilot is thinking...",
      inputTitle: "MergePilot is thinking.",
      sendTitle: "Stop or wait for the current response before sending another request.",
    });
  });

  it("blocks input while a restored workflow is still running", () => {
    expect(deriveComposerInputState({
      workflowStatus: "running",
      inputValue: "review this too",
    })).toEqual({
      inputDisabled: true,
      sendDisabled: true,
      controlsDisabled: true,
      placeholder: "MergePilot is thinking...",
      inputTitle: "MergePilot is thinking.",
      sendTitle: "Stop or wait for the current response before sending another request.",
    });
  });

  it("enables send only when idle input has content", () => {
    expect(deriveComposerInputState({ inputValue: "" })).toMatchObject({
      inputDisabled: false,
      sendDisabled: true,
      controlsDisabled: false,
      sendTitle: "Type a message first.",
    });
    expect(deriveComposerInputState({ inputValue: "review my changes" })).toMatchObject({
      inputDisabled: false,
      sendDisabled: false,
      controlsDisabled: false,
      sendTitle: "Send message",
    });
  });
});
