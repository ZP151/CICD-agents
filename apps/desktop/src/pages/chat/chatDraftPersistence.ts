import { conversationTextFromParts } from "../../chatBubbles.js";
import type { Bubble, WorkflowEventState } from "./chat.types.js";

const CHAT_DRAFT_STORAGE_KEY = "dev_agent_chat_draft_v1";

export interface ChatDraftState {
  repoPath: string;
  input: string;
  bubbles: Bubble[];
  sessionId: string | null;
  statusText: string | null;
  workflowState: WorkflowEventState | null;
  customTitle: string | null;
  activeProjectLinkId: string | null;
  /** @deprecated Use activeProjectLinkId. */
  activeProfileId?: string | null;
}

function isActiveWorkflowDraft(workflowState: WorkflowEventState | null): boolean {
  return Boolean(
    workflowState &&
      (
        workflowState.status === "planning" ||
        workflowState.status === "running" ||
        workflowState.status === "waiting_for_approval"
      ),
  );
}

function restoreInterruptedStreamingBubble(bubble: Bubble): Bubble {
  if (bubble.kind !== "assistant" || !bubble.streaming) {
    return bubble;
  }
  const restoredText = bubble.text || conversationTextFromParts(bubble.parts);
  return {
    ...bubble,
    text: restoredText,
    streaming: false,
  };
}

function imagePlaceholderText(bubble: Bubble): string {
  const attachments = bubble.transientImageAttachments ?? [];
  if (attachments.length === 0) return bubble.text ?? "";
  const existing = bubble.text ?? "";
  const placeholders = attachments.map((attachment) => `[image: ${attachment.name}]`).join("\n");
  return existing.includes("[image:") ? existing : [existing, placeholders].filter(Boolean).join("\n\n");
}

function stripTransientBubbleState(bubble: Bubble): Bubble {
  if (!bubble.transientImageAttachments?.length) return bubble;
  const rest = { ...bubble };
  delete rest.transientImageAttachments;
  return {
    ...rest,
    text: imagePlaceholderText(bubble),
  };
}

export function sanitizeChatDraft(draft: ChatDraftState): ChatDraftState {
  const hadInterruptedStream = draft.bubbles.some((bubble) => bubble.kind === "assistant" && bubble.streaming);
  const activeWorkflow = isActiveWorkflowDraft(draft.workflowState);
  const activeProjectLinkId = draft.activeProjectLinkId ?? draft.activeProfileId ?? null;
  return {
    ...draft,
    activeProjectLinkId,
    activeProfileId: undefined,
    bubbles: draft.bubbles.map(restoreInterruptedStreamingBubble).map(stripTransientBubbleState),
    statusText: hadInterruptedStream && !activeWorkflow ? null : draft.statusText,
  };
}

export function loadChatDraft(): ChatDraftState | null {
  try {
    const raw = sessionStorage.getItem(CHAT_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return sanitizeChatDraft(JSON.parse(raw) as ChatDraftState);
  } catch {
    return null;
  }
}

export function saveChatDraft(draft: ChatDraftState): void {
  try {
    sessionStorage.setItem(CHAT_DRAFT_STORAGE_KEY, JSON.stringify(sanitizeChatDraft(draft)));
  } catch {
    /* ignore storage quota / privacy mode */
  }
}

export function clearChatDraft(): void {
  try {
    sessionStorage.removeItem(CHAT_DRAFT_STORAGE_KEY);
  } catch {
    /* ignore storage quota / privacy mode */
  }
}
