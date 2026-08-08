import {
  prInsightArtifactProjectLinkId,
  type PrInsightArtifact,
} from "../../prInsightArtifacts.js";
import { PullRequestContextPanel } from "./PullRequestContextPanel.js";
import {
  ActionButton,
  InlineNotice,
  StatusBadge,
} from "../../components/workbench/WorkbenchPrimitives.js";
import {
  formatDate,
  insightReadinessTone,
  readiness,
} from "./pullRequestViewModel.js";
import type {
  ContextState,
  DisplayPullRequest,
  PreviewState,
} from "./pullRequestTypes.js";

export interface PullRequestCardProps {
  pr: DisplayPullRequest;
  projectLinkId: string;
  previewState: PreviewState;
  insightArtifacts: PrInsightArtifact[];
  contextState: ContextState | undefined;
  isExpanded: boolean;
  highlighted: boolean;
  onToggleContext: (pr: DisplayPullRequest) => void;
  onPreviewInsight: (pr: DisplayPullRequest) => void;
  onOpenInsight: (pr: DisplayPullRequest) => void;
  onOpenSavedInsightInChat: (pr: DisplayPullRequest, artifact: PrInsightArtifact) => void;
}

export function PullRequestCard({
  pr,
  projectLinkId,
  previewState,
  insightArtifacts,
  contextState,
  isExpanded,
  highlighted,
  onToggleContext,
  onPreviewInsight,
  onOpenInsight,
}: PullRequestCardProps): JSX.Element {
  const state = readiness(pr);
  const insightTone = previewState.phase === "done"
    ? insightReadinessTone(previewState.result.readiness)
    : null;
  const storedInsightHistory = insightArtifacts.filter((artifact) => (
    artifact.repository === pr.repository &&
    artifact.pullRequestId === pr.id &&
    (!pr.sourceProjectLinkId || prInsightArtifactProjectLinkId(artifact) === pr.sourceProjectLinkId)
  ));
  const storedInsight = storedInsightHistory[0] ?? null;
  const storedInsightTone = storedInsight?.readiness
    ? insightReadinessTone(storedInsight.readiness)
    : null;
  const authorLabel = pr.createdBy || "Not available";
  const createdLabel = formatDate(pr.creationDate) || "Not available";
  const reviewerLabel = `${pr.voteSummary.approved} approved / ${pr.reviewerCount} total`;

  const hasInsight = Boolean(storedInsight || previewState.phase === "done");
  const latestInsightSummary = previewState.phase === "done"
    ? previewState.result.summary || "Insight preview generated."
    : storedInsight?.summary || "Saved insight available.";
  const latestInsightPreview = pullRequestInsightPreviewText(latestInsightSummary);

  return (
    <article
      className={`border-b border-[rgb(var(--app-border))] px-4 py-4 transition-colors last:border-b-0 ${
        highlighted
          ? "bg-[rgb(var(--app-accent-soft))]"
          : "bg-[rgb(var(--app-surface))] hover:bg-[rgb(var(--app-surface-raised))]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-[rgb(var(--app-accent-readable))]">#{pr.id}</span>
            <StatusBadge className={state.tone}>
              {state.label}
            </StatusBadge>
            <StatusBadge>{pr.status}</StatusBadge>
            {!projectLinkId && pr.sourceProjectLinkName && (
              <StatusBadge>
                {pr.sourceProjectLinkName}
              </StatusBadge>
            )}
          </div>
          <h3 className="truncate text-sm font-semibold text-[rgb(var(--app-text))]">{pr.title || "(untitled)"}</h3>
          <p className="mt-1 truncate font-mono text-xs text-[rgb(var(--app-text-subtle))]">
            {pr.sourceBranch} {"->"} {pr.targetBranch}
          </p>
        </div>
        <div className={pullRequestActionsClass()}>
          <div className={pullRequestActionRowClass()}>
            <ActionButton
              type="button"
              tone="quiet"
              onClick={() => onToggleContext(pr)}
              className="min-h-7 px-2.5 py-1"
            >
              {isExpanded ? "Hide details" : contextState?.phase === "loaded" ? "Show details" : "Load details"}
            </ActionButton>
            <ActionButton
              type="button"
              tone="quiet"
              onClick={() => {
                onOpenInsight(pr);
                onPreviewInsight(pr);
              }}
              loading={previewState.phase === "loading"}
              className="min-h-7 px-2.5 py-1"
            >
              {previewState.phase === "loading" ? "Generating..." : hasInsight ? "Open insight" : "Generate insight"}
            </ActionButton>
            {pr.url && (
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md px-2.5 py-1.5 text-xs text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-control-hover))] hover:text-[rgb(var(--app-text))]"
              >
                Open in ADO
              </a>
            )}
          </div>
        </div>
      </div>

      <div
        className={pullRequestMetaGridClass()}
        title={`Author: ${authorLabel}; Created: ${createdLabel}; Reviewers: ${reviewerLabel}`}
      >
        <span>
          <span className="text-[rgb(var(--app-text-subtle))]">Author:</span>{" "}
          <span className="text-[rgb(var(--app-text))]">{authorLabel}</span>
        </span>
        <span>
          <span className="text-[rgb(var(--app-text-subtle))]">Created:</span>{" "}
          <span className="text-[rgb(var(--app-text))]">{createdLabel}</span>
        </span>
        <span>
          <span className="text-[rgb(var(--app-text-subtle))]">Reviewers:</span>{" "}
          <span className="text-[rgb(var(--app-text))]">{reviewerLabel}</span>
        </span>
      </div>

      {hasInsight && (
        <button
          type="button"
          onClick={() => onOpenInsight(pr)}
          className="mt-3 block w-full rounded-lg bg-[rgb(var(--app-surface-raised))] px-3 py-2.5 text-left transition hover:bg-[rgb(var(--app-control-hover))]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[rgb(var(--app-text-muted))]">Latest insight</p>
            {(insightTone || storedInsightTone) && (
              <StatusBadge className={(insightTone ?? storedInsightTone)!.tone}>
                {(insightTone ?? storedInsightTone)!.label}
              </StatusBadge>
            )}
          </div>
          <p className={pullRequestInsightPreviewClass()}>
            {latestInsightPreview}
          </p>
        </button>
      )}

      {previewState.phase === "error" && (
        <div className="mt-3"><InlineNotice tone="danger" title="Insight generation failed">{previewState.message}</InlineNotice></div>
      )}
      {isExpanded && <PullRequestContextPanel state={contextState} />}
    </article>
  );
}

export function pullRequestActionsClass(): string {
  return "flex w-full max-w-full flex-col items-start gap-1.5 md:min-w-[220px] md:flex-1 md:items-end";
}

export function pullRequestActionRowClass(): string {
  return "flex w-full min-w-0 flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end";
}

export function pullRequestMetaGridClass(): string {
  return "mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[rgb(var(--app-text-muted))]";
}

export function pullRequestInsightPreviewClass(): string {
  return "mt-1 max-w-[72ch] truncate text-xs leading-relaxed text-[rgb(var(--app-text-muted))]";
}

export function pullRequestInsightPreviewText(markdown: string): string {
  const fallback = "Open the latest insight details.";
  const meaningfulLine = markdown
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#"))
    .map((line) => stripMarkdownLine(line))
    .find((line) => (
      line.length > 0 &&
      !line.endsWith(":") &&
      !/^PR Insight Summary\b/i.test(line)
    ));
  const text = (meaningfulLine || fallback).replace(/\s+/g, " ").trim();
  if (text.length <= 180) return text;
  return `${text.slice(0, 177).trimEnd()}...`;
}

function stripMarkdownLine(line: string): string {
  return line
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/[*_`~]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();
}
