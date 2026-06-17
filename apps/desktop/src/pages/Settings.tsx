import { useEffect, useRef, useState } from "react";
import {
  configureDaemon,
  fetchAuthStatus,
  fetchDaemonConfig,
  fetchHealth,
  testLlmConfig,
  type AuthUser,
  type HealthStatus,
  type LlmProviderConfig,
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
  additionalModels: AdditionalModelConfig[];
  azureTenantId: string;
  azureClientId: string;
}

type AdditionalModelProvider = "azure" | "openai";

interface AdditionalModelConfig {
  id: string;
  provider: AdditionalModelProvider;
  label: string;
  enabled: boolean;
  available: boolean;
  testedAt: string;
  testError: string;
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
  additionalModels: [],
  azureTenantId: "",
  azureClientId: "",
};

type DaemonStatus = "unknown" | "checking" | "configured" | "unconfigured" | "unreachable";

function makeModelId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `model-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyAdditionalModel(): AdditionalModelConfig {
  return {
    id: makeModelId(),
    provider: "azure",
    label: "",
    enabled: false,
    available: false,
    testedAt: "",
    testError: "",
    azureEndpoint: "",
    azureApiKey: "",
    azureDeployment: "",
    azureApiVersion: "",
    openaiApiKey: "",
    openaiModel: "",
  };
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeAdditionalModels(value: unknown): AdditionalModelConfig[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = item as Record<string, unknown>;
    return {
      id: cleanString(raw.id) || makeModelId(),
      provider: raw.provider === "openai" ? "openai" : "azure",
      label: cleanString(raw.label),
      enabled: raw.enabled === true,
      available: raw.available === true,
      testedAt: cleanString(raw.testedAt),
      testError: cleanString(raw.testError),
      azureEndpoint: cleanString(raw.azureEndpoint),
      azureApiKey: cleanString(raw.azureApiKey),
      azureDeployment: cleanString(raw.azureDeployment),
      azureApiVersion: cleanString(raw.azureApiVersion),
      openaiApiKey: cleanString(raw.openaiApiKey),
      openaiModel: cleanString(raw.openaiModel),
    };
  });
}

function additionalModelName(model: AdditionalModelConfig): string {
  const fallback = model.provider === "openai" ? model.openaiModel : model.azureDeployment;
  return model.label.trim() || fallback.trim() || "Untitled model";
}

function additionalModelDescription(model: AdditionalModelConfig): string {
  const provider = model.provider === "openai" ? "OpenAI" : "Azure OpenAI";
  const configured = model.provider === "openai"
    ? Boolean(model.openaiApiKey.trim() && model.openaiModel.trim())
    : Boolean(model.azureEndpoint.trim() && model.azureApiKey.trim() && model.azureDeployment.trim());
  if (!configured) return `${provider} · missing required fields`;
  if (model.available) return `${provider} · available`;
  if (model.testError) return `${provider} · test failed`;
  return `${provider} · not tested`;
}

function additionalModelIsConfigured(model: AdditionalModelConfig): boolean {
  return model.provider === "openai"
    ? Boolean(model.openaiApiKey.trim() && model.openaiModel.trim())
    : Boolean(model.azureEndpoint.trim() && model.azureApiKey.trim() && model.azureDeployment.trim());
}

function llmConfigFromModel(model: AdditionalModelConfig): LlmProviderConfig {
  return model.provider === "openai"
    ? {
        llmProvider: "openai",
        openaiApiKey: model.openaiApiKey.trim(),
        openaiModel: model.openaiModel.trim(),
      }
    : {
        llmProvider: "azure",
        azureEndpoint: model.azureEndpoint.trim(),
        azureApiKey: model.azureApiKey.trim(),
        azureDeployment: model.azureDeployment.trim(),
        azureApiVersion: model.azureApiVersion.trim(),
      };
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings> & Record<string, unknown>;
      const stored = { ...DEFAULTS, ...parsed };
      return {
        workMode: stored.workMode,
        defaultOpenDestination: stored.defaultOpenDestination,
        terminalShell: stored.terminalShell,
        language: stored.language,
        inferenceSpeed: stored.inferenceSpeed,
        codeReviewMode: stored.codeReviewMode,
        suggestedPrompts: stored.suggestedPrompts,
        additionalModels: normalizeAdditionalModels(parsed.additionalModels),
        azureTenantId: cleanString(parsed.azureTenantId),
        azureClientId: cleanString(parsed.azureClientId),
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
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
  disabled = false,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`settings-toggle ${checked ? "is-on" : ""}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      disabled={disabled}
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
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [modelDraft, setModelDraft] = useState<AdditionalModelConfig>(createEmptyAdditionalModel);
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHydrateDaemonRef = useRef(false);

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
    fetchDaemonConfig().then((config) => {
      if (!config) return;
      setSettings((current) => ({
        ...current,
        azureTenantId: config.azureTenantId ?? current.azureTenantId,
        azureClientId: config.azureClientId ?? current.azureClientId,
      }));
    }).catch(() => undefined).finally(() => {
      didHydrateDaemonRef.current = true;
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

  useEffect(() => {
    if (!didHydrateDaemonRef.current) return;
    const tenantId = settings.azureTenantId.trim();
    const clientId = settings.azureClientId.trim();
    const timer = setTimeout(() => {
      configureDaemon({
        azureTenantId: tenantId,
        azureClientId: clientId,
      }).catch(() => undefined);
    }, 900);
    return () => clearTimeout(timer);
  }, [settings.azureTenantId, settings.azureClientId]);

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function startAddingModel() {
    setEditingModelId("new");
    setModelDraft(createEmptyAdditionalModel());
  }

  function startEditingModel(model: AdditionalModelConfig) {
    setEditingModelId(model.id);
    setModelDraft({ ...model });
  }

  function cancelModelEdit() {
    setEditingModelId(null);
    setModelDraft(createEmptyAdditionalModel());
  }

  function saveModelDraft() {
    setSettings((current) => {
      const saved = {
        ...modelDraft,
        label: modelDraft.label.trim(),
        azureEndpoint: modelDraft.azureEndpoint.trim(),
        azureDeployment: modelDraft.azureDeployment.trim(),
        azureApiVersion: modelDraft.azureApiVersion.trim(),
        openaiModel: modelDraft.openaiModel.trim(),
      };
      const exists = current.additionalModels.some((model) => model.id === saved.id);
      return {
        ...current,
        additionalModels: exists
          ? current.additionalModels.map((model) => (model.id === saved.id ? saved : model))
          : [...current.additionalModels, saved],
      };
    });
    cancelModelEdit();
  }

  function updateModelDraft<K extends keyof AdditionalModelConfig>(key: K, value: AdditionalModelConfig[K]) {
    setModelDraft((current) => {
      const next = { ...current, [key]: value };
      if (
        key === "provider"
        || key === "azureEndpoint"
        || key === "azureApiKey"
        || key === "azureDeployment"
        || key === "azureApiVersion"
        || key === "openaiApiKey"
        || key === "openaiModel"
      ) {
        return { ...next, enabled: false, available: false, testedAt: "", testError: "" };
      }
      return next;
    });
  }

  async function testModel(model: AdditionalModelConfig, source: "draft" | "saved" = "saved"): Promise<boolean> {
    if (!additionalModelIsConfigured(model)) {
      const failed = { ...model, enabled: false, available: false, testError: "Required fields are missing." };
      if (source === "draft") setModelDraft(failed);
      else {
        setSettings((current) => ({
          ...current,
          additionalModels: current.additionalModels.map((item) => (item.id === model.id ? failed : item)),
        }));
      }
      return false;
    }
    setTestingModelId(model.id);
    try {
      await testLlmConfig(llmConfigFromModel(model));
      const passed = {
        ...model,
        enabled: true,
        available: true,
        testedAt: new Date().toISOString(),
        testError: "",
      };
      if (source === "draft") setModelDraft(passed);
      else {
        setSettings((current) => ({
          ...current,
          additionalModels: current.additionalModels.map((item) => (item.id === model.id ? passed : item)),
        }));
      }
      return true;
    } catch (err) {
      const failed = {
        ...model,
        enabled: false,
        available: false,
        testedAt: "",
        testError: err instanceof Error ? err.message : String(err),
      };
      if (source === "draft") setModelDraft(failed);
      else {
        setSettings((current) => ({
          ...current,
          additionalModels: current.additionalModels.map((item) => (item.id === model.id ? failed : item)),
        }));
      }
      return false;
    } finally {
      setTestingModelId((current) => (current === model.id ? null : current));
    }
  }

  function disableModel(model: AdditionalModelConfig) {
    setSettings((current) => ({
      ...current,
      additionalModels: current.additionalModels.map((item) => (
        item.id === model.id ? { ...item, enabled: false, available: false } : item
      )),
    }));
  }

  const availableAdditionalModels = settings.additionalModels.filter((model) => model.enabled && model.available);

  return (
    <div className="settings-page">
      <div className="settings-hero">
        <div>
          <h2 className="settings-title">Settings</h2>
          <p className="settings-subtitle">
            Tune the local workspace, identity context, and optional custom model providers.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {saved && <span className="text-xs text-emerald-500">Saved</span>}
        </div>
      </div>

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

      <SettingsSection title="Additional Models">
        <SettingsRow
          title="Available in Chat"
          description={availableAdditionalModels.length > 0
            ? availableAdditionalModels.map(additionalModelName).join(", ")
            : "No custom models are available yet."}
        />
        <SettingsRow
          title="Models"
          description="Optional model choices for Chat."
        >
          <button
            type="button"
            onClick={startAddingModel}
            className="settings-text-button"
            disabled={editingModelId !== null}
          >
            Add model
          </button>
        </SettingsRow>

        {settings.additionalModels.length === 0 && editingModelId === null && (
          <p className="settings-message">No additional models configured.</p>
        )}

        {settings.additionalModels.map((model) => (
          <SettingsRow
            key={model.id}
            title={additionalModelName(model)}
            description={additionalModelDescription(model)}
          >
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <ToggleSwitch
                  checked={model.enabled && model.available}
                  disabled={testingModelId === model.id}
                  onChange={(value) => {
                    if (!value) {
                      disableModel(model);
                      return;
                    }
                    void testModel(model);
                  }}
                />
                <button
                  type="button"
                  className="settings-text-button"
                  onClick={() => void testModel(model)}
                  disabled={testingModelId === model.id}
                >
                  {testingModelId === model.id ? "Testing..." : "Test"}
                </button>
                <button type="button" className="settings-text-button" onClick={() => startEditingModel(model)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="settings-text-button"
                  onClick={() => {
                    setSettings((current) => ({
                      ...current,
                      additionalModels: current.additionalModels.filter((item) => item.id !== model.id),
                    }));
                    if (editingModelId === model.id) cancelModelEdit();
                  }}
                >
                  Delete
                </button>
              </div>
              {model.testError && <p className="max-w-[360px] text-right text-[11px] text-red-500">{model.testError}</p>}
            </div>
          </SettingsRow>
        ))}

        {editingModelId !== null && (
          <div className="settings-list rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]/45">
            <SettingsRow title={editingModelId === "new" ? "Add model" : "Edit model"}>
              <SegmentedChoice<AdditionalModelProvider>
                value={modelDraft.provider}
                onChange={(value) => updateModelDraft("provider", value)}
                options={[
                  { label: "Azure OpenAI", value: "azure" },
                  { label: "OpenAI", value: "openai" },
                ]}
              />
            </SettingsRow>
            <SettingsRow title="Display name" description="Optional. Used in the Chat model menu.">
              <TextInput
                label="Display name"
                placeholder="Team review model"
                value={modelDraft.label}
                onChange={(value) => updateModelDraft("label", value)}
              />
            </SettingsRow>
            {modelDraft.provider === "azure" ? (
              <>
                <SettingsRow title="Endpoint">
                  <TextInput
                    label="Endpoint"
                    placeholder="https://your-resource.openai.azure.com"
                    value={modelDraft.azureEndpoint}
                    onChange={(value) => updateModelDraft("azureEndpoint", value)}
                  />
                </SettingsRow>
                <SettingsRow title="API key">
                  <TextInput
                    label="API key"
                    type="password"
                    placeholder="Azure OpenAI key"
                    value={modelDraft.azureApiKey}
                    onChange={(value) => updateModelDraft("azureApiKey", value)}
                  />
                </SettingsRow>
                <SettingsRow title="Deployment">
                  <TextInput
                    label="Deployment"
                    placeholder="my-chat-deployment"
                    value={modelDraft.azureDeployment}
                    onChange={(value) => updateModelDraft("azureDeployment", value)}
                  />
                </SettingsRow>
                <SettingsRow title="API version">
                  <TextInput
                    label="API version"
                    placeholder="2024-02-01"
                    value={modelDraft.azureApiVersion}
                    onChange={(value) => updateModelDraft("azureApiVersion", value)}
                  />
                </SettingsRow>
              </>
            ) : (
              <>
                <SettingsRow title="API key">
                  <TextInput
                    label="API key"
                    type="password"
                    placeholder="OpenAI API key"
                    value={modelDraft.openaiApiKey}
                    onChange={(value) => updateModelDraft("openaiApiKey", value)}
                  />
                </SettingsRow>
                <SettingsRow title="Model">
                  <TextInput
                    label="Model"
                    placeholder="model name"
                    value={modelDraft.openaiModel}
                    onChange={(value) => updateModelDraft("openaiModel", value)}
                  />
                </SettingsRow>
              </>
            )}
            <SettingsRow title="Enabled" description="Controls whether this model appears in Chat.">
              <ToggleSwitch
                checked={modelDraft.enabled && modelDraft.available}
                disabled={testingModelId === modelDraft.id}
                onChange={(value) => {
                  if (!value) {
                    setModelDraft((current) => ({ ...current, enabled: false, available: false }));
                    return;
                  }
                  void testModel(modelDraft, "draft");
                }}
              />
            </SettingsRow>
            <SettingsRow title="Actions">
              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    className="settings-text-button"
                    onClick={() => void testModel(modelDraft, "draft")}
                    disabled={testingModelId === modelDraft.id}
                  >
                    {testingModelId === modelDraft.id ? "Testing..." : "Test connection"}
                  </button>
                  <button type="button" className="settings-text-button" onClick={saveModelDraft}>
                    Save
                  </button>
                  <button type="button" className="settings-text-button" onClick={cancelModelEdit}>
                    Cancel
                  </button>
                </div>
                {modelDraft.available && <p className="text-[11px] text-emerald-500">Connection verified.</p>}
                {modelDraft.testError && <p className="max-w-[360px] text-right text-[11px] text-red-500">{modelDraft.testError}</p>}
              </div>
            </SettingsRow>
          </div>
        )}

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
        <SettingsRow title="Azure tenant ID" description="Must match the tenant of the DevCICDAgent app registration.">
          <TextInput
            label="Azure tenant ID"
            placeholder="Tenant ID"
            value={settings.azureTenantId}
            onChange={(value) => set("azureTenantId", value)}
          />
        </SettingsRow>
        <SettingsRow title="Azure client ID" description="Application client ID for the registered app that has Azure DevOps user_impersonation consent.">
          <div className="flex min-w-0 items-center gap-2">
            <TextInput
              label="Azure client ID"
              placeholder="Application (client) ID"
              value={settings.azureClientId}
              onChange={(value) => set("azureClientId", value)}
            />
            <StatusPill tone={authUser.azureAuthConfig?.usesDefaultClient ? "warning" : "success"}>
              {authUser.azureAuthConfig?.usesDefaultClient ? "Default" : "Configured"}
            </StatusPill>
          </div>
        </SettingsRow>
        <SettingsRow title="Project Link storage" description="Project Link records can use managed cloud storage when configured.">
          <StatusPill tone={health?.cloudProfileStore ? "success" : "neutral"}>
            {health?.cloudProfileStore ? "Cloud enabled" : "Local fallback"}
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
