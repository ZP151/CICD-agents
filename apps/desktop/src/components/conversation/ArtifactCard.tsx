import type { ConversationArtifactPart } from "../../chatBubbles.js";
import { inlineStatePillClass } from "./conversationPartStyles.js";

export function ArtifactCard({
  part,
  selected = false,
  onSelect,
}: {
  part: ConversationArtifactPart;
  selected?: boolean;
  onSelect?: (artifact: ConversationArtifactPart) => void;
}) {
  const kind = artifactKindLabel(part.artifactType);
  const status = artifactStatusLabel(part.status);
  const summary = artifactSummary(part.artifactType, part.status);
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">
            <span className={artifactStatusDotClass(part.status)} />
            Result artifact
          </p>
          <p className="mt-1 truncate font-medium text-[rgb(var(--app-text))]" title={part.title}>
            {part.title}
          </p>
          <p className="mt-1 leading-relaxed text-[rgb(var(--app-text-muted))]">
            {summary}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">
            {kind}
          </span>
          <span className={artifactStatusClass(part.status)}>{status}</span>
        </div>
      </div>
      <div className="mt-2 border-t border-[rgb(var(--app-border))] pt-2 text-[11px] text-[rgb(var(--app-text-subtle))]">
        {onSelect
          ? "Open in the Result workspace to inspect, copy, or download the full content."
          : "Available as a Result workspace artifact when this conversation is interactive."}
      </div>
    </>
  );

  const cardClass = [
    "rounded-md border bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-left text-xs transition",
    selected ? "border-[rgb(var(--app-accent))] bg-[rgb(var(--app-accent-soft))] ring-1 ring-[rgb(var(--app-border-strong))]" : "border-[rgb(var(--app-border))]",
  ].join(" ");

  if (onSelect) {
    return (
      <button
        type="button"
        className={`${cardClass} block w-full hover:border-[rgb(var(--app-accent))] hover:bg-[rgb(var(--app-surface))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px`}
        data-artifact-id={part.artifactId}
        aria-pressed={selected}
        aria-label={`Open artifact workspace for ${part.title}`}
        onClick={() => onSelect(part)}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={cardClass} data-artifact-id={part.artifactId}>
      {content}
    </div>
  );
}

function artifactKindLabel(type: ConversationArtifactPart["artifactType"]): string {
  const labels: Record<ConversationArtifactPart["artifactType"], string> = {
    html: "Preview",
    markdown: "Report",
    mermaid: "Diagram",
    react: "Preview",
    text: "Text",
  };
  return labels[type];
}

function artifactStatusLabel(status: ConversationArtifactPart["status"]): string {
  const labels: Record<ConversationArtifactPart["status"], string> = {
    error: "Error",
    ready: "Ready",
    streaming: "Streaming",
  };
  return labels[status];
}

function artifactSummary(
  type: ConversationArtifactPart["artifactType"],
  status: ConversationArtifactPart["status"],
): string {
  if (status === "streaming") return "The agent is still building this result. The card stays compact while content streams.";
  if (status === "error") return "The result failed to finish. The artifact stays visible so the next action has context.";

  const summaries: Record<ConversationArtifactPart["artifactType"], string> = {
    html: "A rendered preview result is available in the Result workspace.",
    markdown: "A structured markdown report is available in the Result workspace.",
    mermaid: "A diagram result is available in the Result workspace.",
    react: "An interactive preview result is available in the Result workspace.",
    text: "A text result is available in the Result workspace.",
  };
  return summaries[type];
}

function artifactStatusClass(status: ConversationArtifactPart["status"]): string {
  const classes: Record<ConversationArtifactPart["status"], string> = {
    error: inlineStatePillClass("error"),
    ready: inlineStatePillClass("ready"),
    streaming: inlineStatePillClass("running"),
  };
  return classes[status];
}

function artifactStatusDotClass(status: ConversationArtifactPart["status"]): string {
  const color = status === "error" ? "bg-[rgb(var(--app-danger))]" : status === "ready" ? "bg-[rgb(var(--app-success))]" : "bg-[rgb(var(--app-accent))]";
  const motion = status === "streaming" ? " animate-pulse" : "";
  return `h-1.5 w-1.5 rounded-full ${color}${motion}`;
}
