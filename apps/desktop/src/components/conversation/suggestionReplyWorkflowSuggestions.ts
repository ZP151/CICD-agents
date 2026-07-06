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
  rawText = text,
): void {
  if (context.workflowKind !== "ci") return;
  if (phase.includes("pipeline_setup_required") || text.includes("no azure pipeline is configured")) {
    const candidates = pipelineCandidatesFromText(rawText);
    const configuredPipelineId = context.adoPipelineId?.trim();
    for (const candidate of candidates.filter((item) => item.id !== configuredPipelineId).slice(0, 3)) {
      add(
        `ci-use-pipeline-${candidate.id}`,
        `Use #${candidate.id} ${candidate.name}`,
        `Save Azure Pipeline #${candidate.id} ${candidate.name} to this Project Link.`,
        {
          kind: "project_link_update",
          update: {
            adoPipelineId: candidate.id,
            adoPipelineName: candidate.name,
          },
        },
      );
    }
    if (candidates.length > 0) return;
  }
  const pipelineFailure = phase.includes("pipeline") && /\b(failed|failure|canceled|cancelled)\b/.test(text);
  const failed = phase.includes("failed") || /\b(test|build|validation).{0,32}\bfailed\b/.test(text);
  const isBuild = phase.includes("build") || /\bbuild failed\b/.test(text);
  if (pipelineFailure) {
    add(
      "ci-analyze-pipeline-failure",
      "Analyze pipeline",
      "Analyze the latest Azure Pipeline failure evidence and identify whether it needs logs, a local validation run, or a rerun.",
      { kind: "workspace_action", action: "inspect_pipeline" },
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
    add("ci-analyze-failure", "Analyze failure", "Analyze the latest validation failure report and suggest the smallest safe fix or rerun.", {
      kind: "workspace_action",
      action: "inspect_validation_failure",
    });
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
    add("ci-commit", "Prepare commit", "Prepare a scoped commit for the validated changes.", {
      kind: "workspace_action",
      action: "prepare_commit",
    });
    add("ci-pr", "Check PR readiness", "Check whether these validated changes are ready for pull request insight.", {
      kind: "workspace_action",
      action: "inspect_pr_insight",
    });
  }
}

function pipelineCandidatesFromText(text: string): Array<{ id: string; name: string }> {
  const candidates: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  const candidatePattern = /(?:^|\n)\s*[-*]?\s*#(\d+)\s+([^\n#-][^\n]*?)(?=\s+-\s+|\r?\n|$)/g;
  for (const match of text.matchAll(candidatePattern)) {
    const id = match[1]?.trim() ?? "";
    const name = cleanPipelineCandidateName(match[2] ?? "");
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    candidates.push({ id, name });
  }
  return candidates;
}

function cleanPipelineCandidateName(value: string): string {
  return value
    .replace(/\s+·\s+.*$/, "")
    .replace(/\s+repo:.*$/i, "")
    .trim()
    .slice(0, 80);
}

export function addCommitSuggestions(
  context: SuggestionReplyContext,
  phase: string,
  add: AddSuggestion,
): void {
  if (context.workflowKind !== "commit") return;
  if (phase.includes("stage") || phase.includes("preflight")) {
    add("commit-diff", "Check detailed diff", "Show a detailed diff-aware review before staging.", {
      kind: "workspace_action",
      action: "inspect_changes",
    });
    add("commit-message", "Draft commit message", "Generate a commit message from the reviewed diff.", {
      kind: "workspace_action",
      action: "draft_commit_message",
    });
    add("commit-scope", "Explain change scope", "Explain which files should be staged and why.", {
      kind: "workspace_action",
      action: "explain_change_scope",
    });
  } else if (phase.includes("commit")) {
    add("commit-staged", "Check staged diff", "Show the staged diff and summarize commit risk.", {
      kind: "workspace_action",
      action: "inspect_staged_changes",
    });
    add("commit-message", "Draft commit message", "Generate a commit message from the staged changes.", {
      kind: "workspace_action",
      action: "draft_commit_message",
    });
    add("commit-scope", "Explain change scope", "Explain what is included in this commit.", {
      kind: "workspace_action",
      action: "explain_change_scope",
    });
  } else if (phase.includes("pushed") || context.workflowStatus === "done") {
    add("commit-summary", "Summarize push", "Summarize the commit and push that just completed.", {
      kind: "workspace_action",
      action: "inspect_latest_commit",
    });
    add("commit-branch", "Check branch", "Check the branch status after the push.", {
      kind: "workspace_action",
      action: "refresh_branch",
    });
    add("commit-review", "Review commit", "Review the pushed commit for any remaining risks.", {
      kind: "workspace_action",
      action: "inspect_latest_commit",
    });
  } else if (phase.includes("push")) {
    add("commit-push", "Push branch", "Prepare a push approval for the configured remote branch.", {
      kind: "workspace_action",
      action: "push_branch",
    });
    add("commit-remote", "Show remote target", "Show the remote branch target and push command.", {
      kind: "workspace_action",
      action: "inspect_remote_target",
    });
    add("commit-status", "Check branch status", "Check local branch status before pushing.", {
      kind: "workspace_action",
      action: "refresh_branch",
    });
  }
}

export function addGitSuggestions(
  context: SuggestionReplyContext,
  phase: string,
  add: AddSuggestion,
): void {
  if (context.workflowKind !== "git") return;
  if (phase.includes("rebase")) {
    add("git-continue-rebase", "Continue rebase", "Continue the in-progress rebase after conflicts are resolved.", {
      kind: "workspace_action",
      action: "continue_rebase",
    });
    add("git-abort-rebase", "Abort rebase", "Abort the in-progress rebase and return to the previous branch state.", {
      kind: "workspace_action",
      action: "abort_rebase",
    });
    add("git-skip-rebase", "Skip rebase patch", "Skip the current rebase patch.", {
      kind: "workspace_action",
      action: "skip_rebase",
    });
    return;
  }
  if (phase.includes("merge")) {
    add("git-continue-merge", "Continue merge", "Finish the in-progress merge after conflicts are resolved.", {
      kind: "workspace_action",
      action: "continue_merge",
    });
    add("git-abort-merge", "Abort merge", "Abort the in-progress merge and return to the previous branch state.", {
      kind: "workspace_action",
      action: "abort_merge",
    });
    return;
  }
  if (phase.includes("fetched")) {
    add("git-refresh-after-fetch", "Refresh branch status", "Refresh branch status after fetching remote refs.", {
      kind: "workspace_action",
      action: "refresh_branch",
    });
    add("git-sync-after-fetch", "Pull/rebase first", "Prepare a pull with rebase if the refreshed branch is behind or diverged.", {
      kind: "workspace_action",
      action: "sync_branch_rebase",
    });
    add("git-push-after-fetch", "Push branch", "Prepare a push approval after checking branch readiness.", {
      kind: "workspace_action",
      action: "push_branch",
    });
    return;
  }
  if (phase.includes("synced")) {
    add("git-refresh-after-sync", "Refresh branch status", "Refresh branch status after the rebase sync.", {
      kind: "workspace_action",
      action: "refresh_branch",
    });
    add("git-push-after-sync", "Push branch", "Prepare a push approval if the branch is ready.", {
      kind: "workspace_action",
      action: "push_branch",
    });
    add("git-fetch-after-sync", "Fetch remotes", "Fetch remote refs again before another branch readiness check.", {
      kind: "workspace_action",
      action: "fetch_remotes",
    });
  }
}

export function addPrSuggestions(context: SuggestionReplyContext, text: string, add: AddSuggestion): void {
  if (context.workflowKind !== "pr") return;
  const phase = context.workflowPhase ?? "";
  if (phase.includes("pr_plan_context")) {
    addPrPlanContextSuggestions(text, add);
    return;
  }
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
      { kind: "workspace_action", action: "inspect_ci_recovery_context" },
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

function addPrPlanContextSuggestions(text: string, add: AddSuggestion): void {
  const lower = text.toLowerCase();
  const dirty = /\b(working tree:\s+(?!clean\b)|uncommitted|unstaged|modified|staged|untracked|dirty)\b/.test(lower);
  const missingMapping = /\b(missing_ado_mapping|missing ado|project link is missing|mapping is incomplete|ado target:\s*not configured|complete project link|no project link)\b/.test(lower);
  const authIssue = /\b(oauth token is unavailable|pat|sign in|credential|auth)\b/.test(lower);
  const behindOrDiverged = /\b(behind|diverged|pull\/rebase|pull or rebase|rebase before pushing)\b/.test(lower);
  const noUpstream = /\b(no upstream|set upstream|publish branch|upstream.*missing)\b/.test(lower);

  if (dirty) {
    add("pr-plan-review-changes", "Review changes", "Review the working tree before preparing the PR branch.", {
      kind: "workspace_action",
      action: "inspect_changes",
    });
    add("pr-plan-commit", "Prepare commit", "Prepare a commit for the local changes before pushing the PR branch.", {
      kind: "workspace_action",
      action: "prepare_commit",
    });
  }

  if (behindOrDiverged) {
    add("pr-plan-sync", "Pull/rebase first", "Sync the branch with its upstream before pushing or creating a PR.", {
      kind: "workspace_action",
      action: "sync_branch_rebase",
    });
  }

  if (missingMapping || authIssue) {
    add("pr-plan-auth", "Check ADO context", "Inspect Azure DevOps auth and Project Link mapping before PR creation.", {
      kind: "workspace_action",
      action: "inspect_ado_auth_context",
    });
  }

  add(
    "pr-plan-push",
    noUpstream ? "Publish branch" : "Push branch",
    noUpstream ? "Publish the current branch to the configured remote." : "Prepare a push approval for the current branch.",
    { kind: "workspace_action", action: "push_branch" },
  );
  add("pr-plan-create-pr", "Create PR", "Prepare a pull request approval after the branch is pushed.", {
    kind: "workspace_action",
    action: "create_pr",
  });
  add("pr-plan-risks", "Check PR risks", "Analyze PR risks once the branch and Project Link are ready.", {
    kind: "workspace_action",
    action: "inspect_pr_insight",
  });
}
