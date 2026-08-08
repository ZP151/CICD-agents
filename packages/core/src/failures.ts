/**
 * Typed failure taxonomy (MP-011 / MP-015).
 *
 * One taxonomy for turn, tool and connector failures so Stop, timeout,
 * authorization, target ambiguity, connector failure and internal abort are
 * never merged into a single "request was aborted" state. UI recovery actions
 * come from the failure kind, never from message substring matching.
 */

/** Tool/connector-level failure kinds (architecture doc §4.4). */
export type FailureKind =
  | "connector_unavailable"
  | "protocol_incompatible"
  | "unauthorized"
  | "capability_missing"
  | "invalid_arguments"
  | "ambiguous_target"
  | "target_not_found"
  | "timeout"
  | "cancelled_by_user"
  | "tool_error"
  | "malformed_result"
  | "policy_denied"
  | "internal";

/** Turn-level termination reasons (findings MP-011). */
export type TurnFailureKind =
  | "cancelled_by_user"
  | "client_cancelled"
  | "deadline_exceeded"
  | "tool_failed"
  | "model_failed"
  | "daemon_restarted"
  | "internal";

export type FailureRecoveryAction =
  | "resume"
  | "retry"
  | "reauthorize"
  | "enable_connector"
  | "choose_target"
  | "start_new_turn"
  | "view_diagnostics";

export interface FailureRecovery {
  action: FailureRecoveryAction;
  label: string;
}

export function createDiagnosticId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `dia_${Date.now().toString(36)}_${random}`;
}

const TURN_RECOVERY: Record<TurnFailureKind, FailureRecovery> = {
  cancelled_by_user: { action: "resume", label: "Continue" },
  client_cancelled: { action: "resume", label: "Reconnect and continue" },
  deadline_exceeded: { action: "retry", label: "Retry" },
  tool_failed: { action: "retry", label: "Retry the failed step" },
  model_failed: { action: "retry", label: "Retry" },
  daemon_restarted: { action: "start_new_turn", label: "Start a new turn" },
  internal: { action: "start_new_turn", label: "Start a new turn" },
};

const KIND_RECOVERY: Record<FailureKind, FailureRecovery> = {
  connector_unavailable: { action: "enable_connector", label: "Open connector settings" },
  protocol_incompatible: { action: "view_diagnostics", label: "View diagnostics" },
  unauthorized: { action: "reauthorize", label: "Re-authorize" },
  capability_missing: { action: "enable_connector", label: "Adjust domain or refresh tools" },
  invalid_arguments: { action: "retry", label: "Correct arguments and retry" },
  ambiguous_target: { action: "choose_target", label: "Choose the intended target" },
  target_not_found: { action: "retry", label: "Refresh and choose a pipeline" },
  timeout: { action: "retry", label: "Retry" },
  cancelled_by_user: { action: "resume", label: "Continue" },
  tool_error: { action: "retry", label: "Retry" },
  malformed_result: { action: "view_diagnostics", label: "View connector diagnostics" },
  policy_denied: { action: "view_diagnostics", label: "View policy reason" },
  internal: { action: "start_new_turn", label: "Start a new turn" },
};

export function turnFailureRecovery(kind: TurnFailureKind): FailureRecovery {
  return TURN_RECOVERY[kind];
}

export function failureRecovery(kind: FailureKind): FailureRecovery {
  return KIND_RECOVERY[kind];
}

const TURN_EXPLANATIONS: Record<TurnFailureKind, (diagnosticId?: string) => string> = {
  cancelled_by_user: () =>
    "Cancelled by you. The evidence already gathered stays visible; continue the unfinished steps when ready.",
  client_cancelled: () =>
    "The connection was interrupted while this request was running. Reconnect and continue.",
  deadline_exceeded: () =>
    "This request exceeded its time limit. Retry with a smaller scope, or check diagnostics for what already completed.",
  tool_failed: () =>
    "A tool failed while working on this request. See the failed step below and retry from there.",
  model_failed: () =>
    "The model could not complete this request. Retry the turn, or check the model settings before trying again.",
  daemon_restarted: () =>
    "The daemon restarted while this request was running. The completed steps are preserved; start a new turn to continue.",
  internal: (diagnosticId) =>
    `An internal error occurred${diagnosticId ? ` (diagnostic id ${diagnosticId})` : ""}. Start a new turn, or report this message with the diagnostic id.`,
};

export function explainTurnFailure(kind: TurnFailureKind, diagnosticId?: string): string {
  return TURN_EXPLANATIONS[kind](diagnosticId);
}

/** Turn-level agent failure with a typed kind and safe, non-stack message. */
export class AgentFailure extends Error {
  readonly kind: TurnFailureKind;
  readonly retryable: boolean;
  readonly phase: string | undefined;
  readonly diagnosticId: string | undefined;

