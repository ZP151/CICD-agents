import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "../App.js";
import { fetchProfileReviewQueue, type ReviewQueueItem } from "../api.js";

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
    description: "Medium-risk PRs, uncertain findings, or policy exceptions.",
    tone: "text-yellow-400 border-yellow-900/50 bg-yellow-950/10",
  },
  {
    key: "blocked",
    title: "Blocked",
    description: "High-risk findings, failed policy, failed pipeline, or conflicts.",
    tone: "text-red-400 border-red-900/50 bg-red-950/10",
  },
  {
    key: "watching",
    title: "Watching",
    description: "PRs waiting for new commits, pipeline completion, or policy updates.",
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

export default function ReviewFindings(): JSX.Element {
  const { profiles, profilesLoading } = useAppData();
  const [profileId, setProfileId] = useState("");
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId && profiles[0]) setProfileId(profiles[0].id);
  }, [profileId, profiles]);

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

  return (
    <div className="w-full space-y-6">
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
          Azure Table Storage is not configured, so Review Agent history is unavailable in this desktop session.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {lanes.map((lane) => (
          <div key={lane.key} className={`rounded-lg border p-4 ${lane.tone}`}>
            <p className="text-sm font-semibold">{lane.title}</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">{lane.description}</p>
            <p className="mt-4 text-2xl font-semibold text-zinc-200">{counts[lane.key]}</p>
          </div>
        ))}
      </section>

      {loading && <p className="text-sm text-zinc-600">Loading review decisions...</p>}

      {!loading && configured && items.length === 0 && (
        <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-8 text-center">
          <p className="text-sm font-medium text-zinc-400">No review decisions found</p>
          <p className="mt-1 text-sm text-zinc-600">The Review Agent has not written history for this repository yet.</p>
        </div>
      )}

      {items.length > 0 && (
        <section className="grid gap-3">
          {items.map((item) => (
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
              <div className="mt-4 grid gap-2 text-xs text-zinc-500 sm:grid-cols-3">
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
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
