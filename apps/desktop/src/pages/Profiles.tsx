import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceProfile, WorkspaceProfileInput } from "../api";

// ─── Local-storage persistence ────────────────────────────────────────────────
// Profiles are stored locally so they work even without the daemon running.

const PROFILES_KEY = "cicd_agent_profiles_v1";

function genId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadProfiles(): WorkspaceProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (raw) return JSON.parse(raw) as WorkspaceProfile[];
  } catch { /* ignore */ }
  return [];
}

function persistProfiles(profiles: WorkspaceProfile[]): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

function createProfileLocal(data: WorkspaceProfileInput): WorkspaceProfile {
  const now = Date.now() / 1000;
  const profile: WorkspaceProfile = { ...data, id: genId(), createdAt: now, updatedAt: now };
  persistProfiles([...loadProfiles(), profile]);
  return profile;
}

function updateProfileLocal(id: string, data: Partial<WorkspaceProfileInput>): WorkspaceProfile {
  const all = loadProfiles();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error("Profile not found");
  const updated: WorkspaceProfile = { ...all[idx]!, ...data, id, updatedAt: Date.now() / 1000 };
  const next = [...all];
  next[idx] = updated;
  persistProfiles(next);
  return updated;
}

function deleteProfileLocal(id: string): void {
  persistProfiles(loadProfiles().filter((p) => p.id !== id));
}

// ─── Git branch loader (Tauri command) ───────────────────────────────────────

async function fetchGitBranches(repoPath: string): Promise<string[]> {
  if (!repoPath.trim()) return [];
  try {
    // Tauri v2 exposes __TAURI_INTERNALS__; fall back gracefully in browser dev
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<string[]>("list_git_branches", { repoPath });
    return Array.isArray(result) ? result : [];
  } catch (e) {
    console.warn("[Profiles] list_git_branches failed:", e);
    return [];
  }
}

// ─── PAT helpers ─────────────────────────────────────────────────────────────

type PatStatus = "none" | "pending" | "verified" | "invalid";

async function verifyPat(orgUrl: string, pat: string): Promise<boolean> {
  if (!orgUrl || !pat) return false;
  try {
    const base = orgUrl.replace(/\/$/, "");
    const r = await fetch(`${base}/_apis/projects?api-version=7.1&$top=1`, {
      headers: { Authorization: `Basic ${btoa(`:${pat}`)}` },
    });
    return r.ok;
  } catch {
    return false;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, disabled }: { title: string; subtitle?: string; disabled?: boolean }) {
  return (
    <div className="mb-4">
      <h3 className={`text-sm font-semibold ${disabled ? "text-zinc-600" : "text-zinc-200"}`}>{title}</h3>
      {subtitle && <p className={`mt-0.5 text-xs ${disabled ? "text-zinc-700" : "text-zinc-500"}`}>{subtitle}</p>}
    </div>
  );
}

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
      <span className={`text-xs font-medium ${disabled ? "text-zinc-600" : "text-zinc-400"}`}>{label}</span>
      {children ?? (
        <div className="relative flex items-center">
          <input
            type={isSecret && !show ? "password" : "text"}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className={`w-full rounded-md border px-3 py-1.5 text-sm placeholder-zinc-600 outline-none transition pr-8 ${
              disabled
                ? "border-zinc-800 bg-zinc-900/30 text-zinc-600 cursor-not-allowed"
                : "bg-zinc-800 border-zinc-700 text-zinc-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            }`}
          />
          {isSecret && !disabled && (
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 text-zinc-500 hover:text-zinc-300 text-xs"
            >
              {show ? "Hide" : "Show"}
            </button>
          )}
        </div>
      )}
      {hint && <span className={`text-xs ${disabled ? "text-zinc-700" : "text-zinc-600"}`}>{hint}</span>}
    </label>
  );
}

function Divider() {
  return <div className="border-t border-zinc-800 my-6" />;
}

// ─── Blank profile ────────────────────────────────────────────────────────────

const BLANK: WorkspaceProfileInput = {
  name: "",
  repoPath: "",
  defaultBranch: "main",
  targetBranch: "main",
  adoOrgUrl: "",
  adoProject: "",
  adoRepoName: "",
  adoPat: "",
  adoPipelineId: "",
  adoPipelineName: "",
  templateProfile: "",
  buildCommand: "",
  testCommand: "",
};

// ─── Profile form ─────────────────────────────────────────────────────────────

