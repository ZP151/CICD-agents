import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "../App.js";
import { PaginationControls, paginateItems } from "../components/PaginationControls.js";
import {
  configureDaemon,
  fetchDaemonConfig,
  fetchProfileReviewQueue,
  fetchProfileReviewOperations,
  recordProfileReviewHistory,
  recordProfileReviewDisposition,
  recordProfileReviewOperation,
  runProfileReviewRun,
  type ReviewFinding,
  type ReviewQueueItem,
} from "../api.js";
import { buildReviewAuditCardSummary, buildReviewAuditViewModel, dispositionLabel } from "../reviewAudit.js";
import { compareReviewQueueItems, loadFindingsLocal, reviewQueuePriorityReasons, saveFindingsLocal } from "../reviewHistoryLocal.js";
import {
  loadStoredActiveProjectLinkId,
  resolveActiveProjectLinkId,
  saveStoredActiveProjectLinkId,
} from "../projectLinks.js";
import type { ReviewOperationEvent } from "../reviewOperations.js";
import {
  applyReviewRunToQueueItem,
  reviewQueueFreshnessStatus,
  reviewQueueItemKey,
  staleReviewQueueItems,
} from "../reviewRunHistory.js";

const lanes: Array<{
  key: ReviewQueueItem["decisionQueue"];
  title: string;
  description: string;
  tone: string;
}> = [
  {
    key: "auto_approved",
    title: "Auto-approved",
    description: "Low-risk PRs approved by the Review Agent with an audit record.",
    tone: "text-emerald-400 border-emerald-900/50 bg-emerald-950/10",
  },
  {
    key: "needs_human_review",
    title: "Needs human review",
    description: "Warnings, sensitive paths, or approval guardrails that need judgment.",
    tone: "review-lane-human text-yellow-400 border-yellow-900/50 bg-yellow-950/10",
  },
  {
    key: "blocked",
    title: "Blocked",
    description: "High-risk findings, failed pipeline checks, or merge conflicts.",
    tone: "text-red-400 border-red-900/50 bg-red-950/10",
  },
  {
    key: "watching",
    title: "Watching",
    description: "PRs waiting for commits, pipeline results, or approval configuration.",
    tone: "text-blue-400 border-blue-900/50 bg-blue-950/10",
  },
];

function formatDate(value: string): string {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString();
}

function riskTone(risk: ReviewQueueItem["decisionRiskLevel"]): string {
  if (risk === "high") return "bg-red-950/30 text-red-400 ring-red-900/60";
  if (risk === "medium") return "bg-yellow-950/30 text-yellow-400 ring-yellow-900/60";
  return "bg-emerald-950/30 text-emerald-400 ring-emerald-900/60";
}

function severityTone(severity: ReviewFinding["severity"]): string {
  if (severity === "blocking") return "text-red-400 bg-red-950/30 ring-red-900/60";
  if (severity === "warning") return "text-yellow-400 bg-yellow-950/30 ring-yellow-900/60";
  return "text-zinc-400 bg-zinc-800/50 ring-zinc-700/50";
}

function categoryLabel(category: ReviewFinding["category"]): string {
  const map: Record<ReviewFinding["category"], string> = {
    bug: "Bug",
    "missing-test": "Missing test",
    security: "Security",
    style: "Style",
    design: "Design",
  };
  return map[category] ?? category;
}

function operationKindLabel(kind: ReviewOperationEvent["kind"]): string {
  const map: Record<ReviewOperationEvent["kind"], string> = {
    rerun: "Rerun",
    batch_rerun: "Batch",
    stale_rerun: "Stale",
    disposition: "Disposition",
    ado_retry: "ADO retry",
    insight_preview: "Insight preview",
    review_run: "Review run",
  };
  return map[kind] ?? kind;
}

interface FindingsPanelProps {
  item: ReviewQueueItem;
  findings: ReviewFinding[];
  onClose: () => void;
}

