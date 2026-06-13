export interface ChatAgentUseCase {
  id: string;
  title: string;
  intentSignals: string[];
  readTools: string[];
  writeTools: string[];
  approval: "none" | "required";
  expectedBehavior: string;
}

export const CHAT_AGENT_USE_CASES: ChatAgentUseCase[] = [
  {
    id: "project-understanding",
    title: "Understand repository structure and architecture",
    intentSignals: ["what does this project do", "explain architecture", "where is", "how does this work"],
    readTools: ["repo_refresh_index", "repo_context", "git_log"],
    writeTools: [],
    approval: "none",
    expectedBehavior: "Use repository context before Git mutation workflows; answer with relevant files, modules, and confidence gaps.",
  },
  {
    id: "change-review",
    title: "Review current working-tree changes",
    intentSignals: ["review my changes", "what changed", "inspect diff", "risk before commit"],
    readTools: ["git_status", "git_diff", "repo_context"],
    writeTools: [],
    approval: "none",
    expectedBehavior: "Summarize changed files, likely intent, risk areas, and suggested tests without staging or committing.",
  },
  {
    id: "test-selection",
    title: "Choose and run relevant validation",
    intentSignals: ["run tests", "what tests should I run", "verify this change", "build"],
    readTools: ["git_diff", "git_status", "repo_context"],
    writeTools: ["npm_test", "pytest", "dotnet_test"],
    approval: "required",
    expectedBehavior: "Infer likely test commands from repo/profile context, explain scope, then request approval before execution.",
  },
  {
    id: "branch-management",
    title: "Inspect, create, switch, update, and compare branches",
    intentSignals: ["branch", "checkout", "switch", "fetch", "pull", "rebase", "merge", "cherry-pick", "revert", "compare with main"],
    readTools: ["git_current_branch", "git_branch_list", "git_status", "git_fetch", "git_diff", "git_merge_base"],
    writeTools: ["git_switch", "git_create_branch", "git_checkout", "git_pull", "git_merge", "git_rebase", "git_cherry_pick", "git_revert"],
    approval: "required",
    expectedBehavior: "Inspect dirty state first, prefer safe read-only comparison, and require approval for branch-changing operations.",
  },
  {
    id: "commit-workflow",
    title: "Stage, split, commit, and amend local changes",
    intentSignals: ["stage", "commit", "split commit", "amend", "commit message"],
    readTools: ["git_status", "git_diff", "repo_context"],
    writeTools: ["git_add", "git_restore", "git_commit"],
    approval: "required",
    expectedBehavior: "Review scope before proposing exact staged paths and commit message; do not silently include unrelated files.",
  },
  {
    id: "remote-sync",
    title: "Push, publish, pull, and recover from remote divergence",
    intentSignals: ["push", "publish branch", "set upstream", "non-fast-forward", "pull latest"],
    readTools: ["git_status", "git_current_branch", "git_remote", "git_fetch"],
    writeTools: ["git_push", "git_pull", "git_rebase", "git_merge", "git_cherry_pick", "git_revert"],
    approval: "required",
    expectedBehavior: "Check branch/upstream state, avoid force operations unless explicitly requested, and explain conflict/divergence recovery.",
  },
  {
    id: "pr-insight",
    title: "Analyze Azure DevOps pull requests",
    intentSignals: ["analyze pr", "pr insight", "pull request risk", "review queue"],
    readTools: ["ado_get_pull_request_by_id", "ado_list_pull_request_threads", "ado_get_pull_request_changes", "ado_pipelines_get_builds", "ado_list_pull_request_work_items", "ado_list_pull_request_policy_evaluations"],
    writeTools: [],
    approval: "none",
    expectedBehavior: "Combine ADO PR metadata, files, threads, builds, work items, policies, and saved insight artifacts before recommending action.",
  },
  {
    id: "pr-creation",
    title: "Create and prepare pull requests",
    intentSignals: ["create pr", "open pull request", "push and create pr", "link work item"],
    readTools: ["git_status", "git_current_branch", "git_log", "git_remote"],
    writeTools: ["git_push", "ado_create_pr", "ado_link_work_item"],
    approval: "required",
    expectedBehavior: "Only create a PR when requested, use Project Link target branch, and preserve pushed-only workflows without inventing PR creation.",
  },
  {
    id: "shelve-and-restore",
    title: "Stash, restore, and rollback local work",
    intentSignals: ["stash", "restore file", "discard", "rollback", "checkpoint"],
    readTools: ["git_status", "git_diff", "git_checkpoint_show"],
    writeTools: ["git_stash", "git_restore", "git_checkpoint_apply"],
    approval: "required",
    expectedBehavior: "Prefer checkpoint-backed recovery for risky changes; require explicit paths for restore/discard operations.",
  },
  {
    id: "cicd-operations",
    title: "Inspect and trigger CI/CD",
    intentSignals: ["pipeline", "ci", "build status", "rerun pipeline", "trigger pipeline"],
    readTools: ["ado_pipelines_get_build_definitions", "ado_pipelines_get_builds", "ado_list_pipeline_runs", "ado_pipelines_get_run"],
    writeTools: ["ado_trigger_pipeline"],
    approval: "required",
    expectedBehavior: "Read pipeline state first, explain branch/pipeline target, and require approval before triggering remote runs.",
  },
];

export function chatAgentUseCasePrompt(): string {
  return CHAT_AGENT_USE_CASES.map((useCase) => {
    const reads = useCase.readTools.length ? useCase.readTools.join(", ") : "none";
    const writes = useCase.writeTools.length ? useCase.writeTools.join(", ") : "none";
    return [
      `- ${useCase.title} (${useCase.id})`,
      `  Signals: ${useCase.intentSignals.join("; ")}`,
      `  Read tools: ${reads}`,
      `  Write tools: ${writes}`,
      `  Approval: ${useCase.approval}`,
      `  Behavior: ${useCase.expectedBehavior}`,
    ].join("\n");
  }).join("\n");
}
