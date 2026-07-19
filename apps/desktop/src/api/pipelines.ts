import { RUNTIME_URL, messageFromErrorResponse } from "./runtime.js";
import { readLlmConfig } from "./localSettings.js";

export type PipelineConnectionPurpose = "ci" | "pr-validation" | "release" | "deployment" | "other";

export interface PipelineConnection {
  id: string;
  projectLinkId: string;
  pipelineId: string;
  pipelineName: string;
  purpose: PipelineConnectionPurpose;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export type PipelineConnectionInput = Omit<PipelineConnection, "id" | "createdAt" | "updatedAt">;

export async function submitPipeline(payload: Record<string, unknown>): Promise<{ taskId: string }> {
  const r = await fetch(`${RUNTIME_URL}/tasks/submit-pipeline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Submit pipeline HTTP ${r.status}`, r));
  return (await r.json()) as { taskId: string };
}

export async function listPipelineConnections(projectLinkId?: string): Promise<PipelineConnection[]> {
  const query = projectLinkId ? `?projectLinkId=${encodeURIComponent(projectLinkId)}` : "";
  const r = await fetch(`${RUNTIME_URL}/pipeline-connections${query}`);
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Pipeline connections HTTP ${r.status}`, r));
  return pipelineConnectionsFromResponse(await r.json());
}

export function pipelineConnectionsFromResponse(value: unknown): PipelineConnection[] {
  if (Array.isArray(value)) return value as PipelineConnection[];
  if (
    value &&
    typeof value === "object" &&
    "items" in value &&
    Array.isArray((value as { items?: unknown }).items)
  ) {
    return (value as { items: PipelineConnection[] }).items;
  }
  throw new Error(
    "Pipeline connections could not be loaded because the desktop daemon returned an unexpected response.",
  );
}

export async function createPipelineConnection(data: PipelineConnectionInput): Promise<PipelineConnection> {
  const r = await fetch(`${RUNTIME_URL}/pipeline-connections`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Create pipeline connection HTTP ${r.status}`, r));
  return (await r.json()) as PipelineConnection;
}

export async function updatePipelineConnection(
  id: string,
  data: Partial<PipelineConnectionInput>,
): Promise<PipelineConnection> {
  const r = await fetch(`${RUNTIME_URL}/pipeline-connections/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Update pipeline connection HTTP ${r.status}`, r));
  return (await r.json()) as PipelineConnection;
}

export async function deletePipelineConnection(id: string): Promise<void> {
  const r = await fetch(`${RUNTIME_URL}/pipeline-connections/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Delete pipeline connection HTTP ${r.status}`, r));
}

export async function analyzePipelineEvidence(data: {
  pipelineId: string;
  pipelineName: string;
  project: string;
  repository: string;
  summary: string;
  localAnalysis: string;
  runs: unknown[];
  artifacts: unknown[];
}): Promise<{ source: "llm" | "heuristic"; analysis: string; warning?: string }> {
  const r = await fetch(`${RUNTIME_URL}/pipelines/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...data,
      llmConfig: readLlmConfig(),
    }),
  });
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Analyze pipeline HTTP ${r.status}`, r));
  return (await r.json()) as { source: "llm" | "heuristic"; analysis: string; warning?: string };
}
