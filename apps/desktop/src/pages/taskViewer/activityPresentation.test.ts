import { describe, expect, it } from "vitest";

import { formatIsoTime, formatTime, parseIsoTimestamp } from "./activityPresentation.js";

describe("activityPresentation", () => {
  it("does not surface invalid numeric timestamps", () => {
    expect(formatTime(Number.NaN)).toBe("");
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe("");
    expect(formatTime(0)).toBe("");
  });

  it("does not turn missing or malformed ISO timestamps into synthetic dates", () => {
    expect(formatIsoTime("")).toBe("");
    expect(formatIsoTime(null)).toBe("");
    expect(formatIsoTime(undefined)).toBe("");
    expect(formatIsoTime("not-a-date")).toBe("");
  });

  it("parses sortable ISO timestamps without Date.parse fallback dates", () => {
    expect(parseIsoTimestamp("")).toBe(0);
    expect(parseIsoTimestamp(undefined)).toBe(0);
    expect(parseIsoTimestamp("not-a-date")).toBe(0);
    expect(parseIsoTimestamp("2026-07-16T10:00:00.000Z")).toBeGreaterThan(0);
  });
});
