import type { PrInsightArtifactComparison } from "../../prInsightArtifacts.js";
import {
  PrInsightComparisonCard,
  PrInsightRefreshComparisonCard,
} from "./PrInsightComparisonPanels.js";
import { PrInsightReadinessBlockers } from "./PrInsightReadinessBlockers.js";
import type { PrInsightActivityItem, PrInsightRefreshComparison } from "./prInsightActivity.js";

interface PrInsightDetailPanelProps {
  item: PrInsightActivityItem;
  comparison: PrInsightArtifactComparison | null;
  refreshComparison: PrInsightRefreshComparison | null;
  copiedArtifactId: string | null;
  onCopyArtifactId: (item: PrInsightActivityItem) => void;
  onOpenInChat: (item: PrInsightActivityItem) => void;
  onOpenInPullRequests: (item: PrInsightActivityItem) => void;
}

function formatTime(ts?: number | null): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString();
}

export function PrInsightDetailPanel({
  item,
  comparison,
  refreshComparison,
  copiedArtifactId,
  onCopyArtifactId,
  onOpenInChat,
  onOpenInPullRequests,
}: PrInsightDetailPanelProps): JSX.Element {
  return (
    <div className="space-y-5">
      <header className="border-b border-zinc-800/70 pb-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-300 ring-1 ring-blue-500/20">
            {item.kind === "review_run" ? "full review" : "preview"}
          </span>
          {item.readiness && <span className="text-xs text-zinc-600">{item.readiness}</span>}
          <span className="text-xs text-zinc-600">
            {formatTime(Date.parse(item.at || "0") / 1000)}
          </span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-zinc-100">
              #{item.pullRequestId} · {item.title || "(untitled)"}
            </h2>
            <p className="mt-1 font-mono text-xs text-zinc-600">{item.id}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onOpenInPullRequests(item)}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800"
            >
              Open in Pull Requests
            </button>
            <button
              onClick={() => onOpenInChat(item)}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800"
            >
              Ask in Chat
            </button>
          </div>
        </div>
      </header>

      <section className="rounded-lg border border-blue-950/60 bg-blue-950/10 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-400/70">
            Provenance
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onCopyArtifactId(item)}
              className="rounded-md border border-blue-900/60 px-2 py-1 text-xs text-blue-300/80 transition hover:border-blue-700 hover:text-blue-200"
            >
              {copiedArtifactId === item.id ? "Copied" : "Copy artifact id"}
            </button>
            <button
              onClick={() => onOpenInPullRequests(item)}
              className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
            >
              Pull Requests
            </button>
            <button
              onClick={() => onOpenInChat(item)}
              className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
            >
              Chat
            </button>
          </div>
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <p className="break-words font-mono text-zinc-500 sm:col-span-2">{item.id}</p>
          <p className="text-zinc-600">
            Saved at: <span className="text-zinc-400">{item.at}</span>
          </p>
          <p className="text-zinc-600">
            Source:{" "}
            <span className="text-zinc-400">
              PR #{item.pullRequestId} · {item.kind}
            </span>
          </p>
        </div>
      </section>

      <section className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
          <p className="text-xs text-zinc-600">Project Link</p>
          <p className="mt-1 text-zinc-300">{item.projectLinkName}</p>
        </div>
        <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
          <p className="text-xs text-zinc-600">Repository</p>
          <p className="mt-1 font-mono text-zinc-300">{item.repository}</p>
        </div>
        <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
          <p className="text-xs text-zinc-600">Tokens</p>
          <p className="mt-1 font-mono text-zinc-300">
            {item.tokensIn}/{item.tokensOut}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
          <p className="text-xs text-zinc-600">Decision</p>
          <p className="mt-1 text-zinc-300">
            {[item.decisionQueue, item.decisionRiskLevel, item.contextConfidence]
              .filter(Boolean)
              .join(" · ") || "n/a"}
          </p>
        </div>
        {(item.iterationId || item.sourceCommit) && (
          <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3 sm:col-span-2">
            <p className="text-xs text-zinc-600">Analysis baseline</p>
            <p className="mt-1 break-words font-mono text-zinc-300">
              {item.iterationId ? `iteration ${item.iterationId}` : "iteration n/a"}
              {item.sourceCommit ? ` · ${item.sourceCommit}` : ""}
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
          Saved Summary
        </h3>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
          {item.summary || "No summary saved."}
        </p>
      </section>

      {comparison && <PrInsightComparisonCard comparison={comparison} />}
      {refreshComparison && (
        <PrInsightRefreshComparisonCard item={item} comparison={refreshComparison} />
      )}
      <PrInsightSignalGrid item={item} />
      <PrInsightReadinessBlockers item={item} />
      <PrInsightRisks item={item} />
    </div>
  );
}

function PrInsightSignalGrid({ item }: { item: PrInsightActivityItem }): JSX.Element | null {
  if (!item.signals && typeof item.findingCount !== "number") return null;
  return (
    <section className="grid gap-3 text-sm sm:grid-cols-4 lg:grid-cols-6">
      {item.signals && (
        <>
          <SignalMetric label="Files" value={item.signals.fileCount} />
          <SignalMetric label="Threads" value={item.signals.threadCount} />
          <SignalMetric label="Failed builds" value={item.signals.failedBuildCount} />
          <SignalMetric label="Failed policies" value={item.signals.failedPolicyCount ?? 0} />
          <SignalMetric label="Work items" value={item.signals.workItemCount} />
        </>
      )}
      {typeof item.findingCount === "number" && (
        <SignalMetric label="Findings" value={item.findingCount} />
      )}
    </section>
  );
}

function SignalMetric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
      <p className="text-xs text-zinc-600">{label}</p>
      <p className="mt-1 font-mono text-zinc-300">{value}</p>
    </div>
  );
}

function PrInsightRisks({ item }: { item: PrInsightActivityItem }): JSX.Element | null {
  if (item.risks.length === 0) return null;
  return (
    <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">Risks</h3>
      <div className="flex flex-wrap gap-1.5">
        {item.risks.map((risk) => (
          <span
            key={risk}
            className="rounded-md border border-yellow-900/50 px-2 py-1 text-xs text-yellow-300/80"
          >
            {risk}
          </span>
        ))}
      </div>
    </section>
  );
}
