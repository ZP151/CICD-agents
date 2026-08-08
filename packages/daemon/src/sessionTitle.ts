/**
 * Session titles from the user's first goal (MP-005).
 *
 * The title is generated once from the first real user message, persisted
 * with `titleSource: "auto"`, and never overwrites a manual rename
 * (`titleSource: "user"`). Assistant conclusions, tool output and internal
 * workflow text are never title sources; sensitive values are redacted before
 * persistence (RA-017..RA-020).
 */
import { redact, type ChatMessage } from "@mergepilot/core";
import type { StoredSession } from "./chatHistoryTypes.js";
import { isInternalHistoryText } from "./chatHistorySerialization.js";

const TITLE_MAX_CHARS = 60;

export function sessionTitleFromFirstGoal(messages: ChatMessage[]): string | undefined {
  const firstGoal = messages.find((message) => message.role === "user" && !isInternalHistoryText(message.content));
  if (!firstGoal) return undefined;
  const cleaned = cleanGoalText(firstGoal.content);
  if (!cleaned) return undefined;
  return truncateTitle(cleaned);
}

/** A user-renamed (or user-cleared) title is locked against auto generation. */
export function shouldAutoTitle(session: Pick<StoredSession, "title" | "titleSource">): boolean {
  return session.titleSource !== "user";
}

function cleanGoalText(content: string): string {
  const stripped = content
    // Strip image attachment markers and workflow-internal prefixes.
    .replace(/\[image:\s*[^\]]+\]/gi, " ")
    .replace(/^WORKFLOW STEP (?:COMPLETED|FAILED):/i, " ")
    // Remove fenced code blocks and inline code, then any markdown emphasis.
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[*_~#>]+/g, " ")
    // Collapse whitespace.
    .replace(/\s+/g, " ")
    .trim();
  // RA-020: redact secret-like values before the title can reach history.
  return redact(stripped);
}

function truncateTitle(value: string): string {
  return value.length <= TITLE_MAX_CHARS ? value : `${value.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…`;
}
