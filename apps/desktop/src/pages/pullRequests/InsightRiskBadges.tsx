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
        <span key={`blocking-${risk}`} className="rounded border border-red-900/50 px-2 py-0.5 text-[10px] text-red-300/80">
          {risk}
        </span>
      ))}
      {warnings.map((risk) => (
        <span key={`warning-${risk}`} className="rounded border border-yellow-900/50 px-2 py-0.5 text-[10px] text-yellow-300/80">
          {risk}
        </span>
      ))}
      {info.map((risk) => (
        <span key={`info-${risk}`} className={`rounded border px-2 py-0.5 text-[10px] ${
          infoTone === "blue"
            ? "border-blue-900/50 text-blue-300/70"
            : "border-[rgb(var(--app-border))] text-[rgb(var(--app-text-muted))]"
        }`}>
          {risk}
        </span>
      ))}
    </div>
  );
}
