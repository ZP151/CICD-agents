import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchHealth,
  fetchAuthStatus,
  fetchDaemonConfig,
  configureDaemon,
  migrateProfilesToCloud,
  type DaemonConfigPayload,
  type HealthStatus,
  type AuthUser,
} from "../api";

// ─── Persistence ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "dev_agent_settings";

interface AppSettings {
  llmProvider: "azure" | "openai";
  azureEndpoint: string;
  azureApiKey: string;
  azureDeployment: string;
  azureApiVersion: string;
  openaiApiKey: string;
  openaiModel: string;
  // Azure cloud persistence
  azureStorageAccount: string;
  azureKeyVaultUrl: string;
  azureCosmosEndpoint: string;
}

const DEFAULTS: AppSettings = {
  llmProvider: "azure",
  azureEndpoint: "",
  azureApiKey: "",
  azureDeployment: "",
  azureApiVersion: "2024-02-01",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
  azureStorageAccount: "",
  azureKeyVaultUrl: "",
  azureCosmosEndpoint: "",
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

function saveSettings(s: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

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
          className="w-full rounded-lg border border-zinc-700/60 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none transition"
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2.5 text-zinc-600 hover:text-zinc-400 transition"
            title={show ? "Hide" : "Show"}
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
      {hint && <p className="text-[10px] text-zinc-600">{hint}</p>}
    </label>
  );
}

function Divider() {
  return <hr className="border-zinc-800/60" />;
}

// ─── Cloud status pill ────────────────────────────────────────────────────────

function CloudPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
      active ? "bg-emerald-900/40 text-emerald-400" : "bg-zinc-800/60 text-zinc-600"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-zinc-700"}`} />
      {label}
    </span>
  );
}

// ─── Main Settings page ────────────────────────────────────────────────────────

type DaemonStatus = "unknown" | "checking" | "configured" | "unconfigured" | "unreachable" | "applying" | "applied" | "error";
type CloudApplyStatus = "idle" | "applying" | "applied" | "error";

