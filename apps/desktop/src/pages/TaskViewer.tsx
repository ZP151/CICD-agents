import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../App.js";
import {
  ACTIVITY_HANDOFF_KEY,
  CHAT_HANDOFF_KEY,
  PULL_REQUESTS_HANDOFF_KEY,
  type ActivityHandoffDraft,
  buildCheckpointRollbackHandoffDraft,
  buildPullRequestsPrHandoffDraft,
  buildPrInsightChatHandoffDraft,
} from "../checkpointHandoff.js";
import { comparePrInsightArtifacts, listPrInsightArtifacts } from "../prInsightArtifacts.js";
import {
  fetchChatCheckpointActivity,
  fetchChatCheckpointPreview,
  fetchChatCheckpointRollbackPlan,
  fetchProfilePrInsightArtifactsWithHistory,
  fetchProfileReviewOperations,
  fetchTask,
  fetchTasks,
  streamTask,
  type ChatCheckpointActivity,
  type ChatCheckpointPreview,
  type ChatCheckpointRollbackPlan,
  type PrInsightArtifactHistoryMeta,
  type PrInsightArtifactRecord,
  type TaskView,
} from "../api.js";
import type { ReviewOperationEvent } from "../reviewOperations.js";

interface ReviewActivityItem extends ReviewOperationEvent {
  profileId: string;
  profileName: string;
}

interface PrInsightActivityItem extends PrInsightArtifactRecord {
  profileName: string;
  repoPath: string;
}

interface PrInsightRefreshComparison {
  previousId: string;
  previousAt: string;
  readinessChanged: boolean;
  previousReadiness?: PrInsightArtifactRecord["readiness"];
  currentReadiness?: PrInsightArtifactRecord["readiness"];
  addedRisks: string[];
  resolvedRisks: string[];
  findingCountDelta: number | null;
  tokenDelta: number;
}

function comparePrInsightRefresh(
  current: PrInsightActivityItem,
  previous: PrInsightActivityItem | null | undefined,
): PrInsightRefreshComparison | null {
  if (!previous) return null;
  if (current.profileId !== previous.profileId) return null;
  if (current.repository !== previous.repository) return null;
  if (current.pullRequestId !== previous.pullRequestId) return null;
  if (current.kind !== previous.kind) return null;
  const previousRisks = new Set(previous.risks);
  const currentRisks = new Set(current.risks);
  return {
    previousId: previous.id,
    previousAt: previous.at,
    readinessChanged: previous.readiness !== current.readiness,
    previousReadiness: previous.readiness,
    currentReadiness: current.readiness,
    addedRisks: current.risks.filter((risk) => !previousRisks.has(risk)),
    resolvedRisks: previous.risks.filter((risk) => !currentRisks.has(risk)),
    findingCountDelta: typeof current.findingCount === "number" && typeof previous.findingCount === "number"
      ? current.findingCount - previous.findingCount
      : null,
    tokenDelta: (current.tokensIn + current.tokensOut) - (previous.tokensIn + previous.tokensOut),
  };
}

function statusClass(status: string): string {
  if (status === "succeeded") return "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20";
  if (status === "failed") return "bg-red-500/10 text-red-400 ring-red-500/20";
  if (status === "running") return "bg-blue-500/10 text-blue-400 ring-blue-500/20";
  if (status === "queued") return "bg-yellow-500/10 text-yellow-400 ring-yellow-500/20";
  return "bg-zinc-800 text-zinc-400 ring-zinc-700";
}

function formatTime(ts?: number | null): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString();
}

