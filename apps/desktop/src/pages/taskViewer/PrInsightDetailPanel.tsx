import type { PrInsightArtifactComparison } from "../../prInsightArtifacts.js";
import {
  PrInsightComparisonCard,
  PrInsightRefreshComparisonCard,
} from "./PrInsightComparisonPanels.js";
import { PrInsightReadinessBlockers } from "./PrInsightReadinessBlockers.js";
import type { PrInsightActivityItem, PrInsightRefreshComparison } from "./prInsightActivity.js";
import { MarkdownContent } from "../../components/conversation/ConversationPartRenderer.js";
import { ActionButton } from "../../components/workbench/WorkbenchPrimitives.js";
import { formatIsoTime } from "./activityPresentation.js";
import { ActivityDetailSection, ActivityFact, ActivityFactGrid } from "./ActivityDetailPrimitives.js";

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
          <span className="rounded-full bg-[rgb(var(--app-accent-soft))] px-2 py-0.5 text-xs font-medium text-[rgb(var(--app-accent-readable))] ring-1 ring-[rgb(var(--app-accent))]/30">
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
            <ActionButton
              onClick={() => onOpenInPullRequests(item)}
            >
              Open in Pull Requests
            </ActionButton>
            <ActionButton
              onClick={() => onOpenInChat(item)}
            >
              Ask in Chat
            </ActionButton>
          </div>
        </div>
      </header>

      <ActivityDetailSection
        title="Provenance"
        actions={(
          <ActionButton
            onClick={() => onCopyArtifactId(item)}
            className="min-h-7 px-2"
          >
              {copiedArtifactId === item.id ? "Copied" : "Copy artifact id"}
          </ActionButton>
        )}
      >
        <div className={prInsightProvenanceGridClass()}>
          <p className="col-span-full break-words font-mono text-[rgb(var(--app-text-subtle))]">
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
      </ActivityDetailSection>

      <ActivityFactGrid className={prInsightMetadataGridClass()}>
        <ActivityFact label="Project Link">{item.projectLinkName}</ActivityFact>
        <ActivityFact label="Repository" mono>{item.repository}</ActivityFact>
        <ActivityFact label="Tokens" mono>{item.tokensIn}/{item.tokensOut}</ActivityFact>
        <ActivityFact label="Decision">
          {[item.decisionQueue, item.decisionRiskLevel, item.contextConfidence]
            .filter(Boolean)
            .join(" · ") || "n/a"}
        </ActivityFact>
        {(item.iterationId || item.sourceCommit) && (
          <ActivityFact className="col-span-full" label="Analysis baseline" mono>
            {item.iterationId ? `iteration ${item.iterationId}` : "iteration n/a"}
            {item.sourceCommit ? ` · ${item.sourceCommit}` : ""}
          </ActivityFact>
        )}
      </ActivityFactGrid>

      <ActivityDetailSection title="Saved summary">
        <div className="text-sm leading-relaxed text-[rgb(var(--app-text))]">
          <MarkdownContent markdown={item.summary || "No summary saved."} />
        </div>
      </ActivityDetailSection>

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
    <ActivityFactGrid className={prInsightSignalGridClass()}>
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
    </ActivityFactGrid>
  );
}

export function prInsightSignalGridClass(): string {
  return "gap-3 text-sm grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))]";
}

export function prInsightProvenanceGridClass(): string {
  return "gap-2 text-xs grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))]";
}

export function prInsightMetadataGridClass(): string {
  return "gap-3 text-sm grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))]";
}

function SignalMetric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <ActivityFact label={label} mono>{value}</ActivityFact>
  );
}

function PrInsightRisks({ item }: { item: PrInsightActivityItem }): JSX.Element | null {
  if (item.risks.length === 0) return null;
  return (
    <ActivityDetailSection title="Risks">
      <div className="flex flex-wrap gap-1.5">
        {item.risks.map((risk) => (
          <span
            key={risk}
            className="rounded-md border border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] px-2 py-1 text-xs text-[rgb(var(--app-warning))]"
          >
            {risk}
          </span>
        ))}
      </div>
    </ActivityDetailSection>
  );
}
