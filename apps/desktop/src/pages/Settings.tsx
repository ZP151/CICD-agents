import { useEffect, useRef, useState } from "react";
import {
  fetchAuthStatus,
  fetchHealth,
  type AuthUser,
  type HealthStatus,
} from "../api";
import { useTheme, type AppTheme } from "../theme.js";

const STORAGE_KEY = "dev_agent_settings";

interface AppSettings {
  workMode: "coding" | "everyday";
  defaultOpenDestination: "vscode" | "system" | "none";
  terminalShell: "powershell" | "cmd" | "git_bash";
  language: "auto" | "en" | "zh-CN";
  inferenceSpeed: "fast" | "balanced" | "deep";
  codeReviewMode: "inline" | "detached";
  suggestedPrompts: boolean;
  defaultWorkspacePermissions: boolean;
  autoReviewPermissions: boolean;
  fullAccessPreference: boolean;
  llmProvider: "azure" | "openai";
  azureEndpoint: string;
  azureApiKey: string;
  azureDeployment: string;
  azureApiVersion: string;
  openaiApiKey: string;
  openaiModel: string;
}

const DEFAULTS: AppSettings = {
  workMode: "coding",
  defaultOpenDestination: "vscode",
  terminalShell: "powershell",
  language: "auto",
  inferenceSpeed: "fast",
  codeReviewMode: "inline",
  suggestedPrompts: true,
  defaultWorkspacePermissions: true,
  autoReviewPermissions: true,
  fullAccessPreference: false,
  llmProvider: "azure",
  azureEndpoint: "",
  azureApiKey: "",
  azureDeployment: "",
  azureApiVersion: "2024-02-01",
  openaiApiKey: "",
  openaiModel: "",
};

type DaemonStatus = "unknown" | "checking" | "configured" | "unconfigured" | "unreachable";

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function hasCustomApi(settings: AppSettings): boolean {
  if (settings.llmProvider === "azure") {
    return Boolean(settings.azureEndpoint.trim() && settings.azureApiKey.trim() && settings.azureDeployment.trim());
  }
  return Boolean(settings.openaiApiKey.trim() && settings.openaiModel.trim());
}

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
  onChange: (value: string) => void;
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
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="settings-input"
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setShow((value) => !value)}
            className="absolute right-2.5 text-zinc-600 transition hover:text-zinc-400"
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

