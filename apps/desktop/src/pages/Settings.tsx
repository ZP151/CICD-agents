import { useEffect, useRef, useState } from "react";

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

// ─── Main Settings page ────────────────────────────────────────────────────────

export default function Settings(): JSX.Element {
  const [s, setS] = useState<AppSettings>(loadSettings);
  // "saved" flash indicator
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <div className="mx-auto max-w-xl space-y-8 py-2">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Settings</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Configure your LLM provider. Settings are saved automatically.
          </p>
        </div>
        {saved && (
          <span className="mt-1 text-xs text-emerald-500 shrink-0">Saved</span>
        )}
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
            <Field
              label="API Key"
              type="password"
              placeholder="••••••••••••••••"
              value={s.azureApiKey}
              onChange={(v) => set("azureApiKey", v)}
            />
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

        <p className="rounded-lg bg-amber-950/30 px-3 py-2 text-[11px] text-amber-400/80 border border-amber-900/40">
          Restart the daemon after changing LLM settings for them to take effect.
        </p>
      </section>

      <p className="text-xs text-zinc-600">
        API keys are stored only on this device and never transmitted to any third-party service.
      </p>
    </div>
  );
}
