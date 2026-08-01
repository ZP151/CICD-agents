import { afterEach, describe, expect, it } from "vitest";
import {
  adoptTurnMetrics,
  beginTurnMetrics,
  markTurnMetric,
  resetTurnMetricsForTests,
  turnMetricSnapshotForTests,
} from "./chatTurnMetrics.js";

describe("Turn metrics", () => {
  afterEach(() => resetTurnMetricsForTests());

  it("uses the echoed client Turn id instead of adopting the latest pending Turn", () => {
    beginTurnMetrics("local-turn-first");
    beginTurnMetrics("local-turn-second");

    adoptTurnMetrics("local-turn-first", "turn-first");
    markTurnMetric("turn-first", "turn_started");
    markTurnMetric("turn-first", "finished");

    expect(turnMetricSnapshotForTests("turn-first")).toMatchObject({
      client_send: expect.any(Number),
      local_visible: expect.any(Number),
      turn_started: expect.any(Number),
      finished: expect.any(Number),
    });
    expect(turnMetricSnapshotForTests("local-turn-second")).toMatchObject({
      client_send: expect.any(Number),
      local_visible: expect.any(Number),
    });
    expect(turnMetricSnapshotForTests("local-turn-first")).toBeUndefined();
  });

  it("does not guess an adoption when several local Turns are pending", () => {
    beginTurnMetrics("local-turn-first");
    beginTurnMetrics("local-turn-second");

    adoptTurnMetrics(undefined, "server-turn");

    expect(turnMetricSnapshotForTests("server-turn")).toBeUndefined();
    expect(turnMetricSnapshotForTests("local-turn-first")).toBeDefined();
    expect(turnMetricSnapshotForTests("local-turn-second")).toBeDefined();
  });
});
