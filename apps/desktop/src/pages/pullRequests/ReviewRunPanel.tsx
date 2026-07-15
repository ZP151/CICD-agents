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
    <div className="mt-4 space-y-3 rounded-md border border-zinc-800/70 bg-zinc-950/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">AI Insight</h4>
          {reviewTone && (
            <span className={`rounded border px-2 py-0.5 text-[10px] ${reviewTone.tone}`}>
              {reviewTone.label}
            </span>
          )}
        </div>
        <span className="text-[10px] text-zinc-700">
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
        <span className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
          context confidence {result.contextConfidence}
        </span>
      )}
      {result.decisionReasonCodes?.slice(0, 5).map((code) => (
        <span key={`decision-code-${code}`} className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
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
        <span className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
          effort {result.metadata.estimatedEffort}/5
        </span>
        <span className={`rounded border px-2 py-0.5 text-[10px] ${
          result.metadata.testsRequired
            ? "border-yellow-900/50 text-yellow-300/80"
            : "border-zinc-800 text-zinc-500"
        }`}>
          tests {result.metadata.testsRequired ? "needed" : "not flagged"}
        </span>
        <span className={`rounded border px-2 py-0.5 text-[10px] ${
          result.metadata.securityConcern
            ? "border-red-900/50 text-red-300/80"
            : "border-zinc-800 text-zinc-500"
        }`}>
          security {result.metadata.securityConcern ? "concern" : "clear"}
        </span>
        <span className={`rounded border px-2 py-0.5 text-[10px] ${
          result.metadata.canBeSplit
            ? "border-blue-900/50 text-blue-300/80"
            : "border-zinc-800 text-zinc-500"
        }`}>
          split {result.metadata.canBeSplit ? "recommended" : "not flagged"}
        </span>
      </div>
      {result.metadata.keyIssues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.metadata.keyIssues.map((issue) => (
            <span key={`issue-${issue}`} className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
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
    <div className="space-y-1 rounded-md border border-zinc-800/70 bg-zinc-950/40 p-2 text-[10px] text-zinc-500">
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
    <div className="divide-y divide-zinc-800/70 rounded-md border border-zinc-800/70">
      {result.findings!.slice(0, 5).map((finding, index) => (
        <div key={`${finding.file}-${finding.line}-${index}`} className="grid gap-1 p-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] ${
              finding.severity === "blocking"
                ? "bg-red-950/40 text-red-400"
                : finding.severity === "warning"
                  ? "bg-yellow-950/40 text-yellow-400"
                  : "bg-zinc-800 text-zinc-500"
            }`}>
              {finding.severity}
            </span>
            <span className="rounded bg-zinc-800/70 px-1.5 py-0.5 text-[10px] text-zinc-500">{finding.category}</span>
            <span className="min-w-0 truncate font-mono text-zinc-500">
              {finding.file}:{finding.line}
            </span>
          </div>
          <p className="leading-relaxed text-zinc-400">{finding.message}</p>
        </div>
      ))}
    </div>
  );
}
