import type {
  Bubble,
  SavedPrInsightSource,
} from "../chat.types.js";

interface ChatAssistantMetaPanelProps {
  meta: NonNullable<Bubble["meta"]>;
  onOpenPrInsightSource?: (source: { artifactId: string }) => void;
  onOpenPrInsightWorkspace?: (source: SavedPrInsightSource) => void;
}

export function ChatAssistantMetaPanel({
  meta,
  onOpenPrInsightSource,
  onOpenPrInsightWorkspace,
}: ChatAssistantMetaPanelProps) {
  const suggestions = meta.suggestions?.filter(Boolean) ?? [];
  const insightSources = savedPrInsightSourcesFromSuggestions(suggestions);
  const runtimeSignals: string[] = [];
  if (!assistantMetaHasVisibleContent(meta)) return null;
  return (
    <div className="ml-1 mt-1.5 space-y-1.5 text-xs text-[rgb(var(--app-text-muted))]">
      {runtimeSignals.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {runtimeSignals.map((signal) => (
            <span
              key={signal}
              className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-0.5 text-[11px] text-[rgb(var(--app-text-muted))]"
            >
              {signal}
            </span>
          ))}
        </div>
      )}
      {insightSources.length > 0 && (
        <div className="space-y-1 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">Saved PR insight source</p>
          {insightSources.map((source) => (
            <div key={source.raw} className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 break-words leading-relaxed text-[rgb(var(--app-text-muted))]">
                PR #{source.pullRequestId} · {source.kind.replace(/_/g, " ")} · {source.at}
                <span className="block font-mono text-[11px] text-[rgb(var(--app-text-subtle))]">{source.artifactId}</span>
              </p>
              {onOpenPrInsightSource && (
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {onOpenPrInsightWorkspace && (
                    <button
                      type="button"
                      onClick={() => onOpenPrInsightWorkspace(source)}
                      className="rounded-md border border-[rgb(var(--app-border))] px-2 py-1 text-[11px] text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
                    >
                      Open workspace
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenPrInsightSource({ artifactId: source.artifactId })}
                    className="rounded-md border border-[rgb(var(--app-border))] px-2 py-1 text-[11px] text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
                  >
                    Open Activity
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function assistantMetaHasVisibleContent(meta: NonNullable<Bubble["meta"]>): boolean {
  const suggestions = meta.suggestions?.filter(Boolean) ?? [];
  return savedPrInsightSourcesFromSuggestions(suggestions).length > 0;
}

function savedPrInsightSourcesFromSuggestions(suggestions: string[]) {
  return suggestions
    .map((source) => {
      const match = source.match(/^Used saved PR AI insight artifact (.+) for PR #(\d+) \(([^,]+), (.+)\)\.$/);
      return match
        ? {
            raw: source,
            artifactId: match[1] ?? "",
            pullRequestId: match[2] ?? "",
            kind: match[3] ?? "",
            at: match[4] ?? "",
          }
        : null;
    })
    .filter((source): source is SavedPrInsightSource & { raw: string } => Boolean(source));
}
