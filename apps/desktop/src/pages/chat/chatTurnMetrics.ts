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
const pendingLocalIds = new Set<string>();

export function beginTurnMetrics(localId: string): void {
  pendingLocalIds.add(localId);
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

/** Adopt a browser-local measurement record once the daemon confirms its Turn. */
export function adoptTurnMetrics(clientTurnId: string | undefined, turnId: string | undefined): void {
  if (!turnId) return;
  const fallbackLocalId = pendingLocalIds.size === 1 ? [...pendingLocalIds][0] : undefined;
  const localId = clientTurnId && records.has(clientTurnId) ? clientTurnId : fallbackLocalId;
  if (!localId) return;
  const record = records.get(localId);
  if (!record) return;
  if (localId !== turnId) {
    records.delete(localId);
    records.set(turnId, record);
  }
  pendingLocalIds.delete(localId);
}

export function markTurnMetric(turnId: string | undefined, name: TurnMetricName): void {
  if (!turnId) return;
  const record = records.get(turnId) ?? { marks: {} };
  record.marks[name] ??= performance.now();
  records.set(turnId, record);
  if (name === "finished") publishTurnMetrics(turnId, record);
}

export function markPendingTurnMetric(name: TurnMetricName): void {
  if (pendingLocalIds.size !== 1) return;
  const localId = [...pendingLocalIds][0];
  const record = localId ? records.get(localId) : undefined;
  if (record) record.marks[name] ??= performance.now();
}

/** Internal test seam for verifying concurrent optimistic-Turn correlation. */
export function turnMetricSnapshotForTests(turnId: string): Partial<Record<TurnMetricName, number>> | undefined {
  const record = records.get(turnId);
  return record ? { ...record.marks } : undefined;
}

export function resetTurnMetricsForTests(): void {
  records.clear();
  pendingLocalIds.clear();
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
