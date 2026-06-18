import type { ReactNode } from "react";
import type { ConversationArtifactPart, ConversationPart, ConversationSourcePart } from "../../chatBubbles.js";
import { ArtifactCard } from "./ArtifactCard.js";
import { CodeBlock } from "./CodeBlock.js";
import {
  approvalRiskPillClass,
  conversationPartCardClass,
  inlineStatePillClass,
  statusDotClass,
} from "./conversationPartStyles.js";
import { groupReferenceParts, partKey } from "./conversationPartGrouping.js";
import { MarkdownContentRuntime } from "./MarkdownContentRuntime.js";
import { ReferenceGroup, SourceCard, type ReferencePart } from "./ReferenceParts.js";

export { MarkdownContentRuntime as MarkdownContent } from "./MarkdownContentRuntime.js";

interface ConversationPartRendererProps {
  parts: ConversationPart[];
  streaming?: boolean;
  typingIndicator?: ReactNode;
  selectedArtifactId?: string | null;
  onArtifactSelect?: (artifact: ConversationArtifactPart) => void;
  onSourceSelect?: (source: ConversationSourcePart) => void;
}

export function ConversationPartRenderer({
  parts,
  streaming = false,
  typingIndicator,
  selectedArtifactId,
  onArtifactSelect,
  onSourceSelect,
}: ConversationPartRendererProps) {
  const visibleParts = parts.filter((part) => part.type !== "metadata");
  if (visibleParts.length === 0 && !streaming) return null;
  const renderItems = groupReferenceParts(visibleParts);

  return (
    <div className="space-y-2">
      {renderItems.map((item, index) => (
        item.type === "references"
          ? <ReferenceGroup key={`references-${index}`} sources={item.sources} onSourceSelect={onSourceSelect} />
          : (
              <ConversationPartView
                key={partKey(item.part, index)}
                part={item.part}
                streaming={streaming}
                inlineSources={item.inlineSources}
                selectedArtifactId={selectedArtifactId}
                onArtifactSelect={onArtifactSelect}
                onSourceSelect={onSourceSelect}
              />
            )
      ))}
      {streaming && typingIndicator}
    </div>
  );
}

function ConversationPartView({
  part,
  streaming,
  inlineSources,
  selectedArtifactId,
  onArtifactSelect,
  onSourceSelect,
}: {
  part: ConversationPart;
  streaming?: boolean;
  inlineSources?: ReferencePart[];
  selectedArtifactId?: string | null;
  onArtifactSelect?: (artifact: ConversationArtifactPart) => void;
  onSourceSelect?: (source: ConversationSourcePart) => void;
}) {
  switch (part.type) {
    case "text":
      return (
        <MarkdownContentRuntime
          markdown={part.text}
          streaming={streaming}
          inlineSources={inlineSources}
          onSourceSelect={onSourceSelect}
        />
      );

    case "markdown":
      return (
        <MarkdownContentRuntime
          markdown={part.markdown}
          streaming={streaming}
          inlineSources={inlineSources}
          onSourceSelect={onSourceSelect}
        />
      );

    case "code":
      return (
        <CodeBlock
          code={part.code}
          language={part.language}
          title={part.title ?? part.fileName}
        />
      );

    case "source_document":
      return (
        <SourceCard
          label="Source"
          title={part.title}
          detail={[part.file, part.line ? `line ${part.line}` : ""].filter(Boolean).join(":")}
          snippet={part.snippet}
        />
      );

    case "source_url":
      return (
        <SourceCard
          label={part.domain ?? "Web"}
          title={part.title}
          detail={part.url}
          snippet={part.snippet}
          href={part.url}
        />
      );

    case "tool_call":
      return (
        <div className={conversationPartCardClass}>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-mono text-[rgb(var(--app-accent))]">{part.toolName}</span>
            <span className={inlineStatePillClass(part.state === "error" ? "error" : part.state === "result" ? "ready" : "running")}>
              {part.state}
            </span>
          </div>
          {part.summary && <p className="mt-1 text-[rgb(var(--app-text-muted))]">{part.summary}</p>}
        </div>
      );

    case "tool_approval":
      return (
        <div className={conversationPartCardClass}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-[rgb(var(--app-text))]">Approval required</span>
            <span className={approvalRiskPillClass(part.riskLevel)}>{part.riskLevel ?? "approval"}</span>
          </div>
          <p className="mt-1.5 text-sm font-medium leading-relaxed text-[rgb(var(--app-text))]">{part.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[rgb(var(--app-text-subtle))]">
            <span className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-1.5 py-0.5 font-mono">
              {part.toolName}
            </span>
            <span>Review the scoped action before continuing.</span>
          </div>
        </div>
      );

    case "file":
      return (
        <SourceCard
          label={part.mediaType ?? "File"}
          title={part.fileName}
          detail={part.localPath ?? part.url}
          href={part.url}
        />
      );

    case "artifact":
      return (
        <ArtifactCard
          part={part}
          selected={part.artifactId === selectedArtifactId}
          onSelect={onArtifactSelect}
        />
      );

    case "process_step":
      return (
        <div className={`flex items-start gap-2 ${conversationPartCardClass}`}>
          <span className={statusDotClass(part.status)} />
          <span className="min-w-0">
            <span className="block font-medium text-[rgb(var(--app-text))]">{part.label}</span>
            {part.detail && <span className="mt-0.5 block text-[rgb(var(--app-text-muted))]">{part.detail}</span>}
          </span>
        </div>
      );

    case "suggested_reply":
      return (
        <button
          type="button"
          className="rounded-md border border-[rgb(var(--app-border))] px-2.5 py-1 text-xs text-[rgb(var(--app-text-muted))]"
          disabled
          title={part.message}
        >
          {part.label}
        </button>
      );

    case "metadata":
      return null;
  }
}
