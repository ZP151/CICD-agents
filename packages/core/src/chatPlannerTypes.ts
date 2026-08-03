import type { TurnFailureKind } from "./failures.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ChatImageAttachment {
  name: string;
  mimeType: string;
  dataUrl: string;
}

/** A specific write-operation the agent is proposing to execute on user confirmation. */
export interface PendingToolAction {
  tool: string;
  args: Record<string, unknown>;
  description: string;
  nextHint?: string;
  readiness?: {
    kind: "push";
    status: "no_upstream" | "up_to_date" | "ahead" | "behind" | "diverged" | "unknown";
    upstream?: string;
    ahead?: number;
    behind?: number;
    summary: string;
  };
  preflight?:
    | {
        kind: "branch";
        action: "checkout" | "create";
        status:
          | "current"
          | "local_exists"
          | "remote_only"
          | "missing"
          | "would_create"
          | "already_exists"
          | "invalid"
          | "unknown";
        branch: string;
        currentBranch?: string;
        localBranch?: string;
        remoteBranch?: string;
        summary: string;
      }
    | {
        kind: "pr";
        status:
          | "ready"
          | "missing_ado_mapping"
          | "missing_source_branch"
          | "dirty_worktree"
          | "unknown";
        sourceBranch?: string;
        targetBranch?: string;
        repository?: string;
        project?: string;
        organization?: string;
        title?: string;
        summary: string;
      }
    | {
        kind: "validation";
        status: "ready" | "default_command" | "missing_command" | "unknown";
        validationKind: "test" | "build";
        command: string;
        commandSource: "override" | "project_link" | "derived" | "default" | "artifact";
        changedFiles?: string[];
        changedFileCount?: number;
        selectedScript?: string;
        packageFilters?: string[];
        packageRoots?: string[];
        selectionReason?: string;
        summary: string;
      };
  workflow?: {
    kind: "commit" | "pr" | "git" | "ci";
    phase:
      | "stage"
      | "commit"
      | "push"
      | "fetch_remotes"
      | "sync_branch"
      | "test"
      | "build"
      | "pipeline_trigger"
      | "create"
      | "link_work_item"
      | "stage_conflicts"
      | "continue_rebase"
      | "abort_rebase"
      | "skip_rebase"
      | "continue_merge"
      | "abort_merge"
      | "continue_cherry_pick"
      | "abort_cherry_pick"
      | "skip_cherry_pick"
      | "continue_revert"
      | "abort_revert"
      | "skip_revert";
    branch?: string;
    message?: string;
    pushAfterCommit?: boolean;
  };
}

export interface ChatPlannerResult {
  response: string;
  streamedResponse?: string;
  finalizationMode?: "agent_final" | "control_marker" | "plain_json" | "none";
  riskLevel: string;
  actionsTaken: string[];
  suggestions: string[];
  sources?: ChatPlannerSource[];
  artifacts?: ChatPlannerArtifact[];
  toolCallsMade: Array<{ name: string; args: Record<string, unknown>; ok: boolean }>;
  usedLlm: boolean;
  approvalProposal?: PendingToolAction;
}

export interface ChatPlannerArtifact {
  type: "artifact";
  artifactId: string;
  title: string;
  artifactType: "react" | "html" | "markdown" | "mermaid" | "text";
  status: "streaming" | "ready" | "error";
  content?: string;
}

export type ChatPlannerSource =
  | {
      type: "source_document";
      sourceId?: string;
      title: string;
      file?: string;
      line?: number;
      snippet?: string;
    }
  | {
      type: "source_url";
      sourceId?: string;
      title: string;
      url: string;
      domain?: string;
      snippet?: string;
    };

export interface ChatApprovalRequest {
  id: string;
  action: PendingToolAction;
  riskLevel: string;
  explanation: string;
}

export interface ChatWorkflowState {
  status: "planning" | "running" | "waiting_for_approval" | "blocked" | "done" | "failed";
  currentStep: string;
  completedTools: string[];
  workflowKind?: "commit" | "git" | "ado" | "ci" | "pr";
  workflowPhase?: string;
  authStatus?:
    | "ok"
    | "oauth_unavailable"
    | "oauth_no_org_access"
    | "pat_invalid_or_missing_scope"
    | "unknown_error";
  authMode?: "oauth" | "pat";
  authMessage?: string;
  retryable?: boolean;
  pendingApproval?: ChatApprovalRequest;
}

/** Typed turn-termination detail attached to error/cancelled events (MP-011). */
export interface ChatEventFailure {
  kind: TurnFailureKind;
  retryable: boolean;
  diagnosticId?: string;
}

export type ChatEvent =
  | { type: "assistant_delta"; delta: string }
  | { type: "work_statement"; blockId: string; text: string; replace?: boolean }
  | {
      type: "tool_group_start";
      groupId: string;
      connector?: { kind: "built-in" | "mcp"; id: string; label: string };
    }
  | { type: "tool_group_end"; groupId: string }
  | { type: "final_delta"; delta: string }
  | { type: "turn_phase"; phase: "starting" | "context" | "planning" | "executing" | "adjusting"; label: string }
  | { type: "turn_plan"; title: string; items: string[] }
  | { type: "turn_step"; stepId: string; status: "started" | "completed" | "blocked"; label: string }
  | { type: "progress"; message: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown>; toolCallId?: string }
  | { type: "tool_output_delta"; name: string; stream: "stdout" | "stderr"; delta: string; toolCallId?: string }
  | { type: "tool_end"; name: string; ok: boolean; summary: string; output?: string; result: unknown; toolCallId?: string }
  | { type: "confirm_required"; riskLevel: string; plan: string }
  | { type: "workflow_state"; state: ChatWorkflowState }
  | { type: "approval_required"; approval: ChatApprovalRequest }
  | { type: "approval_resolved"; approvalId: string; approved: boolean }
  | { type: "assistant_control"; control: ChatPlannerResult }
  | { type: "executing" }
  | { type: "message"; text: string }
  | { type: "done"; result: ChatPlannerResult }
  | { type: "error"; message: string; failure?: ChatEventFailure }
  | { type: "cancelled"; failure?: ChatEventFailure };
