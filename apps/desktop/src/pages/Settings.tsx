import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchHealth,
  fetchAuthStatus,
  fetchDaemonConfig,
  configureDaemon,
  type DaemonConfigPayload,
  type AuthUser,
} from "../api";
import { useTheme } from "../theme.js";

// Persistence

const STORAGE_KEY = "dev_agent_settings";

interface AppSettings {
  llmProvider: "azure" | "openai";
  azureEndpoint: string;
  azureApiKey: string;
  azureDeployment: string;
  azureApiVersion: string;
  openaiApiKey: string;
  openaiModel: string;
}

const DEFAULTS: AppSettings = {
  llmProvider: "azure",
  azureEndpoint: "",
  azureApiKey: "",
  azureDeployment: "",
  azureApiVersion: "2024-02-01",
  openaiApiKey: "",
  openaiModel: "gpt-4o",
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

// Sub-components

function TextInput({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  const isSecret = type === "password";
  return (
    <label className="settings-input-wrap">
      <span className="sr-only">{label}</span>
      <div className="relative flex items-center">
        <input
          type={isSecret && !show ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="settings-input"
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
    </label>
  );
}

function SettingsSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="settings-section">
      <h3 className="settings-section-title">{title}</h3>
      <div className="settings-list">{children}</div>
    </section>
  );
}

function SettingsRow({
  children,
  description,
  title,
}: {
  children?: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <div className="settings-row">
      <div className="min-w-0">
        <p className="settings-row-title">{title}</p>
        {description && <p className="settings-row-copy">{description}</p>}
      </div>
      {children && <div className="settings-row-control">{children}</div>}
    </div>
  );
}

function SegmentedChoice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="settings-segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={option.value === value ? "is-active" : ""}
          aria-pressed={option.value === value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return <span className={`settings-status settings-status-${tone}`}>{children}</span>;
}

// Main Settings page

type DaemonStatus = "unknown" | "checking" | "configured" | "unconfigured" | "unreachable" | "applying" | "applied" | "error";

export default function Settings(): JSX.Element {
  const [s, setS] = useState<AppSettings>(loadSettings);
  const { theme, setTheme } = useTheme();
  // "saved" flash indicator
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Daemon / LLM status
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus>("unknown");
  const [applyError, setApplyError] = useState<string | null>(null);

  const [authUser, setAuthUser] = useState<AuthUser>({ authenticated: false });
  const [aoaiKeyInVault, setAoaiKeyInVault] = useState(false);

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
      }));
    }).catch(() => {/* non-fatal */});

    fetchHealth()
      .then((h) => {
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
    <div className="settings-page">
      <div className="settings-hero">
        <div>
          <p className="settings-eyebrow">Workspace preferences</p>
          <h2 className="settings-title">Settings</h2>
          <p className="settings-subtitle">
            Tune the local workspace, model connection, and review behavior.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {saved && <span className="text-xs text-emerald-500">Saved</span>}
          <span className={`text-xs font-medium ${badge.cls}`}>{badge.label}</span>
        </div>
      </div>

      <SettingsSection title="Appearance">
        <SettingsRow title="Theme">
          <SegmentedChoice
            value={theme}
            onChange={setTheme}
            options={[
              { label: "Dark", value: "dark" },
              { label: "Light", value: "light" },
            ]}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Model">
        <SettingsRow title="Provider">
          <SegmentedChoice
            value={s.llmProvider}
            onChange={(value) => set("llmProvider", value)}
            options={[
              { label: "Azure OpenAI", value: "azure" },
              { label: "OpenAI", value: "openai" },
            ]}
          />
        </SettingsRow>

        {s.llmProvider === "azure" ? (
          <>
            <SettingsRow title="Endpoint">
              <TextInput
                label="Endpoint"
                placeholder="https://your-resource.openai.azure.com"
                value={s.azureEndpoint}
                onChange={(v) => set("azureEndpoint", v)}
              />
            </SettingsRow>
            <SettingsRow title="API key">
              {aoaiKeyInVault ? (
                <div className="settings-inline-status">
                  <StatusPill tone="success">Stored in Key Vault</StatusPill>
                  <button
                    type="button"
                    onClick={() => { setAoaiKeyInVault(false); set("azureApiKey", ""); }}
                    className="settings-text-button"
                  >
                    Replace
                  </button>
                </div>
              ) : (
                <TextInput
                  label="API key"
                  type="password"
                  placeholder="••••••••••••••••"
                  value={s.azureApiKey}
                  onChange={(v) => set("azureApiKey", v)}
                />
              )}
            </SettingsRow>
            <SettingsRow title="Deployment">
              <TextInput
                label="Deployment"
                placeholder="gpt-4o"
                value={s.azureDeployment}
                onChange={(v) => set("azureDeployment", v)}
              />
            </SettingsRow>
            <SettingsRow title="API version">
              <TextInput
                label="API version"
                placeholder="2024-02-01"
                value={s.azureApiVersion}
                onChange={(v) => set("azureApiVersion", v)}
              />
            </SettingsRow>
          </>
        ) : (
          <>
            <SettingsRow title="API key">
              <TextInput
                label="API key"
                type="password"
                placeholder="sk-••••••••••••••••"
                value={s.openaiApiKey}
                onChange={(v) => set("openaiApiKey", v)}
              />
            </SettingsRow>
            <SettingsRow title="Model">
              <TextInput
                label="Model"
                placeholder="gpt-4o"
                value={s.openaiModel}
                onChange={(v) => set("openaiModel", v)}
              />
            </SettingsRow>
          </>
        )}

        <SettingsRow title="Daemon status">
          <div className="settings-inline-status">
            <StatusPill
              tone={
                daemonStatus === "configured" || daemonStatus === "applied"
                  ? "success"
                  : daemonStatus === "unconfigured" || daemonStatus === "checking" || daemonStatus === "applying"
                    ? "warning"
                    : daemonStatus === "unreachable" || daemonStatus === "error"
                      ? "danger"
                      : "neutral"
              }
            >
              {badge.label}
            </StatusPill>
            <button
              type="button"
              onClick={() => void applyToDaemon(s)}
              disabled={daemonStatus === "applying" || daemonStatus === "unreachable"}
              className="settings-action-button"
            >
              {daemonStatus === "applying" ? "Applying..." : "Apply"}
            </button>
          </div>
        </SettingsRow>
        {applyError && (
          <p className="settings-message settings-message-danger">{applyError}</p>
        )}
        {daemonStatus === "unreachable" && (
          <p className="settings-message settings-message-warning">Daemon is not reachable. The app will retry on next start.</p>
        )}
      </SettingsSection>

      <SettingsSection title="Account">
        <SettingsRow title="Microsoft sign-in">
          {authUser.authenticated ? (
            <div className="settings-account">
              <div className="settings-avatar">
                {(authUser.name ?? authUser.upn ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 text-right">
                <p className="truncate text-xs font-medium text-zinc-200">{authUser.name ?? authUser.upn}</p>
                <p className="truncate text-[10px] text-zinc-500">{authUser.upn ?? authUser.oid}</p>
              </div>
            </div>
          ) : (
            <StatusPill>Not signed in</StatusPill>
          )}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Data">
        <SettingsRow title="Settings" description="Saved on this device">
          <StatusPill>Local</StatusPill>
        </SettingsRow>
        <SettingsRow title="API keys" description="Applied only to the local daemon">
          <StatusPill>Device only</StatusPill>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Review defaults">
        <SettingsRow title="Queue scope" description="Uses the selected workspace profile">
          <StatusPill>Profile</StatusPill>
        </SettingsRow>
        <SettingsRow title="Audit records" description="Keeps timestamps and actors when available">
          <StatusPill>Retained</StatusPill>
        </SettingsRow>
      </SettingsSection>

      <p className="text-xs text-zinc-600">
        Sensitive values stay on this device unless your organization configures managed storage outside this page.
      </p>
    </div>
  );
}
