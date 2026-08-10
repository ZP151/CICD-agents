import type {
  ProjectLink,
  ProjectLinkInput,
} from "../../../api.js";
import type { SuggestionReply } from "../../../components/conversation/SuggestionReplyBar.js";
import { ProjectLinkSetupCard } from "../projectLinkOnboarding/ProjectLinkSetupCard.js";
import { PromptParticleDeck } from "./PromptParticleDeck.js";
import { ProjectLinkPicker } from "./ProjectLinkPicker.js";

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
  const activeProjectLink = availableProjectLinks.find((projectLink) => projectLink.id === activeProjectLinkId) ?? null;
  const compactReadyWelcome = !projectLinksLoading && Boolean(activeProjectLink);
  return (
    <div className={chatEmptyStateShellClass(compactReadyWelcome)}>
      {projectLinksLoading && availableProjectLinks.length === 0 ? (
        <ProjectLinkLoadingHomeState />
      ) : availableProjectLinks.length === 0 ? (
        <ProjectLinkFirstRunState
          repoPath={repoPath}
          createProjectLink={createProjectLink}
          selectProjectLink={selectProjectLink}
        />
      ) : !activeProjectLinkId ? (
        <ProjectLinkChooser
          repoPath={repoPath}
          projectLinks={availableProjectLinks}
          createProjectLink={createProjectLink}
          selectProjectLink={selectProjectLink}
        />
      ) : (
        <WelcomePanel projectLink={activeProjectLink} onPick={onWelcomeSuggestion} />
      )}
    </div>
  );
}

export function chatEmptyStateShellClass(compactReadyWelcome: boolean): string {
  const base = "flex w-full flex-1 flex-col items-center gap-5 px-4 sm:px-6 lg:px-8";
  return compactReadyWelcome
    ? `${base} justify-center py-8`
    : `${base} justify-center py-8`;
}

function ProjectLinkFirstRunState({
  repoPath,
  createProjectLink,
  selectProjectLink,
}: {
  repoPath: string;
  createProjectLink: (data: ProjectLinkInput) => Promise<ProjectLink>;
  selectProjectLink: (projectLink: ProjectLink) => void;
}) {
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-6">
      <WelcomePanel projectLink={null} onPick={() => undefined} />
      <details className="w-full max-w-xl overflow-hidden rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] text-left shadow-sm">
        <summary
          aria-label="Connect a Project Link"
          className="group flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-[rgb(var(--app-text))] transition-colors duration-[var(--app-motion-fast)] hover:bg-[rgb(var(--app-surface-raised))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--app-focus))]/55"
        >
          <span className="min-w-0">
            <span className="block">Connect a project</span>
            <span className="mt-0.5 block text-xs font-normal text-[rgb(var(--app-text-muted))]">
              Link this repo to Azure DevOps.
            </span>
          </span>
          <svg className="h-4 w-4 shrink-0 text-[rgb(var(--app-text-subtle))] transition-transform duration-[var(--app-motion-fast)] group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
          </svg>
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

function ProjectLinkLoadingHomeState() {
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-3">
      <WelcomePanel projectLink={null} onPick={() => undefined} />
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
export function welcomeSuggestionsForProjectLink(projectLink: ProjectLink | null): SuggestionReply[] {
  if (!projectLink) return [];
  const repository = projectLink.adoRepoName.trim()
    || projectLink.repoPath.replace(/\\/g, "/").split("/").filter(Boolean).pop()
    || projectLink.name;
  const targetBranch = projectLink.targetBranch.trim() || projectLink.defaultBranch.trim() || "the default branch";
  const hasAdoProject = Boolean(projectLink.adoOrgUrl.trim() && projectLink.adoProject.trim() && projectLink.adoRepoName.trim());

  return [
    {
      id: "welcome-contextual-changes",
      label: `Review ${repository} changes`,
      message: `Review the current local changes in ${repository} and explain their impact before proposing any write action.`,
      action: { kind: "fill_composer" },
    },
    {
      id: "welcome-contextual-branch",
      label: `Check ${targetBranch} readiness`,
      message: `Compare the current branch with ${targetBranch}, including local status, tracking, and remote divergence.`,
      action: { kind: "fill_composer" },
    },
    {
      id: "welcome-contextual-entry-points",
      label: `Map ${repository} entry points`,
      message: `Map the main entry points and request flow in ${repository}, then explain where a safe change should start.`,
      action: { kind: "fill_composer" },
    },
    {
      id: "welcome-contextual-tests",
      label: `Inspect ${repository} test surface`,
      message: `Inspect the available test commands and relevant test coverage in ${repository}; summarize the fastest trustworthy validation path.`,
      action: { kind: "fill_composer" },
    },
    {
      id: "welcome-contextual-next-step",
      label: `Plan ${repository} delivery step`,
      message: `Review the current local delivery context for ${repository} and propose the smallest useful next step, without making changes.`,
      action: { kind: "fill_composer" },
    },
    ...(hasAdoProject ? [{
      id: "welcome-contextual-prs",
      label: `Review ${projectLink.adoProject} pull requests`,
      message: `Review active pull requests in ${projectLink.adoProject} for ${repository} and summarize the next review decision.`,
      action: { kind: "fill_composer" as const },
    }, {
      id: "welcome-contextual-work",
      label: `Review ${projectLink.adoProject} work`,
      message: `Review the assigned Azure Boards work for ${projectLink.adoProject} and connect each item to the current ${repository} delivery context.`,
      action: { kind: "fill_composer" as const },
    }, {
      id: "welcome-contextual-delivery",
      label: `Check ${projectLink.adoProject} delivery`,
      message: `Inspect the latest delivery signals for ${projectLink.adoProject} and ${repository}; identify any release blocker before proposing action.`,
      action: { kind: "fill_composer" as const },
    }] : []),
  ];
}

function WelcomePanel({
  projectLink,
  onPick,
}: {
  projectLink: ProjectLink | null;
  onPick: (suggestion: SuggestionReply) => void;
}) {
  const suggestions = welcomeSuggestionsForProjectLink(projectLink);
  return (
    <section
      className="flex w-full max-w-[58rem] flex-col items-center px-2 text-center"
      aria-label="New conversation welcome"
    >
      <div className="mb-4 flex max-w-xl flex-col items-center">
        <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[rgb(var(--app-accent))]/30 bg-[rgb(var(--app-surface))] text-[rgb(var(--app-accent-readable))]" aria-hidden="true">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m6.5-8.5A3.5 3.5 0 0 0 16 2H8a3.5 3.5 0 0 0-3.5 3.5v7A3.5 3.5 0 0 0 8 16h1.4l2.4 2.4a.85.85 0 0 0 1.2 0l2.4-2.4H16a3.5 3.5 0 0 0 3.5-3.5v-7Z" />
          </svg>
        </span>
        <h2 className="text-base font-semibold text-[rgb(var(--app-text))]">Start with a focused prompt</h2>
        <p className="mt-1.5 text-xs leading-5 text-[rgb(var(--app-text-muted))]">
          {projectLink
            ? `Suggestions use the selected ${projectLink.name} context. Edit the prompt before MergePilot does any work.`
            : "Connect or select a Project Link, then describe the outcome you need."}
        </p>
      </div>
      {suggestions.length > 0 && <PromptParticleDeck suggestions={suggestions} onPick={onPick} />}
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
      <ProjectLinkPicker
        projectLinks={projectLinks}
        value={null}
        allowEmpty={false}
        onChange={(id) => {
          const projectLink = projectLinks.find((candidate) => candidate.id === id);
          if (projectLink) selectProjectLink(projectLink);
        }}
      />
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
