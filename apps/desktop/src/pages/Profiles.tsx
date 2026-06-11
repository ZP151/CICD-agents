import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkAdoProjectLinkTools,
  discoverAdoProjectLinkOptions,
  type AdoDiscoveryKind,
  type AdoDiscoveryOption,
  type WorkspaceProfile,
  type WorkspaceProfileInput,
} from "../api";
import { useAppData } from "../App";
import {
  DEFAULT_ADO_ORG_URL,
  fetchAzureDevOpsRemoteSuggestion,
  fetchGitBranches,
  pickRecommendedPipeline,
  type PatStatus,
  verifyPat,
} from "../projectLinks";

// ─── Local-storage fallback ───────────────────────────────────────────────────
// Used only when the daemon is unreachable.

const PROFILES_KEY = "cicd_agent_profiles_v1";

function genId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadProfilesLocal(): WorkspaceProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (raw) return JSON.parse(raw) as WorkspaceProfile[];
  } catch { /* ignore */ }
  return [];
}

function persistProfilesLocal(profiles: WorkspaceProfile[]): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}


// ─── Shared field components ──────────────────────────────────────────────────

function Field({
  label,
  hint,
  type = "text",
  value,
  onChange,
  placeholder,
  disabled,
  children,
}: {
  label: string;
  hint?: string;
  type?: string;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const isSecret = type === "password";
  return (
    <label className="flex flex-col gap-1">
      {label && (
        <span className={`text-xs font-medium ${disabled ? "text-zinc-600" : "text-zinc-400"}`}>
          {label}
        </span>
      )}
      {children ?? (
        <div className="relative flex items-center">
          <input
            type={isSecret && !show ? "password" : "text"}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className={`w-full rounded-lg border px-3 py-2 text-sm placeholder-zinc-600 outline-none transition pr-8 ${
              disabled
                ? "border-zinc-800 bg-zinc-900/30 text-zinc-600 cursor-not-allowed"
                : "bg-zinc-900 border-zinc-700/60 text-zinc-200 focus:border-zinc-600 focus:outline-none"
            }`}
          />
          {isSecret && !disabled && (
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2.5 text-zinc-600 hover:text-zinc-400 transition"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {show ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                )}
              </svg>
            </button>
          )}
        </div>
      )}
      {hint && <p className={`text-[10px] ${disabled ? "text-zinc-700" : "text-zinc-600"}`}>{hint}</p>}
    </label>
  );
}

// ─── Blank Project Link ───────────────────────────────────────────────────────

const BLANK: WorkspaceProfileInput = {
  name: "",
  repoPath: "",
  defaultBranch: "main",
  targetBranch: "main",
  adoOrgUrl: DEFAULT_ADO_ORG_URL,
  adoProject: "",
  adoRepoName: "",
  adoPat: "",
  adoPipelineId: "",
  adoPipelineName: "",
  adoMcpEnabled: false,
  adoMcpCommand: "",
  adoMcpAuthentication: "",
  adoMcpDomains: "repositories,pipelines,work-items",
  templateProfile: "",
  buildCommand: "",
  testCommand: "",
};

// ─── Project Link form ────────────────────────────────────────────────────────

interface ProfileFormProps {
  initial: WorkspaceProfileInput;
  onSave: (data: WorkspaceProfileInput) => Promise<void>;
  onBack: () => void;
  saving: boolean;
  isNew: boolean;
}

function ProfileForm({ initial, onSave, onBack, saving, isNew }: ProfileFormProps) {
  const [form, setForm] = useState<WorkspaceProfileInput>(initial);
  const set = <K extends keyof WorkspaceProfileInput>(key: K) => (v: WorkspaceProfileInput[K]) =>
    setForm((f) => ({ ...f, [key]: v }));

  // ── Git branch loading ──────────────────────────────────────────────────────
  const [branches, setBranches] = useState<string[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBranches = useCallback(async (repoPath: string) => {
    if (!repoPath.trim()) { setBranches([]); setBranchLoading(false); setBranchError(false); return; }
    setBranchLoading(true);
    setBranchError(false);
    const trimmedPath = repoPath.trim();
    const [b, remote] = await Promise.all([
      fetchGitBranches(trimmedPath),
      fetchAzureDevOpsRemoteSuggestion(trimmedPath),
    ]);
    setBranches(b);
    setBranchLoading(false);
    setBranchError(b.length === 0);
    if (remote) {
      setForm((current) => ({
        ...current,
        adoOrgUrl: current.adoOrgUrl || remote.adoOrgUrl,
        adoProject: current.adoProject || remote.adoProject,
        adoRepoName: current.adoRepoName || remote.adoRepoName,
      }));
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!form.repoPath.trim()) { setBranches([]); setBranchLoading(false); setBranchError(false); return; }
    setBranchLoading(true);
    setBranchError(false);
    debounceRef.current = setTimeout(() => { void loadBranches(form.repoPath); }, 700);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form.repoPath, loadBranches]);

  // ── PAT state ───────────────────────────────────────────────────────────────
  const [patStatus, setPatStatus] = useState<PatStatus>(initial.adoPat ? "verified" : "none");
  const [verifying, setVerifying] = useState(false);
  const [discovering, setDiscovering] = useState<AdoDiscoveryKind | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [pipelineHint, setPipelineHint] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<Record<AdoDiscoveryKind, AdoDiscoveryOption[]>>({
    projects: [],
    repositories: [],
    pipelines: [],
  });
  const discoveryAutoRef = useRef<Partial<Record<AdoDiscoveryKind, string>>>({});
  const [mcpChecking, setMcpChecking] = useState(false);
  const [mcpStatus, setMcpStatus] = useState<string | null>(null);

  useEffect(() => {
    if (patStatus === "verified" || patStatus === "invalid") setPatStatus("none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.adoPat]);

  const handleVerifyPat = async () => {
    setVerifying(true);
    setPatStatus(await verifyPat(form.adoOrgUrl, form.adoPat) ? "verified" : "invalid");
    setVerifying(false);
  };

  const handleRequestPat = () => {
    const org = form.adoOrgUrl.replace(/\/$/, "");
    window.open(org ? `${org}/_usersSettings/tokens` : "https://dev.azure.com", "_blank");
    if (patStatus === "none") setPatStatus("pending");
  };

  const applyDiscovery = (kind: AdoDiscoveryKind, option: AdoDiscoveryOption) => {
    setDiscoveryError(null);
    if (kind === "projects") {
      setDiscovered((current) => ({ ...current, repositories: [], pipelines: [] }));
      setPipelineHint(null);
      setForm((current) => ({
        ...current,
        adoProject: option.name,
        adoRepoName: current.adoProject === option.name ? current.adoRepoName : "",
        adoPipelineId: current.adoProject === option.name ? current.adoPipelineId : "",
        adoPipelineName: current.adoProject === option.name ? current.adoPipelineName : "",
      }));
    } else if (kind === "repositories") {
      setDiscovered((current) => ({ ...current, pipelines: [] }));
      setPipelineHint(null);
      setForm((current) => ({
        ...current,
        adoRepoName: option.name,
        adoPipelineId: current.adoRepoName === option.name ? current.adoPipelineId : "",
        adoPipelineName: current.adoRepoName === option.name ? current.adoPipelineName : "",
      }));
    } else {
      setForm((current) => ({ ...current, adoPipelineId: option.id, adoPipelineName: option.name }));
    }
  };

  const runDiscovery = async (kind: AdoDiscoveryKind, mode: "manual" | "auto" = "manual") => {
    const signature = JSON.stringify({
      kind,
      org: form.adoOrgUrl.trim(),
      project: form.adoProject.trim(),
      repo: form.adoRepoName.trim(),
      pat: form.adoPat ? "pat" : "",
    });
    if (mode === "auto" && discoveryAutoRef.current[kind] === signature) return;
    if (mode === "auto") discoveryAutoRef.current[kind] = signature;
    setDiscovering(kind);
    setDiscoveryError(null);
    try {
      const result = await discoverAdoProjectLinkOptions(kind, {
        ...form,
      });
      setDiscovered((current) => ({ ...current, [kind]: result.items }));
      if (result.items.length === 1) applyDiscovery(kind, result.items[0]!);
      if (kind === "pipelines" && result.items.length > 1 && !form.adoPipelineId) {
        const recommended = pickRecommendedPipeline(result.items, form);
        if (recommended) {
          applyDiscovery(kind, recommended);
          setPipelineHint(`Recommended pipeline selected: ${recommended.name}`);
        }
      }
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscovering(null);
    }
  };

  const handleDiscover = async (kind: AdoDiscoveryKind) => {
    await runDiscovery(kind, "manual");
  };

  useEffect(() => {
    if (!form.adoOrgUrl.trim()) return;
    const timer = setTimeout(() => {
      void runDiscovery("projects", "auto");
    }, 650);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.adoOrgUrl, form.adoPat]);

  useEffect(() => {
    if (!form.adoOrgUrl.trim() || !form.adoProject.trim()) return;
    const timer = setTimeout(() => {
      void runDiscovery("repositories", "auto");
    }, 650);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.adoOrgUrl, form.adoProject, form.adoPat]);

  const handleCheckMcp = async () => {
    setMcpChecking(true);
    setMcpStatus(null);
    try {
      const result = await checkAdoProjectLinkTools({
        ...form,
      });
      const authLabel = result.authMode === "pat" ? "PAT fallback" : "OAuth";
      setMcpStatus(result.ok
        ? `ADO tools ready via ${authLabel} · ${result.toolCount} internal tools`
        : `${authLabel} issue · ${result.authMessage ?? result.authStatus ?? "ADO tools unavailable"}`);
    } catch (err) {
      setMcpStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setMcpChecking(false);
    }
  };

  // ── Branch select helper ────────────────────────────────────────────────────
  function BranchSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    if (branchLoading) {
      return (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-zinc-400">{label}</span>
          <div className="flex items-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-900 px-3 py-2 text-sm text-zinc-500">
            <svg className="animate-spin w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 70" />
            </svg>
            Detecting branches…
          </div>
        </div>
      );
    }
    if (branches.length > 0) {
      return (
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-zinc-400">{label}</span>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full min-w-0 rounded-lg border border-emerald-700/60 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500 transition"
          >
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            {!branches.includes(value) && value && <option value={value}>{value} (saved)</option>}
          </select>
        </label>
      );
    }
    return <Field label={label} value={value} onChange={onChange} placeholder="main" />;
  }

  const repoInputClass = `w-full rounded-lg border px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition ${
    !branchLoading && branches.length > 0
      ? "border-emerald-600 bg-zinc-900 focus:border-emerald-500"
      : branchError && form.repoPath
        ? "border-amber-700/60 bg-zinc-900 focus:border-amber-600"
        : "border-zinc-700/60 bg-zinc-900 focus:border-zinc-600"
  }`;

  return (
    <div className="space-y-6">
      {/* Back + title */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="text-xl font-semibold text-zinc-100">{isNew ? "New Project Link" : "Edit Project Link"}</h2>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void onSave(form); }} className="space-y-5">
        {/* ── Workspace ── */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">Workspace</h3>
          </div>
          <Field label="Project Link name *" value={form.name} onChange={set("name")} placeholder="my-project" />
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Repo path</span>
              {form.repoPath && (
                <button
                  type="button"
                  onClick={() => void loadBranches(form.repoPath)}
                  disabled={branchLoading}
                  title="Reload branches from this path"
                  className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition disabled:opacity-40"
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className={branchLoading ? "animate-spin" : ""}>
                    <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    <path d="M8 1v4l2.5-2L8 1z" fill="currentColor"/>
                  </svg>
                  {branchLoading ? "Loading…" : branchError ? "No branches found — retry" : branches.length > 0 ? `${branches.length} branches` : "Detect branches"}
                </button>
              )}
            </div>
            <input
              value={form.repoPath}
              onChange={(e) => set("repoPath")(e.target.value)}
              placeholder="C:\projects\my-app"
              className={repoInputClass}
            />
            {branchError && form.repoPath && (
              <p className="text-[10px] text-amber-500/80">
                Could not read branches. Check the path is a valid git repository.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <BranchSelect label="Default branch" value={form.defaultBranch} onChange={set("defaultBranch")} />
            <BranchSelect label="Target branch (PRs)" value={form.targetBranch} onChange={set("targetBranch")} />
          </div>
        </section>

        {/* ── Azure DevOps ── */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">Azure DevOps</h3>
          </div>
          <Field label="Organisation URL" value={form.adoOrgUrl} onChange={set("adoOrgUrl")} placeholder="https://dev.azure.com/myorg" />
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Project">
              {discovered.projects.length > 0 ? (
                <select
                  value={discovered.projects.some((option) => option.name === form.adoProject) ? form.adoProject : ""}
                  onChange={(event) => {
                    const selected = discovered.projects.find((option) => option.name === event.target.value);
                    if (selected) applyDiscovery("projects", selected);
                  }}
                  className="w-full min-w-0 rounded-lg border border-zinc-700/60 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none transition focus:border-zinc-600"
                >
                  <option value="">{discovering === "projects" ? "Discovering projects..." : "Select project"}</option>
                  {discovered.projects.map((option) => (
                    <option key={option.id} value={option.name}>{option.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.adoProject}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDiscoveryError(null);
                    setDiscovered((current) => ({ ...current, repositories: [], pipelines: [] }));
                    setPipelineHint(null);
                    setForm((current) => ({
                      ...current,
                      adoProject: value,
                      adoRepoName: current.adoProject === value ? current.adoRepoName : "",
                      adoPipelineId: current.adoProject === value ? current.adoPipelineId : "",
                      adoPipelineName: current.adoProject === value ? current.adoPipelineName : "",
                    }));
                  }}
                  placeholder={discovering === "projects" ? "Discovering projects..." : "MyProject"}
                  className="w-full min-w-0 rounded-lg border border-zinc-700/60 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-zinc-600"
                />
              )}
            </Field>
            <Field label="Repository name">
              {discovered.repositories.length > 0 ? (
                <select
                  value={discovered.repositories.some((option) => option.name === form.adoRepoName) ? form.adoRepoName : ""}
                  onChange={(event) => {
                    const selected = discovered.repositories.find((option) => option.name === event.target.value);
                    if (selected) applyDiscovery("repositories", selected);
                  }}
                  className="w-full min-w-0 rounded-lg border border-zinc-700/60 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none transition focus:border-zinc-600"
                >
                  <option value="">{discovering === "repositories" ? "Discovering repositories..." : "Select repository"}</option>
                  {discovered.repositories.map((option) => (
                    <option key={option.id} value={option.name}>{option.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.adoRepoName}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDiscoveryError(null);
                    setDiscovered((current) => ({ ...current, pipelines: [] }));
                    setPipelineHint(null);
                    setForm((current) => ({
                      ...current,
                      adoRepoName: value,
                      adoPipelineId: current.adoRepoName === value ? current.adoPipelineId : "",
                      adoPipelineName: current.adoRepoName === value ? current.adoPipelineName : "",
                    }));
                  }}
                  placeholder={discovering === "repositories" ? "Discovering repositories..." : "my-repo"}
                  className="w-full min-w-0 rounded-lg border border-zinc-700/60 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-zinc-600"
                />
              )}
            </Field>
          </div>
          {discoveryError && (
            <p className="rounded-md border border-red-900/40 bg-red-950/20 px-2.5 py-1.5 text-[11px] text-red-300">
              {discoveryError}
            </p>
          )}

          <details className="group rounded-lg border border-zinc-800 bg-zinc-950/30">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs text-zinc-500 transition hover:text-zinc-300">
              <span className="flex min-w-0 items-center gap-2">
                <svg className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-medium">Optional fallbacks</span>
              </span>
              {(form.adoPipelineName || form.adoPipelineId || form.adoPat || form.adoMcpEnabled) && (
                <span className="shrink-0 rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">configured</span>
              )}
            </summary>
            <div className="space-y-4 border-t border-zinc-800 px-3 py-3">
              <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-zinc-400">Pipeline matching</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDiscover("pipelines")}
                    disabled={!form.adoOrgUrl || !form.adoProject || !form.adoRepoName || discovering !== null}
                    className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40"
                  >
                    {discovering === "pipelines" ? "Discovering..." : "Refresh pipelines"}
                  </button>
                </div>
                {(["pipelines"] as AdoDiscoveryKind[]).map((kind) => (
                  discovered[kind].length > 0 && (
                    <label key={kind} className="grid gap-1">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">{kind}</span>
                      <select
                        className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-300 outline-none focus:border-zinc-600"
                        defaultValue=""
                        onChange={(event) => {
                          const selected = discovered[kind].find((option) => option.id === event.target.value);
                          if (selected) applyDiscovery(kind, selected);
                        }}
                      >
                        <option value="">Select {kind.slice(0, -1)}</option>
                        {discovered[kind].map((option) => (
                          <option key={`${kind}-${option.id}`} value={option.id}>
                            {option.name}{option.description ? ` - ${option.description}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                ))}
                {pipelineHint && (
                  <p className="rounded-md border border-emerald-900/40 bg-emerald-950/20 px-2.5 py-1.5 text-[11px] text-emerald-300">
                    {pipelineHint}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">PAT fallback</span>
                  <div className="flex items-center gap-2">
                    {patStatus === "pending" && (
                      <span className="rounded-full bg-amber-900/30 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-800/40">Pending</span>
                    )}
                    {patStatus === "verified" && (
                      <span className="rounded-full bg-emerald-900/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-800/40">Verified</span>
                    )}
                    {patStatus === "invalid" && (
                      <span className="rounded-full bg-red-900/30 px-2 py-0.5 text-[10px] font-medium text-red-400 border border-red-800/40">Invalid</span>
                    )}
                    <button type="button" onClick={handleRequestPat} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition underline underline-offset-2">
                      Request PAT
                    </button>
                    {form.adoPat && form.adoOrgUrl && (
                      <button type="button" onClick={() => void handleVerifyPat()} disabled={verifying}
                        className="text-[11px] text-zinc-500 hover:text-zinc-300 transition underline underline-offset-2 disabled:opacity-50">
                        {verifying ? "Verifying…" : "Verify"}
                      </button>
                    )}
                  </div>
                </div>
                <Field type="password" label="" value={form.adoPat} onChange={set("adoPat")} />
                {patStatus === "pending" && (
                  <p className="rounded-lg bg-amber-950/20 border border-amber-900/30 px-3 py-2 text-[11px] text-amber-400/80 leading-relaxed">
                    For fallback mode, create a PAT with <span className="font-mono">Code (Read &amp; Write), Build (Read &amp; Execute), Pull Request Threads (Read &amp; Write)</span>, paste it above, then click Verify.
                  </p>
                )}
              </div>

              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/30 p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.adoMcpEnabled}
                    onChange={(event) => set("adoMcpEnabled")(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-900"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-zinc-300">Enable external Azure DevOps MCP bridge fallback</span>
                  </span>
                </label>
                {form.adoMcpEnabled && (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="MCP command" value={form.adoMcpCommand} onChange={set("adoMcpCommand")} placeholder="mcp-server-azuredevops" />
                      <Field label="Authentication" value={form.adoMcpAuthentication} onChange={set("adoMcpAuthentication")} placeholder="pat or azcli" />
                      <Field label="Domains" value={form.adoMcpDomains} onChange={set("adoMcpDomains")} placeholder="repositories,pipelines,work-items" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCheckMcp()}
                        disabled={!form.adoOrgUrl || mcpChecking}
                        className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40"
                      >
                        {mcpChecking ? "Checking..." : "Check ADO auth/tools"}
                      </button>
                      {mcpStatus && (
                        <span className={`text-[11px] ${mcpStatus.startsWith("ADO tools ready") ? "text-emerald-400" : "text-amber-400"}`}>
                          {mcpStatus}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </details>
        </section>

        {/* ── Actions ── */}
        <div className="flex items-center gap-3 pb-4">
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40 transition"
          >
            {saving ? "Saving…" : "Save Project Link"}
          </button>
          <button type="button" onClick={onBack}
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 transition">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Project Link card ────────────────────────────────────────────────────────

function ProfileCard({ profile, onEdit, onDelete }: { profile: WorkspaceProfile; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="group flex items-start justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 hover:border-zinc-700 transition">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-zinc-100 truncate">{profile.name}</span>
        {profile.repoPath && (
          <span className="text-xs text-zinc-500 font-mono truncate">{profile.repoPath}</span>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {profile.adoOrgUrl && <span className="text-xs text-zinc-600 truncate">{profile.adoOrgUrl}</span>}
          {profile.adoProject && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">{profile.adoProject}</span>
          )}
          {profile.defaultBranch && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">branch: {profile.defaultBranch}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4 shrink-0 opacity-0 group-hover:opacity-100 transition">
        <button onClick={onEdit} className="px-3 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 transition">Edit</button>
        <button onClick={onDelete} className="px-3 py-1 rounded-md bg-zinc-800 hover:bg-red-900 hover:text-red-300 text-xs text-zinc-400 transition">Delete</button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Mode = "list" | "new" | { editing: WorkspaceProfile };

export default function Profiles(): JSX.Element {
  const {
    profiles,
    profilesLoading,
    cloudProfileStore: cloudSync,
    usingDaemon,
    refreshProfiles,
    createProfile,
    updateProfile,
    deleteProfile,
  } = useAppData();

  const [mode, setMode] = useState<Mode>("list");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async (data: WorkspaceProfileInput) => {
    setSaving(true); setError(null);
    try {
      if (typeof mode === "object" && "editing" in mode) {
        await updateProfile(mode.editing.id, data);
      } else {
        await createProfile(data);
      }
      setMode("list");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [mode, createProfile, updateProfile]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this Project Link?")) return;
    try { await deleteProfile(id); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [deleteProfile]);

  // ── Form modes ──────────────────────────────────────────────────────────────
  if (mode === "new" || (typeof mode === "object" && "editing" in mode)) {
    return (
      <div className="mx-auto max-w-xl w-full">
        {error && (
          <div className="mb-4 rounded-lg bg-red-900/30 border border-red-800 px-4 py-2 text-sm text-red-400">{error}</div>
        )}
        <ProfileForm
          initial={typeof mode === "object" ? mode.editing : BLANK}
          onSave={handleSave}
          onBack={() => setMode("list")}
          saving={saving}
          isNew={mode === "new"}
        />
      </div>
    );
  }

  // ── List mode ───────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-xl w-full space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Project Links</h2>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <p className="text-sm text-zinc-500">Each Project Link maps one local repo to Azure DevOps, branch defaults, and validation commands.</p>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            {cloudSync ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/30 border border-emerald-800/40 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Cloud synced · Azure Table Storage
              </span>
            ) : usingDaemon ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800/60 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                Local · daemon store
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800/60 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                Local · browser storage
              </span>
            )}
          </div>
        </div>
        {profiles.length > 0 && (
          <button
            onClick={() => setMode("new")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-700 bg-transparent hover:border-zinc-600 hover:bg-zinc-800/40 text-xs text-zinc-400 hover:text-zinc-200 transition shrink-0"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            New Project Link
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-800 px-4 py-2 text-sm text-red-400">{error}</div>
      )}

      {profilesLoading && profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
          <p className="text-xs text-zinc-600">Loading Project Links…</p>
        </div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-zinc-700">
            <rect x="6" y="8" width="28" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M13 16h14M13 21h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="text-sm text-zinc-500">No Project Links yet.</p>
          <button onClick={() => setMode("new")} className="text-sm text-blue-400 hover:text-blue-300 transition">
            Create your first Project Link
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              onEdit={() => setMode({ editing: p })}
              onDelete={() => void handleDelete(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
