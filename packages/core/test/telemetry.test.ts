import { describe, expect, it, beforeEach } from "vitest";
import { isTelemetryEnabled, resetSettingsForTests } from "../src/index.js";

describe("telemetry gating", () => {
  beforeEach(() => {
    delete process.env.TELEMETRY_ENABLED;
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    resetSettingsForTests();
  });

  it("is off by default", () => {
    expect(isTelemetryEnabled()).toBe(false);
  });

  it("is off when the toggle is on but the connection string is missing", () => {
    process.env.TELEMETRY_ENABLED = "1";
    resetSettingsForTests();
    expect(isTelemetryEnabled()).toBe(false);
  });

  it("is on when both the toggle and the connection string are set", () => {
    process.env.TELEMETRY_ENABLED = "1";
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = "InstrumentationKey=test";
    resetSettingsForTests();
    expect(isTelemetryEnabled()).toBe(true);
  });
});
