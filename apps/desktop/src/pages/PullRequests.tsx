import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../App.js";
import {
  CHAT_HANDOFF_KEY,
  PULL_REQUESTS_HANDOFF_KEY,
  buildPrInsightChatHandoffDraft,
  type PullRequestsHandoffDraft,
} from "../checkpointHandoff.js";
import {
  listPrInsightArtifacts,
  prInsightArtifactFreshness,
  savePrInsightPreviewArtifact,
  savePrReviewRunArtifact,
  type PrInsightArtifact,
} from "../prInsightArtifacts.js";
import {
  fetchProfilePullRequestInsightPreview,
  fetchProfilePrInsightArtifacts,
  fetchProfilePullRequestContext,
  fetchProfilePullRequests,
  recordProfileReviewHistory,
  recordProfileReviewOperation,
  runProfileReviewRun,
  saveProfilePrInsightArtifact,
  type PullRequestInsightPreview,
  type PullRequestContext,
  type PullRequestSummary,
  type ReviewRunResult,
} from "../api.js";
import { saveFindingsLocal } from "../reviewHistoryLocal.js";

function formatDate(value: string): string {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function readiness(pr: PullRequestSummary): { label: string; tone: string } {
  if (pr.isDraft) return { label: "Draft", tone: "text-zinc-400 bg-zinc-800/70 ring-zinc-700" };
  if (pr.voteSummary.rejected > 0) return { label: "Changes requested", tone: "text-red-400 bg-red-950/30 ring-red-900/60" };
  if (pr.voteSummary.approved > 0) return { label: "Reviewed", tone: "text-emerald-400 bg-emerald-950/30 ring-emerald-900/60" };
  return { label: "Needs review", tone: "text-yellow-400 bg-yellow-950/30 ring-yellow-900/60" };
}

function pipelineReadiness(pr: PullRequestSummary): { label: string; tone: string } {
  const run = pr.pipelineRun;
  if (!run) return { label: "No run", tone: "text-zinc-500" };
  if (run.state && run.state !== "completed") return { label: run.state, tone: "text-blue-400" };
  if (run.result === "succeeded") return { label: "Succeeded", tone: "text-emerald-400" };
  if (run.result === "failed" || run.result === "canceled") return { label: run.result, tone: "text-red-400" };
  return { label: run.result || run.state || "Unknown", tone: "text-zinc-400" };
}

function insightReadinessTone(value: PullRequestInsightPreview["readiness"]): { label: string; tone: string } {
  if (value === "blocked") return { label: "Blocked", tone: "border-red-900/60 bg-red-950/30 text-red-300" };
  if (value === "needs_attention") return { label: "Needs attention", tone: "border-yellow-900/60 bg-yellow-950/30 text-yellow-300" };
  return { label: "Ready", tone: "border-emerald-900/60 bg-emerald-950/30 text-emerald-300" };
}

function previewOperationDetails(result: PullRequestInsightPreview): string {
  return [
    `readiness=${result.readiness ?? "unknown"}`,
    `risks=${result.risks.length}`,
    `files=${result.signals.fileCount}`,
    `threads=${result.signals.threadCount}`,
    `failedBuilds=${result.signals.failedBuildCount}`,
    `tokens=${result.tokensIn}/${result.tokensOut}`,
    `source=${result.source}`,
  ].join("; ");
}

function reviewRunOperationDetails(result: ReviewRunResult): string {
  return [
    `queue=${result.decisionQueue}`,
    `risk=${result.decisionRiskLevel}`,
    `confidence=${result.contextConfidence ?? "unknown"}`,
    `findings=${result.findingCount}`,
    `discarded=${result.discardedFindings?.length ?? 0}`,
    `tokens=${result.tokensIn}/${result.tokensOut}`,
  ].join("; ");
}

function mergeInsightArtifacts(items: PrInsightArtifact[]): PrInsightArtifact[] {
  const byId = new Map<string, PrInsightArtifact>();
  for (const item of items.sort((a, b) => Date.parse(b.at || "0") - Date.parse(a.at || "0"))) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.at || "0") - Date.parse(a.at || "0"));
}

type ContextState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "loaded"; data: PullRequestContext }
  | { phase: "error"; message: string };

