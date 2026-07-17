import { describe, expect, it } from "vitest";
import { operationDetailSummary } from "./operationDetailSummary.js";

describe("operationDetailSummary", () => {
  it("turns flattened validation JSON into a readable field summary", () => {
    expect(operationDetailSummary(
      '{"error":{"fieldErrors":{"sessionId":["Expected string, received null"]},"formErrors":[]}}',
    )).toBe("sessionId: Expected string, received null");
  });

  it("uses stderr/stdout summaries for tool-shaped JSON", () => {
    expect(operationDetailSummary(
      '{"returncode":1,"stdout":"","stderr":"fatal: branch not found\\nmore details"}',
    )).toBe("fatal: branch not found");
    expect(operationDetailSummary(
      '{"returncode":0,"stdout":"pushed main\\nextra","stderr":""}',
    )).toBe("pushed main");
  });

  it("does not summarize short human-written details", () => {
    expect(operationDetailSummary("Review completed with 3 findings.")).toBeNull();
  });
});
