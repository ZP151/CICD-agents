import { describe, expect, it } from "vitest";

import { parseSortableDate } from "../src/safeDate.js";

describe("parseSortableDate", () => {
  it("does not parse missing values as synthetic fallback dates", () => {
    expect(parseSortableDate("")).toBe(0);
    expect(parseSortableDate(undefined)).toBe(0);
    expect(parseSortableDate(null)).toBe(0);
    expect(parseSortableDate("not-a-date")).toBe(0);
  });

  it("parses valid ISO timestamps for sorting", () => {
    expect(parseSortableDate("2026-07-16T10:00:00.000Z")).toBeGreaterThan(0);
  });
});