function SettingsSection({ children, title }: { children: React.ReactNode; title: string }) {
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

function SelectControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
}) {
  return (
    <select
      className="settings-select"
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`settings-toggle ${checked ? "is-on" : ""}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span />
    </button>
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

function accountLabel(authUser: AuthUser): string {
  if (!authUser.authenticated) return "Not signed in";
  return authUser.name ?? authUser.upn ?? "Signed in";
}

export default function Settings(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const { theme, setTheme } = useTheme();
  const [saved, setSaved] = useState(false);
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus>("unknown");
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser>({ authenticated: false });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDaemonStatus("checking");
    fetchHealth()
      .then((result) => {
        setHealth(result);
        setDaemonStatus(result.llmConfigured ? "configured" : "unconfigured");
      })
      .catch(() => setDaemonStatus("unreachable"));

    fetchAuthStatus().then(setAuthUser).catch(() => {
      setAuthUser({ authenticated: false });
    });
  }, []);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveSettings(settings);
      setSaved(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setSaved(false), 1500);
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [settings]);

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  const customApiReady = hasCustomApi(settings);
  const statusBadge: Record<DaemonStatus, { label: string; tone: "neutral" | "success" | "warning" | "danger"; cls: string }> = {
    unknown: { label: "Model routing", tone: "neutral", cls: "text-zinc-500" },
    checking: { label: "Checking daemon...", tone: "warning", cls: "text-zinc-400" },
    configured: { label: "Built-in default", tone: "success", cls: "text-emerald-500" },
    unconfigured: { label: "Built-in default", tone: "success", cls: "text-emerald-500" },
    unreachable: { label: "Daemon offline", tone: "danger", cls: "text-red-400" },
  };
  const badge = statusBadge[daemonStatus];

  return (
    <div className="settings-page">
      <div className="settings-hero">
        <div>
          <p className="settings-eyebrow">Workspace preferences</p>
          <h2 className="settings-title">Settings</h2>
          <p className="settings-subtitle">
            Tune the local workspace, permissions, identity context, and optional custom model providers.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {saved && <span className="text-xs text-emerald-500">Saved</span>}
          <span className={`text-xs font-medium ${badge.cls}`}>{badge.label}</span>
        </div>
      </div>

      <SettingsSection title="General">
        <SettingsRow title="Work mode" description="Choose how much technical detail the agent shows.">
          <SegmentedChoice
            value={settings.workMode}
            onChange={(value) => set("workMode", value)}
            options={[
              { label: "For coding", value: "coding" },
              { label: "Everyday", value: "everyday" },
            ]}
          />
        </SettingsRow>
        <SettingsRow title="Default open destination" description="Where files and folders open by default.">
          <SelectControl
            value={settings.defaultOpenDestination}
            onChange={(value) => set("defaultOpenDestination", value)}
            options={[
              { label: "VS Code", value: "vscode" },
              { label: "System default", value: "system" },
              { label: "Do not open", value: "none" },
            ]}
          />
        </SettingsRow>
        <SettingsRow title="Agent environment" description="Choose where the agent runs on Windows.">
          <StatusPill>Windows native</StatusPill>
        </SettingsRow>
        <SettingsRow title="Integrated terminal shell" description="Choose which shell opens in the integrated terminal.">
          <SelectControl
            value={settings.terminalShell}
            onChange={(value) => set("terminalShell", value)}
            options={[
              { label: "PowerShell", value: "powershell" },
              { label: "Command Prompt", value: "cmd" },
              { label: "Git Bash", value: "git_bash" },
            ]}
          />
        </SettingsRow>
        <SettingsRow title="Language" description="Language for the app UI.">
          <SelectControl
            value={settings.language}
            onChange={(value) => set("language", value)}
            options={[
              { label: "Auto Detect", value: "auto" },
              { label: "English", value: "en" },
              { label: "Simplified Chinese", value: "zh-CN" },
            ]}
          />
        </SettingsRow>
        <SettingsRow title="Speed" description="Choose the inference tier used across chats and compaction.">
          <SelectControl
            value={settings.inferenceSpeed}
            onChange={(value) => set("inferenceSpeed", value)}
            options={[
              { label: "Fast", value: "fast" },
              { label: "Balanced", value: "balanced" },
              { label: "Deep", value: "deep" },
            ]}
          />
        </SettingsRow>
        <SettingsRow title="Code review" description="Start review in the current chat when possible or launch a separate review chat.">
          <SegmentedChoice
            value={settings.codeReviewMode}
            onChange={(value) => set("codeReviewMode", value)}
            options={[
              { label: "Inline", value: "inline" },
              { label: "Detached", value: "detached" },
            ]}
          />
        </SettingsRow>
        <SettingsRow title="Suggested prompts" description="Suggest what to do next from project files and connected services.">
          <ToggleSwitch checked={settings.suggestedPrompts} onChange={(value) => set("suggestedPrompts", value)} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Appearance">
        <SettingsRow title="Theme">
          <SegmentedChoice<AppTheme>
            value={theme}
            onChange={setTheme}
            options={[
              { label: "System", value: "system" },
              { label: "Dark", value: "dark" },
              { label: "Light", value: "light" },
            ]}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Permissions">
        <SettingsRow title="Default permissions" description="Allow the agent to read and edit files in its workspace by default.">
          <ToggleSwitch checked={settings.defaultWorkspacePermissions} onChange={(value) => set("defaultWorkspacePermissions", value)} />
        </SettingsRow>
        <SettingsRow title="Auto-review" description="Let the app review permission requests and surface risky actions before execution.">
          <ToggleSwitch checked={settings.autoReviewPermissions} onChange={(value) => set("autoReviewPermissions", value)} />
        </SettingsRow>
        <SettingsRow title="Full access preference" description="Preference only. Actual filesystem and network access still follow the current runtime policy.">
          <ToggleSwitch checked={settings.fullAccessPreference} onChange={(value) => set("fullAccessPreference", value)} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Additional Models">
        <SettingsRow
          title="Model provider"
          description="Optional. Conversation keeps using the built-in model by default; saved providers appear there as additional model choices."
        >
          <SegmentedChoice
            value={settings.llmProvider}
            onChange={(value) => set("llmProvider", value)}
            options={[
              { label: "Azure OpenAI", value: "azure" },
              { label: "OpenAI", value: "openai" },
            ]}
          />
        </SettingsRow>

        {settings.llmProvider === "azure" ? (
          <>
            <SettingsRow title="Endpoint" description="For an additional user-owned Azure OpenAI resource.">
              <TextInput
                label="Endpoint"
                placeholder="https://your-resource.openai.azure.com"
                value={settings.azureEndpoint}
                onChange={(value) => set("azureEndpoint", value)}
              />
            </SettingsRow>
            <SettingsRow title="API key" description="Stored locally for this additional model provider.">
              <TextInput
                label="API key"
                type="password"
                placeholder="Optional custom key"
                value={settings.azureApiKey}
                onChange={(value) => set("azureApiKey", value)}
              />
            </SettingsRow>
            <SettingsRow title="Deployment" description="The deployment name that will appear as a Conversation model choice.">
              <TextInput
                label="Deployment"
                placeholder="my-chat-deployment"
                value={settings.azureDeployment}
                onChange={(value) => set("azureDeployment", value)}
              />
            </SettingsRow>
            <SettingsRow title="API version">
              <TextInput
                label="API version"
                placeholder="2024-02-01"
                value={settings.azureApiVersion}
                onChange={(value) => set("azureApiVersion", value)}
              />
            </SettingsRow>
          </>
        ) : (
          <>
            <SettingsRow title="API key" description="Stored locally for this additional model provider.">
              <TextInput
                label="API key"
                type="password"
                placeholder="Optional custom key"
                value={settings.openaiApiKey}
                onChange={(value) => set("openaiApiKey", value)}
              />
            </SettingsRow>
            <SettingsRow title="Model" description="The model name that will appear as a Conversation model choice.">
              <TextInput
                label="Model"
                placeholder="Optional custom model"
                value={settings.openaiModel}
                onChange={(value) => set("openaiModel", value)}
              />
            </SettingsRow>
          </>
        )}

        <SettingsRow title="Conversation availability" description="Complete providers become selectable from Conversation; the built-in model remains the default.">
          <div className="settings-inline-status">
            <StatusPill tone={customApiReady ? "success" : "neutral"}>
              {customApiReady ? "Additional model available" : "Built-in model only"}
            </StatusPill>
            <StatusPill tone={badge.tone}>{badge.label}</StatusPill>
          </div>
        </SettingsRow>
        {daemonStatus === "unreachable" && (
          <p className="settings-message settings-message-warning">Daemon is not reachable. Local preferences will still be saved.</p>
        )}
      </SettingsSection>

      <SettingsSection title="Account">
        <SettingsRow title="Identity" description="Authentication actions stay in the workspace account menu.">
          {authUser.authenticated ? (
            <div className="settings-account">
              <div className="settings-avatar">
                {accountLabel(authUser).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 text-right">
                <p className="truncate text-xs font-medium text-zinc-200">{accountLabel(authUser)}</p>
                <p className="truncate text-[10px] text-zinc-500">{authUser.upn ?? authUser.oid}</p>
              </div>
            </div>
          ) : (
            <StatusPill>Not signed in</StatusPill>
          )}
        </SettingsRow>
        <SettingsRow title="Tenant account" description="Used for Azure DevOps OAuth and managed cloud storage when available.">
          <StatusPill tone={authUser.authenticated ? "success" : "neutral"}>
            {authUser.authenticated ? (authUser.fromCache ? "Cached" : "Active") : "No account"}
          </StatusPill>
        </SettingsRow>
        <SettingsRow title="Profile store" description="Project Link records can use managed cloud storage when configured.">
          <StatusPill tone={health?.cloudProfileStore ? "success" : "neutral"}>
            {health?.cloudProfileStore ? "Cloud enabled" : "Local fallback"}
          </StatusPill>
        </SettingsRow>
        <SettingsRow title="Secret storage" description="Custom secrets and service credentials should use managed storage when configured.">
          <StatusPill tone={health?.cloudSecrets ? "success" : "neutral"}>
            {health?.cloudSecrets ? "Cloud enabled" : "Local fallback"}
          </StatusPill>
        </SettingsRow>
        <SettingsRow title="Session storage" description="Conversation and checkpoint metadata can use managed cloud storage when configured.">
          <StatusPill tone={health?.cloudSessions ? "success" : "neutral"}>
            {health?.cloudSessions ? "Cloud enabled" : "Local fallback"}
          </StatusPill>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