interface ProfileFormProps {
  initial: WorkspaceProfileInput;
  onSave: (data: WorkspaceProfileInput) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function ProfileForm({ initial, onSave, onCancel, saving }: ProfileFormProps) {
  const [form, setForm] = useState<WorkspaceProfileInput>(initial);
  const set = (key: keyof WorkspaceProfileInput) => (v: string) =>
    setForm((f) => ({ ...f, [key]: v }));

  // ── Git branch loading ──────────────────────────────────────────────────────
  const [branches, setBranches] = useState<string[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!form.repoPath.trim()) {
      setBranches([]);
      setBranchLoading(false);
      return;
    }
    setBranchLoading(true); // show spinner immediately on keystroke
    debounceRef.current = setTimeout(async () => {
      const b = await fetchGitBranches(form.repoPath.trim());
      setBranches(b);
      setBranchLoading(false);
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form.repoPath]);

  // ── PAT state ───────────────────────────────────────────────────────────────
  const [patStatus, setPatStatus] = useState<PatStatus>(
    initial.adoPat ? "verified" : "none",
  );
  const [verifying, setVerifying] = useState(false);

  const handleVerifyPat = async () => {
    setVerifying(true);
    const ok = await verifyPat(form.adoOrgUrl, form.adoPat);
    setPatStatus(ok ? "verified" : "invalid");
    setVerifying(false);
  };

  const handleRequestPat = () => {
    const org = form.adoOrgUrl.replace(/\/$/, "");
    if (org) {
      window.open(`${org}/_usersSettings/tokens`, "_blank");
    } else {
      window.open("https://dev.azure.com", "_blank");
    }
    if (patStatus === "none") setPatStatus("pending");
  };

  // Reset PAT status when PAT value changes
  useEffect(() => {
    if (patStatus === "verified" || patStatus === "invalid") setPatStatus("none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.adoPat]);

  // ── Branch select helper ────────────────────────────────────────────────────
  function BranchSelect({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
  }) {
    if (branches.length > 0) {
      return (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-400">{label}</span>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
          >
            {branches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
            {/* allow typing a custom value not in the list */}
            {!branches.includes(value) && value && (
              <option value={value}>{value} (custom)</option>
            )}
          </select>
        </label>
      );
    }
    return (
      <Field
        label={label}
        value={value}
        onChange={onChange}
        placeholder="main"
      />
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void onSave(form); }}
      className="flex flex-col gap-5"
    >
      {/* ── Identity ── */}
      <SectionHeader title="Identity" />
      <Field
        label="Profile name *"
        value={form.name}
        onChange={set("name")}
        placeholder="my-project"
      />

      <Divider />

      {/* ── Repository ── */}
      <SectionHeader
        title="Repository"
        subtitle="Local path to the Git working tree for this profile."
      />
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-zinc-400">Repo path</span>
        <div className="relative flex items-center gap-2">
          <input
            value={form.repoPath}
            onChange={(e) => set("repoPath")(e.target.value)}
            placeholder="C:\projects\my-app"
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
          />
          {branchLoading && (
            <span className="shrink-0 text-[10px] text-zinc-600 animate-pulse">checking git…</span>
          )}
          {!branchLoading && branches.length > 0 && (
            <span className="shrink-0 flex items-center gap-1 text-[10px] text-emerald-600">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              git repo
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <BranchSelect
          label="Default branch"
          value={form.defaultBranch}
          onChange={set("defaultBranch")}
        />
        <BranchSelect
          label="Target branch (for PRs)"
          value={form.targetBranch}
          onChange={set("targetBranch")}
        />
      </div>

      <Divider />

      {/* ── Azure DevOps ── */}
      <SectionHeader
        title="Azure DevOps"
        subtitle="Connection details used by ADO tools when this profile is active."
      />
      <Field
        label="Organisation URL"
        value={form.adoOrgUrl}
        onChange={set("adoOrgUrl")}
        placeholder="https://dev.azure.com/myorg"
      />
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Project"
          value={form.adoProject}
          onChange={set("adoProject")}
          placeholder="MyProject"
        />
        <Field
          label="Repository name"
          value={form.adoRepoName}
          onChange={set("adoRepoName")}
          placeholder="my-repo"
        />
      </div>

      {/* PAT field + actions */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-400">Personal Access Token</span>
          <div className="flex items-center gap-2">
            {patStatus === "pending" && (
              <span className="rounded-full bg-amber-900/30 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-800/40">
                Pending approval
              </span>
            )}
            {patStatus === "verified" && (
              <span className="rounded-full bg-emerald-900/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-800/40">
                Verified
              </span>
            )}
            {patStatus === "invalid" && (
              <span className="rounded-full bg-red-900/30 px-2 py-0.5 text-[10px] font-medium text-red-400 border border-red-800/40">
                Invalid
              </span>
            )}
            <button
              type="button"
              onClick={handleRequestPat}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition underline underline-offset-2"
            >
              Request PAT
            </button>
            {form.adoPat && form.adoOrgUrl && (
              <button
                type="button"
                onClick={() => void handleVerifyPat()}
                disabled={verifying}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition underline underline-offset-2 disabled:opacity-50"
              >
                {verifying ? "Verifying…" : "Verify"}
              </button>
            )}
          </div>
        </div>
        <Field
          type="password"
          label=""
          value={form.adoPat}
          onChange={(v) => { set("adoPat")(v); }}
          hint="Stored locally on this device — never committed or sent to any server."
        />
        {patStatus === "pending" && (
          <p className="rounded-md bg-amber-950/20 border border-amber-900/30 px-3 py-2 text-[11px] text-amber-400/80 leading-relaxed">
            A browser tab opened to your Azure DevOps token settings. Create a PAT with
            <span className="font-mono mx-1 select-all">Code (Read &amp; Write), Build (Read &amp; Execute), Pull Request Threads (Read &amp; Write)</span>
            scopes, paste it above, then click Verify.
          </p>
        )}
      </div>

      {/* Pipeline fields — disabled until pipeline integration is ready */}
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Pipeline ID"
          value={form.adoPipelineId}
          onChange={set("adoPipelineId")}
          placeholder="42"
          disabled
          hint="Pipeline integration coming soon"
        />
        <Field
          label="Pipeline name"
          value={form.adoPipelineName}
          onChange={set("adoPipelineName")}
          placeholder="CI"
          disabled
        />
      </div>

      <Divider />

      {/* ── Build / Test — disabled ── */}
      <SectionHeader
        title="Build / Test"
        subtitle="Custom overrides — coming soon."
        disabled
      />
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Build command"
          value={form.buildCommand}
          onChange={set("buildCommand")}
          placeholder="npm run build"
          disabled
        />
        <Field
          label="Test command"
          value={form.testCommand}
          onChange={set("testCommand")}
          placeholder="npm test"
          disabled
        />
      </div>

      {/* ── Actions ── */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          className="px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-sm font-medium text-white transition"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 text-sm text-zinc-300 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Profile card ─────────────────────────────────────────────────────────────

function ProfileCard({
  profile,
  onEdit,
  onDelete,
}: {
  profile: WorkspaceProfile;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-start justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 hover:border-zinc-700 transition">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-zinc-100 truncate">{profile.name}</span>
        {profile.repoPath && (
          <span className="text-xs text-zinc-500 font-mono truncate">{profile.repoPath}</span>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {profile.adoOrgUrl && (
            <span className="text-xs text-zinc-600 truncate">{profile.adoOrgUrl}</span>
          )}
          {profile.adoProject && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
              {profile.adoProject}
            </span>
          )}
          {profile.defaultBranch && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">
              branch: {profile.defaultBranch}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4 shrink-0 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={onEdit}
          className="px-3 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 transition"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-1 rounded-md bg-zinc-800 hover:bg-red-900 hover:text-red-300 text-xs text-zinc-400 transition"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Mode = "list" | "new" | { editing: WorkspaceProfile };

export default function Profiles(): JSX.Element {
  const [profiles, setProfiles] = useState<WorkspaceProfile[]>([]);
  const [mode, setMode] = useState<Mode>("list");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setProfiles(loadProfiles());
    setError(null);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleSave = useCallback(
    async (data: WorkspaceProfileInput) => {
      setSaving(true);
      setError(null);
      try {
        if (typeof mode === "object" && "editing" in mode) {
          updateProfileLocal(mode.editing.id, data);
        } else {
          createProfileLocal(data);
        }
        setMode("list");
        reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [mode, reload],
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (!confirm("Delete this profile?")) return;
      try {
        deleteProfileLocal(id);
        reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [reload],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">Profiles</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Each profile holds repo path, ADO connection, and branch defaults for one workspace.
          </p>
        </div>
        {mode === "list" && profiles.length > 0 && (
          <button
            onClick={() => setMode("new")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-700 bg-transparent hover:border-zinc-600 hover:bg-zinc-800/40 text-xs text-zinc-400 hover:text-zinc-200 transition"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            New profile
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {error && (
          <div className="mb-4 rounded-md bg-red-900/30 border border-red-800 px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {mode === "new" && (
          <ProfileForm
            initial={BLANK}
            onSave={handleSave}
            onCancel={() => setMode("list")}
            saving={saving}
          />
        )}

        {typeof mode === "object" && "editing" in mode && (
          <ProfileForm
            initial={mode.editing}
            onSave={handleSave}
            onCancel={() => setMode("list")}
            saving={saving}
          />
        )}

        {mode === "list" && (
          <>
            {profiles.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-zinc-700">
                  <rect x="6" y="8" width="28" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M13 16h14M13 21h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <p className="text-sm text-zinc-500">No profiles yet.</p>
                <button
                  onClick={() => setMode("new")}
                  className="text-sm text-blue-400 hover:text-blue-300 transition"
                >
                  Create your first profile
                </button>
              </div>
            )}
            {profiles.length > 0 && (
              <div className="flex flex-col gap-2">
                {profiles.map((p) => (
                  <ProfileCard
                    key={p.id}
                    profile={p}
                    onEdit={() => setMode({ editing: p })}
                    onDelete={() => handleDelete(p.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