  constructor(opts: {
    kind: TurnFailureKind;
    message?: string;
    retryable?: boolean;
    phase?: string;
    diagnosticId?: string;
  }) {
    super(opts.message ?? explainTurnFailure(opts.kind, opts.diagnosticId));
    this.name = "AgentFailure";
    this.kind = opts.kind;
    this.retryable =
      opts.retryable ?? (opts.kind === "deadline_exceeded" || opts.kind === "tool_failed" || opts.kind === "model_failed");
    this.phase = opts.phase;
    this.diagnosticId = opts.diagnosticId;
  }
}

/** Tool-level failure; carries the stable callId and attempt number. */
export class ToolFailure extends Error {
  readonly kind: FailureKind;
  readonly callId: string | undefined;
  readonly attempt: number | undefined;
  readonly retryable: boolean;

  constructor(opts: {
    kind: FailureKind;
    message?: string;
    callId?: string;
    attempt?: number;
    retryable?: boolean;
  }) {
    super(opts.message ?? failureRecovery(opts.kind).label);
    this.name = "ToolFailure";
    this.kind = opts.kind;
    this.callId = opts.callId;
    this.attempt = opts.attempt;
    this.retryable = opts.retryable ?? (opts.kind === "timeout" || opts.kind === "tool_error");
  }
}

export type ConnectorFailureKind =
  | "connector_unavailable"
  | "protocol_incompatible"
  | "unauthorized"
  | "capability_missing"
  | "malformed_result";

/** Connector-level failure with source and (when known) negotiated version. */
export class ConnectorFailure extends Error {
  readonly kind: ConnectorFailureKind;
  readonly connectorId: string | undefined;
  readonly source: "stdio" | "streamable_http" | "unknown";
  readonly protocolVersion: string | undefined;
  readonly retryable: boolean;

  constructor(opts: {
    kind: ConnectorFailureKind;
    message?: string;
    connectorId?: string;
    source?: ConnectorFailure["source"];
    protocolVersion?: string;
    retryable?: boolean;
  }) {
    super(opts.message ?? failureRecovery(opts.kind).label);
    this.name = "ConnectorFailure";
    this.kind = opts.kind;
    this.connectorId = opts.connectorId;
    this.source = opts.source ?? "unknown";
    this.protocolVersion = opts.protocolVersion;
    this.retryable = opts.retryable ?? opts.kind === "connector_unavailable";
  }
}

export class TurnDeadlineExceededError extends AgentFailure {
  constructor(opts: { message?: string; phase?: string } = {}) {
    super({ kind: "deadline_exceeded", phase: opts.phase, message: opts.message });
    this.name = "TurnDeadlineExceededError";
  }
}

export class ToolTimeoutError extends ToolFailure {
  constructor(opts: { callId?: string; attempt?: number; message?: string } = {}) {
    super({ kind: "timeout", callId: opts.callId, attempt: opts.attempt, message: opts.message });
    this.name = "ToolTimeoutError";
  }
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === "AbortError") ||
    (err as { code?: string } | undefined)?.code === "ABORT_ERR"
  );
}

/**
 * Classify an arbitrary thrown value into a turn failure. Uses typed classes
 * first; plain Error text patterns are a migration-compatible last resort and
 * are clearly marked as such (not a source of truth).
 */
export function turnFailureFromError(
  err: unknown,
  opts: { phase?: string; userStopped?: boolean } = {},
): AgentFailure {
  const message = err instanceof Error ? err.message : String(err);
  if (isAbortError(err)) {
    return new AgentFailure({
      kind: opts.userStopped ? "cancelled_by_user" : "client_cancelled",
      phase: opts.phase,
      retryable: false,
    });
  }
  if (err instanceof AgentFailure) return err;
  if (err instanceof ToolFailure) {
    return new AgentFailure({
      kind: "tool_failed",
      phase: opts.phase,
      message: message,
      retryable: err.retryable,
    });
  }
  if (err instanceof ConnectorFailure) {
    return new AgentFailure({
      kind: err.kind === "unauthorized" ? "tool_failed" : "internal",
      phase: opts.phase,
      message,
      retryable: err.retryable,
    });
  }
  // Last resort classification for plain errors from migrated code paths.
  const lowered = message.toLowerCase();
  if (/timed out|timeout|deadline/i.test(lowered)) {
    return new AgentFailure({ kind: "deadline_exceeded", phase: opts.phase, message });
  }
  if (/^model|llm|provider|azure openai|anthropic/i.test(message.trim()) || /rate limit|429/i.test(lowered)) {
    return new AgentFailure({ kind: "model_failed", phase: opts.phase, message });
  }
  // Internal failures never surface the raw message: it may contain paths,
  // payloads or secrets. The user sees the diagnostic id; the full detail
  // belongs in the safe server log.
  return new AgentFailure({
    kind: "internal",
    phase: opts.phase,
    diagnosticId: createDiagnosticId(),
  });
}
