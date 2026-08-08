import { describe, expect, it } from "vitest";
import {
  AgentFailure,
  ConnectorFailure,
  ToolFailure,
  ToolTimeoutError,
  TurnDeadlineExceededError,
  createDiagnosticId,
  explainTurnFailure,
  failureRecovery,
  isAbortError,
  turnFailureFromError,
  turnFailureRecovery,
} from "../src/failures.js";

describe("failure taxonomy (MP-011)", () => {
  it("never merges stop, timeout, authorization, connector and internal failures", () => {
    const stop = turnFailureRecovery("cancelled_by_user");
    const timeout = turnFailureRecovery("deadline_exceeded");
    const auth = failureRecovery("unauthorized");
    const connector = failureRecovery("connector_unavailable");
    const internal = failureRecovery("internal");

    expect(stop.action).toBe("resume");
    expect(timeout.action).toBe("retry");
    expect(auth.action).toBe("reauthorize");
    expect(connector.action).toBe("enable_connector");
    expect(internal.action).toBe("start_new_turn");
    expect(new Set([stop.action, timeout.action, auth.action, connector.action, internal.action]).size).toBe(5);
  });

  it("explains each turn termination reason distinctly", () => {
    expect(explainTurnFailure("cancelled_by_user")).toContain("Cancelled by you");
    expect(explainTurnFailure("deadline_exceeded")).toContain("time limit");
    expect(explainTurnFailure("internal", "dia_abc")).toContain("diagnostic id dia_abc");
    expect(explainTurnFailure("internal", "dia_abc")).not.toContain("stack");
    expect(explainTurnFailure("daemon_restarted")).toContain("daemon restarted");
  });

  it("classifies an AbortError as user stop or client disconnect", () => {
    const abort = new DOMException("aborted", "AbortError");
    expect(isAbortError(abort)).toBe(true);

    expect(turnFailureFromError(abort, { userStopped: true }).kind).toBe("cancelled_by_user");
    expect(turnFailureFromError(abort, { userStopped: true }).retryable).toBe(false);
    expect(turnFailureFromError(abort).kind).toBe("client_cancelled");
  });

  it("maps typed tool failures to tool_failed without losing retryability", () => {
    const timeout = new ToolTimeoutError({ callId: "call-1", attempt: 1 });

    const classified = turnFailureFromError(timeout, { phase: "tool-execution" });

    expect(classified.kind).toBe("tool_failed");
    expect(classified.retryable).toBe(true);
    expect(classified.phase).toBe("tool-execution");
  });

  it("keeps an already typed AgentFailure untouched", () => {
    const typed = new AgentFailure({ kind: "model_failed", phase: "planning" });

    expect(turnFailureFromError(typed)).toBe(typed);
  });

  it("last-resort classification tags timeouts and model errors without string truth", () => {
    expect(turnFailureFromError(new Error("request timed out after 30s")).kind).toBe("deadline_exceeded");
    expect(turnFailureFromError(new Error("Azure OpenAI rate limit exceeded (429)")).kind).toBe("model_failed");
  });

  it("tags unknown plain errors as internal with a diagnostic id", () => {
    const classified = turnFailureFromError(new Error("boom"), { phase: "planning" });

    expect(classified.kind).toBe("internal");
    expect(classified.diagnosticId).toMatch(/^dia_/);
    expect(classified.phase).toBe("planning");
    expect(classified.message).not.toContain("boom");
  });

  it("carries callId and attempt on tool failures for retry lineage", () => {
    const failure = new ToolFailure({
      kind: "invalid_arguments",
      callId: "call-42",
      attempt: 2,
      retryable: false,
    });

    expect(failure.callId).toBe("call-42");
    expect(failure.attempt).toBe(2);
    expect(failure.retryable).toBe(false);
  });

  it("builds connector failures with source and version", () => {
    const failure = new ConnectorFailure({
      kind: "protocol_incompatible",
      connectorId: "azure-devops",
      source: "stdio",
      protocolVersion: "2024-11-05",
      retryable: false,
    });

    expect(failure.source).toBe("stdio");
    expect(failure.protocolVersion).toBe("2024-11-05");
    expect(turnFailureFromError(failure).kind).toBe("internal");
  });

  it("generates unique diagnostic ids", () => {
    expect(createDiagnosticId()).not.toBe(createDiagnosticId());
    expect(createDiagnosticId()).toMatch(/^dia_/);
  });

  it("provides typed turn deadline errors", () => {
    const err = new TurnDeadlineExceededError({ phase: "planning" });

    expect(err.kind).toBe("deadline_exceeded");
    expect(err.phase).toBe("planning");
    expect(err.retryable).toBe(true);
  });
});
