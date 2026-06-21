import type { WorkflowEventState } from "./chat.types.js";
import type { TaskState, WorkflowStep } from "./workflowTaskTypes.js";

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    git_status: "Check Git status",
    git_diff: "Inspect changes",
    git_current_branch: "Read current branch",
    git_log: "Read commit history",
    git_branch_list: "List branches",
    git_remote: "Inspect remotes",
    git_show: "Inspect revision",
    git_fetch: "Fetch remotes",
    git_merge_base: "Find merge base",
    git_checkout: "Switch branch",
    git_pull: "Pull branch",
    git_merge: "Merge branch",
    git_cherry_pick: "Cherry-pick commit",
    git_revert: "Revert commit",
    git_rebase: "Rebase branch",
    git_restore: "Restore files",
    git_add: "Stage files",
    git_commit: "Create commit",
    git_push: "Push branch",
    git_stash: "Stash changes",
    git_create_branch: "Create branch",
    ado_create_pr: "Create pull request",
    ado_get_pull_request_by_id: "Read pull request",
    ado_list_pull_request_threads: "Read PR threads",
    ado_get_pull_request_changes: "Read PR changes",
    ado_list_pull_request_work_items: "Read linked work items",
    ado_list_pull_request_policy_evaluations: "Read PR policies",
    ado_pipelines_get_builds: "Read PR builds",
    ado_link_work_item: "Link work item",
    ado_trigger_pipeline: "Run pipeline",
    validation_command: "Run validation",
  };
  return labels[name] ?? name.replace(/_/g, " ");
}

export function workflowStateWithActionSummary(
  workflowState: WorkflowEventState | null | undefined,
  summary?: string,
): WorkflowEventState | null {
  if (!workflowState) return null;
  const clean = summary?.trim();
  return clean ? { ...workflowState, workflowSummary: clean } : workflowState;
}

export function taskStateFromWorkflow(
  workflowState: WorkflowEventState | null,
  fallbackGoal: string | null,
): TaskState | null {
  if (!workflowState) return null;
  if (workflowState.workflowKind === "commit") return taskStateFromCommitWorkflow(workflowState, fallbackGoal);
  if (workflowState.workflowKind === "git") {
    const gitTask = taskStateFromGitWorkflow(workflowState, fallbackGoal);
    if (gitTask) return gitTask;
  }
  if (workflowState.workflowKind === "pr") return taskStateFromPrWorkflow(workflowState, fallbackGoal);
  if (workflowState.workflowKind === "ci") return taskStateFromCiWorkflow(workflowState, fallbackGoal);

  const completed = workflowState.completedTools ?? [];
  const steps: WorkflowStep[] = completed.map((tool) => ({
    label: toolLabel(tool),
    done: true,
    active: false,
  }));
  const pendingTool = workflowState.pendingApproval?.action.tool;
  const currentLabel = workflowState.pendingApproval?.action.description ?? workflowState.currentStep ?? workflowState.status;

  if (pendingTool) {
    steps.push({ label: currentLabel || toolLabel(pendingTool), done: false, active: true });
  } else if (workflowState.status === "running" || workflowState.status === "planning") {
    steps.push({ label: currentLabel, done: false, active: true });
  } else if (steps.length === 0 && currentLabel) {
    steps.push({ label: currentLabel, done: workflowState.status === "done", active: false });
  }

  return {
    goal: fallbackGoal ?? "Current workflow",
    steps,
    currentStepLabel: currentLabel,
    details: workflowDetailLines(workflowState),
    risk: workflowState.pendingApproval?.riskLevel,
  };
}