export default function Settings(): JSX.Element {
  const [s, setS] = useState<AppSettings>(loadSettings);
  // "saved" flash indicator
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Daemon / LLM status
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus>("unknown");
  const [applyError, setApplyError] = useState<string | null>(null);

  // Azure cloud status
  const [health, setHealth] = useState<HealthStatus>({ ok: false });
  const [authUser, setAuthUser] = useState<AuthUser>({ authenticated: false });
  const [aoaiKeyInVault, setAoaiKeyInVault] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudApplyStatus>("idle");
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [migrateStatus, setMigrateStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [migrateResult, setMigrateResult] = useState<{ migrated: number; skipped: number; total: number } | null>(null);

  // Check daemon health + pre-fill config on mount
  useEffect(() => {
    setDaemonStatus("checking");

    // Load non-secret config from daemon and merge into local settings
    // Daemon values win only for fields the user hasn't filled in locally
    fetchDaemonConfig().then((cfg) => {
      if (!cfg) return;
      setAoaiKeyInVault(cfg.aoaiKeyInVault ?? false);
      setS((prev) => ({
        ...prev,
        llmProvider:         (prev.llmProvider || cfg.llmProvider as "azure" | "openai") ?? prev.llmProvider,
        azureEndpoint:       prev.azureEndpoint    || cfg.azureEndpoint,
        azureDeployment:     prev.azureDeployment  || cfg.azureDeployment,
        azureApiVersion:     prev.azureApiVersion  || cfg.azureApiVersion,
        openaiModel:         prev.openaiModel      || cfg.openaiModel,
        azureStorageAccount: prev.azureStorageAccount || cfg.azureStorageAccount,
        azureKeyVaultUrl:    prev.azureKeyVaultUrl    || cfg.azureKeyVaultUrl,
        azureCosmosEndpoint: prev.azureCosmosEndpoint || cfg.azureCosmosEndpoint,
      }));
    }).catch(() => {/* non-fatal */});

    fetchHealth()
      .then((h) => {
        setHealth(h);
        setDaemonStatus(h.llmConfigured ? "configured" : "unconfigured");
      })
      .catch(() => setDaemonStatus("unreachable"));

    fetchAuthStatus().then(setAuthUser).catch(() => {/* non-fatal */});
  }, []);

  const applyToDaemon = useCallback(async (settings: AppSettings) => {
    setDaemonStatus("applying");
    setApplyError(null);
    try {
      const cfg: DaemonConfigPayload = { llmProvider: settings.llmProvider };
      if (settings.llmProvider === "azure") {
        cfg.azureEndpoint   = settings.azureEndpoint;
        cfg.azureApiKey     = settings.azureApiKey;
        cfg.azureDeployment = settings.azureDeployment;
        cfg.azureApiVersion = settings.azureApiVersion;
      } else {
        cfg.openaiApiKey = settings.openaiApiKey;
        cfg.openaiModel  = settings.openaiModel;
      }
      const res = await configureDaemon(cfg);
      setDaemonStatus(res.llmConfigured ? "applied" : "unconfigured");
      setTimeout(() => setDaemonStatus(res.llmConfigured ? "configured" : "unconfigured"), 2500);
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
      setDaemonStatus("error");
    }
  }, []);

  const applyCloudToDaemon = useCallback(async (settings: AppSettings) => {
    setCloudStatus("applying");
    setCloudError(null);
    try {
      const res = await configureDaemon({
        azureStorageAccount: settings.azureStorageAccount,
        azureKeyVaultUrl:    settings.azureKeyVaultUrl,
        azureCosmosEndpoint: settings.azureCosmosEndpoint,
      });
      setHealth((h) => ({ ...h,
        cloudProfileStore: res.cloudProfileStore,
        cloudSecrets: res.cloudSecrets,
        cloudSessions: res.cloudSessions,
      }));
      setCloudStatus("applied");
      setTimeout(() => setCloudStatus("idle"), 2500);
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : String(e));
      setCloudStatus("error");
    }
  }, []);

  // Auto-save with 800 ms debounce after any change
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveSettings(s);
      setSaved(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setSaved(false), 1500);
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  // We intentionally re-run whenever `s` changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
  }

  // Daemon status badge helpers
  const statusBadge: Record<DaemonStatus, { label: string; cls: string }> = {
    unknown:      { label: "Unknown",       cls: "text-zinc-500" },
    checking:     { label: "Checking...",   cls: "text-zinc-400" },
    configured:   { label: "LLM Ready",     cls: "text-emerald-500" },
    unconfigured: { label: "Not Configured", cls: "text-amber-400" },
    unreachable:  { label: "Daemon Offline", cls: "text-red-400" },
    applying:     { label: "Applying...",   cls: "text-blue-400" },
    applied:      { label: "Applied",       cls: "text-emerald-400" },
    error:        { label: "Apply Failed",  cls: "text-red-400" },
  };
  const badge = statusBadge[daemonStatus];

  return (
    <div className="mx-auto max-w-xl space-y-8 py-2">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Settings</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Configure your LLM provider.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {saved && <span className="text-xs text-emerald-500">Saved</span>}
          <span className={`text-xs font-medium ${badge.cls}`}>{badge.label}</span>
        </div>
      </div>

      {/* ── LLM section ── */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-5">
        <SectionHeader
          title="Language Model"
          subtitle="Connect to an LLM provider to enable AI-powered features."
        />

        {/* Provider selector */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-400">Provider</span>
          <div className="flex gap-2">
            {(["azure", "openai"] as const).map((p) => (
              <button
                key={p}
                onClick={() => set("llmProvider", p)}
                className={`rounded-lg border px-4 py-2 text-sm transition ${
                  s.llmProvider === p
                    ? "border-blue-600 bg-blue-600/20 text-blue-300"
                    : "border-zinc-700 bg-zinc-900/60 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                }`}
              >
                {p === "azure" ? "Azure OpenAI" : "OpenAI"}
              </button>
            ))}
          </div>
        </div>

        <Divider />

        {s.llmProvider === "azure" ? (
          <div className="space-y-4">
            <Field
              label="Azure OpenAI Endpoint"
              placeholder="https://your-resource.openai.azure.com"
              value={s.azureEndpoint}
              onChange={(v) => set("azureEndpoint", v)}
              hint="Found in Azure Portal → Azure OpenAI resource → Keys and Endpoint"
            />
            {aoaiKeyInVault ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-400">API Key</span>
                <div className="flex items-center gap-2 rounded-lg border border-emerald-800/50 bg-emerald-950/20 px-3 py-2">
                  <svg className="h-3.5 w-3.5 shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-xs text-emerald-400">Stored in Azure Key Vault</span>
                  <button
                    type="button"
                    onClick={() => { setAoaiKeyInVault(false); set("azureApiKey", ""); }}
                    className="ml-auto text-[10px] text-zinc-600 hover:text-zinc-400 transition"
                  >
                    Replace
                  </button>
                </div>
                <p className="text-[10px] text-zinc-600">Your API key is securely stored in Key Vault. Click Replace to update it.</p>
              </div>
            ) : (
              <Field
                label="API Key"
                type="password"
                placeholder="••••••••••••••••"
                value={s.azureApiKey}
                onChange={(v) => set("azureApiKey", v)}
                hint={s.azureKeyVaultUrl ? "Will be stored in Key Vault on Apply." : undefined}
              />
            )}
            <Field
              label="Deployment Name"
              placeholder="gpt-4o"
              value={s.azureDeployment}
              onChange={(v) => set("azureDeployment", v)}
              hint="The model deployment name in your Azure OpenAI resource"
            />
            <Field
              label="API Version"
              placeholder="2024-02-01"
              value={s.azureApiVersion}
              onChange={(v) => set("azureApiVersion", v)}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <Field
              label="OpenAI API Key"
              type="password"
              placeholder="sk-••••••••••••••••"
              value={s.openaiApiKey}
              onChange={(v) => set("openaiApiKey", v)}
            />
            <Field
              label="Model"
              placeholder="gpt-4o"
              value={s.openaiModel}
              onChange={(v) => set("openaiModel", v)}
              hint="e.g. gpt-4o, gpt-4-turbo, gpt-3.5-turbo"
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-500">
            Click <strong className="text-zinc-300">Apply to Daemon</strong> to activate credentials immediately.
            They are also written to <code className="text-zinc-400">~/.cicd-agent/.env</code> so they persist across restarts.
          </p>
          <button
            type="button"
            onClick={() => void applyToDaemon(s)}
            disabled={daemonStatus === "applying" || daemonStatus === "unreachable"}
            className="shrink-0 rounded-lg border border-blue-700/60 bg-blue-600/20 px-4 py-1.5 text-sm font-medium text-blue-300 transition hover:bg-blue-600/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {daemonStatus === "applying" ? "Applying…" : "Apply to Daemon"}
          </button>
        </div>
        {applyError && (
          <p className="rounded-lg bg-red-950/30 px-3 py-2 text-[11px] text-red-400 border border-red-900/40">
            {applyError}
          </p>
        )}
        {daemonStatus === "unreachable" && (
          <p className="rounded-lg bg-amber-950/30 px-3 py-2 text-[11px] text-amber-400/80 border border-amber-900/40">
            Daemon is not reachable. Start the app and the daemon will launch automatically.
            Credentials will be applied on next start.
          </p>
        )}
      </section>

      {/* ── Azure Cloud section ── */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-5">
        <div className="flex items-start justify-between">
          <SectionHeader
            title="Azure Cloud Persistence"
            subtitle="Store profiles, secrets, and chat history in your Azure subscription. Requires az login."
          />
          <div className="flex items-center gap-1.5 shrink-0 pt-0.5 flex-wrap justify-end max-w-[160px]">
            <CloudPill active={!!health.cloudProfileStore} label="Profiles" />
            <CloudPill active={!!health.cloudSecrets} label="Secrets" />
            <CloudPill active={!!health.cloudSessions} label="Sessions" />
          </div>
        </div>

        {/* Auth status banner */}
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
          authUser.authenticated
            ? "border-emerald-800/60 bg-emerald-950/20"
            : "border-zinc-800 bg-zinc-900/60"
        }`}>
          {authUser.authenticated ? (
            <>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600/70 text-xs font-semibold text-white">
                {(authUser.name ?? authUser.upn ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-200 truncate">{authUser.name ?? authUser.upn}</p>
                <p className="text-[10px] text-zinc-500 truncate">{authUser.upn ?? authUser.oid}</p>
              </div>
              <span className="ml-auto text-[10px] text-emerald-500 shrink-0">Signed in</span>
            </>
          ) : (
            <>
              <svg className="h-4 w-4 shrink-0 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-xs text-zinc-500">Not signed in — use the sidebar button to sign in with Microsoft.</span>
            </>
          )}
        </div>

        <Divider />

        <div className="space-y-4">
          <Field
            label="Storage Account Name"
            placeholder="mystorageaccount"
            value={s.azureStorageAccount}
            onChange={(v) => set("azureStorageAccount", v)}
            hint="Azure Storage account for Profile persistence (Table Storage). Leave blank to use local files."
          />
          <Field
            label="Key Vault URL"
            placeholder="https://my-vault.vault.azure.net/"
            value={s.azureKeyVaultUrl}
            onChange={(v) => set("azureKeyVaultUrl", v)}
            hint="Azure Key Vault for PAT and API key storage."
          />
          <Field
            label="Cosmos DB Endpoint"
            placeholder="https://my-cosmos.documents.azure.com:443/"
            value={s.azureCosmosEndpoint}
            onChange={(v) => set("azureCosmosEndpoint", v)}
            hint="Azure Cosmos DB endpoint for chat session persistence."
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-500">
            Written to <code className="text-zinc-400">~/.cicd-agent/.env</code> and applied immediately.
            Requires <strong className="text-zinc-300">az login</strong> and RBAC roles on each resource.
          </p>
          <button
            type="button"
            onClick={() => void applyCloudToDaemon(s)}
            disabled={cloudStatus === "applying" || daemonStatus === "unreachable"}
            className="shrink-0 rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-4 py-1.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cloudStatus === "applying" ? "Applying…" : cloudStatus === "applied" ? "Applied" : "Apply"}
          </button>
        </div>

        {cloudError && (
          <p className="rounded-lg bg-red-950/30 px-3 py-2 text-[11px] text-red-400 border border-red-900/40">
            {/auth_required|credential|401|403/i.test(cloudError)
              ? "Azure credential expired. Use the sidebar Sign-in button to re-authenticate."
              : cloudError}
          </p>
        )}

        {/* Migration — only show when cloud store is active */}
        {health.cloudProfileStore && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-zinc-300">Migrate local profiles to cloud</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">
                Copy profiles from the local JSON store to Azure Table Storage. Existing cloud profiles are not overwritten.
              </p>
              {migrateResult && (
                <p className="text-[10px] text-emerald-400 mt-1">
                  Done — {migrateResult.migrated} migrated, {migrateResult.skipped} already in cloud (total {migrateResult.total})
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={async () => {
                setMigrateStatus("running");
                try {
                  const r = await migrateProfilesToCloud();
                  setMigrateResult(r);
                  setMigrateStatus("done");
                } catch (e) {
                  setCloudError(e instanceof Error ? e.message : String(e));
                  setMigrateStatus("error");
                }
              }}
              disabled={migrateStatus === "running"}
              className="shrink-0 rounded-md border border-zinc-700 px-3 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800/40 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {migrateStatus === "running" ? "Migrating…" : migrateStatus === "done" ? "Done" : "Migrate"}
            </button>
          </div>
        )}
      </section>

      <p className="text-xs text-zinc-600">
        API keys are stored only on this device and never transmitted to any third-party service.
      </p>
    </div>
  );
}
