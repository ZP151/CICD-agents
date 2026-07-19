import type { ProjectLink } from "../../../api.js";
import type { WorkspaceAction } from "../workflowTaskState.js";

interface WorkspaceProjectLinkPanelProps {
  repoName: string;
  repoPath: string;
  projectLinks: ProjectLink[];
  activeProjectLink: ProjectLink | null;
  activeProjectLinkId: string | null;
  adoReady: boolean;
  branchName: string;
  busy: boolean;
  onProjectLinkSelect: (id: string) => void;
  runAction: (action: WorkspaceAction) => void;
}

export function WorkspaceProjectLinkPanel({
  repoName,
  repoPath,
  projectLinks,
  activeProjectLink,
  activeProjectLinkId,
  adoReady,
  branchName,
  busy,
  onProjectLinkSelect,
  runAction,
}: WorkspaceProjectLinkPanelProps) {
  return (
    <div className="mt-2 border-t border-[rgb(var(--app-border))] pt-2">
      {projectLinks.length > 0 ? (
        <select
          aria-label="Workspace Project Link"
          className="w-full bg-transparent text-xs text-[rgb(var(--app-text-muted))] outline-none"
          value={activeProjectLinkId ?? ""}
          onChange={(event) => onProjectLinkSelect(event.target.value)}
          title="Project Link"
        >
          <option value="">No Project Link</option>
          {projectLinks.map((projectLink) => (
            <option key={projectLink.id} value={projectLink.id}>{projectLink.name}</option>
          ))}
        </select>
      ) : (
        <p className="text-xs text-[rgb(var(--app-text-subtle))]">No Project Link</p>
      )}
      <p className="mt-1 truncate text-xs text-[rgb(var(--app-text-subtle))]" title={repoPath}>
        {repoName || repoPath || "No local repository selected"}
      </p>
      {adoReady && (
        <>
          <p className="mt-1 truncate text-xs text-[rgb(var(--app-text-subtle))]">
            {activeProjectLink?.adoProject} / {activeProjectLink?.adoRepoName}
          </p>
          <div className={workspaceProjectLinkActionsGridClass()}>
            <button
              type="button"
              onClick={() => runAction({ type: "inspect_pr_insight" })}
              disabled={busy}
              className="truncate whitespace-nowrap rounded-md border border-[rgb(var(--app-border))] px-1.5 py-1 text-[10px] text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-50"
              aria-label="Inspect PR insight"
              title="Inspect the latest active pull request insight"
            >
              PR insight
            </button>
            <button
              type="button"
              onClick={() => runAction({ type: "check_pr_policy" })}
              disabled={busy}
              className="truncate whitespace-nowrap rounded-md border border-[rgb(var(--app-border))] px-1.5 py-1 text-[10px] text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-50"
              title="Check policy evaluations for the latest active pull request"
            >
              Policy
            </button>
            <button
              type="button"
              onClick={() => runAction({ type: "list_pr_work_items" })}
              disabled={busy}
              className="truncate whitespace-nowrap rounded-md border border-[rgb(var(--app-border))] px-1.5 py-1 text-[10px] text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-50"
              title="List linked work items for the latest active pull request"
            >
              Work items
            </button>
            <button
              type="button"
              onClick={() => runAction({ type: "inspect_pipeline" })}
              disabled={busy}
              className="truncate whitespace-nowrap rounded-md border border-[rgb(var(--app-border))] px-1.5 py-1 text-[10px] text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-50"
              aria-label="Inspect pipeline readiness"
              title="Inspect Azure DevOps pipeline readiness for this project link"
            >
              Pipeline
            </button>
            <button
              type="button"
              onClick={() => runAction({ type: "trigger_pipeline", branch: branchName || undefined })}
              disabled={busy}
              className="col-span-full truncate whitespace-nowrap rounded-md border border-[rgb(var(--app-warning-border))] px-1.5 py-1 text-[10px] text-[rgb(var(--app-warning))] transition hover:bg-[rgb(var(--app-warning-soft))] disabled:cursor-wait disabled:opacity-50"
              title="Prepare approval before triggering the configured Azure DevOps pipeline"
            >
              Run pipeline
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function workspaceProjectLinkActionsGridClass(): string {
  return "mt-2 grid min-w-0 gap-1 grid-cols-[repeat(auto-fit,minmax(min(100%,5.75rem),1fr))]";
}
