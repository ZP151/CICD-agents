import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../App.js";
import { CHAT_HANDOFF_KEY } from "../checkpointHandoff.js";
import { resolveActiveProjectLink } from "../projectLinks.js";
import {
  ActionButton,
  InlineNotice,
  WorkbenchPage,
} from "../components/workbench/WorkbenchPrimitives.js";
import { TextInput } from "./settings/SettingsControls.js";
import { pullRequestPlanningPrompt } from "./chat/workspaceActionWorkflow.js";

export interface PullRequestPlanningHandoffInput {
  projectLinkId: string;
  repoPath?: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  workItemId: string;
}

export const DEFAULT_PULL_REQUEST_PLANNING_PREFERENCES: Readonly<{
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
  workItemId: string;
}> = {
  sourceBranch: "",
  targetBranch: "",
  title: "",
  description: "",
  workItemId: "",
};

/**
 * Creating a PR begins with read-only evidence gathering. Branch and title
 * fields are optional preferences, because the first useful step is to inspect
 * the checked-out branch, its upstream, the remote target, and local changes.
 */
export function buildPullRequestPlanningHandoff({
  projectLinkId,
  repoPath,
  sourceBranch,
  targetBranch,
  title,
  description,
  workItemId,
}: PullRequestPlanningHandoffInput): {
  message: string;
  repoPath?: string;
  projectLinkId: string;
  source: "pull-request-planning";
  statusText: "Starting pull request readiness review";
  autoSubmit: true;
} {
  const action = {
    type: "create_pr" as const,
    branch: sourceBranch.trim(),
    targetBranch: targetBranch.trim(),
    title: title.trim(),
    description: description.trim() || undefined,
    draft: false,
  };
  const workItemHint = workItemId.trim() ? ` Link work item #${workItemId.trim()} if it is valid.` : "";
  return {
    message: `${pullRequestPlanningPrompt(action)}${workItemHint}`,
    repoPath,
    projectLinkId,
    source: "pull-request-planning",
    statusText: "Starting pull request readiness review",
    autoSubmit: true,
  };
}

/**
 * Changes begins a PR as a planning conversation. The agent first checks the
 * local and remote branch state, then proposes the eventual write action only
 * after the user has reviewed the evidence and asked to create it.
 */
export default function CreatePullRequest(): JSX.Element {
  const navigate = useNavigate();
  const { projectLinks, projectLinksLoading } = useAppData();
  const projectLink = resolveActiveProjectLink(projectLinks);
  const projectLinkId = projectLink?.id ?? "";
  const [sourceBranch, setSourceBranch] = useState(DEFAULT_PULL_REQUEST_PLANNING_PREFERENCES.sourceBranch);
  const [targetBranch, setTargetBranch] = useState(DEFAULT_PULL_REQUEST_PLANNING_PREFERENCES.targetBranch);
  const [title, setTitle] = useState(DEFAULT_PULL_REQUEST_PLANNING_PREFERENCES.title);
  const [description, setDescription] = useState(DEFAULT_PULL_REQUEST_PLANNING_PREFERENCES.description);
  const [workItemId, setWorkItemId] = useState(DEFAULT_PULL_REQUEST_PLANNING_PREFERENCES.workItemId);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(() => {
    setError(null);
    if (!projectLinkId) {
      setError("Select a Project Link in Context before starting the readiness review.");
      return;
    }
    sessionStorage.setItem(CHAT_HANDOFF_KEY, JSON.stringify(buildPullRequestPlanningHandoff({
      projectLinkId,
      repoPath: projectLink?.repoPath,
      sourceBranch,
      targetBranch,
      title,
      description,
      workItemId,
    })));
    navigate("/chat");
  }, [description, navigate, projectLink?.repoPath, projectLinkId, sourceBranch, targetBranch, title, workItemId]);

  return (
    <WorkbenchPage className="mx-auto w-full max-w-3xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[rgb(var(--app-text))]">Create pull request</h1>
          <p className="mt-1 text-xs text-[rgb(var(--app-text-muted))]">
            Start with a readiness review of the current local and remote branches. Creation is proposed only after you review the evidence.
          </p>
        </div>
        <ActionButton type="button" tone="quiet" onClick={() => navigate("/pulls")}>Back to Changes</ActionButton>
      </div>

      <div className="mt-4 space-y-3.5 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4">
        {projectLinksLoading ? (
          <p className="text-xs text-[rgb(var(--app-text-subtle))]">Loading Project Links...</p>
        ) : projectLink ? (
          <p className="text-xs text-[rgb(var(--app-text-muted))]">
            Project Link:{" "}
            <span className="font-medium text-[rgb(var(--app-text))]">{projectLink.name}</span>
            {" "}(selected in Context)
          </p>
        ) : (
          <p className="text-xs text-[rgb(var(--app-text-subtle))]">Select a Project Link in Context</p>
        )}
        <p className="text-xs leading-5 text-[rgb(var(--app-text-muted))]">
          You can start without filling anything. MergePilot will inspect the checked-out branch, upstream, remote target, local changes, and existing pull requests first. These fields only provide preferences for the review.
        </p>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <TextInput label="Source branch (optional)" placeholder="Use checked-out branch" value={sourceBranch} onChange={setSourceBranch} />
          <TextInput label="Target branch (optional)" placeholder="Use configured target" value={targetBranch} onChange={setTargetBranch} />
        </div>
        <TextInput label="Title (optional)" placeholder="Let MergePilot propose a title" value={title} onChange={setTitle} />
        <label className="block">
          <span className="text-xs font-medium text-[rgb(var(--app-text))]">Description</span>
          <textarea
            aria-label="Description"
            className="mt-1 w-full rounded-md border border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-sm text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <TextInput label="Work item ID (optional)" placeholder="7913" value={workItemId} onChange={setWorkItemId} />

        {error && <InlineNotice tone="danger" title="Could not complete the action">{error}</InlineNotice>}
        <div className="flex justify-end gap-2">
          <ActionButton type="button" tone="primary" onClick={submit} disabled={!projectLinkId}>
            Analyze current workspace
          </ActionButton>
        </div>
      </div>
    </WorkbenchPage>
  );
}
