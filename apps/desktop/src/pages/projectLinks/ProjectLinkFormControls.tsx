import { useState, type ReactNode } from "react";
import {
  type AdoDiscoveryKind,
  type AdoDiscoveryOption,
} from "../../api";

export function Field({
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
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  children?: ReactNode;
}): JSX.Element {
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
            onChange={(event) => onChange?.(event.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className={`w-full rounded-lg border px-3 py-2 pr-8 text-sm placeholder-zinc-600 outline-none transition ${
              disabled
                ? "cursor-not-allowed border-zinc-800 bg-zinc-900/30 text-zinc-600"
                : "border-zinc-700/60 bg-zinc-900 text-zinc-200 focus:border-zinc-600 focus:outline-none"
            }`}
          />
          {isSecret && !disabled && (
            <button
              type="button"
              onClick={() => setShow((visible) => !visible)}
              className="absolute right-2.5 text-zinc-600 transition hover:text-zinc-400"
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
      )}
      {hint && (
        <p className={`text-[10px] ${disabled ? "text-zinc-700" : "text-zinc-600"}`}>{hint}</p>
      )}
    </label>
  );
}

export function BranchSelect({
  label,
  value,
  onChange,
  branches,
  branchLoading,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  branches: string[];
  branchLoading: boolean;
}): JSX.Element {
  if (branchLoading) {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        <div className="flex items-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-900 px-3 py-2 text-sm text-zinc-500">
          <svg className="h-3 w-3 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeDasharray="30 70"
              strokeWidth="3"
            />
          </svg>
          Detecting branches...
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
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 rounded-lg border border-emerald-700/60 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none transition focus:border-emerald-500"
        >
          {branches.map((branch) => (
            <option key={branch} value={branch}>
              {branch}
            </option>
          ))}
          {!branches.includes(value) && value && <option value={value}>{value} (saved)</option>}
        </select>
      </label>
    );
  }
  return <Field label={label} value={value} onChange={onChange} placeholder="main" />;
}

export function ProjectDiscoveryField({
  kind,
  label,
  options,
  value,
  discovering,
  placeholder,
  onApply,
  onManualChange,
}: {
  kind: AdoDiscoveryKind;
  label: string;
  options: AdoDiscoveryOption[];
  value: string;
  discovering: AdoDiscoveryKind | null;
  placeholder: string;
  onApply: (kind: AdoDiscoveryKind, option: AdoDiscoveryOption) => void;
  onManualChange: (value: string) => void;
}): JSX.Element {
  return (
    <Field label={label}>
      {options.length > 0 ? (
        <select
          value={options.some((option) => option.name === value) ? value : ""}
          onChange={(event) => {
            const selected = options.find((option) => option.name === event.target.value);
            if (selected) onApply(kind, selected);
          }}
          className="w-full min-w-0 rounded-lg border border-zinc-700/60 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none transition focus:border-zinc-600"
        >
          <option value="">
            {discovering === kind ? `Discovering ${kind}...` : `Select ${kind.slice(0, -1)}`}
          </option>
          {options.map((option) => (
            <option key={option.id} value={option.name}>
              {option.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={value}
          onChange={(event) => onManualChange(event.target.value)}
          placeholder={discovering === kind ? `Discovering ${kind}...` : placeholder}
          className="w-full min-w-0 rounded-lg border border-zinc-700/60 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-zinc-600"
        />
      )}
    </Field>
  );
}
