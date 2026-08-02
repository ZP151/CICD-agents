import { useId } from "react";
import type { ProjectLinkInput } from "../../api.js";
import { ActionButton, WorkbenchTextInput } from "../../components/workbench/WorkbenchPrimitives.js";
import { BranchSelect, Field } from "./ProjectLinkFormControls.js";

interface ProjectLinkWorkspaceSectionProps {
  form: ProjectLinkInput;
  set: <K extends keyof ProjectLinkInput>(key: K) => (value: ProjectLinkInput[K]) => void;
  branches: string[];
  branchLoading: boolean;
  branchError: boolean;
  repoInputClass: string;
  onReloadBranches: (repoPath: string) => void;
}

export function ProjectLinkWorkspaceSection({
  form,
  set,
  branches,
  branchLoading,
  branchError,
  repoInputClass,
  onReloadBranches,
}: ProjectLinkWorkspaceSectionProps): JSX.Element {
  const repoPathId = useId();

  return (
    <section className="space-y-3.5 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4">
      <div>
        <h3 className="text-sm font-semibold text-[rgb(var(--app-text))]">Workspace</h3>
      </div>
      <Field
        label="Project Link name *"
        value={form.name}
        onChange={set("name")}
        placeholder="my-project"
      />
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label htmlFor={repoPathId} className="text-xs font-medium text-[rgb(var(--app-text-muted))]">
            Repo path
          </label>
          {form.repoPath && (
            <ActionButton
              type="button"
              onClick={() => onReloadBranches(form.repoPath)}
              loading={branchLoading}
              title="Reload branches from this path"
              tone="quiet"
              className="min-h-7 px-1 text-[10px]"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 16 16"
                fill="none"
                className=""
              >
                <path
                  d="M13.5 8A5.5 5.5 0 1 1 8 2.5"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.8"
                />
                <path d="M8 1v4l2.5-2L8 1z" fill="currentColor" />
              </svg>
              {branchLoading
                ? "Loading..."
                : branchError
                  ? "No branches found - retry"
                  : branches.length > 0
                    ? `${branches.length} branches`
                    : "Detect branches"}
            </ActionButton>
          )}
        </div>
        <WorkbenchTextInput
          id={repoPathId}
          value={form.repoPath}
          onChange={(event) => set("repoPath")(event.target.value)}
          placeholder="C:\\projects\\my-app"
          className={`text-sm ${repoInputClass}`}
        />
        {branchError && form.repoPath && (
          <p className="text-[10px] text-[rgb(var(--app-warning))]">
            Could not read branches. Check the path is a valid git repository.
          </p>
        )}
      </div>
      <div className={projectLinkBranchGridClass()}>
        <BranchSelect
          label="Default branch"
          value={form.defaultBranch}
          onChange={set("defaultBranch")}
          branches={branches}
          branchLoading={branchLoading}
        />
        <BranchSelect
          label="Target branch (PRs)"
          value={form.targetBranch}
          onChange={set("targetBranch")}
          branches={branches}
          branchLoading={branchLoading}
        />
      </div>
    </section>
  );
}

export function projectLinkBranchGridClass(): string {
  return "grid min-w-0 gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]";
}
