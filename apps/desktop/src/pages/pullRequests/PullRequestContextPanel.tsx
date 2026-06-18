import { formatDate } from "./pullRequestViewModel.js";
import type { ContextState } from "./pullRequestTypes.js";

export function PullRequestContextPanel({ state }: { state: ContextState | undefined }): JSX.Element {
  if (!state || state.phase === "idle" || state.phase === "loading") {
    return (
      <div className="mt-4 border-t border-zinc-800/70 pt-4 text-sm text-zinc-600">
        Loading PR context...
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="mt-4 border-t border-zinc-800/70 pt-4 text-sm text-red-400">
        {state.message}
      </div>
    );
  }

  const { pullRequest, threads, changes, builds } = state.data;
  const visibleThreads = threads.filter((thread) => thread.comments.length > 0).slice(0, 5);
  const visibleChanges = changes.changes.slice(0, 8);
  const visibleBuilds = builds.slice(0, 5);

  return (
    <div className="mt-4 space-y-4 border-t border-zinc-800/70 pt-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Description</h4>
            <span className="text-[10px] text-zinc-700">source: {state.data.source}</span>
          </div>
          <p className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md border border-zinc-800/70 bg-zinc-950/40 p-3 text-xs leading-relaxed text-zinc-400">
            {pullRequest.description || "No description."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-500">
            <span className="rounded border border-zinc-800 px-2 py-1">code review: {pullRequest.codeReviewId || "n/a"}</span>
            <span className="rounded border border-zinc-800 px-2 py-1">work items: {pullRequest.workItemRefs.length}</span>
            <span className="rounded border border-zinc-800 px-2 py-1">threads: {threads.length}</span>
            <span className="rounded border border-zinc-800 px-2 py-1">files: {changes.fileCount}</span>
            <span className="rounded border border-zinc-800 px-2 py-1">builds: {builds.length}</span>
          </div>
        </section>

        <section className="min-w-0">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Work Items</h4>
          {pullRequest.workItemRefs.length === 0 ? (
            <p className="text-xs text-zinc-700">No linked work items.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pullRequest.workItemRefs.map((item) => (
                item.url ? (
                  <a key={`${item.id}-${item.url}`} href={item.url} target="_blank" rel="noreferrer"
                    className="rounded border border-zinc-800 px-2 py-1 text-xs text-blue-400 transition hover:border-zinc-700 hover:text-blue-300">
                    #{item.id || "work item"}
                  </a>
                ) : (
                  <span key={item.id} className="rounded border border-zinc-800 px-2 py-1 text-xs text-zinc-500">#{item.id}</span>
                )
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Changed Files</h4>
          <span className="truncate font-mono text-[10px] text-zinc-700">
            iteration {changes.iterationId}{changes.sourceCommit ? ` · ${changes.sourceCommit.slice(0, 8)}` : ""}
          </span>
        </div>
        {visibleChanges.length === 0 ? (
          <p className="text-xs text-zinc-700">No changed files found.</p>
        ) : (
          <div className="divide-y divide-zinc-800/70 rounded-md border border-zinc-800/70">
            {visibleChanges.map((change) => (
              <div key={`${change.changeId}-${change.path}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-2 text-xs">
                <span className="rounded bg-zinc-800/70 px-1.5 py-0.5 text-[10px] text-zinc-500">{String(change.changeType || "change")}</span>
                <span className="min-w-0 truncate font-mono text-zinc-400" title={change.path}>
                  {change.path || change.originalPath || "(unknown path)"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="min-w-0">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Recent Threads</h4>
          {visibleThreads.length === 0 ? (
            <p className="text-xs text-zinc-700">No active comments found.</p>
          ) : (
            <div className="divide-y divide-zinc-800/70 rounded-md border border-zinc-800/70">
              {visibleThreads.map((thread) => {
                const firstComment = thread.comments[0];
                return (
                  <div key={thread.id} className="p-3">
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-zinc-600">
                      <span>Thread #{thread.id}</span>
                      <span>{String(thread.status || "unknown")}</span>
                    </div>
                    <p className="truncate text-xs text-zinc-500">
                      {firstComment?.author.displayName || firstComment?.author.uniqueName || "Unknown"}
                    </p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-zinc-400">
                      {firstComment?.content || "(empty comment)"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="min-w-0">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Build History</h4>
          {visibleBuilds.length === 0 ? (
            <p className="text-xs text-zinc-700">No matching builds found.</p>
          ) : (
            <div className="divide-y divide-zinc-800/70 rounded-md border border-zinc-800/70">
              {visibleBuilds.map((build) => (
                <div key={build.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 p-3 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-300">{build.definitionName || build.buildNumber || `Build ${build.id}`}</p>
                    <p className="mt-1 truncate text-zinc-600">{build.sourceBranch || "unknown branch"} · {formatDate(build.finishTime || build.queueTime)}</p>
                  </div>
                  {build.url ? (
                    <a href={build.url} target="_blank" rel="noreferrer" className="text-blue-400 transition hover:text-blue-300">
                      {build.result || build.status || "open"}
                    </a>
                  ) : (
                    <span className="text-zinc-500">{build.result || build.status || "unknown"}</span>
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
