import { getSettings } from "./settings.js";
import { logger } from "./logger.js";

interface AppInsightsClient {
  trackEvent(args: { name: string; properties?: Record<string, unknown> }): void;
  trackMetric(args: { name: string; value: number; properties?: Record<string, unknown> }): void;
  trackException(args: { exception: Error; properties?: Record<string, unknown> }): void;
  flush(): void;
}

let cached: AppInsightsClient | null = null;
let attempted = false;

async function init(): Promise<AppInsightsClient | null> {
  if (cached || attempted) return cached;
  attempted = true;
  const settings = getSettings();
  if (!settings.telemetryEnabled || !settings.appInsightsConnectionString) return null;
  try {
    const ai = await import("applicationinsights");
    ai.setup(settings.appInsightsConnectionString).setAutoCollectExceptions(true).start();
    const client = ai.defaultClient;
    cached = {
      trackEvent: (a) => client.trackEvent({ name: a.name, properties: a.properties as Record<string, string> }),
      trackMetric: (a) =>
        client.trackMetric({ name: a.name, value: a.value, properties: a.properties as Record<string, string> }),
      trackException: (a) =>
        client.trackException({ exception: a.exception, properties: a.properties as Record<string, string> }),
      flush: () => client.flush(),
    };
    logger().info("Application Insights initialised");
  } catch (err) {
    logger().warn({ err }, "Application Insights init failed");
  }
  return cached;
}

export interface TaskMetrics {
  taskId: string;
  kind: string;
  durationMs: number;
  status: string;
  tokensIn: number;
  tokensOut: number;
  embedTokens?: number;
  toolCallCount: number;
}

export async function emitTaskMetrics(metrics: TaskMetrics): Promise<void> {
  const ai = await init();
  if (!ai) return;
  ai.trackEvent({
    name: "TaskCompleted",
    properties: {
      taskId: metrics.taskId,
      kind: metrics.kind,
      status: metrics.status,
      durationMs: metrics.durationMs,
      toolCallCount: metrics.toolCallCount,
    },
  });
  ai.trackMetric({ name: "task.tokens_in", value: metrics.tokensIn });
  ai.trackMetric({ name: "task.tokens_out", value: metrics.tokensOut });
  if (metrics.embedTokens !== undefined) {
    ai.trackMetric({ name: "task.embed_tokens", value: metrics.embedTokens });
  }
  ai.trackMetric({ name: "task.duration_ms", value: metrics.durationMs });
  ai.trackMetric({ name: "task.tool_calls", value: metrics.toolCallCount });
  ai.flush();
}

export interface ReviewMetrics {
  prId: number;
  repository: string;
  findingCount: number;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  status: string;
}

export async function emitReviewMetrics(metrics: ReviewMetrics): Promise<void> {
  const ai = await init();
  if (!ai) return;
  ai.trackEvent({
    name: "PrReviewed",
    properties: {
      prId: metrics.prId,
      repository: metrics.repository,
      status: metrics.status,
      durationMs: metrics.durationMs,
    },
  });
  ai.trackMetric({ name: "review.tokens_in", value: metrics.tokensIn });
  ai.trackMetric({ name: "review.tokens_out", value: metrics.tokensOut });
  ai.trackMetric({ name: "review.findings", value: metrics.findingCount });
  ai.trackMetric({ name: "review.duration_ms", value: metrics.durationMs });
  ai.flush();
}

export function isTelemetryEnabled(): boolean {
  const settings = getSettings();
  return Boolean(settings.telemetryEnabled && settings.appInsightsConnectionString);
}
