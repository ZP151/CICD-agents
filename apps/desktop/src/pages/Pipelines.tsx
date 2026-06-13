import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "../App.js";
import {
  fetchProfilePullRequests,
  runChatWorkflowAction,
  type ChatWorkflowActionResult,
  type PipelineRunSummary,
  type PullRequestSummary,
} from "../api.js";
import { PaginationControls, paginateItems } from "../components/PaginationControls.js";
import {
  loadStoredActiveProjectLinkId,
  resolveActiveProjectLinkId,
  saveStoredActiveProjectLinkId,
} from "../projectLinks.js";

type PipelineStatusFilter = "all" | "failed" | "running" | "succeeded" | "not_configured";

const pipelineFilters: Array<{ key: PipelineStatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "failed", label: "Failed" },
  { key: "running", label: "Running" },
  { key: "succeeded", label: "Succeeded" },
  { key: "not_configured", label: "Not configured" },
];

interface PipelineRow {
  profileId: string;
  profileName: string;
  repoPath: string;
  repository: string;
  project: string;
  orgUrl: string;
  pipelineId: string;
  pipelineName: string;
  defaultBranch: string;
  targetBranch: string;
  latestRun?: PipelineRunSummary;
  relatedPullRequests: PullRequestSummary[];
}

type InspectState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; result: ChatWorkflowActionResult; runs: PipelineRunSummary[] }
  | { phase: "approval"; result: ChatWorkflowActionResult }
  | { phase: "error"; message: string };

function formatDate(value: string | undefined): string {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString();
}

function runTone(run: PipelineRunSummary | undefined): { label: string; tone: string } {
  if (!run) return { label: "No recent run", tone: "text-zinc-500 bg-zinc-800/60 ring-zinc-700/50" };
  if (run.state && run.state !== "completed") return { label: run.state, tone: "text-blue-400 bg-blue-950/20 ring-blue-900/50" };
  if (run.result === "succeeded") return { label: "Succeeded", tone: "text-emerald-400 bg-emerald-950/20 ring-emerald-900/50" };
  if (run.result === "failed" || run.result === "canceled") return { label: run.result, tone: "text-red-400 bg-red-950/30 ring-red-900/60" };
  return { label: run.result || run.state || "Unknown", tone: "text-zinc-400 bg-zinc-800/60 ring-zinc-700/50" };
}

function rowMatchesFilter(row: PipelineRow, filter: PipelineStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "not_configured") return !row.pipelineId;
  if (!row.latestRun) return false;
  if (filter === "running") return Boolean(row.latestRun.state && row.latestRun.state !== "completed");
  if (filter === "failed") return row.latestRun.result === "failed" || row.latestRun.result === "canceled";
  return row.latestRun.result === "succeeded";
}

function extractPipelineRuns(result: ChatWorkflowActionResult): PipelineRunSummary[] {
  const tool = result.tools.find((item) => item.name === "ado_list_pipeline_runs");
  if (!tool?.stdout) return [];
  try {
    const parsed = JSON.parse(tool.stdout) as { runs?: PipelineRunSummary[] };
    return Array.isArray(parsed.runs) ? parsed.runs : [];
  } catch {
    return [];
  }
}