function taskStateFromGitWorkflow(
  workflowState: WorkflowEventState,
  fallbackGoal: string | null,
): TaskState | null {
  const completed = new Set(workflowState.completedTools ?? []);
  const phase = workflowState.workflowPhase ?? "";
  const pending = workflowState.pendingApproval?.action;
  const isFetch =
    phase === "waiting_for_fetch_remotes_approval"
    || phase === "fetched"
    || (pending?.tool === "git_fetch" && pending.workflow?.phase === "fetch_remotes");
  if (isFetch) {
    const fetched = phase === "fetched" || completed.has("git_fetch");
    const waiting = workflowState.status === "waiting_for_approval";
    return {
      goal: fallbackGoal ?? "Remote refs",
      steps: [
        {
          label: "Check remote",
          done: completed.has("git_remote") || Boolean(pending),
          active: false,
        },
        {
          label: "Fetch remotes",
          done: fetched,
          active: waiting,
        },
        {
          label: "Refresh branch status",
          done: false,
          active: fetched,
          action: { type: "refresh_branch" },
        },
      ],
      currentStepLabel: pending?.description ?? workflowState.currentStep ?? workflowState.status,
      details: workflowDetailLines(workflowState),
      risk: workflowState.pendingApproval?.riskLevel,
    };
  }
  const isSync =
    phase === "waiting_for_sync_branch_approval"
    || phase === "synced"
    || (pending?.tool === "git_pull" && pending.workflow?.phase === "sync_branch");
  if (!isSync) return null;

  const synced = phase === "synced" || completed.has("git_pull");
  const waiting = workflowState.status === "waiting_for_approval";
  const branch = pending?.workflow?.branch ?? syncBranchFromStep(workflowState.currentStep);
  return {
    goal: fallbackGoal ?? "Branch sync",
    steps: [
      {
        label: "Check branch readiness",
        done: completed.has("git_status") || Boolean(pending?.readiness),
        active: false,
      },
      {
        label: "Pull with rebase",
        done: synced,
        active: waiting,
      },
      {
        label: "Refresh branch status",
        done: false,
        active: synced,
        action: { type: "refresh_branch" },
      },
      {
        label: "Push when ready",
        done: false,
        active: false,
        action: branch ? { type: "push_branch", branch } : { type: "push_branch" },
      },
    ],
    currentStepLabel: pending?.description ?? workflowState.currentStep ?? workflowState.status,
    details: workflowDetailLines(workflowState),
    risk: workflowState.pendingApproval?.riskLevel,
  };
}

function taskStateFromPrWorkflow(
  workflowState: WorkflowEventState,
  fallbackGoal: string | null,
): TaskState {
  const completed = new Set(workflowState.completedTools ?? []);
  const phase = workflowState.workflowPhase ?? "";
  if (phase.includes("pr_plan_context")) return taskStateFromPrPlanWorkflow(workflowState, completed, fallbackGoal);
  const pendingTool = workflowState.pendingApproval?.action.tool;
  const readinessSteps = prReadinessFollowUpSteps(workflowState, completed);
  const steps: WorkflowStep[] = phase === "inspected" || phase === "policy_checked" || phase === "work_items_listed"
    ? [
        {
          label: "Load pull request",
          done: completed.has("ado_get_pull_request_by_id") || completed.has("ado_list_pull_request_policy_evaluations") || completed.has("ado_list_pull_request_work_items"),
          active: workflowState.status === "planning",
        },
        {
          label: phase === "policy_checked"
            ? "Check policy"
            : phase === "work_items_listed"
              ? "List work items"
              : "Analyze PR insight",
          done: workflowState.status === "done",
          active: workflowState.status === "running",
        },
        ...readinessSteps,
      ]
    : [
        {
          label: "Inspect branch",
          done: completed.has("git_current_branch") || completed.has("git_status"),
          active: workflowState.status === "planning",
        },
        {
          label: pendingTool === "ado_link_work_item" ? "Link work item" : "Prepare pull request",
          done: false,
          active: phase === "waiting_for_create_pr_approval" || pendingTool === "ado_create_pr" || pendingTool === "ado_link_work_item",
        },
      ];
  return {
    goal: fallbackGoal ?? "Pull request workflow",
    steps,
    currentStepLabel: workflowState.pendingApproval?.action.description ?? workflowState.currentStep ?? workflowState.status,
    details: workflowDetailLines(workflowState),
    risk: workflowState.pendingApproval?.riskLevel,
  };
}

