/**
 * Cycle 00 real-ADO E2E driver (demo scenario).
 *
 * 1. POST /chat with the demo prompt against Project Link eb2f6c87
 *    (TeBS-ClaimBot / ClaimBot_API).
 * 2. Stream SSE; capture the approval request and turn continuation state.
 * 3. Approve via POST /chat/:sessionId/confirm-action (execute + verify).
 * 4. Dump the full transcript to .tmp/cycle00-e2e-transcript.jsonl for
 *    evidence and print the key events.
 */
import fs from "node:fs";
import path from "node:path";

const RUNTIME = "http://localhost:8787";
const PROJECT_LINK_ID = "eb2f6c876f53b33d";
const REPO_PATH = "C:\\Users\\15492\\Develop\\ClaimBot_API";
const WORK_ITEM_ID = 7912;
const RUN_ID = Date.now().toString(36);
const CLIENT_TURN_ID = `cycle00-e2e-${RUN_ID}`;
const IDEMPOTENCY_KEY = `cycle00-demo-${RUN_ID}`;
const OUTPUT = path.join(import.meta.dirname, "cycle00-e2e-transcript.jsonl");

const PROMPT =
  "Call the delivery_propose_action tool NOW with these exact arguments and then stop: " +
  `kind "work_item.comment"; target { kind: "work_item", id: ${WORK_ITEM_ID} }; ` +
  `payload { text: "MergePilot Cycle 00 demo: harmless fixture comment (${IDEMPOTENCY_KEY})." }; ` +
  'risk "low"; reason "Cycle 00 demo: record a harmless fixture comment on the work item"; ' +
  `idempotency_key "${IDEMPOTENCY_KEY}"; ` +
  'expires_at ' + (Date.now() + 3600_000) + '; ' +
  "expected_result [ { artifact: { kind: \"work_item\", id: " + WORK_ITEM_ID +
  " }, condition: \"revision_gt\", expectedRevision: 0 }, " +
  "{ artifact: { kind: \"work_item\", id: " + WORK_ITEM_ID +
  " }, condition: \"comment_contains\", expected: \"MergePilot Cycle 00 demo\" } ]. " +
  "Wait for approval. Do not run any other tool.";

interface SseEvent {
  event: string;
  payload: Record<string, unknown>;
}

async function readSse(response: Response): Promise<SseEvent[]> {
  if (!response.ok || !response.body) {
    throw new Error(`SSE HTTP ${response.status}: ${await response.text()}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: SseEvent[] = [];
  let currentEvent = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) currentEvent = line.slice(7).trim();
        else if (line.startsWith("data: ")) {
          try {
            events.push({ event: currentEvent, payload: JSON.parse(line.slice(6)) });
          } catch {
            // ignore non-JSON data frames
          }
        }
      }
    }
  }
  return events;
}

function log(events: SseEvent[]): void {
  fs.appendFileSync(OUTPUT, events.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

async function main(): Promise<void> {
  if (fs.existsSync(OUTPUT)) fs.unlinkSync(OUTPUT);

  // Phase 1: propose
  console.log("=== Phase 1: chat propose ===");
  const chatResponse = await fetch(`${RUNTIME}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: PROMPT,
      repoPath: REPO_PATH,
      projectLinkId: PROJECT_LINK_ID,
      clientTurnId: CLIENT_TURN_ID,
    }),
  });
  const sessionId = chatResponse.headers.get("x-chat-session-id") ?? "";
  const proposeEvents = await readSse(chatResponse);
  log(proposeEvents);
  console.log("sessionId:", sessionId);

  const approval = proposeEvents.find((entry) => entry.event === "turn.approval.requested");
  const approvalPayload = approval?.payload as Record<string, unknown> | undefined;
  const approvalAction = approvalPayload?.["approval"] as
    | { action?: { tool?: string; description?: string; args?: Record<string, unknown> } }
    | undefined;
  console.log("approval tool:", approvalAction?.action?.tool);
  console.log("approval description:", approvalAction?.action?.description);
  const args = approvalAction?.action?.args ?? {};
  console.log("proposal args kind:", args["kind"], "risk:", args["risk"], "idempotency_key:", args["idempotency_key"]);

  // Capture the turn continuation state from the latest turn.* event.
  let lastTurnId = "";
  let lastSequence: number | undefined;
  let startedAt: number | undefined;
  for (const entry of proposeEvents) {
    const payload = entry.payload as { turnId?: string; sequence?: number; emittedAt?: number };
    if (payload.turnId) lastTurnId = payload.turnId;
    if (typeof payload.sequence === "number") lastSequence = payload.sequence;
    if (typeof payload.emittedAt === "number") startedAt = payload.emittedAt;
  }
  console.log("continuation:", { lastTurnId, lastSequence, startedAt });

  if (!sessionId || !lastTurnId) {
    console.error("no session/turn captured; transcript in", OUTPUT);
    process.exit(2);
  }

  // Phase 2: approve -> execute -> verify. The model may retry with corrected
  // payload after a policy refusal, so loop approvals until the turn closes.
  console.log("=== Phase 2: approve ===");
  let allEvents: SseEvent[] = [];
  let continuation = { turnId: lastTurnId, startedAt, lastSequence };
  for (let round = 0; round < 5; round += 1) {
    const approveResponse = await fetch(`${RUNTIME}/chat/${sessionId}/confirm-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(continuation),
    });
    const roundEvents = await readSse(approveResponse);
    log(roundEvents);
    allEvents = [...allEvents, ...roundEvents];
    for (const entry of roundEvents) {
      const payload = entry.payload as { turnId?: string; sequence?: number; emittedAt?: number };
      if (payload.turnId) continuation.turnId = payload.turnId;
      if (typeof payload.sequence === "number") continuation.lastSequence = payload.sequence;
      if (typeof payload.emittedAt === "number") continuation.startedAt = payload.emittedAt;
    }
    const approval = roundEvents.find((entry) => entry.event === "turn.approval.requested");
    const done = roundEvents.some((entry) =>
      ["turn.finished", "turn.completed", "turn.failed", "turn.cancelled"].includes(entry.event),
    );
    if (!approval || done) break;
    console.log(`round ${round + 1}: another approval requested — approving again`);
  }

  for (const entry of allEvents) {
    const p = entry.payload as Record<string, unknown>;
    if (entry.event === "turn.tool.completed" && p["name"] === "delivery_propose_action") {
      console.log("tool completed:", p["name"], "ok:", p["ok"], "summary:", p["summary"]);
    }
  }
  const final = allEvents.find((entry) => entry.event === "turn.final.completed");
  console.log("final:", (final?.payload as { finalText?: string } | undefined)?.finalText?.slice(0, 500));
  const finished = allEvents.some((entry) => entry.event === "turn.finished");
  console.log("finished:", finished);
  console.log("transcript:", OUTPUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
