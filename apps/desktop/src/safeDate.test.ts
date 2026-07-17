import { describe, expect, it } from "vitest";

import { formatSortableDate, parseSortableDate } from "./safeDate.js";

describe("safeDate", () => {
  it("does not parse missing values as synthetic fallback dates", () => {
    expect(parseSortableDate("")).toBe(0);
    expect(parseSortableDate(undefined)).toBe(0);
    expect(parseSortableDate(null)).toBe(0);
    expect(parseSortableDate("not-a-date")).toBe(0);
  });

  it("formats only valid dates", () => {
    expect(formatSortableDate("")).toBe("");
    expect(formatSortableDate("not-a-date")).toBe("");
    expect(formatSortableDate("2026-07-16T10:00:00.000Z")).not.toBe("");
  });
});
