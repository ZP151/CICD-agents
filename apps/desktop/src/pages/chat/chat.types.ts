import type { PrInsightArtifactRecord } from "../../api.js";
import type {
  ApprovalPreflightEvidence,
  ApprovalReadinessEvidence,
  ApprovalWorkflowEvidence,
} from "../../components/conversation/ApprovalEvidence.js";
import type { AssistantBubbleMeta, ConversationPart } from "../../chatBubbles.js";

export type BubbleKind = "user" | "assistant" | "tool" | "confirm" | "pending_confirm" | "error" | "system";

export interface Bubble {
  id: string;
  kind: BubbleKind;
  text?: string;
  parts?: ConversationPart[];
  streaming?: boolean;
  toolCallId?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolOk?: boolean;
  toolSummary?: string;
  toolResult?: unknown;
  toolOpen?: boolean;
  toolLiveOutput?: string;
  riskLevel?: string;
  plan?: string;
  sessionId?: string;
  confirmed?: boolean | null;
  pendingTool?: string;
  pendingArgs?: Record<string, unknown>;
  pendingDescription?: string;
  pendingNextHint?: string;
  pendingWorkflow?: ApprovalWorkflowEvidence;
  pendingReadiness?: ApprovalReadinessEvidence;
  pendingPreflight?: ApprovalPreflightEvidence;
  pendingStatus?: "waiting" | "executing" | "done" | "cancelled";
  meta?: AssistantBubbleMeta;
}

export interface SavedPrInsightSource {
  artifactId: string;
  pullRequestId: string;
  kind: string;
  at: string;
}

export type ArtifactLookupState =
  | { status: "loading" }
  | { status: "loaded"; record: PrInsightArtifactRecord }
  | { status: "error"; message: string };

export type WorkflowStatus = "planning" | "running" | "waiting_for_approval" | "blocked" | "done" | "failed";

export interface ApprovalRequest {
  id: string;
  action: {
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
          status: "current" | "local_exists" | "remote_only" | "missing" | "would_create" | "already_exists" | "invalid" | "unknown";
          branch: string;
          currentBranch?: string;
          localBranch?: string;
          remoteBranch?: string;
          summary: string;
        }
      | {
          kind: "pr";
          status: "ready" | "missing_ado_mapping" | "missing_source_branch" | "dirty_worktree" | "unknown";
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
  };
  riskLevel: string;
  explanation: string;
}

export interface WorkflowEventState {
  status: WorkflowStatus;
  currentStep: string;
  completedTools: string[];
  workflowKind?: "commit" | "git" | "ado" | "ci" | "pr";
  workflowPhase?: string;
  workflowSummary?: string;
  authStatus?: "ok" | "oauth_unavailable" | "oauth_no_org_access" | "pat_invalid_or_missing_scope" | "unknown_error";
  authMode?: "oauth" | "pat";
  authMessage?: string;
  retryable?: boolean;
  pendingApproval?: ApprovalRequest;
}
