export interface SseJsonMessage<T> {
  event: string;
  data: T;
}

export async function readSseJsonStream<T>(
  response: Response,
  onMessage: (message: SseJsonMessage<T>) => void,
): Promise<void> {
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEventType = "message";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const raw = line.slice(6);
        try {
          onMessage({ event: currentEventType, data: JSON.parse(raw) as T });
        } catch {
          /* ignore malformed SSE JSON lines */
        }
        currentEventType = "message";
      }
    }
  }
}
