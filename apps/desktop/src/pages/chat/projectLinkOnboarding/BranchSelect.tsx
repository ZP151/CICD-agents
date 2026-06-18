interface BranchSelectProps {
  branches: string[];
  branchLoading: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function BranchSelect({
  branches,
  branchLoading,
  label,
  value,
  onChange,
}: BranchSelectProps) {
  if (branchLoading) {
    return (
      <div className="grid min-w-0 gap-1">
        <span className="text-[11px] font-medium text-[rgb(var(--app-text-muted))]">{label}</span>
        <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-sm text-[rgb(var(--app-text-muted))]">
          <svg className="h-3 w-3 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="30 70" />
          </svg>
          Detecting branches...
        </div>
      </div>
    );
  }

  if (branches.length > 0) {
    return (
      <label className="grid min-w-0 gap-1">
        <span className="text-[11px] font-medium text-[rgb(var(--app-text-muted))]">{label}</span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 rounded-lg border border-emerald-700/60 bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-sm text-[rgb(var(--app-text))] outline-none transition focus:border-emerald-500"
        >
          {branches.map((branch) => (
            <option key={branch} value={branch}>{branch}</option>
          ))}
          {!branches.includes(value) && value && <option value={value}>{value} (custom)</option>}
        </select>
      </label>
    );
  }

  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-[11px] font-medium text-[rgb(var(--app-text-muted))]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full min-w-0 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-sm text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
        placeholder="main"
      />
    </label>
  );
}
