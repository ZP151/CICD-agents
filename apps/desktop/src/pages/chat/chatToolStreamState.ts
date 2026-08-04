export function makeToolCallId(toolName?: string, args?: Record<string, unknown>): string {
  if (args !== undefined) return `tool-${toolName ?? "unknown"}-${hashShort(JSON.stringify(args ?? {}))}`;
  return `tool-${toolName ?? "unknown"}-${uid()}`;
}

export function toolPartStateFromResult(toolOk?: boolean): "result" | "error" | "running" {
  if (toolOk === false) return "error";
  if (toolOk === true) return "result";
  return "running";
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function hashShort(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
