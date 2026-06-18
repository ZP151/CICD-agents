import {
  CHAT_HANDOFF_KEY,
  type ChatHandoffDraft,
} from "../../checkpointHandoff.js";

export const CHAT_HANDOFF_STATUS_TEXT = "Rollback proposal loaded";

export interface ConsumedChatHandoff {
  input: string;
  repoPath?: string;
  activeProjectLinkId?: string;
  statusText: string;
}

type ChatHandoffStorage = Pick<Storage, "getItem" | "removeItem">;

export function chatHandoffDraftToState(draft: ChatHandoffDraft): ConsumedChatHandoff | null {
  const input = typeof draft.message === "string" ? draft.message.trim() : "";
  if (!input) return null;
  const repoPath = typeof draft.repoPath === "string" ? draft.repoPath.trim() : "";
  const projectLinkId = typeof draft.projectLinkId === "string" ? draft.projectLinkId.trim() : "";
  return {
    input,
    repoPath: repoPath || undefined,
    activeProjectLinkId: projectLinkId || undefined,
    statusText: CHAT_HANDOFF_STATUS_TEXT,
  };
}

export function consumeChatHandoff(storage: ChatHandoffStorage = sessionStorage): ConsumedChatHandoff | null {
  const raw = storage.getItem(CHAT_HANDOFF_KEY);
  if (!raw) return null;
  storage.removeItem(CHAT_HANDOFF_KEY);
  try {
    return chatHandoffDraftToState(JSON.parse(raw) as ChatHandoffDraft);
  } catch {
    return null;
  }
}
