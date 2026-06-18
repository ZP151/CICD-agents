import {
  adoAuthDiagnosticFromError,
  type AdoAuthDiagnostic,
} from "@mergepilot/core";
import type { ChatWorkflowActionPayload } from "../routes/chat-workflow.routes.js";

export function isAdoPullRequestWorkflowAction(action: string): boolean {
  return [
    "inspect_pr_insight",
    "check_pr_policy",
    "list_pr_work_items",
    "link_work_item",
  ].includes(action);
}

export function isAdoPipelineWorkflowAction(action: string): boolean {
  return [
    "inspect_pipeline",
    "trigger_pipeline",
  ].includes(action);
}

export function workflowActionAuthMode(payload: ChatWorkflowActionPayload): "oauth" | "pat" | undefined {
  if (!isAdoPullRequestWorkflowAction(payload.action) && !isAdoPipelineWorkflowAction(payload.action) && payload.action !== "create_pr") {
    return undefined;
  }
  const projectLink = payload.projectLink;
  return projectLink?.adoPat ? "pat" : "oauth";
}

export function workflowActionFailureResponse(
  payload: ChatWorkflowActionPayload,
  err: unknown,
): {
  httpStatus: number;
  body: {
    ok: false;
    action: ChatWorkflowActionPayload["action"];
    repoPath: string;
    sessionId?: string;
    summary: string;
    authStatus?: AdoAuthDiagnostic["status"];
    authMode?: AdoAuthDiagnostic["authMode"];
    authMessage?: string;
    retryable?: boolean;
    workflowState: {
      status: "failed";
      currentStep: string;
      completedTools: string[];
      workflowKind?: "pr" | "ci";
      workflowPhase?: string;
      authStatus?: AdoAuthDiagnostic["status"];
      authMode?: AdoAuthDiagnostic["authMode"];
      authMessage?: string;
      retryable?: boolean;
    };
    tools: [];
  };
} {
  const summary = err instanceof Error ? err.message : String(err);
  const authMode = workflowActionAuthMode(payload);
  const diagnostic = authMode ? adoAuthDiagnosticFromError(err, authMode) : undefined;
  const isAuthFailure = Boolean(diagnostic && diagnostic.status !== "unknown_error");
  const authCurrentStep = diagnostic?.status === "oauth_unavailable"
    ? "Azure DevOps OAuth unavailable"
    : diagnostic?.status === "oauth_no_org_access"
      ? "Azure DevOps OAuth access rejected"
      : diagnostic?.status === "pat_invalid_or_missing_scope"
        ? "Azure DevOps PAT rejected"
        : undefined;
  const workflowState = {
    status: "failed" as const,
    currentStep: isAuthFailure ? authCurrentStep ?? "Azure DevOps authentication failed" : "Workflow action failed",
    completedTools: [],
    ...(isAdoPullRequestWorkflowAction(payload.action) || payload.action === "create_pr" ? { workflowKind: "pr" as const } : {}),
    ...(isAdoPipelineWorkflowAction(payload.action) ? { workflowKind: "ci" as const } : {}),
    ...(isAuthFailure ? {
      workflowPhase: "auth_required",
      authStatus: diagnostic?.status,
      authMode: diagnostic?.authMode,
      authMessage: diagnostic?.message,
      retryable: diagnostic?.retryable,
    } : {}),
  };
  return {
    httpStatus: isAuthFailure
      ? diagnostic?.status === "oauth_unavailable" ? 401 : 400
      : 500,
    body: {
      ok: false,
      action: payload.action,
      repoPath: payload.repoPath,
      sessionId: payload.sessionId,
      summary: isAuthFailure ? diagnostic?.message ?? summary : summary,
      ...(isAuthFailure ? {
        authStatus: diagnostic?.status,
        authMode: diagnostic?.authMode,
        authMessage: diagnostic?.message,
        retryable: diagnostic?.retryable,
      } : {}),
      workflowState,
      tools: [],
    },
  };
}
