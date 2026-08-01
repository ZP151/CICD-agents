import type {
  ProjectLink,
  ProjectLinkInput,
} from "../../../api.js";
import type { SuggestionReply } from "../../../components/conversation/SuggestionReplyBar.js";
import { ProjectLinkSetupCard } from "../projectLinkOnboarding/ProjectLinkSetupCard.js";
import { PromptParticleDeck } from "./PromptParticleDeck.js";

interface ChatEmptyStateProps {
  repoPath: string;
  availableProjectLinks: ProjectLink[];
  projectLinksLoading: boolean;
  activeProjectLinkId: string | null;
  createProjectLink: (data: ProjectLinkInput) => Promise<ProjectLink>;
  selectProjectLink: (projectLink: ProjectLink) => void;
  onWelcomeSuggestion: (suggestion: SuggestionReply) => void;
}

export function ChatEmptyState({
  repoPath,
  availableProjectLinks,
  projectLinksLoading,
  activeProjectLinkId,
  createProjectLink,
  selectProjectLink,
  onWelcomeSuggestion,
}: ChatEmptyStateProps) {
  const compactReadyWelcome =
    !projectLinksLoading && availableProjectLinks.length > 0 && Boolean(activeProjectLinkId);
  return (
    <div className={chatEmptyStateShellClass(compactReadyWelcome)}>
      {projectLinksLoading && availableProjectLinks.length === 0 ? (
        <ProjectLinkLoadingHomeState onWelcomeSuggestion={onWelcomeSuggestion} />
      ) : availableProjectLinks.length === 0 ? (
        <ProjectLinkFirstRunState
          repoPath={repoPath}
          createProjectLink={createProjectLink}
          selectProjectLink={selectProjectLink}
          onWelcomeSuggestion={onWelcomeSuggestion}
        />
      ) : !activeProjectLinkId ? (
        <ProjectLinkChooser
          repoPath={repoPath}
          projectLinks={availableProjectLinks}
          createProjectLink={createProjectLink}
          selectProjectLink={selectProjectLink}
        />
      ) : (
        <WelcomePanel onPick={onWelcomeSuggestion} />
      )}
    </div>
  );
}

export function chatEmptyStateShellClass(compactReadyWelcome: boolean): string {
  const base = "flex w-full flex-1 flex-col items-center gap-5 px-4 sm:px-6 lg:px-8";
  return compactReadyWelcome
    ? `${base} justify-start pb-8 pt-[clamp(3rem,14vh,7rem)]`
    : `${base} justify-center py-8`;
}

function ProjectLinkFirstRunState({
  repoPath,
  createProjectLink,
  selectProjectLink,
  onWelcomeSuggestion,
}: {
  repoPath: string;
  createProjectLink: (data: ProjectLinkInput) => Promise<ProjectLink>;
  selectProjectLink: (projectLink: ProjectLink) => void;
  onWelcomeSuggestion: (suggestion: SuggestionReply) => void;
}) {
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-6">
      <WelcomePanel onPick={onWelcomeSuggestion} disabled />
      <details className="w-full max-w-2xl rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] text-left shadow-sm">
        <summary
          role="button"
          aria-label="Create Project Link"
          className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-[rgb(var(--app-text))] transition hover:bg-[rgb(var(--app-surface-raised))]"
        >
          <span className="min-w-0">
            <span className="block">Connect a Project Link to run workspace actions</span>
            <span className="mt-0.5 block text-xs font-normal text-[rgb(var(--app-text-muted))]">
              Map a local repo to Azure DevOps before Git, PR, pipeline, and review workflows.
            </span>
          </span>
          <span className="shrink-0 rounded-md bg-[rgb(var(--app-accent))] px-3 py-1.5 text-xs font-semibold text-white">
            Create
          </span>
        </summary>
        <div className="border-t border-[rgb(var(--app-border))] p-4">
          <ProjectLinkSetupCard
            repoPath={repoPath}
            createProjectLink={createProjectLink}
            onCreated={selectProjectLink}
            compact
          />
        </div>
      </details>
    </div>
  );
}

function ProjectLinkLoadingHomeState({
  onWelcomeSuggestion,
}: {
  onWelcomeSuggestion: (suggestion: SuggestionReply) => void;
}) {
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-3">
      <WelcomePanel onPick={onWelcomeSuggestion} disabled />
      <p
        className="text-xs text-[rgb(var(--app-text-subtle))]"
        role="status"
        aria-live="polite"
      >
        Checking Project Links...
      </p>
    </div>
  );
}

