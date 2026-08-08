type TurnMetricName =
  | "client_send"
  | "local_visible"
  | "request_received"
  | "sse_flushed"
  | "turn_started"
  | "context_started"
  | "context_ready"
  | "planner_started"
  | "model_request_started"
  | "first_text_delta"
  | "first_public_work_statement"
  | "first_model_token"
  | "first_tool_started"
  | "first_tool_completed"
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

/** Server-reported request receipt time rides on turn.started (same clock family). */
export function adoptRequestReceivedMetric(turnId: string | undefined, requestReceivedAt: number | undefined): void {
  if (!turnId || typeof requestReceivedAt !== "number") return;
  const record = records.get(turnId) ?? { marks: {} };
  record.marks.request_received ??= requestReceivedAt;
  records.set(turnId, record);
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
      clientToDaemonMs: elapsed("client_send", "request_received"),
      firstServerEventMs: elapsed("client_send", "turn_started"),
      requestToFlushedMs: elapsed("request_received", "sse_flushed"),
      firstPublicWorkMs: elapsed("client_send", "first_public_work_statement"),
      firstModelTokenMs: elapsed("client_send", "first_model_token"),
      firstToolStartedMs: elapsed("client_send", "first_tool_started"),
      firstToolCompletedMs: elapsed("client_send", "first_tool_completed"),
      firstFinalTextMs: elapsed("client_send", "first_final_delta"),
      totalMs: elapsed("client_send", "finished"),
    }));
  }
}

/** P50/P95 reporting over elapsed durations (dev/diagnostics). */
export function turnLatencyPercentiles(
  samples: Array<Partial<Record<TurnMetricName, number>>>,
  from: TurnMetricName,
  to: TurnMetricName,
): { p50: number | undefined; p95: number | undefined } {
  const values = samples
    .map((sample) => {
      const start = sample[from];
      const end = sample[to];
      return start === undefined || end === undefined ? undefined : end - start;
    })
    .filter((value): value is number => typeof value === "number" && value >= 0)
    .sort((left, right) => left - right);
  if (values.length === 0) return { p50: undefined, p95: undefined };
  const at = (fraction: number) => values[Math.min(values.length - 1, Math.floor(values.length * fraction))];
  return { p50: at(0.5), p95: at(0.95) };
}
