import type { ProjectLink } from "../../../api.js";
import { ActionButton, ActionLink } from "../../../components/workbench/WorkbenchPrimitives.js";
import type { WorkspaceAction } from "../workflowTaskState.js";
import { ProjectLinkPicker } from "./ProjectLinkPicker.js";

interface WorkspaceProjectLinkPanelProps {
  repoName: string;
  repoPath: string;
  projectLinks: ProjectLink[];
  activeProjectLink: ProjectLink | null;
  activeProjectLinkId: string | null;
  adoReady: boolean;
  branchName: string;
  busy: boolean;
  projectLinkSelectionLocked?: boolean;
  onProjectLinkSelect: (id: string) => void;
  runAction: (action: WorkspaceAction) => void;
  showRepositoryContext?: boolean;
  showActions?: boolean;
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
  projectLinkSelectionLocked = false,
  onProjectLinkSelect,
  runAction,
  showRepositoryContext = true,
  showActions = true,
  actionDensity = "full",
}: WorkspaceProjectLinkPanelProps) {
  return (
    <div className="mb-3 border-b border-[rgb(var(--app-border))] pb-3">
      <div className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-start gap-3 pb-3">
        <svg aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M10 13a5 5 0 007.1.1l2-2a5 5 0 00-7.1-7.1L11 5.2M14 11a5 5 0 00-7.1-.1l-2 2a5 5 0 007.1 7.1l1.1-1.1" />
        </svg>
        <div className="min-w-0">
          <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
            <label className="min-w-0 truncate text-sm font-medium leading-5 text-[rgb(var(--app-text))]" htmlFor="workspace-project-link">
              Project Link
            </label>
            <ActionLink href="#/project-links" tone="secondary" className="min-h-0 shrink-0 border-0 bg-transparent px-0 py-0 text-xs font-medium text-[rgb(var(--app-accent-readable))] hover:bg-transparent hover:underline" title="Manage Project Links">
              Manage
            </ActionLink>
          </div>
          {projectLinks.length > 0 ? (
            <ProjectLinkPicker
              projectLinks={projectLinks}
              value={activeProjectLinkId}
              onChange={onProjectLinkSelect}
              disabled={projectLinkSelectionLocked || busy}
            />
          ) : (
            <p className="text-xs text-[rgb(var(--app-text-subtle))]">No Project Link — create one in Manage.</p>
          )}
          {projectLinkSelectionLocked && (
            <p className="mt-1.5 text-xs leading-4 text-[rgb(var(--app-text-subtle))]">
              Finish the current approval before switching Project Link.
            </p>
          )}
        </div>
      </div>
      {showRepositoryContext && (
        <div className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-start gap-3 border-t border-[rgb(var(--app-border))] pt-3">
          <svg aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 19h16M7 16V7h10v9M9 16V9h6v7" />
          </svg>
          <div className="min-w-0">
            <p className="text-xs font-medium leading-4 text-[rgb(var(--app-text-subtle))]">Repository</p>
            <p className="truncate text-sm leading-5 text-[rgb(var(--app-text-muted))]" title={repoPath}>{repoName || repoPath || "No local repository selected"}</p>
          </div>
        </div>
      )}
      {adoReady && showActions && (
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
