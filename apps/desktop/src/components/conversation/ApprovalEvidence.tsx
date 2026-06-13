export interface ApprovalWorkflowEvidence {
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
}

export interface ApprovalReadinessEvidence {
  kind: "push";
  status: "no_upstream" | "up_to_date" | "ahead" | "behind" | "diverged" | "unknown";
  upstream?: string;
  ahead?: number;
  behind?: number;
  summary: string;
}

export type ApprovalPreflightEvidence =
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
      commandSource: "override" | "profile" | "derived" | "default" | "artifact";
      changedFiles?: string[];
      changedFileCount?: number;
      selectedScript?: string;
      packageFilters?: string[];
      packageRoots?: string[];
      selectionReason?: string;
      summary: string;
    };

export interface ApprovalEvidenceProps {
  toolName?: string;
  args?: Record<string, unknown>;
  nextHint?: string;
  workflow?: ApprovalWorkflowEvidence;
  readiness?: ApprovalReadinessEvidence;
  preflight?: ApprovalPreflightEvidence;
}

export function ApprovalEvidence({
  toolName,
  args,
  nextHint,
  workflow,
  readiness,
  preflight,
}: ApprovalEvidenceProps) {
  const rows = approvalRows(toolName, args, workflow);
  const preflightRows = approvalPreflightRows(preflight);
  const command = toolCommandPreview(toolName, args);
  if (!toolName && rows.length === 0 && !workflow && !readiness && !preflight && !nextHint) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
        <span className="font-medium text-[rgb(var(--app-text))]">Action scope</span>
        {workflow && (
          <span className="rounded border border-[rgb(var(--app-border))] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">
            {workflow.kind}:{workflow.phase}
          </span>
        )}
      </div>
      <div className="space-y-2 px-3 py-2">
        {command && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">
              Command preview
            </p>
            <code className="block whitespace-pre-wrap break-words rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-bg-muted))] px-2 py-1.5 font-mono text-[11px] text-[rgb(var(--app-text-muted))]">
              {command}
            </code>
          </div>
        )}

        {rows.length > 0 && (
          <dl className="grid gap-x-3 gap-y-1.5 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
            {rows.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-[rgb(var(--app-text-subtle))]">{row.label}</dt>
                <dd className="min-w-0 break-words font-mono text-[11px] text-[rgb(var(--app-text-muted))]">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {preflightRows.length > 0 && (
          <dl className="grid gap-x-3 gap-y-1.5 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2 py-1.5 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
            {preflightRows.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-[rgb(var(--app-text-subtle))]">{row.label}</dt>
                <dd className="min-w-0 break-words font-mono text-[11px] text-[rgb(var(--app-text-muted))]">{row.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {workflow && (
          <EvidenceNote
            label="Workflow boundary"
            text={workflowBoundaryText(workflow, nextHint)}
          />
        )}
        {readiness?.summary && <EvidenceNote label="Readiness" text={readiness.summary} />}
        {preflight?.summary && <EvidenceNote label="Preflight" text={preflight.summary} />}
        {!workflow && nextHint && <EvidenceNote label="Next" text={nextHint} />}
      </div>
    </div>
  );
}

function approvalPreflightRows(preflight?: ApprovalPreflightEvidence): Array<{ label: string; value: string }> {
  if (!preflight || preflight.kind !== "validation") return [];
  const rows: Array<{ label: string; value: string }> = [
    { label: "Source", value: validationCommandSourceLabel(preflight.commandSource) },
  ];
  if (preflight.selectedScript) rows.push({ label: "Script", value: preflight.selectedScript });
  if (preflight.packageFilters?.length) rows.push({ label: "Filters", value: preflight.packageFilters.join(", ") });
  if (preflight.packageRoots?.length) rows.push({ label: "Packages", value: preflight.packageRoots.join(", ") });
  if (typeof preflight.changedFileCount === "number") rows.push({ label: "Changed", value: `${preflight.changedFileCount} file${preflight.changedFileCount === 1 ? "" : "s"}` });
  if (preflight.selectionReason) rows.push({ label: "Reason", value: preflight.selectionReason });
  return rows;
}

function validationCommandSourceLabel(source: Extract<ApprovalPreflightEvidence, { kind: "validation" }>["commandSource"]): string {
  if (source === "artifact") return "failure artifact";
  return source;
}

function EvidenceNote({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">{label}</p>
      <p className="mt-0.5 leading-relaxed text-[rgb(var(--app-text-muted))]">{text}</p>
    </div>
  );
}

function approvalRows(
  toolName?: string,
  args?: Record<string, unknown>,
  workflow?: ApprovalWorkflowEvidence,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (toolName) rows.push({ label: "Tool", value: toolName });
  const paths = valueFromKeys(args, ["paths", "path", "files"]);
  if (paths) rows.push({ label: "Paths", value: paths });
  const branch = valueFromKeys(args, ["branch", "source_branch", "sourceBranch"]) || workflow?.branch;
  if (branch) rows.push({ label: "Branch", value: branch });
  const target = valueFromKeys(args, ["target_branch", "targetBranch"]);
  if (target) rows.push({ label: "Target", value: target });
  const remote = valueFromKeys(args, ["remote"]);
  if (remote) rows.push({ label: "Remote", value: remote });
  const message = valueFromKeys(args, ["message"]) || workflow?.message;
  if (message) rows.push({ label: "Message", value: message });
  const title = valueFromKeys(args, ["title"]);
  if (title) rows.push({ label: "Title", value: title });
  const flags = flagSummary(args);
  if (flags) rows.push({ label: "Flags", value: flags });
  return rows;
}

export function toolCommandPreview(toolName?: string, args?: Record<string, unknown>): string {
  if (!toolName) return "";
  if (typeof args?.["command"] === "string" && args["command"].trim()) {
    return args["command"].trim();
  }
  if (toolName === "git_add") {
    const paths = stringArray(args?.["paths"]);
    const flags = [
      args?.["dryRun"] ? "--dry-run" : "",
      args?.["intentToAdd"] ? "--intent-to-add" : "",
      args?.["update"] ? "--update" : "",
      args?.["all"] || paths.length === 0 ? "--all" : "",
    ].filter(Boolean);
    return ["git", "add", ...flags, ...(paths.length ? ["--", ...paths] : [])].join(" ");
  }
  if (toolName === "git_commit") {
    const flags = [
      args?.["all"] ? "--all" : "",
      args?.["amend"] ? "--amend" : "",
      args?.["noVerify"] ? "--no-verify" : "",
      args?.["allowEmpty"] ? "--allow-empty" : "",
    ].filter(Boolean);
    const message = String(args?.["message"] ?? "<message>");
    return ["git", "commit", ...flags, "-m", quoteShell(message)].join(" ");
  }
  if (toolName === "git_push") {
    const remote = String(args?.["remote"] ?? "origin");
    const branch = String(args?.["branch"] ?? "<branch>");
    const flags = [
      args?.["setUpstream"] !== false ? "-u" : "",
      args?.["forceWithLease"] ? "--force-with-lease" : "",
      args?.["tags"] ? "--tags" : "",
      args?.["dryRun"] ? "--dry-run" : "",
    ].filter(Boolean);
    return ["git", "push", ...flags, remote, branch].join(" ");
  }
  if (toolName === "ado_create_pr") {
    const source = String(args?.["source_branch"] ?? args?.["sourceBranch"] ?? "<source>");
    const target = String(args?.["target_branch"] ?? args?.["targetBranch"] ?? "<target>");
    const title = String(args?.["title"] ?? "<title>");
    return `ado_create_pr source=${source} target=${target} title=${quoteShell(title)}`;
  }
  return `${toolName} ${formatUnknown(args ?? {})}`;
}

function workflowBoundaryText(workflow: ApprovalWorkflowEvidence, nextHint?: string): string {
  if (workflow.kind === "commit") {
    if (workflow.phase === "stage") {
      return workflow.pushAfterCommit
        ? "Requested endpoint: stage, commit, and push. The workflow should stop after the push unless a new request asks for PR, work item, or pipeline steps."
        : "Requested endpoint: stage and commit. Push, PR, work item, and pipeline steps require a separate request.";
    }
    if (workflow.phase === "commit") {
      return workflow.pushAfterCommit
        ? "Next approved boundary is push. PR creation, work-item linking, and pipeline runs are out of scope for this workflow."
        : "This workflow ends after commit. Push, PR creation, and pipeline runs are out of scope.";
    }
    if (workflow.phase === "push") {
      return "This workflow ends after push. PR creation, work-item linking, and pipeline runs require a new explicit request.";
    }
  }
  if (workflow.kind === "pr") {
    return "This approval belongs to a pull-request workflow. Work-item linking and pipeline runs still require their own explicit request or approval.";
  }
  if (workflow.kind === "git") {
    if (workflow.phase === "stage_conflicts") return "This approval only stages the selected files that are part of the current Git conflict recovery.";
    if (workflow.phase === "continue_rebase") return "This approval only continues the in-progress rebase after conflicts have been resolved and staged.";
    if (workflow.phase === "abort_rebase") return "This approval only aborts the in-progress rebase and returns the branch to its pre-rebase state.";
    if (workflow.phase === "skip_rebase") return "This approval only skips the current patch in the in-progress rebase.";
    if (workflow.phase === "continue_merge") return "This approval only continues the in-progress merge after conflicts have been resolved and staged.";
    if (workflow.phase === "abort_merge") return "This approval only aborts the in-progress merge.";
    if (workflow.phase === "continue_cherry_pick") return "This approval only continues the in-progress cherry-pick after conflicts have been resolved and staged.";
    if (workflow.phase === "abort_cherry_pick") return "This approval only aborts the in-progress cherry-pick.";
    if (workflow.phase === "skip_cherry_pick") return "This approval only skips the current patch in the in-progress cherry-pick.";
    if (workflow.phase === "continue_revert") return "This approval only continues the in-progress revert after conflicts have been resolved and staged.";
    if (workflow.phase === "abort_revert") return "This approval only aborts the in-progress revert.";
    if (workflow.phase === "skip_revert") return "This approval only skips the current patch in the in-progress revert.";
  }
  if (workflow.kind === "ci") {
    if (workflow.phase === "pipeline_trigger") {
      return "This approval only triggers the configured Azure DevOps pipeline. Git writes and PR changes remain out of scope.";
    }
    return workflow.phase === "build"
      ? "This approval only runs the configured build validation command. Git writes, PR creation, and pipeline triggers remain out of scope."
      : "This approval only runs the configured test validation command. Git writes, PR creation, and pipeline triggers remain out of scope.";
  }
  return nextHint ? `Next: ${nextHint}` : "The workflow boundary is defined by this approval.";
}

function valueFromKeys(args: Record<string, unknown> | undefined, keys: string[]): string {
  for (const key of keys) {
    const value = args?.[key];
    if (value !== undefined && value !== null && value !== "") return shortValue(value);
  }
  return "";
}

function flagSummary(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  return Object.entries(args)
    .filter(([, value]) => typeof value === "boolean" && value)
    .map(([key]) => key)
    .join(", ");
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function shortValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object") return formatUnknown(value);
  return String(value);
}

function quoteShell(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function formatUnknown(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
