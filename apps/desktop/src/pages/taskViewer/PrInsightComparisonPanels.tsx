import type { PrInsightArtifactComparison } from "../../prInsightArtifacts.js";
import { formatIsoTime } from "./activityPresentation.js";
import type { PrInsightActivityItem, PrInsightRefreshComparison } from "./prInsightActivity.js";

function signedDelta(value: number): string {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function readinessLabel(value: string | null | undefined): string {
  return value || "not available";
}

export function PrInsightComparisonCard({
  comparison,
}: {
  comparison: PrInsightArtifactComparison;
}): JSX.Element {
  return (
    <section className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
        Preview vs Full Review
      </h3>
      <div className={prInsightComparisonMetricGridClass()}>
        <div>
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Readiness</p>
          <p className="mt-1 text-[rgb(var(--app-text))]">
            {comparison.readinessChanged
              ? `${readinessLabel(comparison.previewReadiness)} -> ${readinessLabel(comparison.reviewReadiness)}`
              : (comparison.reviewReadiness ?? comparison.previewReadiness ?? "unchanged")}
          </p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Token delta</p>
          <p className="mt-1 font-mono text-[rgb(var(--app-text))]">
            {signedDelta(comparison.tokenDelta)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Finding delta</p>
          <p className="mt-1 font-mono text-[rgb(var(--app-text))]">
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
    <section className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
          Previous {item.kind === "review_run" ? "Full Review" : "Preview"} Comparison
        </h3>
        <span className="text-[11px] text-[rgb(var(--app-text-muted))]">
          compared with {formatIsoTime(comparison.previousAt)}
        </span>
      </div>
      <div className={prInsightComparisonMetricGridClass()}>
        <div>
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Readiness</p>
          <p className="mt-1 text-[rgb(var(--app-text))]">
            {comparison.readinessChanged
              ? `${readinessLabel(comparison.previousReadiness)} -> ${readinessLabel(comparison.currentReadiness)}`
              : (comparison.currentReadiness ?? "unchanged")}
          </p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Token delta</p>
          <p className="mt-1 font-mono text-[rgb(var(--app-text))]">
            {signedDelta(comparison.tokenDelta)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Finding delta</p>
          <p className="mt-1 font-mono text-[rgb(var(--app-text))]">
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
    <div className={prInsightRiskDeltaGridClass()}>
      <div>
        <p className="mb-1 text-[rgb(var(--app-text-muted))]">{addedLabel}</p>
        <div className="flex flex-wrap gap-1.5">
          {addedRisks.length === 0 && (
            <span className="text-[rgb(var(--app-text-muted))]">None</span>
          )}
          {addedRisks.map((risk) => (
            <span
              key={`added-${risk}`}
              className="rounded border border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] px-2 py-1 text-[rgb(var(--app-warning))]"
            >
              {risk}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[rgb(var(--app-text-muted))]">{resolvedLabel}</p>
        <div className="flex flex-wrap gap-1.5">
          {resolvedRisks.length === 0 && (
            <span className="text-[rgb(var(--app-text-muted))]">None</span>
          )}
          {resolvedRisks.map((risk) => (
            <span
              key={`resolved-${risk}`}
              className="rounded border border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-success-soft))] px-2 py-1 text-[rgb(var(--app-success))]"
            >
              {risk}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function prInsightComparisonMetricGridClass(): string {
  return "grid gap-3 text-sm grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))]";
}

export function prInsightRiskDeltaGridClass(): string {
  return "mt-3 grid gap-3 text-xs grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]";
}
