export function InsightRiskBadges({
  blocking,
  warnings,
  info,
  infoTone = "neutral",
}: {
  blocking: string[];
  warnings: string[];
  info: string[];
  infoTone?: "neutral" | "blue";
}): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {blocking.map((risk) => (
        <span key={`blocking-${risk}`} className="rounded border border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-danger))]">
          {risk}
        </span>
      ))}
      {warnings.map((risk) => (
        <span key={`warning-${risk}`} className="rounded border border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-warning))]">
          {risk}
        </span>
      ))}
      {info.map((risk) => (
        <span key={`info-${risk}`} className={`rounded border px-2 py-0.5 text-[10px] ${
          infoTone === "blue"
            ? "border-[rgb(var(--app-accent))]/30 bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-accent-readable))]"
            : "border-[rgb(var(--app-border))] text-[rgb(var(--app-text-muted))]"
        }`}>
          {risk}
        </span>
      ))}
    </div>
  );
}
