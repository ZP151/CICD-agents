import type { ReviewActivityItem } from "./activityTypes.js";
import {
  formatTime,
  reviewOperationKindLabel,
  reviewOperationStatusClass,
} from "./activityPresentation.js";

export function ReviewOperationDetailPanel({
  operation,
}: {
  operation: ReviewActivityItem;
}): JSX.Element {
  return (
    <div className="space-y-5">
      <header className="border-b border-zinc-200 pb-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${reviewOperationStatusClass(operation.ok)}`}
          >
            {operation.ok ? "recorded" : "attention"}
          </span>
          <span className="text-xs text-zinc-600">{reviewOperationKindLabel(operation.kind)}</span>
          <span className="text-xs text-zinc-600">
            {formatTime(Date.parse(operation.at || "0") / 1000)}
          </span>
        </div>
        <h2 className="text-lg font-semibold text-zinc-950">{operation.label}</h2>
        <p className="mt-1 font-mono text-xs text-zinc-600">{operation.id}</p>
      </header>

      <section className="grid gap-3 text-sm sm:grid-cols-2">
        <ReviewOperationFact label="Project Link" value={operation.projectLinkName} />
        <ReviewOperationFact label="Repository" value={operation.repository} mono />
        <ReviewOperationFact
          label="Pull Request"
          value={
            operation.pullRequestId > 0 ? `#${operation.pullRequestId}` : "Queue-level operation"
          }
          mono
        />
        <ReviewOperationFact label="Actor" value={operation.actor || "unknown actor"} />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-3">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
          Details
        </h3>
        <p className="break-words text-sm text-zinc-800">
          {operation.details || "No details recorded."}
        </p>
      </section>
    </div>
  );
}

function ReviewOperationFact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <p className="text-xs text-zinc-600">{label}</p>
      <p className={`mt-1 text-zinc-800 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