function FindingsPanel({ item, findings, onClose }: FindingsPanelProps): JSX.Element {
  const audit = buildReviewAuditViewModel(item);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      {/* Panel */}
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 p-4">
          <div className="min-w-0">
            <p className="font-mono text-xs text-blue-400">#{item.pullRequestId}</p>
            <h3 className="mt-1 truncate text-sm font-semibold text-zinc-100">
              Review Findings ({findings.length})
            </h3>
            <p className="mt-0.5 truncate text-xs text-zinc-500">{item.decisionReason}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {audit.hasAudit && (
            <section className="mb-4 rounded-lg border border-zinc-800/70 bg-zinc-900/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-zinc-300">Disposition audit</p>
                  <p className="mt-1 text-xs text-zinc-600">{audit.dispositionSummary}</p>
                </div>
                {audit.dispositionAt && (
                  <span className="text-xs text-zinc-600">{formatDate(audit.dispositionAt)}</span>
                )}
              </div>
              {audit.dispositionEvents.length > 0 && (
                <ol className="mt-3 space-y-2">
                  {audit.dispositionEvents.map((event, index) => (
                    <li key={`${event.at}-${event.label}-${index}`} className="rounded-md bg-zinc-950/60 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-zinc-300">{event.label}</span>
                        <span className="text-[11px] text-zinc-600">{event.at ? formatDate(event.at) : "Unknown time"}</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {event.actor}
                        {event.note ? ` · ${event.note}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
              {audit.writeBackSummary && (
                <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-2 text-xs">
                  <p className={audit.writeBackSummary.ok ? "text-emerald-400/80" : "text-yellow-400/80"}>
                    ADO write-back {audit.writeBackSummary.statusLabel}
                    {audit.writeBackSummary.at ? ` · ${formatDate(audit.writeBackSummary.at)}` : ""}
                    {audit.writeBackSummary.threadId ? ` · thread ${audit.writeBackSummary.threadId}` : ""}
                  </p>
                  {audit.writeBackSummary.error && (
                    <p className="mt-1 text-yellow-500/80">{audit.writeBackSummary.error}</p>
                  )}
                  {audit.writeBackSummary.url && (
                    <a
                      href={audit.writeBackSummary.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex text-blue-400/80 underline-offset-2 hover:text-blue-300 hover:underline"
                    >
                      Open Azure DevOps thread
                    </a>
                  )}
                </div>
              )}
              {audit.writeBackAttempts.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-zinc-400">Write-back attempts</p>
                  <ol className="mt-2 space-y-2">
                    {audit.writeBackAttempts.map((event, index) => (
                      <li key={`${event.at}-${event.dispositionLabel}-${index}`} className="rounded-md bg-zinc-950/60 p-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={event.ok ? "text-emerald-400/80" : "text-yellow-400/80"}>
                            {event.statusLabel} · {event.dispositionLabel}
                          </span>
                          <span className="text-[11px] text-zinc-600">{event.at ? formatDate(event.at) : "Unknown time"}</span>
                        </div>
                        <p className="mt-1 text-zinc-500">
                          {event.actor}
                          {event.threadId ? ` · thread ${event.threadId}` : ""}
                        </p>
                        {event.note && <p className="mt-1 text-zinc-600">{event.note}</p>}
                        {event.error && <p className="mt-1 text-yellow-500/80">{event.error}</p>}
                        {event.url && (
                          <a
                            href={event.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex text-blue-400/80 underline-offset-2 hover:text-blue-300 hover:underline"
                          >
                            Open attempt thread
                          </a>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          )}
          {findings.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-400">No findings stored</p>
                <p className="mt-1 text-xs text-zinc-600">
                  Run a new review from the Pull Requests page to capture findings.
                </p>
              </div>
            </div>
          ) : (
            <ul className="space-y-3">
              {findings.map((f, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-zinc-800/70 bg-zinc-900/40 p-3"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${severityTone(f.severity)}`}>
                      {f.severity}
                    </span>
                    <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      {categoryLabel(f.category)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-mono text-zinc-500 truncate">
                    {f.file}
                    {f.line > 0 && <span className="text-zinc-600">:{f.line}</span>}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">{f.message}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

export default function ReviewFindings(): JSX.Element {
  const { profiles, profilesLoading } = useAppData();
  const [profileId, setProfileId] = useState(() => loadStoredActiveProjectLinkId());
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [configured, setConfigured] = useState(true);
  const [storage, setStorage] = useState<"azure" | "local" | "browser" | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ReviewQueueItem | null>(null);
  const [panelFindings, setPanelFindings] = useState<ReviewFinding[]>([]);
  const [autoApproveEnabled, setAutoApproveEnabled] = useState(true);
  const [autoApproveSaving, setAutoApproveSaving] = useState(false);
  const [autoApproveError, setAutoApproveError] = useState<string | null>(null);
  const [staleAgeHours, setStaleAgeHours] = useState(24);
  const [staleAgeSaving, setStaleAgeSaving] = useState(false);
  const [queueFilter, setQueueFilter] = useState<ReviewQueueItem["decisionQueue"] | "all">("all");
  const [sortMode, setSortMode] = useState<"attention" | "recent">("attention");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [writeBackRetrying, setWriteBackRetrying] = useState<Record<string, boolean>>({});
  const [rerunning, setRerunning] = useState<Record<string, boolean>>({});
  const [batchRerunning, setBatchRerunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchMode, setBatchMode] = useState<"visible" | "stale">("visible");
  const [operationEvents, setOperationEvents] = useState<ReviewOperationEvent[]>([]);

  useEffect(() => {
    if (profiles.length === 0) return;
    setProfileId((current) => resolveActiveProjectLinkId(profiles, current));
  }, [profiles]);

  useEffect(() => {
    saveStoredActiveProjectLinkId(profileId);
  }, [profileId]);

  useEffect(() => {
    fetchDaemonConfig()
      .then((cfg) => {
        if (cfg && typeof cfg.reviewAutoApproveEnabled === "boolean") {
          setAutoApproveEnabled(cfg.reviewAutoApproveEnabled);
        } else {
          setAutoApproveEnabled(true);
        }
        if (cfg && Number.isFinite(cfg.reviewStaleAgeHours) && cfg.reviewStaleAgeHours > 0) {
          setStaleAgeHours(cfg.reviewStaleAgeHours);
        }
      })
      .catch(() => {
        setAutoApproveEnabled(true);
      });
  }, []);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === profileId) ?? null,
    [profiles, profileId],
  );

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchProfileReviewQueue(profileId);
      setItems(result.items);
      setConfigured(result.configured);
      setStorage(result.storage);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profileId) return;
    fetchProfileReviewOperations(profileId)
      .then((events) => setOperationEvents(events.slice(0, 6)))
      .catch(() => setOperationEvents([]));
  }, [profileId]);

  const counts = useMemo(() => {
    return items.reduce<Record<ReviewQueueItem["decisionQueue"], number>>(
      (acc, item) => {
        acc[item.decisionQueue] += 1;
        return acc;
      },
      { auto_approved: 0, needs_human_review: 0, blocked: 0, watching: 0 },
    );
  }, [items]);

  const displayedItems = useMemo(() => {
    const filtered =
      queueFilter === "all" ? items : items.filter((item) => item.decisionQueue === queueFilter);
    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === "recent") {
        return Date.parse(b.lastRunAt || "0") - Date.parse(a.lastRunAt || "0");
      }
      return compareReviewQueueItems(a, b);
    });
    return sorted;
  }, [items, queueFilter, sortMode]);

  const staleDisplayedItems = useMemo(
    () => staleReviewQueueItems(displayedItems, Date.now(), staleAgeHours),
    [displayedItems, staleAgeHours],
  );

  const paginatedItems = useMemo(
    () => paginateItems(displayedItems, page, pageSize),
    [displayedItems, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [profileId, queueFilter, sortMode]);

  useEffect(() => {
    if (page > paginatedItems.pageCount) setPage(paginatedItems.pageCount);
  }, [page, paginatedItems.pageCount]);

  function openFindings(item: ReviewQueueItem): void {
    const findings = loadFindingsLocal(item.repository, item.pullRequestId);
    setPanelFindings(findings);
    setSelectedItem(item);
  }

  function closePanel(): void {
    setSelectedItem(null);
    setPanelFindings([]);
  }

  async function setGlobalAutoApprove(enabled: boolean): Promise<void> {
    setAutoApproveSaving(true);
    setAutoApproveError(null);
    try {
      await configureDaemon({ reviewAutoApproveEnabled: enabled });
      setAutoApproveEnabled(enabled);
    } catch (err) {
      setAutoApproveError(err instanceof Error ? err.message : String(err));
    } finally {
      setAutoApproveSaving(false);
    }
  }

  function recordOperation(event: Parameters<typeof recordProfileReviewOperation>[1]): void {
    if (!profileId) return;
    void recordProfileReviewOperation(profileId, event)
      .then(() => fetchProfileReviewOperations(profileId))
      .then((events) => setOperationEvents(events.slice(0, 6)))
      .catch(() => {
        /* activity is best-effort */
      });
  }

  async function saveStaleAgeHours(value: number): Promise<void> {
    const normalized = Number.isFinite(value) && value > 0 ? Math.round(value) : 24;
    setStaleAgeHours(normalized);
    setStaleAgeSaving(true);
    setAutoApproveError(null);
    try {
      await configureDaemon({ reviewStaleAgeHours: normalized });
    } catch (err) {
      setAutoApproveError(err instanceof Error ? err.message : String(err));
    } finally {
      setStaleAgeSaving(false);
    }
  }

  async function applyDisposition(
    item: ReviewQueueItem,
    disposition: ReviewQueueItem["manualDisposition"],
  ): Promise<void> {
    if (!profileId) return;
    const now = new Date().toISOString();
    const actor = "desktop-user";
    const note = dispositionLabel(disposition);
    const event = { disposition, at: now, actor, note };
    const next: ReviewQueueItem = {
      ...item,
      manualDisposition: disposition,
      manualDispositionAt: now,
      manualDispositionActor: actor,
      manualDispositionNote: note,
      manualDispositionEvents: [...(item.manualDispositionEvents ?? []), event],
      manualDispositionWriteBackAttempted: disposition === "marked_blocked" || disposition === "changes_requested",
      manualDispositionWriteBackOk: false,
      manualDispositionWriteBackError: "",
      manualDispositionWriteBackAt: "",
      manualDispositionWriteBackThreadId: "",
      manualDispositionWriteBackUrl: "",
      manualDispositionWriteBackEvents: item.manualDispositionWriteBackEvents ?? [],
      decisionQueue:
        disposition === "marked_blocked" || disposition === "changes_requested"
          ? "blocked"
          : disposition === "marked_safe"
            ? "auto_approved"
            : item.decisionQueue,
      decisionRiskLevel:
        disposition === "marked_blocked" || disposition === "changes_requested"
          ? "high"
          : disposition === "marked_safe"
            ? "low"
            : item.decisionRiskLevel,
      decisionReason:
        disposition === "acknowledged"
          ? `Acknowledged by ${actor}. ${item.decisionReason}`
          : disposition === "marked_safe"
            ? "Manually marked safe in Review Queue."
            : disposition === "marked_blocked"
              ? "Manually marked blocked in Review Queue."
              : disposition === "changes_requested"
                ? "Changes requested from Review Queue."
                : item.decisionReason,
    };
    setItems((prev) => prev.map((current) => (
      current.repository === item.repository && current.pullRequestId === item.pullRequestId ? next : current
    )));
    try {
      const saved = await recordProfileReviewDisposition(profileId, next, {
        writeBackToAdo: disposition === "marked_blocked" || disposition === "changes_requested",
      });
      recordOperation({
        kind: "disposition",
        repository: item.repository,
        pullRequestId: item.pullRequestId,
        label: dispositionLabel(disposition),
        ok: true,
        details: note,
      });
      if (saved) {
        setItems((prev) => prev.map((current) => (
          current.repository === saved.repository && current.pullRequestId === saved.pullRequestId ? saved : current
        )));
        setSelectedItem((current) => (
          current?.repository === saved.repository && current.pullRequestId === saved.pullRequestId ? saved : current
        ));
      }
    } catch (err) {
      recordOperation({
        kind: "disposition",
        repository: item.repository,
        pullRequestId: item.pullRequestId,
        label: dispositionLabel(disposition),
        ok: false,
        details: err instanceof Error ? err.message : String(err),
      });
      setError(err instanceof Error ? err.message : String(err));
      await load();
    }
  }

  async function retryDispositionWriteBack(item: ReviewQueueItem): Promise<void> {
    if (!profileId || !item.manualDisposition) return;
    const retryKey = reviewQueueItemKey(item);
    if (writeBackRetrying[retryKey]) return;
    setWriteBackRetrying((prev) => ({ ...prev, [retryKey]: true }));
    const retrying: ReviewQueueItem = {
      ...item,
      manualDispositionWriteBackAttempted: true,
      manualDispositionWriteBackOk: false,
      manualDispositionWriteBackError: "",
      manualDispositionWriteBackAt: "",
      manualDispositionWriteBackThreadId: "",
      manualDispositionWriteBackUrl: "",
      manualDispositionWriteBackEvents: item.manualDispositionWriteBackEvents ?? [],
    };
    setItems((prev) => prev.map((current) => (
      current.repository === item.repository && current.pullRequestId === item.pullRequestId ? retrying : current
    )));
    try {
      const saved = await recordProfileReviewDisposition(profileId, retrying, { writeBackToAdo: true });
      recordOperation({
        kind: "ado_retry",
        repository: item.repository,
        pullRequestId: item.pullRequestId,
        label: "Retry ADO write-back",
        ok: Boolean(saved?.manualDispositionWriteBackOk),
        details: saved?.manualDispositionWriteBackOk
          ? `Posted${saved.manualDispositionWriteBackThreadId ? ` to thread ${saved.manualDispositionWriteBackThreadId}` : ""}.`
          : saved?.manualDispositionWriteBackError || "ADO write-back still pending.",
      });
      if (saved) {
        setItems((prev) => prev.map((current) => (
          current.repository === saved.repository && current.pullRequestId === saved.pullRequestId ? saved : current
        )));
        setSelectedItem((current) => (
          current?.repository === saved.repository && current.pullRequestId === saved.pullRequestId ? saved : current
        ));
      }
    } catch (err) {
      recordOperation({
        kind: "ado_retry",
        repository: item.repository,
        pullRequestId: item.pullRequestId,
        label: "Retry ADO write-back",
        ok: false,
        details: err instanceof Error ? err.message : String(err),
      });
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setWriteBackRetrying((prev) => ({ ...prev, [retryKey]: false }));
    }
  }

  async function rerunReview(item: ReviewQueueItem): Promise<void> {
    if (!profileId) return;
    const rerunKey = reviewQueueItemKey(item);
    if (rerunning[rerunKey]) return;
    setRerunning((prev) => ({ ...prev, [rerunKey]: true }));
    setError(null);
    try {
      const result = await runProfileReviewRun(profileId, item.pullRequestId, selectedProfile?.targetBranch || "main");
      const next = applyReviewRunToQueueItem(item, result);
      await recordProfileReviewHistory(profileId, next);
      saveFindingsLocal(result.repository, result.pullRequestId, result.findings ?? []);
      recordOperation({
        kind: "rerun",
        repository: result.repository,
        pullRequestId: result.pullRequestId,
        label: "Rerun review",
        ok: true,
        details: `${result.decisionQueue.replace(/_/g, " ")} · ${result.findingCount} findings`,
      });
      setItems((prev) => prev.map((current) => (
        current.repository === item.repository && current.pullRequestId === item.pullRequestId ? next : current
      )));
      setSelectedItem((current) => (
        current?.repository === item.repository && current.pullRequestId === item.pullRequestId ? next : current
      ));
      setPanelFindings((current) => (
        selectedItem?.repository === item.repository && selectedItem.pullRequestId === item.pullRequestId
          ? result.findings ?? []
          : current
      ));
    } catch (err) {
      recordOperation({
        kind: "rerun",
        repository: item.repository,
        pullRequestId: item.pullRequestId,
        label: "Rerun review",
        ok: false,
        details: err instanceof Error ? err.message : String(err),
      });
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setRerunning((prev) => ({ ...prev, [rerunKey]: false }));
    }
  }

  async function rerunReviewItems(candidates: ReviewQueueItem[], mode: "visible" | "stale"): Promise<void> {
    if (!profileId || candidates.length === 0 || batchRerunning) return;
    const queue = candidates.filter((item) => !rerunning[reviewQueueItemKey(item)]);
    if (queue.length === 0) return;
    recordOperation({
      kind: mode === "stale" ? "stale_rerun" : "batch_rerun",
      repository: selectedProfile?.adoRepoName || "visible queue",
      pullRequestId: 0,
      label: mode === "stale" ? "Rerun stale" : "Rerun visible",
      ok: true,
      details: `${queue.length} queued`,
    });
    setBatchMode(mode);
    setBatchRerunning(true);
    setBatchProgress({ done: 0, total: queue.length });
    try {
      let done = 0;
      for (const item of queue) {
        await rerunReview(item);
        done += 1;
        setBatchProgress({ done, total: queue.length });
      }
    } finally {
      setBatchRerunning(false);
    }
  }

  async function rerunVisibleReviews(): Promise<void> {
    await rerunReviewItems(paginatedItems.pageItems, "visible");
  }

  async function rerunStaleReviews(): Promise<void> {
    await rerunReviewItems(staleDisplayedItems, "stale");
  }

  return (
    <div className="w-full space-y-6">
      {selectedItem && (
        <FindingsPanel
          item={selectedItem}
          findings={panelFindings}
          onClose={closePanel}
        />
      )}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100">Review Queue</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Approval and quality queue for the selected Project Link. Decisions come from
            Review Agent history, including auto-approval audit records.
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
          <span className="rounded-full border border-zinc-800 px-2 py-1">target: {selectedProfile.targetBranch || "main"}</span>
        </div>
      )}

      {!configured && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 text-sm text-zinc-500">
          Azure Table Storage is not configured. Review history is stored on this device
          {storage === "browser" ? " (browser)" : storage === "local" ? " and in the daemon data folder" : ""}.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {autoApproveError && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
          {autoApproveError}
        </div>
      )}

      {operationEvents.length > 0 && (
        <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-400">Recent activity</p>
            <span className="text-[11px] text-zinc-700">{operationEvents.length} latest</span>
          </div>
          <ol className="mt-2 grid gap-1.5">
            {operationEvents.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ring-1 ${
                  event.ok
                    ? "bg-emerald-950/20 text-emerald-500/80 ring-emerald-900/40"
                    : "bg-yellow-950/30 text-yellow-400 ring-yellow-900/60"
                }`}>
                  {operationKindLabel(event.kind)}
                </span>
                <span className="font-mono text-zinc-600">
                  {event.pullRequestId > 0 ? `#${event.pullRequestId}` : event.repository}
                </span>
                <span className="text-zinc-500">{event.label}</span>
                {event.details && <span className="text-zinc-700">{event.details}</span>}
                <span className="ml-auto text-[11px] text-zinc-700">{formatDate(event.at)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {lanes.map((lane) => (
          <div key={lane.key} className={`rounded-lg border p-4 ${lane.tone}`}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold">{lane.title}</p>
              {lane.key === "auto_approved" && (
                <button
                  type="button"
                  disabled={autoApproveSaving}
                  onClick={() => void setGlobalAutoApprove(!autoApproveEnabled)}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition disabled:opacity-50 ${
                    autoApproveEnabled
                      ? "border-emerald-800/60 bg-emerald-900/40 text-emerald-300"
                      : "border-zinc-700 bg-zinc-800/40 text-zinc-500 hover:text-zinc-300"
                  }`}
                  title={autoApproveEnabled ? "Disable auto-approve" : "Enable auto-approve"}
                  aria-label={autoApproveEnabled ? "Disable auto-approve" : "Enable auto-approve"}
                  aria-pressed={autoApproveEnabled}
                >
                  {autoApproveEnabled ? (
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  )}
                </button>
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">{lane.description}</p>
            <div className="mt-4 flex items-end justify-between gap-2">
              <p className="text-2xl font-semibold text-zinc-200">{counts[lane.key]}</p>
              {lane.key === "auto_approved" && (
                <p className="text-[10px] font-medium text-zinc-600">
                  {autoApproveEnabled ? "Enabled" : "Disabled"}
                </p>
              )}
            </div>
          </div>
        ))}
      </section>

      {loading && <p className="text-sm text-zinc-600">Loading review decisions...</p>}

      {!loading && items.length === 0 && (
        <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-8 text-center">
          <p className="text-sm font-medium text-zinc-400">No review decisions found</p>
          <p className="mt-1 text-sm text-zinc-600">The Review Agent has not written history for this repository yet.</p>
        </div>
      )}

      {items.length > 0 && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-3">
            <div className="flex flex-wrap gap-1.5">
              {(["all", "blocked", "needs_human_review", "watching", "auto_approved"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setQueueFilter(key)}
                  className={`rounded-md px-2.5 py-1 text-xs transition ${
                    queueFilter === key
                      ? "bg-blue-950/40 text-blue-300 ring-1 ring-blue-900/60"
                      : "border border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                  }`}
                >
                  {key === "all" ? "All" : key.replace(/_/g, " ")}
                </button>
              ))}
            </div>
            <select
              className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-400 outline-none"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value === "recent" ? "recent" : "attention")}
              aria-label="Sort review queue"
            >
              <option value="attention">Needs attention first</option>
              <option value="recent">Most recent first</option>
            </select>
            <label className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-500">
              Stale
              <input
                type="number"
                min={1}
                value={staleAgeHours}
                disabled={staleAgeSaving}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setStaleAgeHours(Number.isFinite(next) && next > 0 ? next : 1);
                }}
                onBlur={(e) => void saveStaleAgeHours(Number(e.target.value))}
                className="w-12 bg-transparent text-right text-zinc-300 outline-none disabled:opacity-60"
                aria-label="Stale review age in hours"
              />
              h
            </label>
            <button
              type="button"
              disabled={batchRerunning || paginatedItems.pageItems.length === 0}
              onClick={() => void rerunVisibleReviews()}
              className="rounded-md border border-blue-900/50 px-2.5 py-1 text-xs text-blue-400/80 transition hover:border-blue-700 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {batchRerunning && batchProgress && batchMode === "visible"
                ? `Rerun visible ${batchProgress.done}/${batchProgress.total}`
                : "Rerun page"}
            </button>
            <button
              type="button"
              disabled={batchRerunning || staleDisplayedItems.length === 0}
              onClick={() => void rerunStaleReviews()}
              className="rounded-md border border-yellow-900/50 px-2.5 py-1 text-xs text-yellow-400/80 transition hover:border-yellow-700 hover:text-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {batchRerunning && batchProgress && batchMode === "stale"
                ? `Rerun stale ${batchProgress.done}/${batchProgress.total}`
                : "Rerun stale"}
              {!(batchRerunning && batchMode === "stale") && staleDisplayedItems.length > 0 && (
                <span className="ml-1.5 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                  {staleDisplayedItems.length}
                </span>
              )}
            </button>
            <span className="ml-auto text-xs text-zinc-600">
              {displayedItems.length} visible from {items.length} decisions
            </span>
          </div>

          {paginatedItems.pageItems.map((item) => {
            const storedFindings = loadFindingsLocal(item.repository, item.pullRequestId);
            const hasFindings = item.findingCount > 0 || storedFindings.length > 0;
            const attentionReasons = reviewQueuePriorityReasons(item);
            const writeBackRetryKey = reviewQueueItemKey(item);
            const isRetryingWriteBack = Boolean(writeBackRetrying[writeBackRetryKey]);
            const rerunKey = reviewQueueItemKey(item);
            const isRerunning = Boolean(rerunning[rerunKey]);
            const freshness = reviewQueueFreshnessStatus(item, Date.now(), staleAgeHours);
            const auditSummary = buildReviewAuditCardSummary(item);

            return (
              <article key={`${item.repository}-${item.pullRequestId}`} className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-blue-400">#{item.pullRequestId}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${riskTone(item.decisionRiskLevel)}`}>
                        {item.decisionRiskLevel}
                      </span>
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                        {item.decisionQueue.replace(/_/g, " ")}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ring-1 ${
                        freshness.stale
                          ? "bg-yellow-950/30 text-yellow-400 ring-yellow-900/60"
                          : "bg-emerald-950/20 text-emerald-500/80 ring-emerald-900/40"
                      }`}>
                        {freshness.label}
                      </span>
                    </div>
                    <p className="truncate text-sm font-medium text-zinc-200">{item.decisionReason || "No decision reason recorded."}</p>
                    <p className="mt-1 truncate font-mono text-xs text-zinc-600">
                      iteration {item.lastIterationId} · {item.sourceCommit || "unknown commit"}
                    </p>
                    {attentionReasons.length > 0 && (
                      <p className="mt-2 text-xs text-zinc-500">
                        Attention: {attentionReasons.slice(0, 4).join(" · ")}
                      </p>
                    )}
                    {(item.autoApprovedAt || item.autoApprovalActor) && (
                      <p className="mt-1 text-xs text-zinc-600">
                        Auto-approval: {item.autoApprovedAt ? formatDate(item.autoApprovedAt) : "not recorded"}
                        {item.autoApprovalActor ? ` · ${item.autoApprovalActor}` : ""}
                      </p>
                    )}
                    {auditSummary.hasAudit && (
                      <p className={`mt-1 text-xs ${
                        auditSummary.tone === "success"
                          ? "text-emerald-500/75"
                          : auditSummary.tone === "warning"
                            ? "text-yellow-500/80"
                            : "text-zinc-600"
                      }`}>
                        Audit: {auditSummary.label}
                        {item.manualDispositionAt ? ` · ${formatDate(item.manualDispositionAt)}` : ""}
                        {auditSummary.threadId ? ` · thread ${auditSummary.threadId}` : ""}
                        {auditSummary.url && (
                          <>
                            {" · "}
                            <a
                              href={auditSummary.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-400/80 underline-offset-2 hover:text-blue-300 hover:underline"
                            >
                              open thread
                            </a>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-zinc-600">{formatDate(item.lastRunAt)}</p>
                </div>
                <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                  <div className="grid gap-2 text-xs text-zinc-500 sm:grid-cols-4">
                    <div>
                      <p className="text-zinc-700">Findings</p>
                      <p className="mt-1 text-zinc-400">{item.findingCount}</p>
                    </div>
                    <div>
                      <p className="text-zinc-700">Discarded</p>
                      <p className="mt-1 text-zinc-400">{item.discardedFindingCount}</p>
                    </div>
                    <div>
                      <p className="text-zinc-700">Hunk coverage</p>
                      <p className="mt-1 text-zinc-400">
                        {item.hunkCoverageFiles} files · {item.changedHunkLines} lines
                      </p>
                    </div>
                    <div>
                      <p className="text-zinc-700">Fallback</p>
                      <p className="mt-1 text-zinc-400">{item.wholeFileFallbackFiles} files</p>
                    </div>
                  </div>
                  {hasFindings && (
                    <button
                      onClick={() => openFindings(item)}
                      className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-blue-700 hover:text-blue-300"
                    >
                      View findings
                      {storedFindings.length > 0 && (
                        <span className="ml-1.5 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                          {storedFindings.length}
                        </span>
                      )}
                    </button>
                  )}
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <button
                      type="button"
                      disabled={isRerunning}
                      onClick={() => void rerunReview(item)}
                      className="rounded-md border border-blue-900/50 px-2.5 py-1 text-xs text-blue-400/80 transition hover:border-blue-700 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isRerunning ? "Rerunning..." : "Rerun review"}
                    </button>
                    {item.manualDisposition &&
                      (item.manualDisposition === "marked_blocked" || item.manualDisposition === "changes_requested") &&
                      !item.manualDispositionWriteBackOk && (
                        <button
                          type="button"
                          disabled={isRetryingWriteBack}
                          onClick={() => void retryDispositionWriteBack(item)}
                          className="rounded-md border border-blue-900/50 px-2.5 py-1 text-xs text-blue-400/80 transition hover:border-blue-700 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isRetryingWriteBack ? "Retrying..." : "Retry ADO"}
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={() => void applyDisposition(item, "acknowledged")}
                      className="rounded-md border border-zinc-800 px-2.5 py-1 text-xs text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300"
                    >
                      Acknowledge
                    </button>
                    <button
                      type="button"
                      onClick={() => void applyDisposition(item, "marked_safe")}
                      className="rounded-md border border-emerald-900/50 px-2.5 py-1 text-xs text-emerald-400/80 transition hover:border-emerald-700 hover:text-emerald-300"
                    >
                      Mark safe
                    </button>
                    <button
                      type="button"
                      onClick={() => void applyDisposition(item, "marked_blocked")}
                      className="rounded-md border border-red-900/50 px-2.5 py-1 text-xs text-red-400/80 transition hover:border-red-700 hover:text-red-300"
                    >
                      Block
                    </button>
                    <button
                      type="button"
                      onClick={() => void applyDisposition(item, "changes_requested")}
                      className="rounded-md border border-yellow-900/50 px-2.5 py-1 text-xs text-yellow-400/80 transition hover:border-yellow-700 hover:text-yellow-300"
                    >
                      Request changes
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {displayedItems.length === 0 && (
            <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-6 text-center">
              <p className="text-sm text-zinc-500">No review decisions match this queue filter.</p>
            </div>
          )}
          <PaginationControls
            page={page}
            pageCount={paginatedItems.pageCount}
            pageSize={pageSize}
            totalItems={displayedItems.length}
            visibleItems={paginatedItems.pageItems.length}
            itemLabel="review decisions"
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(1);
            }}
          />
        </section>
      )}
    </div>
  );
}
