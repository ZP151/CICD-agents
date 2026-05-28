import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "../App.js";
import { fetchProfilePullRequests, type PullRequestSummary } from "../api.js";

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

export default function PullRequests(): JSX.Element {
  const { profiles, profilesLoading } = useAppData();
  const [profileId, setProfileId] = useState("");
  const [status, setStatus] = useState("active");
  const [prs, setPrs] = useState<PullRequestSummary[]>([]);
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

  return (
    <div className="flex min-h-full w-full flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800/70 pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100">Pull Requests</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Developer workspace for active PRs. This view starts with Azure DevOps PR state;
            pipeline readiness is matched from the selected profile when a pipeline is configured.
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
            <p className="mt-1 text-sm text-zinc-600">Try another profile or status filter.</p>
          </div>
        </div>
      )}

      {prs.length > 0 && (
        <div className="grid gap-3">
          {prs.map((pr) => {
            const state = readiness(pr);
            const pipeline = pipelineReadiness(pr);
            return (
              <article key={pr.id} className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-4">
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
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
