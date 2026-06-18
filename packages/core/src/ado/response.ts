import { ToolError } from "../tools/executor.js";

/** Parse an ADO REST response; surface HTML auth pages as a clear ToolError. */
export async function parseAdoJson(resp: Response, action: string): Promise<unknown> {
  const text = await resp.text();
  if (!resp.ok) {
    throw new ToolError(`ADO ${action} failed: HTTP ${resp.status}: ${text.slice(0, 400)}`);
  }
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
    throw new ToolError(
      `ADO ${action} returned HTML instead of JSON (often a sign-in or error page). ` +
        "Check adoOrgUrl, project, repository, and PAT scopes (Code: Read).",
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ToolError(
      `ADO ${action} returned invalid JSON. Body starts with: ${text.slice(0, 200)}`,
    );
  }
}
