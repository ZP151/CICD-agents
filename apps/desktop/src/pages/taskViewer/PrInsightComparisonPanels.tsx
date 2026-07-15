import type { PrInsightArtifactComparison } from "../../prInsightArtifacts.js";
import type { PrInsightActivityItem, PrInsightRefreshComparison } from "./prInsightActivity.js";

function formatTime(ts?: number | null): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString();
}

function signedDelta(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`;
}

export function PrInsightComparisonCard({
  comparison,
}: {
  comparison: PrInsightArtifactComparison;
}): JSX.Element {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
        Preview vs Full Review
      </h3>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-zinc-600">Readiness</p>
          <p className="mt-1 text-zinc-800">
            {comparison.readinessChanged
              ? `${comparison.previewReadiness ?? "unknown"} -> ${comparison.reviewReadiness ?? "unknown"}`
              : (comparison.reviewReadiness ?? comparison.previewReadiness ?? "unchanged")}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-600">Token delta</p>
          <p className="mt-1 font-mono text-zinc-800">{signedDelta(comparison.tokenDelta)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-600">Finding delta</p>
          <p className="mt-1 font-mono text-zinc-800">
            {comparison.findingCountDelta === null
              ? "n/a"
              : signedDelta(comparison.findingCountDelta)}
          </p>
        </div>
      </div>
      <RiskDeltaGrid
        addedLabel="Added risks in full review"
        resolvedLabel="No longer present"
        addedRisks={comparison.addedRisks}
        resolvedRisks={comparison.resolvedRisks}
      />
    </section>
  );
}

export function PrInsightRefreshComparisonCard({
  item,
  comparison,
}: {
  item: PrInsightActivityItem;
  comparison: PrInsightRefreshComparison;
}): JSX.Element {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
          Previous {item.kind === "review_run" ? "Full Review" : "Preview"} Comparison
        </h3>
        <span className="text-[11px] text-zinc-600">
          compared with {formatTime(Date.parse(comparison.previousAt || "0") / 1000)}
        </span>
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-zinc-600">Readiness</p>
          <p className="mt-1 text-zinc-800">
            {comparison.readinessChanged
              ? `${comparison.previousReadiness ?? "unknown"} -> ${comparison.currentReadiness ?? "unknown"}`
              : (comparison.currentReadiness ?? "unchanged")}
          </p>
        </div>
        <div>
          <p className="text-xs text-zinc-600">Token delta</p>
          <p className="mt-1 font-mono text-zinc-800">{signedDelta(comparison.tokenDelta)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-600">Finding delta</p>
          <p className="mt-1 font-mono text-zinc-800">
            {comparison.findingCountDelta === null
              ? "n/a"
              : signedDelta(comparison.findingCountDelta)}
          </p>
        </div>
      </div>
      <RiskDeltaGrid
        addedLabel="New risks since previous run"
        resolvedLabel="Risks no longer present"
        addedRisks={comparison.addedRisks}
        resolvedRisks={comparison.resolvedRisks}
      />
    </section>
  );
}

function RiskDeltaGrid({
  addedLabel,
  resolvedLabel,
  addedRisks,
  resolvedRisks,
}: {
  addedLabel: string;
  resolvedLabel: string;
  addedRisks: string[];
  resolvedRisks: string[];
}): JSX.Element | null {
  if (addedRisks.length === 0 && resolvedRisks.length === 0) return null;
  return (
    <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
      <div>
        <p className="mb-1 text-zinc-600">{addedLabel}</p>
        <div className="flex flex-wrap gap-1.5">
          {addedRisks.length === 0 && <span className="text-zinc-600">None</span>}
          {addedRisks.map((risk) => (
            <span
              key={`added-${risk}`}
              className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700"
            >
              {risk}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-zinc-600">{resolvedLabel}</p>
        <div className="flex flex-wrap gap-1.5">
          {resolvedRisks.length === 0 && <span className="text-zinc-600">None</span>}
          {resolvedRisks.map((risk) => (
            <span
              key={`resolved-${risk}`}
              className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700"
            >
              {risk}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
