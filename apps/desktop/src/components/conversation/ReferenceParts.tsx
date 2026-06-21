import type { ConversationSourcePart } from "../../chatBubbles.js";
import { conversationPartCardClass } from "./conversationPartStyles.js";
import { stripSourceLineSuffix } from "./sourceTitleUtils.js";

export type ReferencePart = ConversationSourcePart;

export function ReferenceGroup({
  sources,
  onSourceSelect,
  inline = false,
}: {
  sources: ReferencePart[];
  onSourceSelect?: (source: ConversationSourcePart) => void;
  inline?: boolean;
}) {
  const documentCount = sources.filter((source) => source.type === "source_document").length;
  const webCount = sources.length - documentCount;
  const summary = [
    documentCount ? `${documentCount} file${documentCount === 1 ? "" : "s"}` : "",
    webCount ? `${webCount} link${webCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ");
  const primarySources = sources.slice(0, 4);
  const remainingCount = Math.max(0, sources.length - primarySources.length);

  const wrapperClass = inline
    ? "my-1.5 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2 py-1.5 text-xs"
    : "rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-2 text-xs";

  return (
    <div className={wrapperClass}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2 py-1 text-[11px] font-medium text-[rgb(var(--app-text-muted))]">
          <span className="text-[rgb(var(--app-text-subtle))]">{inline ? "Refs" : "Sources"}</span>
          <span>{summary || `${sources.length} reference${sources.length === 1 ? "" : "s"}`}</span>
        </span>
        {primarySources.map((source, index) => (
          <ReferenceChip key={referenceKey(source, index)} source={source} onSourceSelect={onSourceSelect} />
        ))}
        {remainingCount > 0 && (
          <span className="rounded-md border border-[rgb(var(--app-border))] px-2 py-1 text-[11px] text-[rgb(var(--app-text-subtle))]">
            +{remainingCount}
          </span>
        )}
      </div>
    </div>
  );
}

export function SourceCard({
  label,
  title,
  detail,
  snippet,
  href,
}: {
  label: string;
  title: string;
  detail?: string;
  snippet?: string;
  href?: string;
}) {
  const content = (
    <div className={conversationPartCardClass}>
      <p className="text-[11px] font-medium text-[rgb(var(--app-text-subtle))]">{label}</p>
      <p className="mt-1 font-medium text-[rgb(var(--app-text))]">{title}</p>
      {detail && <p className="mt-0.5 break-all font-mono text-[11px] text-[rgb(var(--app-text-subtle))]">{detail}</p>}
      {snippet && <p className="mt-1 leading-relaxed text-[rgb(var(--app-text-muted))]">{snippet}</p>}
    </div>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="block transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35">
      {content}
    </a>
  ) : content;
}

export function sourceReferenceTitle(source: ReferencePart): string {
  if (source.type === "source_url") return source.url;
  return source.file || stripSourceLineSuffix(source.title);
}

function ReferenceChip({
  source,
  onSourceSelect,
}: {
  source: ReferencePart;
  onSourceSelect?: (source: ConversationSourcePart) => void;
}) {
  const title = source.type === "source_document"
    ? source.file?.split(/[\\/]/).filter(Boolean).pop() || stripSourceLineSuffix(source.title) || "Source file"
    : source.title || source.domain || "Source";
  const label = truncateMiddle(title, 34);
  const className = "inline-flex max-w-[13rem] items-center gap-1 rounded-md border border-[rgb(var(--app-border))] px-2 py-1 text-[11px] text-[rgb(var(--app-text-subtle))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text-muted))]";
  return (
    <button
      type="button"
      className={className}
      title={sourceReferenceTitle(source)}
      onClick={() => onSourceSelect?.(source)}
    >
      <span className="shrink-0">{source.type === "source_url" ? (source.domain ? "web" : "url") : "file"}</span>
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

function referenceKey(part: ReferencePart, index: number): string {
  return part.type === "source_url"
    ? `source-url-${part.sourceId}-${index}`
    : `source-doc-${part.sourceId}-${index}`;
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const head = Math.max(8, Math.floor((maxLength - 1) * 0.58));
  const tail = Math.max(6, maxLength - head - 1);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