function taskStateFromPrPlanWorkflow(
  workflowState: WorkflowEventState,
  completed: Set<string>,
  fallbackGoal: string | null,
): TaskState {
  const summary = `${workflowState.workflowSummary ?? ""}\n${workflowState.currentStep ?? ""}`;
  const lower = summary.toLowerCase();
  const dirty = /\bworking tree:\s+(?!clean\b)|\b(uncommitted|unstaged|modified|staged|untracked|dirty)\b/.test(lower);
  const missingMapping = /\b(missing_ado_mapping|missing ado|azure devops target:\s*missing|project link.*mapping|complete project link|no project link)\b/.test(lower);
  const authIssue = /\b(oauth token is unavailable|credential|sign in|pat)\b/.test(lower);
  const needsSync = /\b(behind|diverged|pull or rebase|rebase before pushing)\b/.test(lower);
  const noUpstream = /\b(no upstream|set upstream|upstream tracking|push the branch with upstream)\b/.test(lower);
  const sourceBranch = textSignal(summary, /^-\s*Source branch:\s*(.+)$/im);
  const targetBranch = textSignal(summary, /^-\s*Target branch:\s*(.+)$/im);
  const steps: WorkflowStep[] = [
    {
      label: "Inspect PR plan",
      done: workflowState.status === "done" || completed.has("git_status") || completed.has("git_current_branch"),
      active: workflowState.status === "planning" || workflowState.status === "running",
    },
  ];
  let activatedNextAction = false;
  const nextActionActive = (done: boolean): boolean => {
    if (done || activatedNextAction) return false;
    activatedNextAction = true;
    return true;
  };
  const addFollowUp = (step: WorkflowStep): void => {
    steps.push({
      ...step,
      active: step.active || nextActionActive(step.done),
    });
  };

  if (dirty) {
    addFollowUp({
      label: "Review and commit changes",
      done: false,
      active: false,
      action: { type: "prepare_commit", branch: sourceBranch, includeUnstaged: true },
    });
  }
  if (needsSync) {
    addFollowUp({
      label: "Sync branch",
      done: false,
      active: false,
      action: { type: "sync_branch_rebase", branch: sourceBranch },
    });
  }
  addFollowUp({
    label: noUpstream ? "Publish branch" : "Push branch",
    done: completed.has("git_push"),
    active: false,
    action: { type: "push_branch", branch: sourceBranch },
  });
  if (missingMapping || authIssue) {
    addFollowUp({
      label: "Check ADO context",
      done: false,
      active: false,
      action: { type: "inspect_ado_auth_context" },
    });
  } else {
    addFollowUp({
      label: "Create pull request",
      done: completed.has("ado_create_pr"),
      active: false,
      action: {
        type: "create_pr",
        branch: sourceBranch,
        targetBranch,
        draft: false,
      },
    });
  }

  return {
    goal: fallbackGoal ?? "PR plan",
    steps,
    currentStepLabel: workflowState.currentStep ?? workflowState.status,
    details: workflowDetailLines(workflowState),
    risk: workflowState.pendingApproval?.riskLevel,
  };
}

function prReadinessFollowUpSteps(workflowState: WorkflowEventState, completed: Set<string>): WorkflowStep[] {
  const summary = `${workflowState.workflowSummary ?? ""}\n${workflowState.currentStep ?? ""}`;
  const failedBuilds = numericSignal(summary, /(\d+)\s+failed\/canceled build/i);
  const failedPolicies = numericSignal(summary, /(\d+)\s+failed\/error policy/i);
  const linkedWorkItems = numericSignal(summary, /(\d+)\s+linked work item/i);
  const lower = summary.toLowerCase();
  const steps: WorkflowStep[] = [];
  let activatedNextAction = false;
  const nextActionActive = (done: boolean): boolean => {
    if (done || activatedNextAction) return false;
    activatedNextAction = true;
    return true;
  };
  if ((failedBuilds ?? 0) > 0 || /\b(ci|build|test|validation).{0,40}\b(failed|blocked|failure)\b/.test(lower)) {
    const done = completed.has("validation_command");
    steps.push({ label: "Review CI blockers", done, active: nextActionActive(done), action: { type: "run_tests" } });
  }
  if ((failedPolicies ?? 0) > 0 || /\b(policy|policies).{0,40}\b(failed|blocked|blocking|error)\b/.test(lower)) {
    const done = completed.has("ado_list_pull_request_policy_evaluations");
    steps.push({ label: "Check policy blockers", done, active: nextActionActive(done), action: { type: "check_pr_policy" } });
  }
  if (linkedWorkItems === 0 || /\bno linked work items?\b/.test(lower)) {
    const done = completed.has("ado_list_pull_request_work_items");
    steps.push({ label: "Review work items", done, active: nextActionActive(done), action: { type: "list_pr_work_items" } });
  }
  return steps.slice(0, 3);
}

function numericSignal(text: string, pattern: RegExp): number | undefined {
  const match = text.match(pattern);
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function textSignal(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern);
  return match?.[1]?.trim() || undefined;
}

function taskStateFromCommitWorkflow(
  workflowState: WorkflowEventState,
  fallbackGoal: string | null,
): TaskState {
  const completed = new Set(workflowState.completedTools ?? []);
  const phase = workflowState.workflowPhase ?? "";
  const workflow = workflowState.pendingApproval?.action.workflow;
  const shouldPush = Boolean(workflow?.pushAfterCommit || phase === "waiting_for_push_approval" || completed.has("git_push"));
  const steps: WorkflowStep[] = [
    { label: "Inspect changes", done: completed.has("git_status") || completed.has("git_diff"), active: phase === "preflight" || workflowState.status === "planning" },
    { label: "Stage changes", done: completed.has("git_add"), active: phase === "waiting_for_stage_approval" || workflowState.currentStep === "git_add" },
    { label: "Commit changes", done: completed.has("git_commit"), active: phase === "waiting_for_commit_approval" || workflowState.currentStep === "git_commit" },
  ];
  if (shouldPush) {
    steps.push({ label: "Push branch", done: completed.has("git_push"), active: phase === "waiting_for_push_approval" || workflowState.currentStep === "git_push" });
  }

  return {
    goal: fallbackGoal ?? "Commit workflow",
    steps,
    currentStepLabel: workflowState.pendingApproval?.action.description ?? workflowState.currentStep ?? workflowState.status,
    details: workflowDetailLines(workflowState),
    risk: workflowState.pendingApproval?.riskLevel,
  };
}

