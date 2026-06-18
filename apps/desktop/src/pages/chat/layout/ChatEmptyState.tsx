import type {
  ProjectLink,
  ProjectLinkInput,
} from "../../../api.js";
import { ProjectLinkSetupCard } from "../projectLinkOnboarding/ProjectLinkSetupCard.js";
import type { WorkspaceAction } from "../workflowTaskState.js";
import { workspaceActionFromWelcomeSuggestion } from "../workspaceActionSuggestions.js";

interface ChatEmptyStateProps {
  repoPath: string;
  availableProjectLinks: ProjectLink[];
  activeProjectLinkId: string | null;
  welcomeSuggestions: string[];
  createProjectLink: (data: ProjectLinkInput) => Promise<ProjectLink>;
  selectProjectLink: (projectLink: ProjectLink) => void;
  queuePrompt: (prompt: string) => void;
  runWorkspaceAction: (action: WorkspaceAction) => void;
}

export function ChatEmptyState({
  repoPath,
  availableProjectLinks,
  activeProjectLinkId,
  welcomeSuggestions,
  createProjectLink,
  selectProjectLink,
  runWorkspaceAction,
  queuePrompt,
}: ChatEmptyStateProps) {
  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-6 px-8">
      {availableProjectLinks.length === 0 ? (
        <ProjectLinkSetupCard
          repoPath={repoPath}
          createProjectLink={createProjectLink}
          onCreated={selectProjectLink}
        />
      ) : !activeProjectLinkId ? (
        <ProjectLinkChooser
          repoPath={repoPath}
          projectLinks={availableProjectLinks}
          createProjectLink={createProjectLink}
          selectProjectLink={selectProjectLink}
        />
      ) : (
        <WelcomeSuggestions
          suggestions={welcomeSuggestions}
          queuePrompt={queuePrompt}
          runWorkspaceAction={runWorkspaceAction}
        />
      )}
    </div>
  );
}

function ProjectLinkChooser({
  repoPath,
  projectLinks,
  createProjectLink,
  selectProjectLink,
}: {
  repoPath: string;
  projectLinks: ProjectLink[];
  createProjectLink: (data: ProjectLinkInput) => Promise<ProjectLink>;
  selectProjectLink: (projectLink: ProjectLink) => void;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 shrink-0 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <p className="text-xs font-semibold text-zinc-400">Choose a Project Link for this chat</p>
      </div>
      <div className="flex flex-col gap-1.5">
        {projectLinks.map((projectLink) => (
          <button
            key={projectLink.id}
            onClick={() => selectProjectLink(projectLink)}
            className="group flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-left transition hover:border-zinc-700 hover:bg-zinc-800/60"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-200">{projectLink.name}</p>
              {projectLink.repoPath && (
                <p className="truncate font-mono text-xs text-zinc-600">{projectLink.repoPath}</p>
              )}
            </div>
            <svg className="ml-2 h-3.5 w-3.5 shrink-0 text-zinc-700 transition group-hover:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
      <details className="pt-0.5">
        <summary className="cursor-pointer text-xs text-zinc-600 transition hover:text-zinc-400">
          + New Project Link
        </summary>
        <div className="mt-3">
          <ProjectLinkSetupCard
            repoPath={repoPath}
            createProjectLink={createProjectLink}
            onCreated={selectProjectLink}
          />
        </div>
      </details>
    </div>
  );
}

function WelcomeSuggestions({
  suggestions,
  queuePrompt,
  runWorkspaceAction,
}: {
  suggestions: string[];
  queuePrompt: (prompt: string) => void;
  runWorkspaceAction: (action: WorkspaceAction) => void;
}) {
  return (
    <>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800/60">
        <svg className="h-6 w-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-base font-medium text-zinc-400">Ask MergePilot anything</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-600">
          "help me review changes and go all the way to PR"<br />
          "what's changed since main?" &nbsp;·&nbsp; "run tests" &nbsp;·&nbsp; "create PR"
        </p>
      </div>
      <div className="flex max-w-md flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => {
              const action = workspaceActionFromWelcomeSuggestion(suggestion);
              if (action) runWorkspaceAction(action);
              else queuePrompt(suggestion);
            }}
            className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </>
  );
}
