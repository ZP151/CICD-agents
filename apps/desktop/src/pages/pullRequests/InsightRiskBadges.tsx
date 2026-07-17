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
        <span key={`blocking-${risk}`} className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-700 dark:text-red-300">
          {risk}
        </span>
      ))}
      {warnings.map((risk) => (
        <span key={`warning-${risk}`} className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-800 dark:text-amber-300">
          {risk}
        </span>
      ))}
      {info.map((risk) => (
        <span key={`info-${risk}`} className={`rounded border px-2 py-0.5 text-[10px] ${
          infoTone === "blue"
            ? "border-[rgb(var(--app-accent))]/30 bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-accent))]"
            : "border-[rgb(var(--app-border))] text-[rgb(var(--app-text-muted))]"
        }`}>
          {risk}
        </span>
      ))}
    </div>
  );
}