function taskStateFromCiWorkflow(
  workflowState: WorkflowEventState,
  fallbackGoal: string | null,
): TaskState {
  const phase = workflowState.workflowPhase ?? "";
  if (phase.includes("pipeline") || workflowState.pendingApproval?.action.tool === "ado_trigger_pipeline") {
    const waiting = workflowState.status === "waiting_for_approval";
    const running = workflowState.status === "running";
    const inspected = workflowState.completedTools?.includes("ado_list_pipeline_runs") || phase === "pipeline_inspected";
    const triggered = workflowState.completedTools?.includes("ado_trigger_pipeline") || phase === "pipeline_triggered";
    return {
      goal: fallbackGoal ?? "Pipeline workflow",
      steps: [
        { label: "Inspect pipeline", done: inspected, active: running && !inspected, action: { type: "inspect_pipeline" } },
        { label: "Review latest runs", done: inspected, active: phase === "pipeline_inspected" && workflowState.status === "done" },
        { label: "Trigger pipeline", done: triggered, active: waiting || (!triggered && inspected), action: { type: "trigger_pipeline" } },
        { label: triggered ? "Pipeline triggered" : "Review run status", done: triggered, active: running && inspected },
      ],
      currentStepLabel: workflowState.pendingApproval?.action.description ?? workflowState.currentStep ?? workflowState.status,
      details: workflowDetailLines(workflowState),
      risk: workflowState.pendingApproval?.riskLevel,
    };
  }
  const isBuild = phase.includes("build") || workflowState.currentStep.toLowerCase().includes("build");
  const noun = isBuild ? "Build" : "Tests";
  const passed = phase.endsWith("_passed") || (workflowState.status === "done" && !phase.endsWith("_failed"));
  const failed = phase.endsWith("_failed") || workflowState.status === "failed";
  const waiting = workflowState.status === "waiting_for_approval";
  const running = workflowState.status === "running";
  return {
    goal: fallbackGoal ?? `${noun} validation`,
    steps: [
      { label: "Inspect workspace", done: true, active: false },
      { label: `Approve ${noun.toLowerCase()}`, done: !waiting, active: waiting },
      { label: `Run ${noun.toLowerCase()}`, done: passed || failed, active: running },
      { label: passed ? `${noun} passed` : failed ? `${noun} failed` : "Review result", done: passed, active: failed },
    ],
    currentStepLabel: workflowState.pendingApproval?.action.description ?? workflowState.currentStep ?? workflowState.status,
    details: workflowDetailLines(workflowState),
    risk: workflowState.pendingApproval?.riskLevel,
  };
}

function workflowDetailLines(workflowState: WorkflowEventState): string[] {
  const action = workflowState.pendingApproval?.action;
  const lines: string[] = [];
  if (workflowState.authMessage) lines.push(truncateMiddle(workflowState.authMessage, 120));
  if (workflowState.authStatus) {
    const authLabel = workflowState.authMode === "pat" ? "PAT" : "OAuth";
    const retryLabel = workflowState.retryable ? "retry after reconnecting" : "check configuration";
    lines.push(`${authLabel}: ${workflowState.authStatus} (${retryLabel})`);
  }
  if (action?.preflight?.summary) lines.push(action.preflight.summary);
  if (action?.readiness?.summary) lines.push(action.readiness.summary);
  if ((workflowState.workflowKind === "pr" || workflowState.workflowKind === "ci") && workflowState.workflowSummary) {
    lines.push(truncateMiddle(workflowState.workflowSummary, 160));
  }
  if (action?.workflow?.branch) lines.push(`Branch: ${action.workflow.branch}`);
  if (action?.workflow?.message) lines.push(`Message: ${truncateMiddle(action.workflow.message, 90)}`);
  return lines.slice(0, 4);
}

function syncBranchFromStep(step: string): string | undefined {
  const match = step.match(/\b(?:Synced branch|Branch)\s+([^\s.]+)/i);
  return match?.[1];
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const head = Math.max(1, Math.floor((maxLength - 3) * 0.65));
  const tail = Math.max(1, maxLength - 3 - head);
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}
