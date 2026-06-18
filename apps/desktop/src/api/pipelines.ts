import { RUNTIME_URL } from "./runtime.js";

export async function submitPipeline(payload: Record<string, unknown>): Promise<{ taskId: string }> {
  const r = await fetch(`${RUNTIME_URL}/tasks/submit-pipeline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`/tasks/submit-pipeline HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as { taskId: string };
}