export function ProjectLinkLoadingState(): JSX.Element {
  return (
    <section
      className="flex w-full max-w-2xl flex-col gap-3 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4 text-left shadow-sm"
      aria-label="Loading Project Links"
    >
      <div className="flex items-center gap-3">
        <span className="h-8 w-8 animate-pulse rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[rgb(var(--app-text))]">
            Loading Project Links
          </h2>
          <p className="mt-1 text-xs text-[rgb(var(--app-text-muted))]">
            Checking local workspace mappings before starting a chat.
          </p>
        </div>
      </div>
      <div className="grid gap-2" aria-hidden="true">
        <span className="h-2.5 w-3/4 animate-pulse rounded bg-[rgb(var(--app-bg-muted))]" />
        <span className="h-2.5 w-1/2 animate-pulse rounded bg-[rgb(var(--app-bg-muted))]" />
      </div>
    </section>
  );
}

/**
 * Welcome actions are deliberately ordinary prompts.  A welcome card is a
 * starting point for a conversation, not authority to run a hidden workflow.
 * The planner receives the same text once the user sends it and then exposes
 * any commands as an ordered execution group.
 */
export const welcomeSuggestions: SuggestionReply[] = [
  {
    id: "welcome-understand",
    label: "Understand this project",
    message: "Understand this project",
    action: { kind: "fill_composer" },
  },
  {
    id: "welcome-review",
    label: "Review my changes",
    message: "Review my changes",
    action: { kind: "fill_composer" },
  },
  {
    id: "welcome-branch",
    label: "What's on this branch?",
    message: "What's on this branch?",
    action: { kind: "fill_composer" },
  },
  {
    id: "welcome-pr-insight",
    label: "Analyze PR insight for this repo",
    message: "Analyze PR insight for this repo",
    action: { kind: "fill_composer" },
  },
  {
    id: "welcome-pipelines",
    label: "Open Pipelines workspace",
    message: "Open Pipelines workspace",
    action: { kind: "fill_composer" },
  },
  {
    id: "welcome-stage-commit",
    label: "Stage and commit",
    message: "Stage and commit",
    action: { kind: "fill_composer" },
  },
  {
    id: "welcome-pr-plan",
    label: "Push and create PR",
    message: "Push and create PR",
    action: { kind: "fill_composer" },
  },
];

function WelcomePanel({
  onPick,
  disabled = false,
}: {
  onPick: (suggestion: SuggestionReply) => void;
  disabled?: boolean;
}) {
  return (
    <section
      className="flex w-full max-w-[58rem] flex-col items-center gap-5 rounded-lg border border-transparent px-2 text-center"
      aria-label="New conversation welcome"
    >
      <div className="flex min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))] ring-1 ring-[rgb(var(--app-border))]">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M7.5 18.25 4 20l.75-3.25A7.25 7.25 0 0 1 3 12c0-4.14 4.03-7.5 9-7.5s9 3.36 9 7.5-4.03 7.5-9 7.5a10.5 10.5 0 0 1-4.5-1.25Z" />
          </svg>
        </div>
        <div className="max-w-[42rem] space-y-1.5">
          <h2 className="text-base font-semibold text-[rgb(var(--app-text))]">Start with a focused prompt</h2>
          <p className="text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
            Choose a starting point, then edit the prompt before MergePilot does any work.
          </p>
        </div>
      </div>
      <PromptParticleDeck suggestions={welcomeSuggestions} disabled={disabled} onPick={onPick} />
    </section>
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
    <div className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-5">
      <div className="flex items-center gap-2">
        <svg className="h-4 w-4 shrink-0 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <p className="text-xs font-semibold text-[rgb(var(--app-text-muted))]">Choose a Project Link for this chat</p>
      </div>
      <div className="flex flex-col gap-1.5">
        {projectLinks.map((projectLink) => (
          <button
            key={projectLink.id}
            onClick={() => selectProjectLink(projectLink)}
            className="group flex items-center justify-between rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2.5 text-left transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-bg-muted))]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[rgb(var(--app-text))]">{projectLink.name}</p>
              {projectLink.repoPath && (
                <p className="truncate font-mono text-xs text-[rgb(var(--app-text-subtle))]">{projectLink.repoPath}</p>
              )}
            </div>
            <svg className="ml-2 h-3.5 w-3.5 shrink-0 text-[rgb(var(--app-text-subtle))] transition group-hover:text-[rgb(var(--app-text))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
      <details className="pt-0.5">
        <summary className="cursor-pointer text-xs text-[rgb(var(--app-text-muted))] transition hover:text-[rgb(var(--app-text))]">
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
