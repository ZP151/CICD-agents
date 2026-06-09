import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "../App.js";
import {
  configureDaemon,
  fetchDaemonConfig,
  fetchProfileReviewQueue,
  type ReviewFinding,
  type ReviewQueueItem,
} from "../api.js";
import { loadFindingsLocal } from "../reviewHistoryLocal.js";

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

interface FindingsPanelProps {
  item: ReviewQueueItem;
  findings: ReviewFinding[];
  onClose: () => void;
}

function FindingsPanel({ item, findings, onClose }: FindingsPanelProps): JSX.Element {
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
  const [profileId, setProfileId] = useState("");
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

  useEffect(() => {
    if (!profileId && profiles[0]) setProfileId(profiles[0].id);
  }, [profileId, profiles]);

  useEffect(() => {
    fetchDaemonConfig()
      .then((cfg) => {
        if (cfg && typeof cfg.reviewAutoApproveEnabled === "boolean") {
          setAutoApproveEnabled(cfg.reviewAutoApproveEnabled);
        } else {
          setAutoApproveEnabled(true);
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

  const counts = useMemo(() => {
    return items.reduce<Record<ReviewQueueItem["decisionQueue"], number>>(
      (acc, item) => {
        acc[item.decisionQueue] += 1;
        return acc;
      },
      { auto_approved: 0, needs_human_review: 0, blocked: 0, watching: 0 },
    );
  }, [items]);

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
            Approval and quality queue for the selected profile. Decisions come from
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
            {profiles.length === 0 && <option value="">No profiles</option>}
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

      <section className="grid gap-3 lg:grid-cols-4">
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
          {items.map((item) => {
            const storedFindings = loadFindingsLocal(item.repository, item.pullRequestId);
            const hasFindings = item.findingCount > 0 || storedFindings.length > 0;

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
                    </div>
                    <p className="truncate text-sm font-medium text-zinc-200">{item.decisionReason || "No decision reason recorded."}</p>
                    <p className="mt-1 truncate font-mono text-xs text-zinc-600">
                      iteration {item.lastIterationId} · {item.sourceCommit || "unknown commit"}
                    </p>
                  </div>
                  <p className="text-xs text-zinc-600">{formatDate(item.lastRunAt)}</p>
                </div>
                <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                  <div className="grid gap-2 text-xs text-zinc-500 sm:grid-cols-3">
                    <div>
                      <p className="text-zinc-700">Findings</p>
                      <p className="mt-1 text-zinc-400">{item.findingCount}</p>
                    </div>
                    <div>
                      <p className="text-zinc-700">Auto-approved</p>
                      <p className="mt-1 truncate text-zinc-400">{item.autoApprovedAt ? formatDate(item.autoApprovedAt) : "No"}</p>
                    </div>
                    <div>
                      <p className="text-zinc-700">Actor</p>
                      <p className="mt-1 truncate text-zinc-400">{item.autoApprovalActor || "None"}</p>
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
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
