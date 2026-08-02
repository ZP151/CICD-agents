import { useState, type ReactNode } from "react";
import {
  type AdoDiscoveryKind,
  type AdoDiscoveryOption,
} from "../../api";
import {
  ActionButton,
  WorkbenchSelect,
  WorkbenchTextInput,
} from "../../components/workbench/WorkbenchPrimitives.js";

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
        <span className={`text-xs font-medium ${disabled ? "text-[rgb(var(--app-text-faint))]" : "text-[rgb(var(--app-text-muted))]"}`}>
          {label}
        </span>
      )}
      {children ?? (
        <div className="relative flex items-center">
          <WorkbenchTextInput
            type={isSecret && !show ? "password" : "text"}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className="pr-9 text-sm disabled:bg-[rgb(var(--app-bg-muted))] disabled:text-[rgb(var(--app-text-faint))]"
          />
          {isSecret && !disabled && (
            <ActionButton
              type="button"
              onClick={() => setShow((visible) => !visible)}
              tone="quiet"
              aria-label={show ? "Hide password" : "Show password"}
              title={show ? "Hide password" : "Show password"}
              className="absolute right-1 h-7 min-h-7 w-7 px-0 text-[rgb(var(--app-text-subtle))]"
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
            </ActionButton>
          )}
        </div>
      )}
      {hint && (
        <p className={`text-[10px] ${disabled ? "text-[rgb(var(--app-text-faint))]" : "text-[rgb(var(--app-text-subtle))]"}`}>{hint}</p>
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
        <span className="text-xs font-medium text-[rgb(var(--app-text-muted))]">{label}</span>
        <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-sm text-[rgb(var(--app-text-muted))]">
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
        <span className="text-xs font-medium text-[rgb(var(--app-text-muted))]">{label}</span>
        <WorkbenchSelect
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="border-[rgb(var(--app-success-border))] text-sm focus:border-[rgb(var(--app-success))]"
        >
          {branches.map((branch) => (
            <option key={branch} value={branch}>
              {branch}
            </option>
          ))}
          {!branches.includes(value) && value && <option value={value}>{value} (saved)</option>}
        </WorkbenchSelect>
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
        <WorkbenchSelect
          value={options.some((option) => option.name === value) ? value : ""}
          onChange={(event) => {
            const selected = options.find((option) => option.name === event.target.value);
            if (selected) onApply(kind, selected);
          }}
          className="text-sm"
        >
          <option value="">
            {discovering === kind ? `Discovering ${kind}...` : `Select ${kind.slice(0, -1)}`}
          </option>
          {options.map((option) => (
            <option key={option.id} value={option.name}>
              {option.name}
            </option>
          ))}
        </WorkbenchSelect>
      ) : (
        <WorkbenchTextInput
          value={value}
          onChange={(event) => onManualChange(event.target.value)}
          placeholder={discovering === kind ? `Discovering ${kind}...` : placeholder}
          className="text-sm"
        />
      )}
    </Field>
  );
}
