const HIDDEN_PROGRESS_MESSAGES = new Set([
  "Reading project context",
  "Refreshing project context",
]);

export function visibleProgressStatusText(message: string | null | undefined): string | null {
  const trimmed = message?.trim();
  if (!trimmed) return "Thinking";
  if (HIDDEN_PROGRESS_MESSAGES.has(trimmed)) return null;
  return trimmed;
}