function PullRequestContextPanel({ state }: { state: ContextState | undefined }): JSX.Element {
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

export default function PullRequests(): JSX.Element {
  const navigate = useNavigate();
  const { profiles, profilesLoading } = useAppData();
  const [profileId, setProfileId] = useState("");
  const [status, setStatus] = useState("active");
  const [prs, setPrs] = useState<PullRequestSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPrId, setExpandedPrId] = useState<number | null>(null);
  const [highlightedPrId, setHighlightedPrId] = useState<number | null>(null);
  const [contexts, setContexts] = useState<Record<number, ContextState>>({});
  type QueueState =
    | { phase: "idle" }
    | { phase: "watching" }
    | { phase: "reviewing" }
    | { phase: "done"; result: ReviewRunResult }
    | { phase: "error"; message: string };

  type PreviewState =
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "done"; result: PullRequestInsightPreview }
    | { phase: "error"; message: string };

  const [queueing, setQueueing] = useState<Record<number, QueueState>>({});
  const [previews, setPreviews] = useState<Record<number, PreviewState>>({});
  const [insightArtifacts, setInsightArtifacts] = useState<PrInsightArtifact[]>([]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === profileId) ?? null,
    [profiles, profileId],
  );

  const handleQueueForReview = useCallback(async (pr: PullRequestSummary) => {
    if (!profileId) return;

    // Step 1 — write a "watching" placeholder so the PR appears in the Review Queue immediately
    setQueueing((prev) => ({ ...prev, [pr.id]: { phase: "watching" } }));
    try {
      await recordProfileReviewHistory(profileId, {
        pullRequestId: pr.id,
        lastIterationId: 0,
        findingCount: 0,
        lastRunAt: new Date().toISOString(),
        sourceCommit: "",
        decisionQueue: "watching",
        decisionRiskLevel: "medium",
        decisionReason: `Preparing AI insight for ${pr.sourceBranch}`,
        decisionReasonCodes: [],
        contextConfidence: "",
        autoApprovedAt: "",
        autoApprovalActor: "",
        discardedFindingCount: 0,
        hunkCoverageFiles: 0,
        wholeFileFallbackFiles: 0,
        changedHunkLines: 0,
        manualDisposition: "",
        manualDispositionAt: "",
        manualDispositionActor: "",
        manualDispositionNote: "",
        manualDispositionEvents: [],
        manualDispositionWriteBackAttempted: false,
        manualDispositionWriteBackOk: false,
        manualDispositionWriteBackError: "",
        manualDispositionWriteBackAt: "",
        manualDispositionWriteBackThreadId: "",
        manualDispositionWriteBackUrl: "",
        manualDispositionWriteBackEvents: [],
      });
    } catch {
      // Non-fatal — proceed to the actual review even if the placeholder write failed
    }

    // Step 2 — run the Review Agent immediately
    setQueueing((prev) => ({ ...prev, [pr.id]: { phase: "reviewing" } }));
    try {
      const result = await runProfileReviewRun(profileId, pr.id, pr.targetBranch);
      // Persist the real result into browser localStorage so Review Queue reflects it immediately
      await recordProfileReviewHistory(profileId, {
        pullRequestId:     result.pullRequestId,
        lastIterationId:   result.iterationId,
        findingCount:      result.findingCount,
        lastRunAt:         result.lastRunAt,
        sourceCommit:      "",
        decisionQueue:     result.decisionQueue,
        decisionRiskLevel: result.decisionRiskLevel,
        decisionReason:    result.decisionReason,
        decisionReasonCodes: result.decisionReasonCodes ?? [],
        contextConfidence: result.contextConfidence ?? "",
        autoApprovedAt:    result.decisionQueue === "auto_approved" ? result.lastRunAt : "",
        autoApprovalActor: result.decisionQueue === "auto_approved" ? result.autoApprovalActor : "",
        discardedFindingCount: result.discardedFindings?.length ?? 0,
        hunkCoverageFiles: result.coverage?.filesWithHunks ?? 0,
        wholeFileFallbackFiles: result.coverage?.wholeFileOnlyFiles ?? 0,
        changedHunkLines: result.coverage?.changedHunkLines ?? 0,
        manualDisposition: "",
        manualDispositionAt: "",
        manualDispositionActor: "",
        manualDispositionNote: "",
        manualDispositionEvents: [],
        manualDispositionWriteBackAttempted: false,
        manualDispositionWriteBackOk: false,
        manualDispositionWriteBackError: "",
        manualDispositionWriteBackAt: "",
        manualDispositionWriteBackThreadId: "",
        manualDispositionWriteBackUrl: "",
        manualDispositionWriteBackEvents: [],
      });
      if (result.findings && result.findings.length > 0) {
        saveFindingsLocal(result.repository, result.pullRequestId, result.findings);
      }
      const artifact = savePrReviewRunArtifact({
        profileId,
        repository: result.repository,
        pullRequestId: result.pullRequestId,
        title: pr.title,
        result,
      });
      setInsightArtifacts(listPrInsightArtifacts(profileId));
      void saveProfilePrInsightArtifact(profileId, artifact);
      void recordProfileReviewOperation(profileId, {
        kind: "review_run",
        repository: result.repository,
        pullRequestId: result.pullRequestId,
        label: `#${result.pullRequestId} · ${pr.title}`,
        ok: true,
        details: reviewRunOperationDetails(result),
      });
      setQueueing((prev) => ({ ...prev, [pr.id]: { phase: "done", result } }));
    } catch (err) {
      void recordProfileReviewOperation(profileId, {
        kind: "review_run",
        repository: pr.repository,
        pullRequestId: pr.id,
        label: `#${pr.id} · ${pr.title}`,
        ok: false,
        details: err instanceof Error ? err.message : String(err),
      });
      setQueueing((prev) => ({
        ...prev,
        [pr.id]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, [profileId]);

  const handlePreviewInsight = useCallback(async (pr: PullRequestSummary) => {
    if (!profileId) return;
    setPreviews((prev) => ({ ...prev, [pr.id]: { phase: "loading" } }));
    try {
      const result = await fetchProfilePullRequestInsightPreview(profileId, pr.id);
      const artifact = savePrInsightPreviewArtifact({
        profileId,
        repository: pr.repository,
        pullRequestId: pr.id,
        title: pr.title,
        result,
      });
      setInsightArtifacts(listPrInsightArtifacts(profileId));
      void saveProfilePrInsightArtifact(profileId, artifact);
      void recordProfileReviewOperation(profileId, {
        kind: "insight_preview",
        repository: pr.repository,
        pullRequestId: pr.id,
        label: `#${pr.id} · ${pr.title}`,
        ok: true,
        details: previewOperationDetails(result),
      });
      setPreviews((prev) => ({ ...prev, [pr.id]: { phase: "done", result } }));
    } catch (err) {
      void recordProfileReviewOperation(profileId, {
        kind: "insight_preview",
        repository: pr.repository,
        pullRequestId: pr.id,
        label: `#${pr.id} · ${pr.title}`,
        ok: false,
        details: err instanceof Error ? err.message : String(err),
      });
      setPreviews((prev) => ({
        ...prev,
        [pr.id]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, [profileId]);

  const openSavedInsightInChat = useCallback((pr: PullRequestSummary, artifact: PrInsightArtifact) => {
    const draft = buildPrInsightChatHandoffDraft({
      pullRequestId: pr.id,
      title: pr.title,
      repository: pr.repository,
      repoPath: selectedProfile?.repoPath || ".",
      profileId,
      kind: artifact.kind,
    });
    sessionStorage.setItem(CHAT_HANDOFF_KEY, JSON.stringify(draft));
    navigate("/chat");
  }, [navigate, profileId, selectedProfile]);

  const toggleContext = useCallback(async (pr: PullRequestSummary) => {
    if (!profileId) return;
    const nextExpanded = expandedPrId === pr.id ? null : pr.id;
    setExpandedPrId(nextExpanded);
    if (nextExpanded === null) return;

    const existing = contexts[pr.id];
    if (existing?.phase === "loaded" || existing?.phase === "loading") return;

    setContexts((prev) => ({ ...prev, [pr.id]: { phase: "loading" } }));
    try {
      const data = await fetchProfilePullRequestContext(profileId, pr.id);
      setContexts((prev) => ({ ...prev, [pr.id]: { phase: "loaded", data } }));
    } catch (err) {
      setContexts((prev) => ({
        ...prev,
        [pr.id]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, [contexts, expandedPrId, profileId]);

  useEffect(() => {
    if (!profileId && profiles[0]) setProfileId(profiles[0].id);
  }, [profileId, profiles]);

  useEffect(() => {
    const raw = sessionStorage.getItem(PULL_REQUESTS_HANDOFF_KEY);
    if (!raw) return;
    let draft: PullRequestsHandoffDraft | null = null;
    try {
      draft = JSON.parse(raw) as PullRequestsHandoffDraft;
    } catch {
      sessionStorage.removeItem(PULL_REQUESTS_HANDOFF_KEY);
      return;
    }
    if (draft.kind !== "pr" || !draft.profileId || !draft.pullRequestId) {
      sessionStorage.removeItem(PULL_REQUESTS_HANDOFF_KEY);
      return;
    }
    if (profileId !== draft.profileId) setProfileId(draft.profileId);
    if (status !== "all") setStatus("all");
  }, [profileId, status]);

  useEffect(() => {
    if (!profileId) {
      setInsightArtifacts([]);
      return;
    }
    const local = listPrInsightArtifacts(profileId);
    setInsightArtifacts(local);
    let cancelled = false;
    void fetchProfilePrInsightArtifacts(profileId)
      .then((remote) => {
        if (cancelled) return;
        setInsightArtifacts(mergeInsightArtifacts([...(remote as PrInsightArtifact[]), ...local]));
      })
      .catch(() => {
        /* browser-local artifacts are enough when daemon is unavailable */
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    setError(null);
    try {
      setPrs(await fetchProfilePullRequests(profileId, status));
    } catch (err) {
      setPrs([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [profileId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const raw = sessionStorage.getItem(PULL_REQUESTS_HANDOFF_KEY);
    if (!raw || !profileId) return;
    let draft: PullRequestsHandoffDraft | null = null;
    try {
      draft = JSON.parse(raw) as PullRequestsHandoffDraft;
    } catch {
      sessionStorage.removeItem(PULL_REQUESTS_HANDOFF_KEY);
      return;
    }
    if (draft.kind !== "pr" || draft.profileId !== profileId) return;
    const target = prs.find((pr) => (
      pr.id === draft.pullRequestId &&
      (!draft.repository || pr.repository === draft.repository)
    ));
    if (!target) return;

    setExpandedPrId(target.id);
    setHighlightedPrId(target.id);
    const currentContext = contexts[target.id];
    if (!currentContext || currentContext.phase === "idle") {
      setContexts((prev) => ({ ...prev, [target.id]: { phase: "loading" } }));
      void fetchProfilePullRequestContext(profileId, target.id)
        .then((data) => setContexts((prev) => ({ ...prev, [target.id]: { phase: "loaded", data } })))
        .catch((err: unknown) => setContexts((prev) => ({
          ...prev,
          [target.id]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
        })));
    }
    sessionStorage.removeItem(PULL_REQUESTS_HANDOFF_KEY);
  }, [contexts, profileId, prs]);

  useEffect(() => {
    if (!highlightedPrId) return;
    const timer = window.setTimeout(() => {
      setHighlightedPrId((current) => current === highlightedPrId ? null : current);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [highlightedPrId]);

  return (
    <div className="flex min-h-full w-full flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800/70 pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100">Pull Requests</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Developer workspace for active PRs. This view starts with Azure DevOps PR state;
            pipeline readiness is matched from the selected Project Link when a pipeline is configured.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 outline-none"
            value={profileId}
            disabled={profilesLoading || profiles.length === 0}
            onChange={(e) => setProfileId(e.target.value)}
          >
            {profiles.length === 0 && <option value="">No Project Links</option>}
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
          <select
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 outline-none"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="abandoned">Abandoned</option>
            <option value="all">All</option>
          </select>
          <button
            onClick={() => void load()}
            className="rounded-md border border-zinc-800 px-3 py-1.5 text-sm text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300"
          >
            Refresh
          </button>
        </div>
      </header>

      {selectedProfile && (
        <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
          <span className="rounded-full border border-zinc-800 px-2 py-1">{selectedProfile.adoProject || "No project"}</span>
          <span className="rounded-full border border-zinc-800 px-2 py-1">{selectedProfile.adoRepoName || "No repo"}</span>
          <span className="rounded-full border border-zinc-800 px-2 py-1">pipeline: {selectedProfile.adoPipelineName || selectedProfile.adoPipelineId || "not configured"}</span>
          <span className="rounded-full border border-zinc-800 px-2 py-1">target: {selectedProfile.targetBranch || "main"}</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-zinc-600">Loading pull requests...</p>}

      {!loading && !error && prs.length === 0 && (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-8 text-center">
          <div>
            <p className="text-sm font-medium text-zinc-400">No pull requests found</p>
            <p className="mt-1 text-sm text-zinc-600">Try another Project Link or status filter.</p>
          </div>
        </div>
      )}

      {prs.length > 0 && (
        <div className="grid gap-3">
          {prs.map((pr) => {
            const state = readiness(pr);
            const pipeline = pipelineReadiness(pr);
            const qState = queueing[pr.id] ?? { phase: "idle" };
            const previewState = previews[pr.id] ?? { phase: "idle" };
            const insightTone = previewState.phase === "done"
              ? insightReadinessTone(previewState.result.readiness)
              : null;
            const reviewTone = qState.phase === "done"
              ? insightReadinessTone(qState.result.readiness)
              : null;
            const storedInsightHistory = insightArtifacts.filter((artifact) => (
              artifact.repository === pr.repository && artifact.pullRequestId === pr.id
            ));
            const storedInsight = storedInsightHistory[0] ?? null;
            const previousStoredInsights = storedInsightHistory.slice(1, 4);
            const storedInsightTone = storedInsight?.readiness
              ? insightReadinessTone(storedInsight.readiness)
              : null;
            const contextState = contexts[pr.id];
            const isExpanded = expandedPrId === pr.id;
            const currentPrBaseline = contextState?.phase === "loaded"
              ? {
                  iterationId: contextState.data.changes.iterationId,
                  sourceCommit: contextState.data.changes.sourceCommit,
                }
              : null;
            const storedInsightFreshness = storedInsight
              ? prInsightArtifactFreshness(storedInsight, currentPrBaseline)
              : null;

            // Derive button label, style, and disabled state from qState
            const isRunning = qState.phase === "watching" || qState.phase === "reviewing";
            const isDone    = qState.phase === "done";
            const isError   = qState.phase === "error";

            const decisionLabel = isDone
              ? qState.result.decisionQueue === "auto_approved"   ? "Auto-approved"
              : qState.result.decisionQueue === "needs_human_review" ? "Needs review"
              : qState.result.decisionQueue === "blocked"         ? "Blocked"
              : "Reviewed"
              : "";

            const decisionTone = isDone
              ? qState.result.decisionQueue === "auto_approved"      ? "border-emerald-800/60 bg-emerald-950/20 text-emerald-400"
              : qState.result.decisionQueue === "needs_human_review" ? "border-yellow-800/60 bg-yellow-950/20 text-yellow-400"
              : qState.result.decisionQueue === "blocked"            ? "border-red-800/60 bg-red-950/20 text-red-400"
              : "border-blue-800/60 bg-blue-950/20 text-blue-400"
              : "";

            const buttonClass = `rounded-md border px-3 py-1.5 text-xs transition disabled:opacity-60 ${
              isDone   ? `${decisionTone} cursor-default`
              : isError ? "border-red-800/60 text-red-400 hover:border-red-700 hover:text-red-300"
              : isRunning ? "border-zinc-700 text-zinc-500 cursor-wait"
              : "border-zinc-700 text-zinc-400 hover:border-blue-700 hover:text-blue-300"
            }`;

            return (
              <article
                key={pr.id}
                className={`rounded-lg border p-4 transition ${
                  highlightedPrId === pr.id
                    ? "border-blue-700/70 bg-blue-950/20 shadow-[0_0_0_1px_rgba(29,78,216,0.25)]"
                    : "border-zinc-800/70 bg-zinc-900/30"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-blue-400">#{pr.id}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${state.tone}`}>
                        {state.label}
                      </span>
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">{pr.status}</span>
                    </div>
                    <h3 className="truncate text-sm font-semibold text-zinc-100">{pr.title || "(untitled)"}</h3>
                    <p className="mt-1 truncate font-mono text-xs text-zinc-600">
                      {pr.sourceBranch} {"->"} {pr.targetBranch}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void toggleContext(pr)}
                        className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
                      >
                        {isExpanded ? "Hide details" : contextState?.phase === "loaded" ? "Show details" : "Load details"}
                      </button>
                      <button
                        onClick={() => void handlePreviewInsight(pr)}
                        disabled={previewState.phase === "loading"}
                        className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 disabled:cursor-wait disabled:opacity-60"
                      >
                        {previewState.phase === "loading" ? "Previewing..." : "Preview Insight"}
                      </button>
                      <button
                        onClick={() => void handleQueueForReview(pr)}
                        disabled={isRunning || isDone}
                        className={buttonClass}
                      >
                        {qState.phase === "watching"  ? "Preparing…"
                        : qState.phase === "reviewing" ? "Analyzing…"
                        : isDone                       ? decisionLabel
                        : isError                      ? "Retry"
                        : "Run AI Insight"}
                      </button>
                      {pr.url && (
                        <a
                          href={pr.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
                        >
                          Open in ADO
                        </a>
                      )}
                    </div>
                    {/* Inline review outcome / error */}
                    {isDone && (
                      <p className="max-w-xs text-right text-[10px] leading-relaxed text-zinc-500 truncate" title={qState.result.decisionReason}>
                        {qState.result.findingCount} finding{qState.result.findingCount === 1 ? "" : "s"} · {qState.result.decisionReason}
                      </p>
                    )}
                    {isError && (
                      <p className="max-w-xs text-right text-[10px] text-red-500 truncate" title={qState.message}>
                        {qState.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-2 text-xs text-zinc-500 sm:grid-cols-4">
                  <div>
                    <p className="text-zinc-700">Author</p>
                    <p className="mt-1 truncate text-zinc-400">{pr.createdBy || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-zinc-700">Created</p>
                    <p className="mt-1 truncate text-zinc-400">{formatDate(pr.creationDate) || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-zinc-700">Reviewers</p>
                    <p className="mt-1 text-zinc-400">
                      {pr.voteSummary.approved} approved / {pr.reviewerCount} total
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-700">Pipeline</p>
                    {pr.pipelineRun?.url ? (
                      <a
                        href={pr.pipelineRun.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`mt-1 block truncate transition hover:text-zinc-200 ${pipeline.tone}`}
                      >
                        {pipeline.label} {pr.pipelineRun.name ? `(${pr.pipelineRun.name})` : ""}
                      </a>
                    ) : (
                      <p className={`mt-1 truncate ${pipeline.tone}`}>{pipeline.label}</p>
                    )}
                  </div>
                </div>
                {storedInsight && previewState.phase !== "done" && !isDone && (
                  <div className="mt-4 space-y-2 rounded-md border border-zinc-800/70 bg-zinc-950/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Last AI Insight</h4>
                        {storedInsightTone && (
                          <span className={`rounded border px-2 py-0.5 text-[10px] ${storedInsightTone.tone}`}>
                            {storedInsightTone.label}
                          </span>
                        )}
                        <span className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                          {storedInsight.kind === "review_run" ? "full review" : "preview"}
                        </span>
                        {storedInsightHistory.length > 1 && (
                          <span className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                            {storedInsightHistory.length} saved runs
                          </span>
                        )}
                        {storedInsightFreshness && (
                          <span className={`rounded border px-2 py-0.5 text-[10px] ${
                            storedInsightFreshness.state === "stale"
                              ? "border-yellow-900/50 text-yellow-300/80"
                              : storedInsightFreshness.state === "fresh"
                                ? "border-emerald-900/50 text-emerald-300/80"
                                : "border-zinc-800 text-zinc-500"
                          }`}
                          >
                            {storedInsightFreshness.state}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-700">
                        {formatDate(storedInsight.at)} · tokens {storedInsight.tokensIn}/{storedInsight.tokensOut}
                      </span>
                    </div>
                    <button
                      onClick={() => openSavedInsightInChat(pr, storedInsight)}
                      className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
                    >
                      Ask in Chat
                    </button>
                    {storedInsightFreshness?.state === "stale" && (
                      <button
                        onClick={() => storedInsight.kind === "review_run"
                          ? void handleQueueForReview(pr)
                          : void handlePreviewInsight(pr)}
                        disabled={isRunning || previewState.phase === "loading"}
                        className="rounded-md border border-yellow-900/50 px-2 py-1 text-xs text-yellow-300/80 transition hover:border-yellow-700 hover:text-yellow-200 disabled:cursor-wait disabled:opacity-60"
                      >
                        Refresh insight
                      </button>
                    )}
                    <p className="max-h-16 overflow-hidden whitespace-pre-wrap text-xs leading-relaxed text-zinc-400">
                      {storedInsight.summary || "No summary stored."}
                    </p>
                    {storedInsightFreshness && storedInsightFreshness.state !== "fresh" && (
                      <p className="text-xs text-zinc-500">{storedInsightFreshness.label}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {storedInsight.decisionQueue && (
                        <span className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                          {storedInsight.decisionQueue.replace(/_/g, " ")}
                        </span>
                      )}
                      {typeof storedInsight.findingCount === "number" && (
                        <span className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                          {storedInsight.findingCount} finding{storedInsight.findingCount === 1 ? "" : "s"}
                        </span>
                      )}
                      {storedInsight.risks.slice(0, 5).map((risk) => (
                        <span key={`stored-risk-${storedInsight.id}-${risk}`} className="rounded border border-yellow-900/50 px-2 py-0.5 text-[10px] text-yellow-300/80">
                          {risk}
                        </span>
                      ))}
                    </div>
                    {previousStoredInsights.length > 0 && (
                      <div className="space-y-1.5 border-t border-zinc-800/70 pt-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Previous saved runs</p>
                        {previousStoredInsights.map((artifact) => (
                          <div key={artifact.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800/70 px-2 py-1.5">
                            <div className="min-w-0">
                              <p className="truncate text-[11px] text-zinc-500">
                                {artifact.kind === "review_run" ? "full review" : "preview"} · {formatDate(artifact.at)}
                              </p>
                              <p className="max-w-xl truncate text-[11px] text-zinc-600" title={artifact.summary}>
                                {artifact.summary || "No summary stored."}
                              </p>
                            </div>
                            <button
                              onClick={() => openSavedInsightInChat(pr, artifact)}
                              className="shrink-0 rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300"
                            >
                              Ask in Chat
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {previewState.phase === "done" && (
                  <div className="mt-4 space-y-2 rounded-md border border-blue-900/40 bg-blue-950/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-300/80">Insight Preview</h4>
                        {insightTone && (
                          <span className={`rounded border px-2 py-0.5 text-[10px] ${insightTone.tone}`}>
                            {insightTone.label}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-blue-300/50">
                        {previewState.result.source} · files {previewState.result.signals.fileCount} · threads {previewState.result.signals.threadCount}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-400">
                      {previewState.result.summary}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(previewState.result.categories?.blocking ?? []).map((risk) => (
                        <span key={`blocking-${risk}`} className="rounded border border-red-900/50 px-2 py-0.5 text-[10px] text-red-300/80">
                          {risk}
                        </span>
                      ))}
                      {(previewState.result.categories?.warnings ?? previewState.result.risks).map((risk) => (
                        <span key={`warning-${risk}`} className="rounded border border-yellow-900/50 px-2 py-0.5 text-[10px] text-yellow-300/80">
                          {risk}
                        </span>
                      ))}
                      {(previewState.result.categories?.info ?? []).map((risk) => (
                        <span key={`info-${risk}`} className="rounded border border-blue-900/50 px-2 py-0.5 text-[10px] text-blue-300/70">
                          {risk}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {previewState.phase === "error" && (
                  <p className="mt-3 rounded-md border border-red-900/40 bg-red-950/20 px-3 py-2 text-xs text-red-300">
                    {previewState.message}
                  </p>
                )}
                {isDone && (
                  <div className="mt-4 space-y-3 rounded-md border border-zinc-800/70 bg-zinc-950/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">AI Insight</h4>
                        {reviewTone && (
                          <span className={`rounded border px-2 py-0.5 text-[10px] ${reviewTone.tone}`}>
                            {reviewTone.label}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-700">
                        tokens: {qState.result.tokensIn}/{qState.result.tokensOut}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-400">
                      {qState.result.summary || "No summary returned."}
                    </p>
                    {(qState.result.contextConfidence || (qState.result.decisionReasonCodes?.length ?? 0) > 0) && (
                      <div className="flex flex-wrap gap-1.5">
                        {qState.result.contextConfidence && (
                          <span className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                            context confidence {qState.result.contextConfidence}
                          </span>
                        )}
                        {qState.result.decisionReasonCodes?.slice(0, 5).map((code) => (
                          <span key={`decision-code-${code}`} className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                            {code.replace(/[._]/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                    {qState.result.metadata && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                            effort {qState.result.metadata.estimatedEffort}/5
                          </span>
                          <span className={`rounded border px-2 py-0.5 text-[10px] ${
                            qState.result.metadata.testsRequired
                              ? "border-yellow-900/50 text-yellow-300/80"
                              : "border-zinc-800 text-zinc-500"
                          }`}>
                            tests {qState.result.metadata.testsRequired ? "needed" : "not flagged"}
                          </span>
                          <span className={`rounded border px-2 py-0.5 text-[10px] ${
                            qState.result.metadata.securityConcern
                              ? "border-red-900/50 text-red-300/80"
                              : "border-zinc-800 text-zinc-500"
                          }`}>
                            security {qState.result.metadata.securityConcern ? "concern" : "clear"}
                          </span>
                          <span className={`rounded border px-2 py-0.5 text-[10px] ${
                            qState.result.metadata.canBeSplit
                              ? "border-blue-900/50 text-blue-300/80"
                              : "border-zinc-800 text-zinc-500"
                          }`}>
                            split {qState.result.metadata.canBeSplit ? "recommended" : "not flagged"}
                          </span>
                        </div>
                        {qState.result.metadata.keyIssues.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {qState.result.metadata.keyIssues.map((issue) => (
                              <span key={`issue-${issue}`} className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                                {issue}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {qState.result.compression && (
                      <div className="space-y-1 rounded-md border border-zinc-800/70 bg-zinc-950/40 p-2 text-[10px] text-zinc-500">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>
                            context {qState.result.compression.compressed ? "compressed" : "complete"}
                          </span>
                          <span>included {qState.result.compression.includedFiles.length}</span>
                          <span>omitted {qState.result.compression.omittedFiles.length}</span>
                        </div>
                        {qState.result.compression.omittedFiles.length > 0 && (
                          <p className="truncate">
                            omitted: {qState.result.compression.omittedFiles.slice(0, 5).join(", ")}
                            {qState.result.compression.omittedFiles.length > 5 ? ", ..." : ""}
                          </p>
                        )}
                        {qState.result.coverage && (
                          <p>
                            hunk coverage {qState.result.coverage.filesWithHunks}/{qState.result.coverage.totalFiles} files
                            {" · "}
                            {qState.result.coverage.hunkCount} hunk(s), {qState.result.coverage.changedHunkLines} changed line(s)
                            {qState.result.coverage.wholeFileOnlyFiles > 0
                              ? ` · ${qState.result.coverage.wholeFileOnlyFiles} whole-file fallback`
                              : ""}
                          </p>
                        )}
                        {qState.result.discardedFindings && qState.result.discardedFindings.length > 0 && (
                          <p>
                            discarded model comments: {qState.result.discardedFindings.length}
                          </p>
                        )}
                      </div>
                    )}
                    {qState.result.categories && (
                      <div className="flex flex-wrap gap-1.5">
                        {qState.result.categories.blocking.map((risk) => (
                          <span key={`review-blocking-${risk}`} className="rounded border border-red-900/50 px-2 py-0.5 text-[10px] text-red-300/80">
                            {risk}
                          </span>
                        ))}
                        {qState.result.categories.warnings.map((risk) => (
                          <span key={`review-warning-${risk}`} className="rounded border border-yellow-900/50 px-2 py-0.5 text-[10px] text-yellow-300/80">
                            {risk}
                          </span>
                        ))}
                        {qState.result.categories.info.map((risk) => (
                          <span key={`review-info-${risk}`} className="rounded border border-blue-900/50 px-2 py-0.5 text-[10px] text-blue-300/70">
                            {risk}
                          </span>
                        ))}
                      </div>
                    )}
                    {qState.result.findings && qState.result.findings.length > 0 && (
                      <div className="divide-y divide-zinc-800/70 rounded-md border border-zinc-800/70">
                        {qState.result.findings.slice(0, 5).map((finding, index) => (
                          <div key={`${finding.file}-${finding.line}-${index}`} className="grid gap-1 p-2 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                                finding.severity === "blocking"
                                  ? "bg-red-950/40 text-red-400"
                                  : finding.severity === "warning"
                                    ? "bg-yellow-950/40 text-yellow-400"
                                    : "bg-zinc-800 text-zinc-500"
                              }`}>
                                {finding.severity}
                              </span>
                              <span className="rounded bg-zinc-800/70 px-1.5 py-0.5 text-[10px] text-zinc-500">{finding.category}</span>
                              <span className="min-w-0 truncate font-mono text-zinc-500">
                                {finding.file}:{finding.line}
                              </span>
                            </div>
                            <p className="leading-relaxed text-zinc-400">{finding.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {isExpanded && <PullRequestContextPanel state={contextState} />}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
