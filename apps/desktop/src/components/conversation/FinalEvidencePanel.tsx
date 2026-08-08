import { useState } from "react";

export interface FinalEvidenceEntry {
  tool: string;
  ok: boolean;
  summary: string;
  callId?: string;
}

/**
 * MP-003: the final conclusion carries bounded evidence references instead of
 * replayed tool output. Collapsed, this panel shows which tools grounded the
 * answer; expanding reveals the bounded summaries. Full output stays in the
 * Working transcript owned by the same callId.
 */
export function FinalEvidencePanel({ evidence }: { evidence?: FinalEvidenceEntry[] }): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  if (!evidence || evidence.length === 0) return null;

  const ids = evidence.map((entry) => entry.tool).join(", ");
  return (
    <section aria-label="Evidence references" className="mt-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
          Evidence · {evidence.length}
        </span>
        <span className="truncate font-mono text-[10px] text-[rgb(var(--app-text-subtle))]">{ids}</span>
      </button>
      {expanded && (
        <ul className="mt-2 space-y-1.5 border-t border-[rgb(var(--app-border))] pt-2">
          {evidence.map((entry, index) => (
            <li key={`${entry.callId ?? entry.tool}-${index}`} className="text-xs leading-5">
              <span className="font-mono text-[11px] text-[rgb(var(--app-accent-readable))]">
                {entry.tool}
              </span>
              <span className="ml-1.5 text-[rgb(var(--app-text-muted))]">{entry.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
