import { useState, type ReactNode } from "react";

export function TextInput({
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
}): JSX.Element {
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              )}
            </svg>
          </button>
        )}
      </div>
    </label>
  );
}

export function SettingsSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}): JSX.Element {
  return (
    <section className="settings-section">
      <h3 className="settings-section-title">{title}</h3>
      <div className="settings-list">{children}</div>
    </section>
  );
}

export function SettingsRow({
  children,
  description,
  title,
}: {
  children?: ReactNode;
  description?: string;
  title: string;
}): JSX.Element {
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

export function SegmentedChoice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}): JSX.Element {
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

export function ToggleSwitch({
  checked,
  disabled = false,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}): JSX.Element {
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

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}): JSX.Element {
  return <span className={`settings-status settings-status-${tone}`}>{children}</span>;
}
