import type { ProjectLink } from "../../../api.js";
import { ActionButton, WorkbenchSelect } from "../../../components/workbench/WorkbenchPrimitives.js";
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
  showRepositoryContext?: boolean;
  actionDensity?: "full" | "compact";
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
  showRepositoryContext = true,
  actionDensity = "full",
}: WorkspaceProjectLinkPanelProps) {
  return (
    <div className="mt-2 border-t border-[rgb(var(--app-border))] pt-2">
      {projectLinks.length > 0 ? (
        <WorkbenchSelect
          aria-label="Workspace Project Link"
          className="min-h-8 bg-transparent px-0 py-1 text-xs text-[rgb(var(--app-text-muted))]"
          value={activeProjectLinkId ?? ""}
          onChange={(event) => onProjectLinkSelect(event.target.value)}
        >
          <option value="">No Project Link</option>
          {projectLinks.map((projectLink) => (
            <option key={projectLink.id} value={projectLink.id}>{projectLink.name}</option>
          ))}
        </WorkbenchSelect>
      ) : (
        <p className="text-xs text-[rgb(var(--app-text-subtle))]">No Project Link</p>
      )}
      {showRepositoryContext && (
        <p className="mt-1 truncate text-xs text-[rgb(var(--app-text-subtle))]" title={repoPath}>
          {repoName || repoPath || "No local repository selected"}
        </p>
      )}
      {adoReady && (
        <>
          <p className="mt-1 truncate text-xs text-[rgb(var(--app-text-subtle))]">
            {activeProjectLink?.adoProject} / {activeProjectLink?.adoRepoName}
          </p>
          <div className={workspaceProjectLinkActionsGridClass()}>
            <ActionButton
              type="button"
              onClick={() => runAction({ type: "inspect_pr_insight" })}
              disabled={busy}
              tone="quiet"
              className="min-h-7 w-full truncate whitespace-nowrap px-1.5 py-1 text-[10px]"
              aria-label="Inspect PR insight"
            >
              PR insight
            </ActionButton>
            {actionDensity === "full" && (
              <>
                <ActionButton
                  type="button"
                  onClick={() => runAction({ type: "check_pr_policy" })}
                  disabled={busy}
                  tone="quiet"
                  className="min-h-7 w-full truncate whitespace-nowrap px-1.5 py-1 text-[10px]"
                  aria-label="Check pull request policy evaluations"
                >
                  Policy
                </ActionButton>
                <ActionButton
                  type="button"
                  onClick={() => runAction({ type: "list_pr_work_items" })}
                  disabled={busy}
                  tone="quiet"
                  className="min-h-7 w-full truncate whitespace-nowrap px-1.5 py-1 text-[10px]"
                  aria-label="List pull request work items"
                >
                  Work items
                </ActionButton>
              </>
            )}
            <ActionButton
              type="button"
              onClick={() => runAction({ type: "inspect_pipeline" })}
              disabled={busy}
              tone="quiet"
              className="min-h-7 w-full truncate whitespace-nowrap px-1.5 py-1 text-[10px]"
              aria-label="Inspect pipeline readiness"
            >
              Pipeline
            </ActionButton>
            {actionDensity === "full" && (
              <ActionButton
                type="button"
                onClick={() => runAction({ type: "trigger_pipeline", branch: branchName || undefined })}
                disabled={busy}
                tone="quiet"
                className="col-span-full min-h-7 w-full truncate whitespace-nowrap border border-[rgb(var(--app-warning-border))] px-1.5 py-1 text-[10px] text-[rgb(var(--app-warning))] hover:bg-[rgb(var(--app-warning-soft))] hover:text-[rgb(var(--app-warning))]"
                aria-label="Prepare approval before triggering the configured Azure DevOps pipeline"
              >
                Run pipeline
              </ActionButton>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function workspaceProjectLinkActionsGridClass(): string {
  return "mt-2 grid min-w-0 gap-1 grid-cols-[repeat(auto-fit,minmax(min(100%,5.75rem),1fr))]";
}
