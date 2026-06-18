import {
  type ChatPlannerResult,
  type ChatWorkflowState,
  type PendingToolAction,
} from "@mergepilot/core";
import {
  gitRecoveryOperationFromPhase,
  gitRecoveryOperationFromTool,
  isGitRecoveryTool,
} from "./chatGitWorkflow.js";
import { validationDoneAfterConfirmedAction } from "./chatValidationOutcome.js";

export function structuredDoneAfterConfirmedAction(action: PendingToolAction, toolResult: unknown): {
  currentStep: string;
  workflowKind: NonNullable<ChatWorkflowState["workflowKind"]>;
  workflowPhase: string;
  result: ChatPlannerResult;
} | undefined {
  if (action.workflow?.kind === "git" && isGitRecoveryTool(action.tool)) {
    const gitAction = String(action.args["action"] ?? "").trim();
    const operation = gitRecoveryOperationFromTool(action.tool);
    if (operation && ["continue", "abort", "skip"].includes(gitAction)) {
      const past = gitAction === "continue" ? "continued" : gitAction === "abort" ? "aborted" : "skipped";
      const label = `${operation.label} ${past}`;
      return {
        currentStep: label,
        workflowKind: "git",
        workflowPhase: `${operation.phase}_${past}`,
        result: {
          response: `The in-progress ${operation.displayName} was ${past}. I stopped here so the next step can be based on the updated Git state.`,
          finalizationMode: "none",
          riskLevel: "low",
          actionsTaken: [label],
          suggestions: ["Inspect changes", "Check branch status", "Continue project workflow"],
          toolCallsMade: [{ name: action.tool, args: action.args, ok: true }],
          usedLlm: false,
        },
      };
    }
  }

  if (action.tool === "git_add" && action.workflow?.kind === "git" && action.workflow.phase === "stage_conflicts") {
    const operation = gitRecoveryOperationFromPhase(String(action.workflow.message ?? ""));
    const paths = Array.isArray(action.args["paths"]) ? action.args["paths"].map(String).filter(Boolean) : [];
    const fileLabel = `${paths.length || "selected"} conflict file${paths.length === 1 ? "" : "s"}`;
    const operationLabel = operation?.displayName ?? "Git operation";
    return {
      currentStep: `Staged ${fileLabel}`,
      workflowKind: "git",
      workflowPhase: `${operation?.phase ?? "git"}_conflicts_staged`,
      result: {
        response: `The ${fileLabel} were staged for the in-progress ${operationLabel}. I stopped here so you can continue, abort, or skip that operation explicitly.`,
        finalizationMode: "none",
        riskLevel: "low",
        actionsTaken: [`Staged ${fileLabel}`],
        suggestions: [
          operation ? `Continue ${operation.displayName}` : "Continue Git operation",
          "Inspect changes",
          "Abort recovery",
        ],
        toolCallsMade: [{ name: action.tool, args: action.args, ok: true }],
        usedLlm: false,
      },
    };
  }

  if (action.tool === "git_push" && action.workflow?.kind === "commit" && action.workflow.phase === "push") {
    const branch = String(action.args["branch"] ?? action.workflow.branch ?? "").trim();
    const response = [
      branch ? `The committed changes have been pushed to ${branch}.` : "The committed changes have been pushed.",
      "I stopped here because the requested scope was stage, commit, and push.",
      "I will not create a pull request, link work items, or trigger a pipeline unless you ask for those steps.",
    ].join(" ");
    return {
      currentStep: branch ? `Pushed branch ${branch}` : "Pushed branch",
      workflowKind: "commit",
      workflowPhase: "pushed",
      result: {
        response,
        finalizationMode: "none",
        riskLevel: "low",
        actionsTaken: ["Pushed branch"],
        suggestions: ["Review pushed changes", "Create pull request", "Run pipeline"],
        toolCallsMade: [{ name: action.tool, args: action.args, ok: true }],
        usedLlm: false,
      },
    };
  }

  if (action.tool === "ado_link_work_item" && action.workflow?.kind === "pr") {
    const result = typeof toolResult === "object" && toolResult !== null ? toolResult as Record<string, unknown> : {};
    const prId = Number(result["pull_request_id"] ?? action.args["pull_request_id"] ?? 0);
    const workItemId = Number(result["work_item_id"] ?? action.args["work_item_id"] ?? 0);
    const ok = result["ok"] !== false;
    const response = ok
      ? `Work item ${workItemId || ""} is linked to pull request #${prId || ""}. Next: refresh linked work items, policy status, or PR insight.`
      : "Azure DevOps did not confirm the work item link. Check the tool output and retry with a valid work item ID.";
    return {
      currentStep: ok
        ? `Work item ${workItemId || ""} linked to PR #${prId || ""}`.trim()
        : "Work item link failed",
      workflowKind: "pr",
      workflowPhase: ok ? "work_item_linked" : "work_item_link_failed",
      result: {
        response,
        finalizationMode: "none",
        riskLevel: ok ? "low" : "medium",
        actionsTaken: ["Linked work item"],
        suggestions: ["List linked work items", "Check policy status", "Inspect PR insight"],
        toolCallsMade: [{ name: action.tool, args: action.args, ok }],
        usedLlm: false,
      },
    };
  }

  if (action.tool === "validation_command" && action.workflow?.kind === "ci") {
    return validationDoneAfterConfirmedAction(action, toolResult);
  }

  if (action.tool !== "ado_create_pr" || action.workflow?.kind !== "pr") return undefined;
  const result = typeof toolResult === "object" && toolResult !== null ? toolResult as Record<string, unknown> : {};
  const prId = Number(result["pull_request_id"] ?? 0);
  const url = String(result["url"] ?? "");
  const title = String(action.args["title"] ?? action.workflow.message ?? "Pull request");
  const source = String(action.args["source_branch"] ?? action.workflow.branch ?? "");
  const target = String(action.args["target_branch"] ?? "");
  const prLabel = prId ? `#${prId}` : "created";
  const response = [
    `Pull request ${prLabel} is created: ${title}.`,
    source && target ? `Source: ${source} -> ${target}.` : "",
    url ? `URL: ${url}` : "",
    "Next: inspect PR insight, policy status, builds, and linked work items.",
  ].filter(Boolean).join(" ");
  return {
    currentStep: prId ? `Pull request #${prId} created` : "Pull request created",
    workflowKind: "pr",
    workflowPhase: "created",
    result: {
      response,
      finalizationMode: "none",
      riskLevel: "low",
      actionsTaken: ["Created pull request"],
      suggestions: ["Inspect PR insight", "Check policy status", "Link related work items"],
      toolCallsMade: [{ name: action.tool, args: action.args, ok: true }],
      usedLlm: false,
    },
  };
}
