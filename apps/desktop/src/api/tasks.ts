import { RUNTIME_URL, messageFromErrorResponse } from "./runtime.js";

export interface TaskView {
  id: string;
  kind: string;
  status: string;
  payload?: Record<string, unknown>;
  steps: Array<{ seq: number; name: string; detail: string; status: string; createdAt: number }>;
  result: unknown;
  error: string;
  createdAt: number;
  startedAt?: number | null;
  finishedAt?: number | null;
}

export async function fetchTasks(): Promise<TaskView[]> {
  const r = await fetch(`${RUNTIME_URL}/tasks`);
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Activity runs HTTP ${r.status}`, r));
  return (await r.json()) as TaskView[];
}

export async function fetchTask(taskId: string): Promise<TaskView> {
  const r = await fetch(`${RUNTIME_URL}/tasks/${taskId}`);
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Activity run HTTP ${r.status}`, r));
  return (await r.json()) as TaskView;
}

export function streamTask(
  taskId: string,
  onEvent: (type: string, data: unknown) => void,
): () => void {
  const url = `${RUNTIME_URL}/tasks/${taskId}/events`;
  const es = new EventSource(url);
  const handler = (event: MessageEvent): void => {
    try {
      onEvent(event.type || "message", JSON.parse(event.data));
    } catch {
      onEvent(event.type || "message", event.data);
    }
  };
  ["step", "status", "done", "error"].forEach((name) => es.addEventListener(name, handler));
  return () => es.close();
}
