import type { PrInsightArtifactComparison } from "../../prInsightArtifacts.js";
import {
  PrInsightComparisonCard,
  PrInsightRefreshComparisonCard,
} from "./PrInsightComparisonPanels.js";
import { PrInsightReadinessBlockers } from "./PrInsightReadinessBlockers.js";
import type { PrInsightActivityItem, PrInsightRefreshComparison } from "./prInsightActivity.js";
import { MarkdownContent } from "../../components/conversation/ConversationPartRenderer.js";
import { formatIsoTime } from "./activityPresentation.js";

interface PrInsightDetailPanelProps {
  item: PrInsightActivityItem;
  comparison: PrInsightArtifactComparison | null;
  refreshComparison: PrInsightRefreshComparison | null;
  copiedArtifactId: string | null;
  onCopyArtifactId: (item: PrInsightActivityItem) => void;
  onOpenInChat: (item: PrInsightActivityItem) => void;
  onOpenInPullRequests: (item: PrInsightActivityItem) => void;
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
      <header className="border-b border-[rgb(var(--app-border))] pb-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[rgb(var(--app-accent-soft))] px-2 py-0.5 text-xs font-medium text-[rgb(var(--app-accent))] ring-1 ring-[rgb(var(--app-accent))]/30">
            {item.kind === "review_run" ? "full review" : "preview"}
          </span>
          {item.readiness && (
            <span className="text-xs text-[rgb(var(--app-text-muted))]">{item.readiness}</span>
          )}
          <span className="text-xs text-[rgb(var(--app-text-muted))]">
            {formatIsoTime(item.at)}
          </span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[rgb(var(--app-text))]">
              #{item.pullRequestId} · {item.title || "(untitled)"}
            </h2>
            <p className="mt-1 font-mono text-xs text-[rgb(var(--app-text-muted))]">{item.id}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onOpenInPullRequests(item)}
              className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-1.5 text-xs text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))]"
            >
              Open in Pull Requests
            </button>
            <button
              onClick={() => onOpenInChat(item)}
              className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-1.5 text-xs text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))]"
            >
              Ask in Chat
            </button>
          </div>
        </div>
      </header>

      <section className="rounded-lg border border-[rgb(var(--app-accent))]/20 bg-[rgb(var(--app-accent-soft))]/60 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-accent))]">
            Provenance
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onCopyArtifactId(item)}
              className="rounded-md border border-[rgb(var(--app-accent))]/30 bg-[rgb(var(--app-surface))] px-2 py-1 text-xs text-[rgb(var(--app-accent))] transition hover:border-[rgb(var(--app-accent))]"
            >
              {copiedArtifactId === item.id ? "Copied" : "Copy artifact id"}
            </button>
          </div>
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <p className="break-words font-mono text-[rgb(var(--app-text-subtle))] sm:col-span-2">
            {item.id}
          </p>
          <p className="text-[rgb(var(--app-text-muted))]">
            Saved at: <span className="text-[rgb(var(--app-text))]">{item.at}</span>
          </p>
          <p className="text-[rgb(var(--app-text-muted))]">
            Source:{" "}
            <span className="text-[rgb(var(--app-text))]">
              PR #{item.pullRequestId} · {item.kind}
            </span>
          </p>
        </div>
      </section>

      <section className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Project Link</p>
          <p className="mt-1 text-[rgb(var(--app-text))]">{item.projectLinkName}</p>
        </div>
        <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Repository</p>
          <p className="mt-1 font-mono text-[rgb(var(--app-text))]">{item.repository}</p>
        </div>
        <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Tokens</p>
          <p className="mt-1 font-mono text-[rgb(var(--app-text))]">
            {item.tokensIn}/{item.tokensOut}
          </p>
        </div>
        <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
          <p className="text-xs text-[rgb(var(--app-text-muted))]">Decision</p>
          <p className="mt-1 text-[rgb(var(--app-text))]">
            {[item.decisionQueue, item.decisionRiskLevel, item.contextConfidence]
              .filter(Boolean)
              .join(" · ") || "n/a"}
          </p>
        </div>
        {(item.iterationId || item.sourceCommit) && (
          <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 sm:col-span-2">
            <p className="text-xs text-[rgb(var(--app-text-muted))]">Analysis baseline</p>
            <p className="mt-1 break-words font-mono text-[rgb(var(--app-text))]">
              {item.iterationId ? `iteration ${item.iterationId}` : "iteration n/a"}
              {item.sourceCommit ? ` · ${item.sourceCommit}` : ""}
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
          Saved Summary
        </h3>
        <div className="text-sm leading-relaxed text-[rgb(var(--app-text))]">
          <MarkdownContent markdown={item.summary || "No summary saved."} />
        </div>
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
    <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
      <p className="text-xs text-[rgb(var(--app-text-muted))]">{label}</p>
      <p className="mt-1 font-mono text-[rgb(var(--app-text))]">{value}</p>
    </div>
  );
}

function PrInsightRisks({ item }: { item: PrInsightActivityItem }): JSX.Element | null {
  if (item.risks.length === 0) return null;
  return (
    <section className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
        Risks
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {item.risks.map((risk) => (
          <span
            key={risk}
            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-300"
          >
            {risk}
          </span>
        ))}
      </div>
    </section>
  );
}
