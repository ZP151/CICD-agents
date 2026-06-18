export function errorTextFromToolResult(result: unknown): string {
  if (result && typeof result === "object" && "error" in result) {
    return summarizeKnownRuntimeError(String((result as { error?: unknown }).error ?? ""));
  }
  return summarizeKnownRuntimeError(typeof result === "string" ? result : JSON.stringify(result));
}

export function summarizeKnownRuntimeError(text: string): string {
  if (/Could not locate the bindings file/i.test(text) || /better_sqlite3\.node/i.test(text)) {
    return "Repository index storage is unavailable because the installed daemon could not load its native SQLite binding.";
  }
  if (/schema\.sql/i.test(text) && /ENOENT|no such file|cannot find/i.test(text)) {
    return "Repository index storage is unavailable because the installed daemon could not find its database schema.";
  }
  return text.trim();
}
