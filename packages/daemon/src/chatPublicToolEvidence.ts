/**
 * The legacy bubble store is still consulted by approval/workflow recovery.
 * Keep its tool evidence on the same public boundary as the Turn Transcript:
 * raw executor and MCP payloads must never be written to a session record.
 */
export function storedPublicToolResult(
  toolName: string,
  ok: boolean,
  summary: string,
  output?: string,
): Record<string, unknown> {
  const record: Record<string, unknown> = { ok, summary };
  if (!output?.trim()) return record;
  record.output = output;
  // Workflow continuation has one legacy dependency on the current branch.
  // Its input remains the bounded/redacted public command output.
  if (toolName === "git_current_branch") record.stdout = output;
  return record;
}
