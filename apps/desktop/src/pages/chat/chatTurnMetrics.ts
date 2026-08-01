type TurnMetricName =
  | "client_send"
  | "local_visible"
  | "sse_flushed"
  | "turn_started"
  | "context_started"
  | "context_ready"
  | "planner_started"
  | "first_text_delta"
  | "first_public_work_statement"
  | "first_final_delta"
  | "finished";

interface TurnMetricRecord {
  localId?: string;
  marks: Partial<Record<TurnMetricName, number>>;
}

const records = new Map<string, TurnMetricRecord>();
let pendingLocalId: string | undefined;

export function beginTurnMetrics(localId: string): void {
  pendingLocalId = localId;
  const record: TurnMetricRecord = { localId, marks: { client_send: performance.now() } };
  records.set(localId, record);
  // Measure visibility after React has had one paint opportunity instead of
  // recording the state update itself as a misleading 0 ms render.
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      record.marks.local_visible ??= performance.now();
    });
  } else {
    record.marks.local_visible = performance.now();
  }
}

export function markTurnMetric(turnId: string | undefined, name: TurnMetricName): void {
  if (!turnId) return;
  const pending = pendingLocalId ? records.get(pendingLocalId) : undefined;
  const record = records.get(turnId) ?? pending ?? { marks: {} };
  if (pending && pendingLocalId && pendingLocalId !== turnId) records.delete(pendingLocalId);
  pendingLocalId = undefined;
  record.marks[name] ??= performance.now();
  records.set(turnId, record);
  if (name === "finished") publishTurnMetrics(turnId, record);
}

export function markPendingTurnMetric(name: TurnMetricName): void {
  if (!pendingLocalId) return;
  const record = records.get(pendingLocalId);
  if (record) record.marks[name] ??= performance.now();
}

function publishTurnMetrics(turnId: string, record: TurnMetricRecord): void {
  const marks = record.marks;
  if (marks.client_send === undefined) return;
  const elapsed = (from: TurnMetricName, to: TurnMetricName) => {
    const start = marks[from];
    const end = marks[to];
    return start === undefined || end === undefined ? undefined : Math.round(end - start);
  };
  if (import.meta.env.DEV) {
    // Serialize deliberately: desktop console collection records arguments
    // independently and otherwise reduces the useful timings to "Object".
    console.debug("[turn-metrics]", JSON.stringify({
      turnId,
      ttfvMs: elapsed("client_send", "local_visible"),
      firstServerEventMs: elapsed("client_send", "turn_started"),
      firstPublicWorkMs: elapsed("client_send", "first_public_work_statement"),
      firstFinalTextMs: elapsed("client_send", "first_final_delta"),
      totalMs: elapsed("client_send", "finished"),
    }));
  }
}
