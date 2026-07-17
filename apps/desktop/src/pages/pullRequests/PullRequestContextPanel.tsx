import { MarkdownContent } from "../../components/conversation/ConversationPartRenderer.js";
import { formatDate } from "./pullRequestViewModel.js";
import type { ContextState } from "./pullRequestTypes.js";

export function PullRequestContextPanel({ state }: { state: ContextState | undefined }): JSX.Element {
  if (!state || state.phase === "idle" || state.phase === "loading") {
    return (
      <div className="mt-4 border-t border-[rgb(var(--app-border))] pt-4 text-sm text-[rgb(var(--app-text-muted))]">
        Loading PR context...
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="mt-4 border-t border-[rgb(var(--app-border))] pt-4 text-sm text-red-700 dark:text-red-300">
        {state.message}
      </div>
    );
  }

  const { pullRequest, threads, changes, builds } = state.data;
  const visibleThreads = threads.filter((thread) => thread.comments.length > 0).slice(0, 5);
  const visibleChanges = changes.changes.slice(0, 8);
  const visibleBuilds = builds.slice(0, 5);

  return (
    <div className="mt-4 space-y-4 border-t border-[rgb(var(--app-border))] pt-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">Description</h4>
            <span className="text-[10px] text-[rgb(var(--app-text-subtle))]">source: {state.data.source}</span>
          </div>
          <div className="max-h-32 overflow-auto rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3 text-[rgb(var(--app-text-muted))]">
            <MarkdownContent markdown={pullRequest.description || "No description."} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[rgb(var(--app-text-muted))]">
            <span className="rounded border border-[rgb(var(--app-border))] px-2 py-1">code review: {pullRequest.codeReviewId || "n/a"}</span>
            <span className="rounded border border-[rgb(var(--app-border))] px-2 py-1">work items: {pullRequest.workItemRefs.length}</span>
            <span className="rounded border border-[rgb(var(--app-border))] px-2 py-1">threads: {threads.length}</span>
            <span className="rounded border border-[rgb(var(--app-border))] px-2 py-1">files: {changes.fileCount}</span>
            <span className="rounded border border-[rgb(var(--app-border))] px-2 py-1">builds: {builds.length}</span>
          </div>
        </section>

        <section className="min-w-0">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">Work Items</h4>
          {pullRequest.workItemRefs.length === 0 ? (
            <p className="text-xs text-[rgb(var(--app-text-subtle))]">No linked work items.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pullRequest.workItemRefs.map((item) => (
                item.url ? (
                  <a key={`${item.id}-${item.url}`} href={item.url} target="_blank" rel="noreferrer"
                    className="rounded border border-[rgb(var(--app-border))] px-2 py-1 text-xs text-[rgb(var(--app-accent))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))]">
                    #{item.id || "work item"}
                  </a>
                ) : (
                  <span key={item.id} className="rounded border border-[rgb(var(--app-border))] px-2 py-1 text-xs text-[rgb(var(--app-text-muted))]">#{item.id}</span>
                )
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">Changed Files</h4>
          <span className="truncate font-mono text-[10px] text-[rgb(var(--app-text-subtle))]">
            iteration {changes.iterationId}{changes.sourceCommit ? ` · ${changes.sourceCommit.slice(0, 8)}` : ""}
          </span>
        </div>
        {visibleChanges.length === 0 ? (
          <p className="text-xs text-[rgb(var(--app-text-subtle))]">No changed files found.</p>
        ) : (
          <div className="divide-y divide-[rgb(var(--app-border))] rounded-md border border-[rgb(var(--app-border))]">
            {visibleChanges.map((change) => (
              <div key={`${change.changeId}-${change.path}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-2 text-xs">
                <span className="rounded bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">{String(change.changeType || "change")}</span>
                <span className="min-w-0 truncate font-mono text-[rgb(var(--app-text-muted))]" title={change.path}>
                  {change.path || change.originalPath || "(path not available)"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="min-w-0">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">Recent Threads</h4>
          {visibleThreads.length === 0 ? (
            <p className="text-xs text-[rgb(var(--app-text-subtle))]">No active comments found.</p>
          ) : (
            <div className="divide-y divide-[rgb(var(--app-border))] rounded-md border border-[rgb(var(--app-border))]">
              {visibleThreads.map((thread) => {
                const firstComment = thread.comments[0];
                return (
                  <div key={thread.id} className="p-3">
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[rgb(var(--app-text-subtle))]">
                      <span>Thread #{thread.id}</span>
                      <span>{String(thread.status || "not set")}</span>
                    </div>
                    <p className="truncate text-xs text-[rgb(var(--app-text-muted))]">
                      {firstComment?.author.displayName || firstComment?.author.uniqueName || "Not available"}
                    </p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
                      {firstComment?.content || "(empty comment)"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="min-w-0">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">Build History</h4>
          {visibleBuilds.length === 0 ? (
            <p className="text-xs text-[rgb(var(--app-text-subtle))]">No matching builds found.</p>
          ) : (
            <div className="divide-y divide-[rgb(var(--app-border))] rounded-md border border-[rgb(var(--app-border))]">
              {visibleBuilds.map((build) => (
                <div key={build.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[rgb(var(--app-text))]">{build.definitionName || build.buildNumber || `Build ${build.id}`}</p>
                    <p className="mt-1 truncate text-[rgb(var(--app-text-subtle))]">
                      {build.sourceBranch || "Branch not available"} · {formatDate(build.finishTime || build.queueTime)}
                    </p>
                  </div>
                  {build.url ? (
                    <a href={build.url} target="_blank" rel="noreferrer" className="text-[rgb(var(--app-accent))] transition hover:underline">
                      {build.result || build.status || "open"}
                    </a>
                  ) : (
                    <span className="text-[rgb(var(--app-text-muted))]">{build.result || build.status || "Not available"}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
