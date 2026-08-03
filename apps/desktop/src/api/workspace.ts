import { RUNTIME_URL, messageFromErrorBody } from "./runtime.js";

export interface WorkspaceFilePreview {
  path: string;
  content: string;
  size: number;
  lineCount: number;
}

export class WorkspaceFilePreviewError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "WorkspaceFilePreviewError";
  }
}

export async function fetchWorkspaceFile(
  repoPath: string,
  filePath: string,
): Promise<WorkspaceFilePreview> {
  const r = await fetch(`${RUNTIME_URL}/workspace/file`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repoPath, filePath }),
  });
  if (!r.ok) {
    const bodyText = await r.text();
    throw workspaceFilePreviewError(r.status, bodyText);
  }
  return (await r.json()) as WorkspaceFilePreview;
}

function workspaceFilePreviewError(status: number, bodyText: string): WorkspaceFilePreviewError {
  const parsed = parseJsonBody(bodyText);
  const errorText = typeof parsed === "object" && parsed && "error" in parsed
    ? messageFromErrorBody("Workspace file preview failed.", JSON.stringify({ error: (parsed as { error?: unknown }).error }))
    : messageFromErrorBody("Workspace file preview failed.", bodyText);
  if (status === 413) return new WorkspaceFilePreviewError("File is too large to preview.", status, parsed);
  if (status === 415) return new WorkspaceFilePreviewError("Binary file preview is not supported.", status, parsed);
  if (status === 404) return new WorkspaceFilePreviewError("File not found or has been deleted.", status, parsed);
  if (status === 403) return new WorkspaceFilePreviewError("Permission denied while reading this file.", status, parsed);
  return new WorkspaceFilePreviewError(errorText, status, parsed);
}

function parseJsonBody(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return undefined;
  }
}