export default function Pipelines(): JSX.Element {
  const { profiles, profilesLoading } = useAppData();
  const [profileId, setProfileId] = useState(() => loadStoredActiveProjectLinkId());
  const [filter, setFilter] = useState<PipelineStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [relatedPrs, setRelatedPrs] = useState<Record<string, PullRequestSummary[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspectState, setInspectState] = useState<Record<string, InspectState>>({});

  useEffect(() => {
    if (profiles.length === 0) return;
    setProfileId((current) => resolveActiveProjectLinkId(profiles, current));
  }, [profiles]);

  useEffect(() => {
    saveStoredActiveProjectLinkId(profileId);
  }, [profileId]);

  const selectedProfiles = useMemo(
    () => profileId ? profiles.filter((profile) => profile.id === profileId) : profiles,
    [profileId, profiles],
  );

  const loadRelatedPullRequests = useCallback(async () => {
    if (selectedProfiles.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const entries = await Promise.all(selectedProfiles.map(async (profile) => {
        if (!profile.adoPipelineId) return [profile.id, []] as const;
        const active = await fetchProfilePullRequests(profile.id, "active");
        return [profile.id, active] as const;
      }));
      setRelatedPrs(Object.fromEntries(entries));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedProfiles]);

  useEffect(() => {
    void loadRelatedPullRequests();
  }, [loadRelatedPullRequests]);

  const rows = useMemo<PipelineRow[]>(() => {
    return selectedProfiles.map((profile) => {
      const prs = relatedPrs[profile.id] ?? [];
      const runs = prs.map((pr) => pr.pipelineRun).filter((run): run is PipelineRunSummary => Boolean(run));
      const latestRun = runs.sort((a, b) => {
        const left = Date.parse(b.finishedDate || b.createdDate || "0");
        const right = Date.parse(a.finishedDate || a.createdDate || "0");
        return left - right;
      })[0];
      return {
        profileId: profile.id,
        profileName: profile.name,
        repoPath: profile.repoPath,
        repository: profile.adoRepoName,
        project: profile.adoProject,
        orgUrl: profile.adoOrgUrl,
        pipelineId: profile.adoPipelineId,
        pipelineName: profile.adoPipelineName,
        defaultBranch: profile.defaultBranch,
        targetBranch: profile.targetBranch,
        latestRun,
        relatedPullRequests: prs,
      };
    });
  }, [relatedPrs, selectedProfiles]);

  const counts = useMemo(() => {
    return pipelineFilters.reduce<Record<PipelineStatusFilter, number>>((acc, item) => {
      acc[item.key] = rows.filter((row) => rowMatchesFilter(row, item.key)).length;
      return acc;
    }, { all: 0, failed: 0, running: 0, succeeded: 0, not_configured: 0 });
  }, [rows]);

  const filteredRows = useMemo(
    () => rows.filter((row) => rowMatchesFilter(row, filter)),
    [filter, rows],
  );

  const paginatedRows = useMemo(
    () => paginateItems(filteredRows, page, pageSize),
    [filteredRows, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [filter, profileId]);

  useEffect(() => {
    if (page > paginatedRows.pageCount) setPage(paginatedRows.pageCount);
  }, [page, paginatedRows.pageCount]);

  async function inspectPipeline(row: PipelineRow): Promise<void> {
    if (!row.pipelineId) return;
    setInspectState((current) => ({ ...current, [row.profileId]: { phase: "loading" } }));
    try {
      const result = await runChatWorkflowAction("inspect_pipeline", row.repoPath, row.profileId, {
        pipelineId: Number(row.pipelineId),
      });
      setInspectState((current) => ({
        ...current,
        [row.profileId]: { phase: "done", result, runs: extractPipelineRuns(result) },
      }));
    } catch (err) {
      setInspectState((current) => ({
        ...current,
        [row.profileId]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  async function triggerPipeline(row: PipelineRow): Promise<void> {
    if (!row.pipelineId) return;
    setInspectState((current) => ({ ...current, [row.profileId]: { phase: "loading" } }));
    try {
      const result = await runChatWorkflowAction("trigger_pipeline", row.repoPath, row.profileId, {
        pipelineId: Number(row.pipelineId),
        branch: row.defaultBranch,
      });
      setInspectState((current) => ({ ...current, [row.profileId]: { phase: "approval", result } }));
    } catch (err) {
      setInspectState((current) => ({
        ...current,
        [row.profileId]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  return (
    <div className="flex min-h-full w-full flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800/70 pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100">Pipelines</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
            CI/CD execution workspace for Project Link pipeline configuration, recent run state,
            and controlled Azure Pipeline inspect or trigger actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 outline-none"
            value={profileId}
            disabled={profilesLoading || profiles.length === 0}
            onChange={(event) => setProfileId(event.target.value)}
          >
            {profiles.length === 0 && <option value="">No Project Links</option>}
            {profiles.length > 0 && <option value="">All Project Links</option>}
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
          <button
            onClick={() => void loadRelatedPullRequests()}
            className="rounded-md border border-zinc-800 px-3 py-1.5 text-sm text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300"
          >
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {pipelineFilters.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={`rounded-lg border p-3 text-left transition ${
              filter === item.key
                ? "border-blue-900/60 bg-blue-950/20 text-blue-300"
                : "border-zinc-800/70 bg-zinc-900/20 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            }`}
          >
            <p className="text-xs font-medium">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-200">{counts[item.key]}</p>
          </button>
        ))}
      </section>

      {loading && <p className="text-sm text-zinc-600">Loading pipeline-linked pull requests...</p>}

      {!loading && rows.length === 0 && (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-8 text-center">
          <div>
            <p className="text-sm font-medium text-zinc-400">No Project Links available</p>
            <p className="mt-1 text-sm text-zinc-600">Create a Project Link before inspecting pipelines.</p>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="grid gap-3">
          {paginatedRows.pageItems.map((row) => {
            const tone = runTone(row.latestRun);
            const state = inspectState[row.profileId] ?? { phase: "idle" };
            const inspectedRuns = state.phase === "done" ? state.runs : [];
            return (
              <article key={row.profileId} className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-blue-400">
                        {row.pipelineId ? `#${row.pipelineId}` : "No pipeline"}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${tone.tone}`}>
                        {tone.label}
                      </span>
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                        {row.profileName}
                      </span>
                    </div>
                    <h3 className="truncate text-sm font-medium text-zinc-200">
                      {row.pipelineName || row.pipelineId || "Pipeline not configured"}
                    </h3>
                    <p className="mt-1 truncate font-mono text-xs text-zinc-600">
                      {row.project || "No project"} / {row.repository || "No repository"}
                    </p>
                  </div>
                  <p className="text-xs text-zinc-600">
                    {formatDate(row.latestRun?.finishedDate || row.latestRun?.createdDate)}
                  </p>
                </div>

                <div className="mt-4 grid gap-3 text-xs text-zinc-500 sm:grid-cols-4">
                  <div>
                    <p className="text-zinc-700">Default branch</p>
                    <p className="mt-1 truncate text-zinc-400">{row.defaultBranch || "not set"}</p>
                  </div>
                  <div>
                    <p className="text-zinc-700">Target branch</p>
                    <p className="mt-1 truncate text-zinc-400">{row.targetBranch || "main"}</p>
                  </div>
                  <div>
                    <p className="text-zinc-700">Linked PRs</p>
                    <p className="mt-1 text-zinc-400">{row.relatedPullRequests.length}</p>
                  </div>
                  <div>
                    <p className="text-zinc-700">Latest run</p>
                    {row.latestRun?.url ? (
                      <a href={row.latestRun.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-blue-400 hover:text-blue-300">
                        {row.latestRun.name || `Run ${row.latestRun.id}`}
                      </a>
                    ) : (
                      <p className="mt-1 truncate text-zinc-400">No run linked yet</p>
                    )}
                  </div>
                </div>

                {state.phase === "done" && (
                  <div className="mt-4 rounded-md border border-zinc-800/70 bg-zinc-950/30 p-3">
                    <p className="text-xs text-zinc-400">{state.result.summary}</p>
                    {inspectedRuns.length > 0 && (
                      <div className="mt-3 divide-y divide-zinc-800/70 rounded-md border border-zinc-800/70">
                        {inspectedRuns.slice(0, 5).map((run) => {
                          const inspectedTone = runTone(run);
                          return (
                            <div key={run.id} className="grid gap-2 p-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto]">
                              <span className="min-w-0 truncate text-zinc-400">{run.name || `Run ${run.id}`}</span>
                              <span className={inspectedTone.tone.split(" ")[0]}>{inspectedTone.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {state.phase === "approval" && (
                  <div className="mt-4 rounded-md border border-blue-900/40 bg-blue-950/10 p-3 text-xs text-blue-300/80">
                    {state.result.summary}. Open Chat to review and confirm the approval proposal.
                  </div>
                )}

                {state.phase === "error" && (
                  <div className="mt-4 rounded-md border border-red-900/40 bg-red-950/20 p-3 text-xs text-red-300">
                    {state.message}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={!row.pipelineId || state.phase === "loading"}
                    onClick={() => void inspectPipeline(row)}
                    className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-blue-700 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {state.phase === "loading" ? "Working..." : "Inspect runs"}
                  </button>
                  <button
                    type="button"
                    disabled={!row.pipelineId || state.phase === "loading"}
                    onClick={() => void triggerPipeline(row)}
                    className="rounded-md border border-blue-900/50 px-3 py-1.5 text-xs text-blue-400/80 transition hover:border-blue-700 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Trigger pipeline
                  </button>
                </div>
              </article>
            );
          })}

          {filteredRows.length === 0 && (
            <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-6 text-center">
              <p className="text-sm text-zinc-500">No pipelines match this filter.</p>
            </div>
          )}

          <PaginationControls
            page={page}
            pageCount={paginatedRows.pageCount}
            pageSize={pageSize}
            totalItems={filteredRows.length}
            visibleItems={paginatedRows.pageItems.length}
            itemLabel="pipelines"
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(1);
            }}
          />
        </div>
      )}
    </div>
  );
}
