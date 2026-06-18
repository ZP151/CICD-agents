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
  const insightSources = suggestions
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
  const sourceMessages = new Set(insightSources.map((source) => source.raw));
  const contextMessages = new Set(suggestions.filter((source) => source.startsWith("Repository context: ")));
  const otherSuggestions = suggestions.filter((source) => !sourceMessages.has(source) && !contextMessages.has(source));
  const runtimeSignals: string[] = [];
  if (suggestions.length === 0 && runtimeSignals.length === 0) return null;
  return (
    <div className="ml-1 mt-1.5 space-y-1.5 text-xs text-zinc-500">
      {runtimeSignals.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {runtimeSignals.map((signal) => (
            <span key={signal} className="rounded-md border border-zinc-800/60 bg-zinc-900/20 px-2 py-0.5 text-[11px] text-zinc-500">
              {signal}
            </span>
          ))}
        </div>
      )}
      {insightSources.length > 0 && (
        <div className="space-y-1 rounded-md border border-blue-950/60 bg-blue-950/10 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-400/70">Saved PR insight source</p>
          {insightSources.map((source) => (
            <div key={source.raw} className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 break-words leading-relaxed text-zinc-500">
                PR #{source.pullRequestId} · {source.kind.replace(/_/g, " ")} · {source.at}
                <span className="block font-mono text-[11px] text-zinc-600">{source.artifactId}</span>
              </p>
              {onOpenPrInsightSource && (
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {onOpenPrInsightWorkspace && (
                    <button
                      type="button"
                      onClick={() => onOpenPrInsightWorkspace(source)}
                      className="rounded-md border border-blue-900/60 px-2 py-1 text-[11px] text-blue-300/80 transition hover:border-blue-700 hover:text-blue-200"
                    >
                      Open workspace
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenPrInsightSource({ artifactId: source.artifactId })}
                    className="rounded-md border border-blue-900/60 px-2 py-1 text-[11px] text-blue-300/80 transition hover:border-blue-700 hover:text-blue-200"
                  >
                    Open Activity
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {otherSuggestions.length > 0 && (
        <ul className="space-y-0.5">
          {otherSuggestions.map((suggestion, index) => (
            <li key={index} className="flex gap-1"><span className="text-zinc-600">›</span>{suggestion}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
