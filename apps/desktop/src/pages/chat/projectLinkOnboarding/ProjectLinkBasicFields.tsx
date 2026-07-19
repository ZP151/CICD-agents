import type { ProjectLinkInput } from "../../../api.js";
import { BranchSelect } from "./BranchSelect.js";

export interface ProjectLinkBasicFieldsProps {
  branches: string[];
  branchError: boolean;
  branchLoading: boolean;
  form: ProjectLinkInput;
  loadBranches: (repoPath: string) => Promise<void>;
  setField: <K extends keyof ProjectLinkInput>(key: K) => (value: ProjectLinkInput[K]) => void;
}

export function ProjectLinkBasicFields({
  branches,
  branchError,
  branchLoading,
  form,
  loadBranches,
  setField,
}: ProjectLinkBasicFieldsProps) {
  const repoInputClass = `rounded-lg border px-3 py-2 font-mono text-sm text-[rgb(var(--app-text))] outline-none transition ${
    !branchLoading && branches.length > 0
      ? "border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-surface-raised))] focus:border-[rgb(var(--app-success))]"
      : branchError && form.repoPath
        ? "border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-surface-raised))] focus:border-[rgb(var(--app-warning))]"
        : "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] focus:border-[rgb(var(--app-accent))]"
  }`;

  return (
    <>
      <label className="grid gap-1">
        <span className="text-[11px] font-medium text-[rgb(var(--app-text-muted))]">Link name</span>
        <input
          value={form.name}
          onChange={(e) => setField("name")(e.target.value)}
          className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-sm text-[rgb(var(--app-text))] outline-none focus:border-[rgb(var(--app-accent))]"
          placeholder="web-app production"
        />
      </label>
      <label className="grid gap-1">
        <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-[rgb(var(--app-text-muted))]">
          <span>Local repository path</span>
          {form.repoPath && (
            <button
              type="button"
              onClick={() => void loadBranches(form.repoPath)}
              disabled={branchLoading}
              className="text-[10px] text-[rgb(var(--app-text-subtle))] transition hover:text-[rgb(var(--app-text-muted))] disabled:opacity-40"
            >
              {branchLoading ? "Loading..." : branchError ? "Retry branch detection" : branches.length > 0 ? `${branches.length} branches found` : "Detect branches"}
            </button>
          )}
        </span>
        <input
          value={form.repoPath}
          onChange={(e) => setField("repoPath")(e.target.value)}
          className={repoInputClass}
          placeholder="C:\projects\my-app"
        />
        {branchError && form.repoPath && (
          <span className="text-[10px] text-[rgb(var(--app-warning))]">Could not read branches. Check this is a valid git repository.</span>
        )}
      </label>
      <div className={projectLinkOnboardingBranchGridClass()}>
        <BranchSelect
          branches={branches}
          branchLoading={branchLoading}
          label="Default branch"
          value={form.defaultBranch}
          onChange={setField("defaultBranch")}
        />
        <BranchSelect
          branches={branches}
          branchLoading={branchLoading}
          label="PR target branch"
          value={form.targetBranch}
          onChange={setField("targetBranch")}
        />
      </div>
    </>
  );
}

export function projectLinkOnboardingBranchGridClass(): string {
  return "grid min-w-0 gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))]";
}
