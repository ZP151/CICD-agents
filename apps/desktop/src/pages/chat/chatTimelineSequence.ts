import type { ChatEventPayload } from "../../api.js";

/**
 * The live stream and session replay can overlap briefly after reconnecting.
 * Keep the acceptance cursor at the dispatcher boundary so every canonical
 * part, including final text that lives outside the transcript reducer, has
 * the same monotonic sequence contract.
 */
const cursorsByConsumer = new WeakMap<object, Map<string, number>>();
const MAX_TRACKED_TURNS = 256;

export function acceptCanonicalTimelineSequence(
  consumer: object,
  event: Pick<ChatEventPayload, "turnId" | "sequence" | "type">,
): boolean {
  if (!event.turnId || typeof event.sequence !== "number") return true;
  let cursors = cursorsByConsumer.get(consumer);
  if (!cursors) {
    cursors = new Map();
    cursorsByConsumer.set(consumer, cursors);
  }

  const last = cursors.get(event.turnId);
  if (last !== undefined && event.sequence <= last) return false;

  cursors.set(event.turnId, event.sequence);
  // Turn identifiers are unbounded over a long-lived desktop session. The
  // insertion order is sufficient here because an evicted old turn cannot be
  // active; its persisted transcript reducer remains the second safety net.
  while (cursors.size > MAX_TRACKED_TURNS) {
    const oldest = cursors.keys().next().value;
    if (!oldest) break;
    cursors.delete(oldest);
  }
  return true;
}
