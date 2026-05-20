import { useCallback, useEffect, useState } from "react";
import {
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  type WorkspaceProfile,
  type WorkspaceProfileInput,
} from "../api";

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
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
}: {
  label: string;
  hint?: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  const isSecret = type === "password";
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      <div className="relative flex items-center">
        <input
          type={isSecret && !show ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition pr-8"
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 text-zinc-500 hover:text-zinc-300 text-xs"
          >
            {show ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {hint && <span className="text-xs text-zinc-600">{hint}</span>}
    </label>
  );
}

function Divider() {
  return <div className="border-t border-zinc-800 my-6" />;
}

// ─── Blank profile form ────────────────────────────────────────────────────────

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

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void onSave(form); }}
      className="flex flex-col gap-5"
    >
      <SectionHeader title="Identity" />
      <Field label="Profile name *" value={form.name} onChange={set("name")} placeholder="my-project" />

      <Divider />
      <SectionHeader
        title="Repository"
        subtitle="Local path to the Git working tree for this profile."
      />
      <Field label="Repo path" value={form.repoPath} onChange={set("repoPath")} placeholder="C:\projects\my-app" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Default branch" value={form.defaultBranch} onChange={set("defaultBranch")} placeholder="main" />
        <Field label="Target branch (for PRs)" value={form.targetBranch} onChange={set("targetBranch")} placeholder="main" />
      </div>

      <Divider />
      <SectionHeader
        title="Azure DevOps"
        subtitle="Connection details used by ADO tools when this profile is active."
      />
      <Field label="Organisation URL" value={form.adoOrgUrl} onChange={set("adoOrgUrl")} placeholder="https://dev.azure.com/myorg" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Project" value={form.adoProject} onChange={set("adoProject")} placeholder="MyProject" />
        <Field label="Repository name" value={form.adoRepoName} onChange={set("adoRepoName")} placeholder="my-repo" />
      </div>
      <Field label="Personal Access Token" type="password" value={form.adoPat} onChange={set("adoPat")} hint="Stored locally in ~/.cicd-agent — never committed." />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Pipeline ID" value={form.adoPipelineId} onChange={set("adoPipelineId")} placeholder="42" />
        <Field label="Pipeline name" value={form.adoPipelineName} onChange={set("adoPipelineName")} placeholder="CI" />
      </div>

      <Divider />
      <SectionHeader
        title="Build / Test"
        subtitle="Optional overrides. Leave blank to use the template defaults."
      />
      <Field label="Build command" value={form.buildCommand} onChange={set("buildCommand")} placeholder="npm run build" />
      <Field label="Test command" value={form.testCommand} onChange={set("testCommand")} placeholder="npm test" />

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          className="px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-sm font-medium text-white transition"
        >
          {saving ? "Saving..." : "Save profile"}
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

// ─── Profile list item ─────────────────────────────────────────────────────────

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

// ─── Main page ─────────────────────────────────────────────────────────────────

type Mode = "list" | "new" | { editing: WorkspaceProfile };

export default function Profiles(): JSX.Element {
  const [profiles, setProfiles] = useState<WorkspaceProfile[]>([]);
  const [mode, setMode] = useState<Mode>("list");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProfiles(await listProfiles());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const handleSave = useCallback(
    async (data: WorkspaceProfileInput) => {
      setSaving(true);
      setError(null);
      try {
        if (typeof mode === "object" && "editing" in mode) {
          await updateProfile(mode.editing.id, data);
        } else {
          await createProfile(data);
        }
        setMode("list");
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [mode, reload],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this profile?")) return;
      setError(null);
      try {
        await deleteProfile(id);
        await reload();
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
            {loading && (
              <p className="text-sm text-zinc-500">Loading...</p>
            )}
            {!loading && profiles.length === 0 && (
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
            {!loading && profiles.length > 0 && (
              <div className="flex flex-col gap-2">
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
          </>
        )}
      </div>
    </div>
  );
}