function duration(task: TaskView): string {
  if (!task.startedAt) return "";
  const end = task.finishedAt ?? Math.floor(Date.now() / 1000);
  const seconds = Math.max(0, end - task.startedAt);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

function taskTitle(task: TaskView): string {
  const payload = task.payload ?? {};
  const repo = String(payload["repoPath"] ?? "").trim();
  if (task.kind === "submit-pipeline") {
    return repo ? `Pipeline submission: ${repo}` : "Pipeline submission";
  }
  return task.kind;
}

function latestDetail(task: TaskView): string {
  const last = task.steps[task.steps.length - 1];
  if (last?.detail) return last.detail;
  if (task.error) return task.error;
  return `${task.steps.length} step${task.steps.length === 1 ? "" : "s"}`;
}

function reviewOperationKindLabel(kind: ReviewOperationEvent["kind"]): string {
  const map: Record<ReviewOperationEvent["kind"], string> = {
    rerun: "Rerun",
    batch_rerun: "Batch rerun",
    stale_rerun: "Stale rerun",
    disposition: "Disposition",
    ado_retry: "ADO retry",
    insight_preview: "Insight preview",
    review_run: "Review run",
  };
  return map[kind] ?? kind;
}

function reviewOperationStatusClass(ok: boolean): string {
  return ok
    ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
    : "bg-yellow-500/10 text-yellow-400 ring-yellow-500/20";
}

function prInsightBlockerDetails(item: PrInsightArtifactRecord): Array<{ label: string; values: string[] }> {
  const signals = item.signals;
  if (!signals) return [];
  const details: Array<{ label: string; values: string[] }> = [];
  if (signals.buildBlockers?.length) {
    details.push({
      label: "Build blockers",
      values: signals.buildBlockers.slice(0, 5).map((build) => {
        const id = build.id ? `#${build.id}` : "build";
        const number = build.buildNumber && build.buildNumber !== String(build.id) ? ` ${build.buildNumber}` : "";
        const definition = build.definitionName ? ` ${build.definitionName}` : "";
        const result = build.result || build.status || "unknown";
        return `${id}${number}${definition}: ${result}`;
      }),
    });
  }
  if (signals.policyBlockers?.length) {
    details.push({
      label: "Policy blockers",
      values: signals.policyBlockers.slice(0, 5).map((policy) =>
        `${policy.name || policy.typeName || policy.id || "policy"}: ${policy.status}${policy.isBlocking ? " (blocking)" : ""}`
      ),
    });
  }
  if (signals.activeThreads?.length) {
    details.push({
      label: "Active threads",
      values: signals.activeThreads.slice(0, 5).map((thread) =>
        `#${thread.id}${thread.author ? ` ${thread.author}` : ""}: ${thread.firstComment || "active discussion"}`
      ),
    });
  }
  if (signals.linkedWorkItems?.length) {
    details.push({
      label: "Linked work items",
      values: signals.linkedWorkItems.slice(0, 5).map((workItem) =>
        `#${workItem.id} ${workItem.type}${workItem.state ? ` [${workItem.state}]` : ""}: ${workItem.title || "untitled"}`
      ),
    });
  }
  return details;
}

export function PrInsightReadinessBlockers({ item }: { item: PrInsightArtifactRecord }): JSX.Element | null {
  const groups = prInsightBlockerDetails(item);
  if (groups.length === 0) return null;
  return (
    <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">Readiness blockers</h3>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="text-xs text-zinc-600">{group.label}</p>
            <ul className="space-y-1">
              {group.values.map((value) => (
                <li key={value} className="break-words font-mono text-xs text-zinc-300">{value}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function checkpointActivityKindLabel(event: ChatCheckpointActivity): string {
  return event.targetCheckpointId ? "checkpoint apply" : "checkpoint";
}

function checkpointActivityDetail(event: ChatCheckpointActivity): string {
  if (event.targetCheckpointId) {
    return `restored ${event.targetCheckpointId} · safety ${event.safetyCheckpointId ?? event.checkpointId}`;
  }
  return event.repoPath;
}

export default function TaskViewer(): JSX.Element {
  const navigate = useNavigate();
  const { profiles } = useAppData();
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<TaskView | null>(null);
  const [reviewActivity, setReviewActivity] = useState<ReviewActivityItem[]>([]);
  const [prInsightActivity, setPrInsightActivity] = useState<PrInsightActivityItem[]>([]);
  const [prInsightHistory, setPrInsightHistory] = useState<PrInsightArtifactHistoryMeta[]>([]);
  const [checkpointActivity, setCheckpointActivity] = useState<ChatCheckpointActivity[]>([]);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [selectedPrInsightId, setSelectedPrInsightId] = useState<string | null>(null);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [checkpointPreview, setCheckpointPreview] = useState<ChatCheckpointPreview | null>(null);
  const [checkpointRollbackPlan, setCheckpointRollbackPlan] = useState<ChatCheckpointRollbackPlan | null>(null);
  const [reviewProfileFilter, setReviewProfileFilter] = useState("all");
  const [reviewKindFilter, setReviewKindFilter] = useState<ReviewOperationEvent["kind"] | "all">("all");
  const [prInsightProfileFilter, setPrInsightProfileFilter] = useState("all");
  const [prInsightKindFilter, setPrInsightKindFilter] = useState<PrInsightArtifactRecord["kind"] | "all">("all");
  const [loading, setLoading] = useState(true);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [prInsightLoading, setPrInsightLoading] = useState(false);
  const [checkpointLoading, setCheckpointLoading] = useState(false);
  const [checkpointPreviewLoading, setCheckpointPreviewLoading] = useState(false);
  const [checkpointRollbackLoading, setCheckpointRollbackLoading] = useState(false);
  const [copiedPrInsightId, setCopiedPrInsightId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const next = await fetchTasks();
      setTasks(next);
      setSelectedId((current) => current ?? next[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshReviewActivity = useCallback(async () => {
    setReviewLoading(true);
    try {
      const nested = await Promise.all(profiles.map(async (profile) => {
        const items = await fetchProfileReviewOperations(profile.id);
        return items.map((item) => ({
          ...item,
          profileId: profile.id,
          profileName: profile.name,
        }));
      }));
      const next = nested
        .flat()
        .sort((a, b) => Date.parse(b.at || "0") - Date.parse(a.at || "0"))
        .slice(0, 50);
      setReviewActivity(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReviewLoading(false);
    }
  }, [profiles]);

  const refreshPrInsightActivity = useCallback(async () => {
    setPrInsightLoading(true);
    try {
      const nested = await Promise.all(profiles.map(async (profile) => {
        const localItems = listPrInsightArtifacts(profile.id);
        const result = await fetchProfilePrInsightArtifactsWithHistory(profile.id).catch(() => ({
          items: localItems as PrInsightArtifactRecord[],
          history: [],
        }));
        return {
          items: [...result.items, ...localItems]
            .sort((a, b) => Date.parse(b.at || "0") - Date.parse(a.at || "0"))
            .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
            .map((item) => ({
            ...item,
            profileName: profile.name,
            repoPath: profile.repoPath || ".",
          })),
          history: result.history,
        };
      }));
      const next = nested
        .flatMap((entry) => entry.items)
        .sort((a, b) => Date.parse(b.at || "0") - Date.parse(a.at || "0"))
        .slice(0, 50);
      setPrInsightHistory(nested.flatMap((entry) => entry.history));
      setPrInsightActivity(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPrInsightLoading(false);
    }
  }, [profiles]);

  const refreshCheckpointActivity = useCallback(async () => {
    setCheckpointLoading(true);
    try {
      const next = await fetchChatCheckpointActivity();
      setCheckpointActivity(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckpointLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    void refreshReviewActivity();
  }, [refreshReviewActivity]);

  useEffect(() => {
    void refreshPrInsightActivity();
  }, [refreshPrInsightActivity]);

  useEffect(() => {
    const raw = sessionStorage.getItem(ACTIVITY_HANDOFF_KEY);
    if (!raw) return;
    let draft: ActivityHandoffDraft | null = null;
    try {
      draft = JSON.parse(raw) as ActivityHandoffDraft;
    } catch {
      sessionStorage.removeItem(ACTIVITY_HANDOFF_KEY);
      return;
    }
    if (draft.kind !== "pr_insight" || !draft.artifactId) {
      sessionStorage.removeItem(ACTIVITY_HANDOFF_KEY);
      return;
    }
    const target = prInsightActivity.find((event) => event.id === draft.artifactId);
    if (!target) return;
    setPrInsightProfileFilter(target.profileId);
    setPrInsightKindFilter(target.kind);
    setSelectedPrInsightId(target.id);
    setSelectedReviewId(null);
    setSelectedCheckpointId(null);
    setSelectedId(null);
    setSelected(null);
    sessionStorage.removeItem(ACTIVITY_HANDOFF_KEY);
  }, [prInsightActivity]);

  useEffect(() => {
    void refreshCheckpointActivity();
  }, [refreshCheckpointActivity]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    void fetchTask(selectedId)
      .then((task) => {
        if (!cancelled) setSelected(task);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !selected || !["queued", "running"].includes(selected.status)) return;
    const close = streamTask(selectedId, (type, data) => {
      if (type === "step") {
        setSelected((current) => current
          ? { ...current, steps: [...current.steps, data as TaskView["steps"][number]] }
          : current);
      } else if (type === "status") {
        setSelected((current) => current ? { ...current, status: String(data) } : current);
      } else if (type === "done") {
        const done = data as { status?: string; result?: unknown; error?: string };
        setSelected((current) => current
          ? {
              ...current,
              status: done.status ?? current.status,
              result: done.result ?? current.result,
              error: done.error ?? current.error,
              finishedAt: Math.floor(Date.now() / 1000),
            }
          : current);
        void refresh();
      }
    });
    return close;
  }, [selectedId, selected, refresh]);

  const activeCount = useMemo(
    () => tasks.filter((task) => task.status === "queued" || task.status === "running").length,
    [tasks],
  );

  const selectedReview = useMemo(
    () => reviewActivity.find((event) => event.id === selectedReviewId) ?? null,
    [reviewActivity, selectedReviewId],
  );

  const selectedPrInsight = useMemo(
    () => prInsightActivity.find((event) => event.id === selectedPrInsightId) ?? null,
    [prInsightActivity, selectedPrInsightId],
  );

  const prInsightHistoryMeta = useMemo(() => {
    if (prInsightHistory.length > 0) {
      const fromBackend = new Map<string, { index: number; total: number; latest: boolean }>();
      for (const item of prInsightHistory) {
        fromBackend.set(item.artifactId, {
          index: item.index,
          total: item.total,
          latest: item.latest,
        });
      }
      return fromBackend;
    }
    const groups = new Map<string, PrInsightActivityItem[]>();
    for (const event of prInsightActivity) {
      const key = `${event.profileId}/${event.repository}/${event.pullRequestId}/${event.kind}`;
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    const meta = new Map<string, { index: number; total: number; latest: boolean }>();
    for (const events of groups.values()) {
      const sorted = [...events].sort((a, b) => Date.parse(b.at || "0") - Date.parse(a.at || "0"));
      sorted.forEach((event, index) => {
        meta.set(event.id, { index, total: sorted.length, latest: index === 0 });
      });
    }
    return meta;
  }, [prInsightActivity, prInsightHistory]);

  const selectedPrInsightComparison = useMemo(() => {
    if (!selectedPrInsight) return null;
    const siblings = prInsightActivity.filter((event) => (
      event.profileId === selectedPrInsight.profileId &&
      event.repository === selectedPrInsight.repository &&
      event.pullRequestId === selectedPrInsight.pullRequestId
    ));
    const preview = siblings.find((event) => event.kind === "insight_preview") ?? null;
    const review = siblings.find((event) => event.kind === "review_run") ?? null;
    return comparePrInsightArtifacts(preview, review);
  }, [prInsightActivity, selectedPrInsight]);

  const selectedPrInsightRefreshComparison = useMemo(() => {
    if (!selectedPrInsight) return null;
    const selectedAt = Date.parse(selectedPrInsight.at || "0");
    const previous = prInsightActivity
      .filter((event) => (
        event.id !== selectedPrInsight.id &&
        event.profileId === selectedPrInsight.profileId &&
        event.repository === selectedPrInsight.repository &&
        event.pullRequestId === selectedPrInsight.pullRequestId &&
        event.kind === selectedPrInsight.kind &&
        Date.parse(event.at || "0") < selectedAt
      ))
      .sort((a, b) => Date.parse(b.at || "0") - Date.parse(a.at || "0"))[0] ?? null;
    return comparePrInsightRefresh(selectedPrInsight, previous);
  }, [prInsightActivity, selectedPrInsight]);

  const selectedCheckpoint = useMemo(
    () => checkpointActivity.find((event) => event.id === selectedCheckpointId) ?? null,
    [checkpointActivity, selectedCheckpointId],
  );

  const filteredReviewActivity = useMemo(() => {
    return reviewActivity.filter((event) => {
      if (reviewProfileFilter !== "all" && event.profileId !== reviewProfileFilter) return false;
      if (reviewKindFilter !== "all" && event.kind !== reviewKindFilter) return false;
      return true;
    });
  }, [reviewActivity, reviewKindFilter, reviewProfileFilter]);

  const filteredPrInsightActivity = useMemo(() => {
    return prInsightActivity.filter((event) => {
      if (prInsightProfileFilter !== "all" && event.profileId !== prInsightProfileFilter) return false;
      if (prInsightKindFilter !== "all" && event.kind !== prInsightKindFilter) return false;
      return true;
    });
  }, [prInsightActivity, prInsightKindFilter, prInsightProfileFilter]);

  useEffect(() => {
    if (!selectedReviewId) return;
    if (filteredReviewActivity.some((event) => event.id === selectedReviewId)) return;
    setSelectedReviewId(filteredReviewActivity[0]?.id ?? null);
  }, [filteredReviewActivity, selectedReviewId]);

  useEffect(() => {
    if (!selectedPrInsightId) return;
    if (filteredPrInsightActivity.some((event) => event.id === selectedPrInsightId)) return;
    setSelectedPrInsightId(filteredPrInsightActivity[0]?.id ?? null);
  }, [filteredPrInsightActivity, selectedPrInsightId]);

  useEffect(() => {
    if (!selectedCheckpoint) {
      setCheckpointPreview(null);
      setCheckpointRollbackPlan(null);
      return;
    }
    let cancelled = false;
    setCheckpointPreviewLoading(true);
    setCheckpointRollbackLoading(true);
    void Promise.allSettled([
      fetchChatCheckpointPreview(selectedCheckpoint.checkpointId),
      fetchChatCheckpointRollbackPlan(selectedCheckpoint.checkpointId),
    ])
      .then(([previewResult, planResult]) => {
        if (cancelled) return;
        if (previewResult.status === "fulfilled") {
          setCheckpointPreview(previewResult.value);
        } else {
          setCheckpointPreview(null);
          setError(previewResult.reason instanceof Error ? previewResult.reason.message : String(previewResult.reason));
        }
        if (planResult.status === "fulfilled") {
          setCheckpointRollbackPlan(planResult.value);
        } else {
          setCheckpointRollbackPlan(null);
          setError(planResult.reason instanceof Error ? planResult.reason.message : String(planResult.reason));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCheckpointPreviewLoading(false);
          setCheckpointRollbackLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCheckpoint]);

  function selectTask(taskId: string): void {
    setSelectedId(taskId);
    setSelectedReviewId(null);
    setSelectedPrInsightId(null);
    setSelectedCheckpointId(null);
  }

  function selectReviewActivity(eventId: string): void {
    setSelectedReviewId(eventId);
    setSelectedPrInsightId(null);
    setSelectedCheckpointId(null);
    setSelectedId(null);
    setSelected(null);
  }

  function selectPrInsightActivity(eventId: string): void {
    setSelectedPrInsightId(eventId);
    setSelectedReviewId(null);
    setSelectedCheckpointId(null);
    setSelectedId(null);
    setSelected(null);
  }

  function selectCheckpointActivity(eventId: string): void {
    setSelectedCheckpointId(eventId);
    setSelectedReviewId(null);
    setSelectedPrInsightId(null);
    setSelectedId(null);
    setSelected(null);
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([refresh(), refreshReviewActivity(), refreshPrInsightActivity(), refreshCheckpointActivity()]);
  }

  function openRollbackPlanInChat(): void {
    if (!selectedCheckpoint || !checkpointRollbackPlan?.proposal) return;
    sessionStorage.setItem(CHAT_HANDOFF_KEY, JSON.stringify(buildCheckpointRollbackHandoffDraft({
      proposal: checkpointRollbackPlan.proposal,
      checkpointId: selectedCheckpoint.checkpointId,
      repoPath: selectedCheckpoint.repoPath,
      profileId: selectedCheckpoint.profileId,
    })));
    navigate("/chat");
  }

  function openPrInsightInChat(item: PrInsightActivityItem): void {
    sessionStorage.setItem(CHAT_HANDOFF_KEY, JSON.stringify(buildPrInsightChatHandoffDraft({
      pullRequestId: item.pullRequestId,
      title: item.title,
      repository: item.repository,
      repoPath: item.repoPath || ".",
      profileId: item.profileId,
      kind: item.kind,
      artifactId: item.id,
    })));
    navigate("/chat");
  }

  function openPrInsightInPullRequests(item: PrInsightActivityItem): void {
    sessionStorage.setItem(PULL_REQUESTS_HANDOFF_KEY, JSON.stringify(buildPullRequestsPrHandoffDraft({
      profileId: item.profileId,
      repository: item.repository,
      pullRequestId: item.pullRequestId,
      artifactId: item.id,
    })));
    navigate("/pulls");
  }

  function copyPrInsightArtifactId(item: PrInsightActivityItem): void {
    const write = navigator.clipboard?.writeText(item.id);
    if (!write) return;
    void write.then(() => {
      setCopiedPrInsightId(item.id);
      window.setTimeout(() => setCopiedPrInsightId((current) => current === item.id ? null : current), 2000);
    });
  }

  return (
    <div className="flex min-h-full w-full gap-5">
      <section className="flex w-[360px] shrink-0 flex-col border-r border-zinc-800/70 pr-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100">Activity</h2>
            <p className="mt-1 text-sm text-zinc-500">Agent runs and background jobs.</p>
          </div>
          <button
            onClick={() => void refreshAll()}
            className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300"
          >
            Refresh
          </button>
        </div>

        {activeCount > 0 && (
          <div className="mb-3 rounded-md border border-blue-900/50 bg-blue-950/20 px-3 py-2 text-xs text-blue-300">
            {activeCount} active run{activeCount === 1 ? "" : "s"}
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto space-y-1.5">
          {loading && <p className="px-1 text-sm text-zinc-600">Loading activity...</p>}
          {!loading && tasks.length === 0 && (
            <p className="px-1 text-sm text-zinc-600">No agent runs yet.</p>
          )}
          {tasks.map((task) => {
            const selectedTask = task.id === selectedId;
            return (
              <button
                key={task.id}
                onClick={() => selectTask(task.id)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                  selectedTask
                    ? "border-zinc-700 bg-zinc-900"
                    : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/50"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${statusClass(task.status)}`}>
                    {task.status}
                  </span>
                  <span className="truncate text-xs text-zinc-600">{formatTime(task.createdAt)}</span>
                </div>
                <p className="truncate text-sm font-medium text-zinc-200">{taskTitle(task)}</p>
                <p className="mt-1 truncate text-xs text-zinc-600">{latestDetail(task)}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 border-t border-zinc-800/70 pt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Checkpoint Activity</h3>
            {checkpointLoading && <span className="text-[11px] text-zinc-700">Loading</span>}
          </div>
          <div className="max-h-[220px] overflow-y-auto space-y-1.5">
            {!checkpointLoading && checkpointActivity.length === 0 && (
              <p className="px-1 text-xs text-zinc-600">No Git checkpoints yet.</p>
            )}
            {checkpointActivity.slice(0, 8).map((event) => {
              const selectedEvent = event.id === selectedCheckpointId;
              return (
                <button
                  key={event.id}
                  onClick={() => selectCheckpointActivity(event.id)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                    selectedEvent
                      ? "border-zinc-700 bg-zinc-900"
                      : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/50"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${reviewOperationStatusClass(event.toolOk !== false)}`}>
                      {checkpointActivityKindLabel(event)}
                    </span>
                    <span className="truncate text-xs text-zinc-600">{formatTime(event.at)}</span>
                  </div>
                  <p className="truncate text-sm font-medium text-zinc-200">{event.toolName}</p>
                  <p className="mt-1 truncate font-mono text-xs text-zinc-600">{checkpointActivityDetail(event)}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 border-t border-zinc-800/70 pt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Saved PR Insights</h3>
            {prInsightLoading && <span className="text-[11px] text-zinc-700">Loading</span>}
          </div>
          <div className="mb-2 grid gap-1.5">
            <select
              className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-400 outline-none"
              value={prInsightProfileFilter}
              onChange={(e) => setPrInsightProfileFilter(e.target.value)}
              aria-label="Filter saved PR insights by Project Link"
            >
              <option value="all">All Project Links</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
            <select
              className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-400 outline-none"
              value={prInsightKindFilter}
              onChange={(e) => setPrInsightKindFilter(e.target.value as PrInsightArtifactRecord["kind"] | "all")}
              aria-label="Filter saved PR insights by artifact type"
            >
              <option value="all">All saved insight types</option>
              <option value="insight_preview">Insight preview</option>
              <option value="review_run">Full review</option>
            </select>
          </div>
          <div className="max-h-[260px] overflow-y-auto space-y-1.5">
            {!prInsightLoading && filteredPrInsightActivity.length === 0 && (
              <p className="px-1 text-xs text-zinc-600">No saved PR insights yet.</p>
            )}
            {filteredPrInsightActivity.slice(0, 10).map((event) => {
              const selectedEvent = event.id === selectedPrInsightId;
              const historyMeta = prInsightHistoryMeta.get(event.id);
              return (
                <button
                  key={event.id}
                  onClick={() => selectPrInsightActivity(event.id)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                    selectedEvent
                      ? "border-zinc-700 bg-zinc-900"
                      : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/50"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-300 ring-1 ring-blue-500/20">
                      {event.kind === "review_run" ? "full review" : "preview"}
                    </span>
                    {historyMeta && historyMeta.total > 1 && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ring-1 ${
                        historyMeta.latest
                          ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
                          : "bg-zinc-800/70 text-zinc-500 ring-zinc-700"
                      }`}
                      >
                        {historyMeta.latest ? `latest of ${historyMeta.total}` : `older ${historyMeta.index + 1}/${historyMeta.total}`}
                      </span>
                    )}
                    <span className="truncate text-xs text-zinc-600">{formatTime(Date.parse(event.at || "0") / 1000)}</span>
                  </div>
                  <p className="truncate text-sm font-medium text-zinc-200">#{event.pullRequestId} · {event.title || "(untitled)"}</p>
                  <p className="mt-1 truncate text-xs text-zinc-600">{event.profileName} · {event.repository}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 border-t border-zinc-800/70 pt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Review Activity</h3>
            {reviewLoading && <span className="text-[11px] text-zinc-700">Loading</span>}
          </div>
          <div className="mb-2 grid gap-1.5">
            <select
              className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-400 outline-none"
              value={reviewProfileFilter}
              onChange={(e) => setReviewProfileFilter(e.target.value)}
              aria-label="Filter review activity by Project Link"
            >
              <option value="all">All Project Links</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
            <select
              className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-400 outline-none"
              value={reviewKindFilter}
              onChange={(e) => setReviewKindFilter(e.target.value as ReviewOperationEvent["kind"] | "all")}
              aria-label="Filter review activity by event type"
            >
              <option value="all">All review events</option>
              <option value="rerun">Rerun</option>
              <option value="batch_rerun">Batch rerun</option>
              <option value="stale_rerun">Stale rerun</option>
              <option value="disposition">Disposition</option>
              <option value="ado_retry">ADO retry</option>
              <option value="insight_preview">Insight preview</option>
              <option value="review_run">Review run</option>
            </select>
          </div>
          <div className="max-h-[320px] overflow-y-auto space-y-1.5">
            {!reviewLoading && filteredReviewActivity.length === 0 && (
              <p className="px-1 text-xs text-zinc-600">No review operations yet.</p>
            )}
            {filteredReviewActivity.slice(0, 12).map((event) => {
              const selectedEvent = event.id === selectedReviewId;
              return (
                <button
                  key={`${event.profileId}-${event.id}`}
                  onClick={() => selectReviewActivity(event.id)}
                  className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                    selectedEvent
                      ? "border-zinc-700 bg-zinc-900"
                      : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/50"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${reviewOperationStatusClass(event.ok)}`}>
                      {reviewOperationKindLabel(event.kind)}
                    </span>
                    <span className="truncate text-xs text-zinc-600">{formatTime(Date.parse(event.at || "0") / 1000)}</span>
                  </div>
                  <p className="truncate text-sm font-medium text-zinc-200">
                    {event.pullRequestId > 0 ? `#${event.pullRequestId} · ${event.label}` : event.label}
                  </p>
                  <p className="mt-1 truncate text-xs text-zinc-600">{event.profileName} · {event.details}</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="min-w-0 flex-1">
        {!selected && !selectedReview && !selectedPrInsight && !selectedCheckpoint && (
          <div className="flex h-full items-center justify-center text-sm text-zinc-600">
            Select a run, checkpoint, or review operation to inspect details.
          </div>
        )}

        {selected && (
          <div className="space-y-5">
            <header className="border-b border-zinc-800/70 pb-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusClass(selected.status)}`}>
                  {selected.status}
                </span>
                <span className="text-xs text-zinc-600">{selected.kind}</span>
                {duration(selected) && <span className="text-xs text-zinc-600">{duration(selected)}</span>}
              </div>
              <h2 className="text-lg font-semibold text-zinc-100">{taskTitle(selected)}</h2>
              <p className="mt-1 font-mono text-xs text-zinc-600">{selected.id}</p>
            </header>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">Steps</h3>
              {selected.steps.length === 0 ? (
                <p className="text-sm text-zinc-600">No steps recorded yet.</p>
              ) : (
                <ol className="space-y-2">
                  {selected.steps.map((step) => (
                    <li key={step.seq} className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 px-3 py-2">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 w-8 shrink-0 font-mono text-xs text-zinc-600">{step.seq}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${statusClass(step.status)}`}>
                              {step.status}
                            </span>
                            <span className="text-sm font-medium text-zinc-200">{step.name}</span>
                            <span className="text-xs text-zinc-600">{formatTime(step.createdAt)}</span>
                          </div>
                          {step.detail && (
                            <p className="mt-1 break-words font-mono text-xs text-zinc-500">{step.detail}</p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {selected.error && (
              <section className="rounded-lg border border-red-900/50 bg-red-950/20 p-3">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-400">Error</h3>
                <p className="break-words font-mono text-xs text-red-300">{selected.error}</p>
              </section>
            )}
          </div>
        )}

        {selectedCheckpoint && (
          <div className="space-y-5">
            <header className="border-b border-zinc-800/70 pb-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${reviewOperationStatusClass(selectedCheckpoint.toolOk !== false)}`}>
                  {checkpointActivityKindLabel(selectedCheckpoint)}
                </span>
                <span className="text-xs text-zinc-600">{selectedCheckpoint.toolName}</span>
                <span className="text-xs text-zinc-600">{formatTime(selectedCheckpoint.at)}</span>
              </div>
              <h2 className="text-lg font-semibold text-zinc-100">
                {selectedCheckpoint.targetCheckpointId ? "Checkpoint apply safety snapshot" : "Git checkpoint before confirmed action"}
              </h2>
              <p className="mt-1 font-mono text-xs text-zinc-600">{selectedCheckpoint.checkpointId}</p>
            </header>

            <section className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                <p className="text-xs text-zinc-600">Repository</p>
                <p className="mt-1 break-words font-mono text-zinc-300">{selectedCheckpoint.repoPath}</p>
              </div>
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                <p className="text-xs text-zinc-600">Session</p>
                <p className="mt-1 break-words font-mono text-zinc-300">{selectedCheckpoint.sessionId}</p>
              </div>
            </section>

            <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                {selectedCheckpoint.targetCheckpointId ? "Safety Snapshot Path" : "Snapshot Path"}
              </h3>
              <p className="break-words font-mono text-xs text-zinc-300">{selectedCheckpoint.checkpointPath}</p>
            </section>

            {selectedCheckpoint.targetCheckpointId && (
              <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">Checkpoint Apply</h3>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-zinc-600">Restored Checkpoint</p>
                    <p className="mt-1 break-words font-mono text-zinc-300">{selectedCheckpoint.targetCheckpointId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-600">Apply Mode</p>
                    <p className="mt-1 break-words font-mono text-zinc-300">{selectedCheckpoint.applyMode ?? "unknown"}</p>
                  </div>
                </div>
                {selectedCheckpoint.restoredFiles && selectedCheckpoint.restoredFiles.length > 0 && (
                  <p className="mt-3 text-xs text-zinc-500">
                    Restored files: {selectedCheckpoint.restoredFiles.slice(0, 8).join(", ")}
                    {selectedCheckpoint.restoredFiles.length > 8 ? `, +${selectedCheckpoint.restoredFiles.length - 8} more` : ""}
                  </p>
                )}
                <p className="mt-3 text-xs text-zinc-500">
                  Preview and rollback planning below use the safety snapshot captured immediately before this apply action.
                </p>
              </section>
            )}

            <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Rollback Plan</h3>
                {checkpointRollbackLoading && <span className="text-[11px] text-zinc-600">Loading</span>}
              </div>
              {!checkpointRollbackLoading && !checkpointRollbackPlan && (
                <p className="text-sm text-zinc-600">No rollback plan available for this checkpoint.</p>
              )}
              {checkpointRollbackPlan && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                      checkpointRollbackPlan.supported
                        ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                        : "bg-yellow-500/10 text-yellow-400 ring-yellow-500/20"
                    }`}
                    >
                      {checkpointRollbackPlan.supported ? "proposal ready" : "planning only"}
                    </span>
                    <span className="font-mono text-xs text-zinc-600">{checkpointRollbackPlan.mode}</span>
                  </div>
                  <p className="text-sm text-zinc-300">{checkpointRollbackPlan.reason}</p>
                  {checkpointRollbackPlan.proposal && (
                    <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-xs text-zinc-600">Confirmed Action Proposal</p>
                        <button
                          onClick={openRollbackPlanInChat}
                          className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800"
                        >
                          Open in Chat for approval
                        </button>
                      </div>
                      <p className="text-sm text-zinc-300">{checkpointRollbackPlan.proposal.description}</p>
                      <pre className="mt-2 overflow-auto text-xs text-zinc-500">
                        {JSON.stringify({
                          tool: checkpointRollbackPlan.proposal.tool,
                          args: checkpointRollbackPlan.proposal.args,
                        }, null, 2)}
                      </pre>
                    </div>
                  )}
                  {checkpointRollbackPlan.requiredCapability && (
                    <p className="font-mono text-xs text-zinc-500">
                      Required capability: {checkpointRollbackPlan.requiredCapability}
                    </p>
                  )}
                  {checkpointRollbackPlan.currentTrackedPaths.length > 0 && (
                    <p className="text-xs text-zinc-500">
                      Tracked paths to restore: {checkpointRollbackPlan.currentTrackedPaths.slice(0, 8).join(", ")}
                      {checkpointRollbackPlan.currentTrackedPaths.length > 8 ? `, +${checkpointRollbackPlan.currentTrackedPaths.length - 8} more` : ""}
                    </p>
                  )}
                  {checkpointRollbackPlan.warnings.length > 0 && (
                    <div className="space-y-1">
                      {checkpointRollbackPlan.warnings.map((warning) => (
                        <p key={warning} className="text-xs text-yellow-300">{warning}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Snapshot Preview</h3>
                {checkpointPreviewLoading && <span className="text-[11px] text-zinc-600">Loading</span>}
              </div>
              {!checkpointPreviewLoading && !checkpointPreview && (
                <p className="text-sm text-zinc-600">No preview available for this checkpoint.</p>
              )}
              {checkpointPreview && (
                <div className="space-y-3">
                  <div className="grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-zinc-600">Branch</p>
                      <p className="mt-1 break-words font-mono text-zinc-300">{checkpointPreview.branch || "unknown"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-600">Files</p>
                      <p className="mt-1 font-mono text-zinc-300">{checkpointPreview.files.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-600">Diff</p>
                      <p className="mt-1 font-mono text-zinc-300">
                        {checkpointPreview.diffChars} chars{checkpointPreview.diffTruncated ? " · truncated" : ""}
                      </p>
                    </div>
                  </div>
                  {checkpointPreview.files.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs text-zinc-600">Changed Files</p>
                      <div className="flex flex-wrap gap-1.5">
                        {checkpointPreview.files.slice(0, 12).map((file) => (
                          <span key={file} className="max-w-full truncate rounded-md border border-zinc-800 px-2 py-1 font-mono text-xs text-zinc-400">
                            {file}
                          </span>
                        ))}
                        {checkpointPreview.files.length > 12 && (
                          <span className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-600">
                            +{checkpointPreview.files.length - 12} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {checkpointPreview.statusLines.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs text-zinc-600">Status</p>
                      <pre className="max-h-28 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/70 p-2 text-xs text-zinc-400">
                        {checkpointPreview.statusLines.join("\n")}
                      </pre>
                    </div>
                  )}
                  {checkpointPreview.diffPreview && (
                    <div>
                      <p className="mb-1 text-xs text-zinc-600">Diff Preview</p>
                      <pre className="max-h-72 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/70 p-2 text-xs text-zinc-400">
                        {checkpointPreview.diffPreview}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </section>

            {selectedCheckpoint.toolSummary && (
              <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">Tool Result</h3>
                <p className="break-words font-mono text-xs text-zinc-300">{selectedCheckpoint.toolSummary}</p>
              </section>
            )}
          </div>
        )}

        {selectedPrInsight && (
          <div className="space-y-5">
            <header className="border-b border-zinc-800/70 pb-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-300 ring-1 ring-blue-500/20">
                  {selectedPrInsight.kind === "review_run" ? "full review" : "preview"}
                </span>
                {selectedPrInsight.readiness && <span className="text-xs text-zinc-600">{selectedPrInsight.readiness}</span>}
                <span className="text-xs text-zinc-600">{formatTime(Date.parse(selectedPrInsight.at || "0") / 1000)}</span>
              </div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-zinc-100">#{selectedPrInsight.pullRequestId} · {selectedPrInsight.title || "(untitled)"}</h2>
                  <p className="mt-1 font-mono text-xs text-zinc-600">{selectedPrInsight.id}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => openPrInsightInPullRequests(selectedPrInsight)}
                    className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800"
                  >
                    Open in Pull Requests
                  </button>
                  <button
                    onClick={() => openPrInsightInChat(selectedPrInsight)}
                    className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800"
                  >
                    Ask in Chat
                  </button>
                </div>
              </div>
            </header>

            <section className="rounded-lg border border-blue-950/60 bg-blue-950/10 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-400/70">Provenance</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => copyPrInsightArtifactId(selectedPrInsight)}
                    className="rounded-md border border-blue-900/60 px-2 py-1 text-xs text-blue-300/80 transition hover:border-blue-700 hover:text-blue-200"
                  >
                    {copiedPrInsightId === selectedPrInsight.id ? "Copied" : "Copy artifact id"}
                  </button>
                  <button
                    onClick={() => openPrInsightInPullRequests(selectedPrInsight)}
                    className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
                  >
                    Pull Requests
                  </button>
                  <button
                    onClick={() => openPrInsightInChat(selectedPrInsight)}
                    className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
                  >
                    Chat
                  </button>
                </div>
              </div>
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <p className="break-words font-mono text-zinc-500 sm:col-span-2">{selectedPrInsight.id}</p>
                <p className="text-zinc-600">Saved at: <span className="text-zinc-400">{selectedPrInsight.at}</span></p>
                <p className="text-zinc-600">Source: <span className="text-zinc-400">PR #{selectedPrInsight.pullRequestId} · {selectedPrInsight.kind}</span></p>
              </div>
            </section>

            <section className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                <p className="text-xs text-zinc-600">Project Link</p>
                <p className="mt-1 text-zinc-300">{selectedPrInsight.profileName}</p>
              </div>
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                <p className="text-xs text-zinc-600">Repository</p>
                <p className="mt-1 font-mono text-zinc-300">{selectedPrInsight.repository}</p>
              </div>
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                <p className="text-xs text-zinc-600">Tokens</p>
                <p className="mt-1 font-mono text-zinc-300">{selectedPrInsight.tokensIn}/{selectedPrInsight.tokensOut}</p>
              </div>
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                <p className="text-xs text-zinc-600">Decision</p>
                <p className="mt-1 text-zinc-300">
                  {[selectedPrInsight.decisionQueue, selectedPrInsight.decisionRiskLevel, selectedPrInsight.contextConfidence]
                    .filter(Boolean)
                    .join(" · ") || "n/a"}
                </p>
              </div>
              {(selectedPrInsight.iterationId || selectedPrInsight.sourceCommit) && (
                <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3 sm:col-span-2">
                  <p className="text-xs text-zinc-600">Analysis baseline</p>
                  <p className="mt-1 break-words font-mono text-zinc-300">
                    {selectedPrInsight.iterationId ? `iteration ${selectedPrInsight.iterationId}` : "iteration n/a"}
                    {selectedPrInsight.sourceCommit ? ` · ${selectedPrInsight.sourceCommit}` : ""}
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">Saved Summary</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{selectedPrInsight.summary || "No summary saved."}</p>
            </section>

            {selectedPrInsightComparison && (
              <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">Preview vs Full Review</h3>
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-zinc-600">Readiness</p>
                    <p className="mt-1 text-zinc-300">
                      {selectedPrInsightComparison.readinessChanged
                        ? `${selectedPrInsightComparison.previewReadiness ?? "unknown"} -> ${selectedPrInsightComparison.reviewReadiness ?? "unknown"}`
                        : selectedPrInsightComparison.reviewReadiness ?? selectedPrInsightComparison.previewReadiness ?? "unchanged"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-600">Token delta</p>
                    <p className="mt-1 font-mono text-zinc-300">{selectedPrInsightComparison.tokenDelta >= 0 ? "+" : ""}{selectedPrInsightComparison.tokenDelta}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-600">Finding delta</p>
                    <p className="mt-1 font-mono text-zinc-300">
                      {selectedPrInsightComparison.findingCountDelta === null
                        ? "n/a"
                        : `${selectedPrInsightComparison.findingCountDelta >= 0 ? "+" : ""}${selectedPrInsightComparison.findingCountDelta}`}
                    </p>
                  </div>
                </div>
                {(selectedPrInsightComparison.addedRisks.length > 0 || selectedPrInsightComparison.resolvedRisks.length > 0) && (
                  <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-zinc-600">Added risks in full review</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedPrInsightComparison.addedRisks.length === 0 && <span className="text-zinc-600">None</span>}
                        {selectedPrInsightComparison.addedRisks.map((risk) => (
                          <span key={`added-${risk}`} className="rounded border border-yellow-900/50 px-2 py-1 text-yellow-300/80">{risk}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-zinc-600">No longer present</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedPrInsightComparison.resolvedRisks.length === 0 && <span className="text-zinc-600">None</span>}
                        {selectedPrInsightComparison.resolvedRisks.map((risk) => (
                          <span key={`resolved-${risk}`} className="rounded border border-emerald-900/50 px-2 py-1 text-emerald-300/80">{risk}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {selectedPrInsightRefreshComparison && (
              <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Previous {selectedPrInsight.kind === "review_run" ? "Full Review" : "Preview"} Comparison</h3>
                  <span className="text-[11px] text-zinc-600">
                    compared with {formatTime(Date.parse(selectedPrInsightRefreshComparison.previousAt || "0") / 1000)}
                  </span>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-zinc-600">Readiness</p>
                    <p className="mt-1 text-zinc-300">
                      {selectedPrInsightRefreshComparison.readinessChanged
                        ? `${selectedPrInsightRefreshComparison.previousReadiness ?? "unknown"} -> ${selectedPrInsightRefreshComparison.currentReadiness ?? "unknown"}`
                        : selectedPrInsightRefreshComparison.currentReadiness ?? "unchanged"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-600">Token delta</p>
                    <p className="mt-1 font-mono text-zinc-300">
                      {selectedPrInsightRefreshComparison.tokenDelta >= 0 ? "+" : ""}{selectedPrInsightRefreshComparison.tokenDelta}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-600">Finding delta</p>
                    <p className="mt-1 font-mono text-zinc-300">
                      {selectedPrInsightRefreshComparison.findingCountDelta === null
                        ? "n/a"
                        : `${selectedPrInsightRefreshComparison.findingCountDelta >= 0 ? "+" : ""}${selectedPrInsightRefreshComparison.findingCountDelta}`}
                    </p>
                  </div>
                </div>
                {(selectedPrInsightRefreshComparison.addedRisks.length > 0 || selectedPrInsightRefreshComparison.resolvedRisks.length > 0) && (
                  <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-zinc-600">New risks since previous run</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedPrInsightRefreshComparison.addedRisks.length === 0 && <span className="text-zinc-600">None</span>}
                        {selectedPrInsightRefreshComparison.addedRisks.map((risk) => (
                          <span key={`refresh-added-${risk}`} className="rounded border border-yellow-900/50 px-2 py-1 text-yellow-300/80">{risk}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-zinc-600">Risks no longer present</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedPrInsightRefreshComparison.resolvedRisks.length === 0 && <span className="text-zinc-600">None</span>}
                        {selectedPrInsightRefreshComparison.resolvedRisks.map((risk) => (
                          <span key={`refresh-resolved-${risk}`} className="rounded border border-emerald-900/50 px-2 py-1 text-emerald-300/80">{risk}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {(selectedPrInsight.signals || typeof selectedPrInsight.findingCount === "number") && (
              <section className="grid gap-3 text-sm sm:grid-cols-4 lg:grid-cols-6">
                {selectedPrInsight.signals && (
                  <>
                    <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                      <p className="text-xs text-zinc-600">Files</p>
                      <p className="mt-1 font-mono text-zinc-300">{selectedPrInsight.signals.fileCount}</p>
                    </div>
                    <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                      <p className="text-xs text-zinc-600">Threads</p>
                      <p className="mt-1 font-mono text-zinc-300">{selectedPrInsight.signals.threadCount}</p>
                    </div>
                    <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                      <p className="text-xs text-zinc-600">Failed builds</p>
                      <p className="mt-1 font-mono text-zinc-300">{selectedPrInsight.signals.failedBuildCount}</p>
                    </div>
                    <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                      <p className="text-xs text-zinc-600">Failed policies</p>
                      <p className="mt-1 font-mono text-zinc-300">{selectedPrInsight.signals.failedPolicyCount ?? 0}</p>
                    </div>
                    <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                      <p className="text-xs text-zinc-600">Work items</p>
                      <p className="mt-1 font-mono text-zinc-300">{selectedPrInsight.signals.workItemCount}</p>
                    </div>
                  </>
                )}
                {typeof selectedPrInsight.findingCount === "number" && (
                  <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                    <p className="text-xs text-zinc-600">Findings</p>
                    <p className="mt-1 font-mono text-zinc-300">{selectedPrInsight.findingCount}</p>
                  </div>
                )}
              </section>
            )}

            <PrInsightReadinessBlockers item={selectedPrInsight} />

            {selectedPrInsight.risks.length > 0 && (
              <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">Risks</h3>
                <div className="flex flex-wrap gap-1.5">
                  {selectedPrInsight.risks.map((risk) => (
                    <span key={risk} className="rounded-md border border-yellow-900/50 px-2 py-1 text-xs text-yellow-300/80">
                      {risk}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {selectedReview && (
          <div className="space-y-5">
            <header className="border-b border-zinc-800/70 pb-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${reviewOperationStatusClass(selectedReview.ok)}`}>
                  {selectedReview.ok ? "recorded" : "attention"}
                </span>
                <span className="text-xs text-zinc-600">{reviewOperationKindLabel(selectedReview.kind)}</span>
                <span className="text-xs text-zinc-600">{formatTime(Date.parse(selectedReview.at || "0") / 1000)}</span>
              </div>
              <h2 className="text-lg font-semibold text-zinc-100">{selectedReview.label}</h2>
              <p className="mt-1 font-mono text-xs text-zinc-600">{selectedReview.id}</p>
            </header>

            <section className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                <p className="text-xs text-zinc-600">Project Link</p>
                <p className="mt-1 text-zinc-300">{selectedReview.profileName}</p>
              </div>
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                <p className="text-xs text-zinc-600">Repository</p>
                <p className="mt-1 font-mono text-zinc-300">{selectedReview.repository}</p>
              </div>
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                <p className="text-xs text-zinc-600">Pull Request</p>
                <p className="mt-1 font-mono text-zinc-300">
                  {selectedReview.pullRequestId > 0 ? `#${selectedReview.pullRequestId}` : "Queue-level operation"}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
                <p className="text-xs text-zinc-600">Actor</p>
                <p className="mt-1 text-zinc-300">{selectedReview.actor || "unknown actor"}</p>
              </div>
            </section>

            <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">Details</h3>
              <p className="break-words text-sm text-zinc-300">{selectedReview.details || "No details recorded."}</p>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
