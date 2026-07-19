import { useCallback, useState } from "react";
import type { ConversationArtifactPart } from "../../../chatBubbles.js";
import { ConversationPartRenderer } from "../../../components/conversation/ConversationPartRenderer.js";
import type { ArtifactLookupState } from "../chat.types.js";
import {
  artifactDownloadFileName,
  artifactDownloadMimeType,
  artifactWorkspacePlaceholder,
} from "./artifactWorkspaceHelpers.js";
import { MermaidArtifactPreview } from "./MermaidArtifactPreview.js";
import { prInsightArtifactRecordToMarkdown } from "./prInsightArtifacts.js";

export function ArtifactWorkspaceContent({
  artifact,
  lookupState,
}: {
  artifact: ConversationArtifactPart;
  lookupState: ArtifactLookupState | null;
}) {
  const persistedContent = lookupState?.status === "loaded"
    ? prInsightArtifactRecordToMarkdown(lookupState.record)
    : "";
  const content = artifact.content?.trim();
  const renderContent = content || persistedContent.trim();
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const downloadFileName = artifactDownloadFileName(artifact);
  const copyContent = useCallback(() => {
    if (!renderContent) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(renderContent).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      });
      return;
    }
    setCopied(true);
    if (typeof window !== "undefined") window.setTimeout(() => setCopied(false), 1800);
  }, [renderContent]);
  const downloadContent = useCallback(() => {
    if (!renderContent || typeof document === "undefined" || typeof URL === "undefined") return;
    const url = URL.createObjectURL(new Blob([renderContent], { type: artifactDownloadMimeType(artifact.artifactType) }));
    const link = document.createElement("a");
    link.href = url;
    link.download = downloadFileName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloaded(true);
    window.setTimeout(() => setDownloaded(false), 1800);
  }, [artifact.artifactType, downloadFileName, renderContent]);

  if (!artifact.content?.trim() && lookupState?.status === "loading") {
    return (
      <div className="mt-3 rounded-md border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2" aria-live="polite">
        <p className="text-xs font-medium text-[rgb(var(--app-text-muted))]">
          Loading saved PR insight artifact...
        </p>
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 w-4/5 rounded-full bg-[rgb(var(--app-border))]" />
          <div className="h-1.5 w-2/3 rounded-full bg-[rgb(var(--app-border))]" />
        </div>
      </div>
    );
  }

  if (!artifact.content?.trim() && lookupState?.status === "error") {
    return (
      <div className="mt-3 rounded-md border border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] px-3 py-2" aria-live="polite">
        <p className="text-xs font-medium text-[rgb(var(--app-danger))]">Saved artifact unavailable</p>
        <p className="mt-1 break-words text-[11px] leading-relaxed text-[rgb(var(--app-text-muted))]">
          {lookupState.message}
        </p>
      </div>
    );
  }

  if (!renderContent) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
        <p className="text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
          {artifactWorkspacePlaceholder(artifact.artifactType, artifact.status)}
        </p>
      </div>
    );
  }

  if (artifact.artifactType === "markdown") {
    return (
      <div className="mt-3 overflow-hidden rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]">
        <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
          <span className="text-[11px] font-medium text-[rgb(var(--app-text-subtle))]">Markdown report</span>
          <ArtifactActionStrip copied={copied} downloaded={downloaded} onCopy={copyContent} onDownload={downloadContent} />
        </div>
        <div className="p-3">
          <ConversationPartRenderer parts={[{ type: "markdown", markdown: renderContent }]} />
        </div>
      </div>
    );
  }

  if (artifact.artifactType === "mermaid") {
    return (
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2">
          <p className="text-[11px] text-[rgb(var(--app-text-muted))]">
            Mermaid diagram source and optional preview. Rendering loads the diagram engine on demand.
          </p>
          <ArtifactActionStrip copied={copied} downloaded={downloaded} onCopy={copyContent} onDownload={downloadContent} />
        </div>
        <MermaidArtifactPreview source={renderContent} />
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-bg-muted))] px-3 py-2 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
          {renderContent}
        </pre>
      </div>
    );
  }

  if (artifact.artifactType === "text") {
    return (
      <div className="mt-3 overflow-hidden rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]">
        <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
          <span className="text-[11px] font-medium text-[rgb(var(--app-text-subtle))]">Text artifact</span>
          <ArtifactActionStrip copied={copied} downloaded={downloaded} onCopy={copyContent} onDownload={downloadContent} />
        </div>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-3 py-2 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
          {renderContent}
        </pre>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-[rgb(var(--app-text-subtle))]">Saved source</span>
        <ArtifactActionStrip copied={copied} downloaded={downloaded} onCopy={copyContent} onDownload={downloadContent} />
      </div>
      <p className="text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
        Preview content is saved, but isolated HTML/React rendering is not enabled in this workspace yet.
      </p>
      <p className="mt-1 font-mono text-[11px] text-[rgb(var(--app-text-subtle))]">
        {renderContent.length.toLocaleString()} characters available
      </p>
    </div>
  );
}

function ArtifactActionStrip({
  copied,
  downloaded,
  onCopy,
  onDownload,
}: {
  copied: boolean;
  downloaded: boolean;
  onCopy: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-1">
      <ArtifactActionButton onClick={onCopy} active={copied}>
        {copied ? "Copied" : "Copy content"}
      </ArtifactActionButton>
      <ArtifactActionButton onClick={onDownload} active={downloaded}>
        {downloaded ? "Download started" : "Download"}
      </ArtifactActionButton>
    </div>
  );
}

function ArtifactActionButton({
  children,
  onClick,
  active = false,
}: {
  children: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px ${
        active
          ? "border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-success-soft))] text-[rgb(var(--app-success))]"
          : "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-bg-muted))] hover:text-[rgb(var(--app-text))]"
      }`}
    >
      {children}
    </button>
  );
}
