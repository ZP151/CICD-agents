import type {
  SuggestionReplyAction,
  SuggestionReplyContext,
} from "./suggestionReplyTypes.js";

export type AddSuggestion = (
  id: string,
  label: string,
  message: string,
  action?: SuggestionReplyAction,
) => void;

export function addCiSuggestions(
  context: SuggestionReplyContext,
  text: string,
  phase: string,
  add: AddSuggestion,
): void {
  if (context.workflowKind !== "ci") return;
  const pipelineFailure = phase.includes("pipeline") && /\b(failed|failure|canceled|cancelled)\b/.test(text);
  const failed = phase.includes("failed") || /\b(test|build|validation).{0,32}\bfailed\b/.test(text);
  const isBuild = phase.includes("build") || /\bbuild failed\b/.test(text);
  if (pipelineFailure) {
    add(
      "ci-analyze-pipeline-failure",
      "Analyze pipeline",
      "Analyze the latest Azure Pipeline failure evidence and identify whether it needs logs, a local validation run, or a rerun.",
    );
    add("ci-rerun-pipeline", "Rerun pipeline", "Prepare an approval to trigger the configured Azure Pipeline again.", {
      kind: "workspace_action",
      action: "trigger_pipeline",
    });
    add("ci-local-validation", "Run local validation", "Run focused local validation before changing code for this pipeline failure.", {
      kind: "workspace_action",
      action: "run_tests",
    });
    return;
  }
  if (failed) {
    add("ci-analyze-failure", "Analyze failure", "Analyze the latest validation failure report and suggest the smallest safe fix or rerun.");
    add(
      "ci-rerun",
      isBuild ? "Rerun build" : "Rerun tests",
      isBuild
        ? "Rerun the relevant build command after reviewing the validation failure."
        : "Rerun the relevant tests after reviewing the validation failure.",
      { kind: "workspace_action", action: isBuild ? "run_build" : "run_tests" },
    );
    add("ci-review-changes", "Review changes", "Review changed files against the validation failure context.", {
      kind: "workspace_action",
      action: "inspect_changes",
    });
    return;
  }
  if (phase.includes("passed")) {
    add("ci-review", "Review changes", "Review the validated changes before preparing a commit.", {
      kind: "workspace_action",
      action: "inspect_changes",
    });
    add("ci-commit", "Prepare commit", "Prepare a scoped commit for the validated changes.");
    add("ci-pr", "Check PR readiness", "Check whether these validated changes are ready for pull request insight.");
  }
}

export function addCommitSuggestions(
  context: SuggestionReplyContext,
  phase: string,
  add: AddSuggestion,
): void {
  if (context.workflowKind !== "commit") return;
  if (phase.includes("stage") || phase.includes("preflight")) {
    add("commit-diff", "Check detailed diff", "Show a detailed diff-aware review before staging.");
    add("commit-message", "Draft commit message", "Generate a commit message from the reviewed diff.");
    add("commit-scope", "Explain change scope", "Explain which files should be staged and why.");
  } else if (phase.includes("commit")) {
    add("commit-staged", "Check staged diff", "Show the staged diff and summarize commit risk.");
    add("commit-message", "Draft commit message", "Generate a commit message from the staged changes.");
    add("commit-scope", "Explain change scope", "Explain what is included in this commit.");
  } else if (phase.includes("pushed") || context.workflowStatus === "done") {
    add("commit-summary", "Summarize push", "Summarize the commit and push that just completed.");
    add("commit-branch", "Check branch", "Check the branch status after the push.", {
      kind: "workspace_action",
      action: "refresh_branch",
    });
    add("commit-review", "Review commit", "Review the pushed commit for any remaining risks.");
  } else if (phase.includes("push")) {
    add("commit-push", "Push branch", "Push the committed changes to the configured remote branch.", {
      kind: "requires_approval",
      reason: "Pushing writes to the remote repository.",
    });
    add("commit-remote", "Show remote target", "Show the remote branch target and push command.");
    add("commit-status", "Check branch status", "Check local branch status before pushing.", {
      kind: "workspace_action",
      action: "refresh_branch",
    });
  }
}

export function addPrSuggestions(context: SuggestionReplyContext, text: string, add: AddSuggestion): void {
  if (context.workflowKind !== "pr") return;
  const hasCiReadinessBlocker = /\b(ci|build|test|validation|failed|failure|blocked|blocker|readiness|ready|policy)\b/.test(text);
  const hasStructuredBuildBlocker = /\b(build blockers?|failedbuilds=[1-9]|failed builds?:\s*[1-9]|failed\/canceled build)\b/.test(text);
  const hasStructuredPolicyBlocker = /\b(policy blockers?|failedpolicies=[1-9]|failed policies?:\s*[1-9]|failed\/error policy)\b/.test(text);
  const hasStructuredWorkItemSignal = /\b(linked work items?|workitems=0|work items?:\s*0|no linked work items?)\b/.test(text);
  if (hasStructuredBuildBlocker || hasStructuredPolicyBlocker || hasStructuredWorkItemSignal) {
    if (hasStructuredBuildBlocker) {
      add("pr-rerun-validation", "Rerun validation", "Rerun relevant validation after reviewing saved PR readiness blockers.", {
        kind: "workspace_action",
        action: "run_tests",
      });
    }
    if (hasStructuredPolicyBlocker) {
      add("pr-policy", "Check policy", "Check pull request policy status.", {
        kind: "workspace_action",
        action: "check_pr_policy",
      });
    }
    if (hasStructuredWorkItemSignal) {
      add("pr-work-items", "List work items", "List linked work items for this pull request.", {
        kind: "workspace_action",
        action: "list_pr_work_items",
      });
    }
    add("pr-risks", "Check PR risks", "Summarize the main PR risks and what evidence supports them.", {
      kind: "workspace_action",
      action: "inspect_pr_insight",
    });
    return;
  }
  if (hasCiReadinessBlocker) {
    add(
      "pr-validation-recovery",
      "Validation recovery",
      "Analyze validation failure context together with PR readiness, policy, and linked work items.",
    );
    add("pr-policy", "Check policy", "Check pull request policy status.", {
      kind: "workspace_action",
      action: "check_pr_policy",
    });
    add("pr-work-items", "List work items", "List linked work items for this pull request.", {
      kind: "workspace_action",
      action: "list_pr_work_items",
    });
    return;
  }
  add("pr-risks", "Check PR risks", "Summarize the main PR risks and what evidence supports them.", {
    kind: "workspace_action",
    action: "inspect_pr_insight",
  });
  add("pr-policy", "Check policy", "Check pull request policy status.", {
    kind: "workspace_action",
    action: "check_pr_policy",
  });
  add("pr-work-items", "List work items", "List linked work items for this pull request.", {
    kind: "workspace_action",
    action: "list_pr_work_items",
  });
}
