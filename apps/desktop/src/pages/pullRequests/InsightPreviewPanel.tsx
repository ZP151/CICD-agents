import { MarkdownContent } from "../../components/conversation/ConversationPartRenderer.js";
import { insightReadinessTone } from "./pullRequestViewModel.js";
import type { PreviewState } from "./pullRequestTypes.js";
import { InsightRiskBadges } from "./InsightRiskBadges.js";

export function InsightPreviewPanel({
  previewState,
  insightTone,
}: {
  previewState: Extract<PreviewState, { phase: "done" }>;
  insightTone: ReturnType<typeof insightReadinessTone> | null;
}): JSX.Element {
  return (
    <div className="mt-4 space-y-3 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-xs font-semibold text-[rgb(var(--app-text-muted))]">Insight Preview</h4>
          {insightTone && (
            <span className={`rounded border px-2 py-0.5 text-[10px] ${insightTone.tone}`}>
              {insightTone.label}
            </span>
          )}
        </div>
        <span className="text-[10px] text-[rgb(var(--app-text-subtle))]">
          {previewState.result.source} · files {previewState.result.signals.fileCount} · threads {previewState.result.signals.threadCount}
        </span>
      </div>
      <div className="text-xs">
        <MarkdownContent markdown={previewState.result.summary || "No summary returned."} />
      </div>
      <InsightRiskBadges
        blocking={previewState.result.categories?.blocking ?? []}
        warnings={previewState.result.categories?.warnings ?? previewState.result.risks}
        info={previewState.result.categories?.info ?? []}
      />
    </div>
  );
}
