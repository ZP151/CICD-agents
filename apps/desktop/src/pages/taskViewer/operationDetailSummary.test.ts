import { describe, expect, it } from "vitest";
import {
  operationDetailPreview,
  operationDetailSummary,
} from "./operationDetailSummary.js";

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

  it("does not expose successful command stderr as the primary summary", () => {
    expect(operationDetailSummary(
      '{"returncode":0,"stdout":"","stderr":"To C:\\\\Users\\\\15492\\\\repo.git\\n * [new tag] v0.1 -> v0.1"}',
    )).toBe("Command completed successfully.");
  });

  it("summarizes tool-shaped output even when it is not strict JSON", () => {
    expect(operationDetailSummary(
      '{"returncode":0,"stdout":"","stderr":"To C:\\\\Users\\\\15492\\\\repo.git\n * [new tag] v0.1 -> v0.1"}',
    )).toBe("Command completed successfully.");
  });

  it("does not summarize short human-written details", () => {
    expect(operationDetailSummary("Review completed with 3 findings.")).toBeNull();
  });

  it("previews key-value metrics without exposing every low-level token", () => {
    expect(operationDetailPreview(
      "readiness=needs_attention; risks=2; files=2; threads=6; failedBuilds=0; tokens=156/254; source=llm",
    )).toBe("readiness=needs_attention; risks=2; files=2");
    expect(operationDetailPreview(
      "queue=needs_human_review; risk=medium; confidence=low; findings=3; discarded=0; tokens=913/313",
    )).toBe("queue=needs_human_review; risk=medium; confidence=low");
  });

  it("leaves short human-written details out of compact list previews", () => {
    expect(operationDetailPreview("Review completed with 3 findings.")).toBeNull();
  });
});
