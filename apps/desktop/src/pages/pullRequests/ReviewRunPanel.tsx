import { InsightRiskBadges } from "./InsightRiskBadges.js";
import { insightReadinessTone } from "./pullRequestViewModel.js";
import type { QueueState } from "./pullRequestTypes.js";
import { MarkdownContent } from "../../components/conversation/ConversationPartRenderer.js";

type ReviewRunResult = Extract<QueueState, { phase: "done" }>["result"];

export function ReviewRunPanel({
  result,
  reviewTone,
}: {
  result: ReviewRunResult;
  reviewTone: ReturnType<typeof insightReadinessTone> | null;
}): JSX.Element {
  return (
    <div className="mt-4 space-y-3 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">AI Insight</h4>
          {reviewTone && (
            <span className={`rounded border px-2 py-0.5 text-[10px] ${reviewTone.tone}`}>
              {reviewTone.label}
            </span>
          )}
        </div>
        <span className="text-[10px] text-[rgb(var(--app-text-subtle))]">
          tokens: {result.tokensIn}/{result.tokensOut}
        </span>
      </div>
      <div className="text-xs">
        <MarkdownContent markdown={result.summary || "No summary returned."} />
      </div>
      {(result.contextConfidence || (result.decisionReasonCodes?.length ?? 0) > 0) && (
        <DecisionBadges result={result} />
      )}
      {result.metadata && <ReviewMetadata result={result} />}
      {result.compression && <ReviewCompression result={result} />}
      {result.categories && (
        <InsightRiskBadges
          blocking={result.categories.blocking}
          warnings={result.categories.warnings}
          info={result.categories.info}
          infoTone="blue"
        />
      )}
      {result.findings && result.findings.length > 0 && (
        <ReviewFindingsPreview result={result} />
      )}
    </div>
  );
}

function DecisionBadges({ result }: { result: ReviewRunResult }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {result.contextConfidence && (
        <span className="rounded border border-[rgb(var(--app-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
          context confidence {result.contextConfidence}
        </span>
      )}
      {result.decisionReasonCodes?.slice(0, 5).map((code) => (
        <span key={`decision-code-${code}`} className="rounded border border-[rgb(var(--app-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
          {code.replace(/[._]/g, " ")}
        </span>
      ))}
    </div>
  );
}

function ReviewMetadata({ result }: { result: ReviewRunResult }): JSX.Element {
  if (!result.metadata) return <></>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded border border-[rgb(var(--app-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
          effort {result.metadata.estimatedEffort}/5
        </span>
        <span className={`rounded border px-2 py-0.5 text-[10px] ${
          result.metadata.testsRequired
            ? "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300"
            : "border-[rgb(var(--app-border))] text-[rgb(var(--app-text-muted))]"
        }`}>
          tests {result.metadata.testsRequired ? "needed" : "not flagged"}
        </span>
        <span className={`rounded border px-2 py-0.5 text-[10px] ${
          result.metadata.securityConcern
            ? "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300"
            : "border-[rgb(var(--app-border))] text-[rgb(var(--app-text-muted))]"
        }`}>
          security {result.metadata.securityConcern ? "concern" : "clear"}
        </span>
        <span className={`rounded border px-2 py-0.5 text-[10px] ${
          result.metadata.canBeSplit
            ? "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
            : "border-[rgb(var(--app-border))] text-[rgb(var(--app-text-muted))]"
        }`}>
          split {result.metadata.canBeSplit ? "recommended" : "not flagged"}
        </span>
      </div>
      {result.metadata.keyIssues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.metadata.keyIssues.map((issue) => (
            <span key={`issue-${issue}`} className="rounded border border-[rgb(var(--app-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
              {issue}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCompression({ result }: { result: ReviewRunResult }): JSX.Element {
  if (!result.compression) return <></>;
  return (
    <div className="space-y-1 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-2 text-[10px] text-[rgb(var(--app-text-muted))]">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          context {result.compression.compressed ? "compressed" : "complete"}
        </span>
        <span>included {result.compression.includedFiles.length}</span>
        <span>omitted {result.compression.omittedFiles.length}</span>
      </div>
      {result.compression.omittedFiles.length > 0 && (
        <p className="truncate">
          omitted: {result.compression.omittedFiles.slice(0, 5).join(", ")}
          {result.compression.omittedFiles.length > 5 ? ", ..." : ""}
        </p>
      )}
      {result.coverage && (
        <p>
          hunk coverage {result.coverage.filesWithHunks}/{result.coverage.totalFiles} files
          {" · "}
          {result.coverage.hunkCount} hunk(s), {result.coverage.changedHunkLines} changed line(s)
          {result.coverage.wholeFileOnlyFiles > 0
            ? ` · ${result.coverage.wholeFileOnlyFiles} whole-file fallback`
            : ""}
        </p>
      )}
      {result.discardedFindings && result.discardedFindings.length > 0 && (
        <p>
          discarded model comments: {result.discardedFindings.length}
        </p>
      )}
    </div>
  );
}

function ReviewFindingsPreview({ result }: { result: ReviewRunResult }): JSX.Element {
  return (
    <div className="divide-y divide-[rgb(var(--app-border))] rounded-md border border-[rgb(var(--app-border))]">
      {result.findings!.slice(0, 5).map((finding, index) => (
        <div key={`${finding.file}-${finding.line}-${index}`} className="grid gap-1 p-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${
              finding.severity === "blocking"
                ? "bg-red-500/10 text-red-700 dark:text-red-300"
                : finding.severity === "warning"
                  ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                  : "bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))]"
            }`}>
              {finding.severity}
            </span>
            <span className="rounded bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">{finding.category}</span>
            <span className="min-w-0 truncate font-mono text-[rgb(var(--app-text-muted))]">
              {finding.file}:{finding.line}
            </span>
          </div>
          <p className="leading-relaxed text-[rgb(var(--app-text-muted))]">{finding.message}</p>
        </div>
      ))}
    </div>
  );
}
