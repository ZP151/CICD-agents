import type {
  ProjectLink,
  ProjectLinkInput,
} from "../../../api.js";
import { useState } from "react";
import type { ChatRenderItem } from "../../../chatRenderItems.js";
import {
  conversationPartsFromAssistantBubble,
  conversationTextFromParts,
  type ConversationArtifactPart,
  type ConversationSourcePart,
} from "../../../chatBubbles.js";
import { ConversationPartRenderer } from "../../../components/conversation/ConversationPartRenderer.js";
import { visibleConversationParts } from "../../../components/conversation/ConversationPartRenderer.js";
import { FinalEvidencePanel } from "../../../components/conversation/FinalEvidencePanel.js";
import {
  PendingActionCard,
} from "../approval/ApprovalCards.js";
import { ConfirmCard } from "../approval/ConfirmCard.js";
import type {
  Bubble,
  SavedPrInsightSource,
} from "../chat.types.js";
import { imageAttachmentLabel } from "../chatAttachments.js";
import {
  assistantMetaHasVisibleContent,
  ChatAssistantMetaPanel,
} from "./ChatAssistantMetaPanel.js";
import { ChatEmptyState } from "./ChatEmptyState.js";
import { TurnTranscriptView } from "./TurnTranscript.js";
import type { SuggestionReply } from "../../../components/conversation/SuggestionReplyBar.js";

interface ChatMessageListProps {
  bubbles: Bubble[];
  renderItems: ChatRenderItem<Bubble>[];
  busy: boolean;
  statusText: string | null;
  repoPath: string;
  availableProjectLinks: ProjectLink[];
  projectLinksLoading: boolean;
  activeProjectLinkId: string | null;
  selectedArtifactId: string | null;
  createProjectLink: (data: ProjectLinkInput) => Promise<ProjectLink>;
  selectProjectLink: (projectLink: ProjectLink) => void;
  onWelcomeSuggestion: (suggestion: SuggestionReply) => void;
  toggleTool: (id: string) => void;
  confirmPendingAction: (id: string) => void;
  cancelPendingAction: (id: string, feedback?: string) => void;
  resolveConfirm: (id: string, confirmed: boolean) => Promise<void>;
  selectArtifact: (artifact: ConversationArtifactPart) => void;
  selectSource: (source: ConversationSourcePart) => void;
  openPrInsightSourceInActivity: (source: { artifactId: string }) => void;
  openPrInsightSourceInWorkspace: (source: SavedPrInsightSource) => void;
}

export function ChatMessageList({
  bubbles,
  renderItems,
  busy,
  repoPath,
  availableProjectLinks,
  projectLinksLoading,
  activeProjectLinkId,
  selectedArtifactId,
  createProjectLink,
  selectProjectLink,
  onWelcomeSuggestion,
  toggleTool,
  confirmPendingAction,
  cancelPendingAction,
  resolveConfirm,
  selectArtifact,
  selectSource,
  openPrInsightSourceInActivity,
  openPrInsightSourceInWorkspace,
}: ChatMessageListProps) {
  const hasVisibleTranscript = renderItems.some(hasVisibleRenderItem);
  return (
    <>
      {!hasVisibleTranscript && (
        <ChatEmptyState
          repoPath={repoPath}
          availableProjectLinks={availableProjectLinks}
          projectLinksLoading={projectLinksLoading}
          activeProjectLinkId={activeProjectLinkId}
          createProjectLink={createProjectLink}
          selectProjectLink={selectProjectLink}
          onWelcomeSuggestion={onWelcomeSuggestion}
        />
      )}

      {renderItems.map((item) => (
        item.kind === "transcript"
            ? <TurnTranscriptView
                key={item.key}
                bubble={item.transcript}
                approval={item.approval}
                onConfirmApproval={confirmPendingAction}
                onCancelApproval={cancelPendingAction}
              />
          : item.kind === "tool-group"
          ? null
          : (
              <ChatBubbleRow
                key={item.bubble.id}
                bubble={item.bubble}
                selectedArtifactId={selectedArtifactId}
                confirmPendingAction={confirmPendingAction}
                cancelPendingAction={cancelPendingAction}
                resolveConfirm={resolveConfirm}
                selectArtifact={selectArtifact}
                selectSource={selectSource}
                openPrInsightSourceInActivity={openPrInsightSourceInActivity}
                openPrInsightSourceInWorkspace={openPrInsightSourceInWorkspace}
              />
            )
      ))}

    </>
  );
}

function hasVisibleRenderItem(item: ChatRenderItem<Bubble>): boolean {
  if (item.kind === "transcript") return true;
  if (item.kind === "tool-group") {
    return item.tools.length > 0 || Boolean(item.approval && isVisibleBubble(item.approval));
  }
  return isVisibleBubble(item.bubble);
}

function isVisibleBubble(bubble: Bubble): boolean {
  if (bubble.kind === "pending_confirm") {
    return bubble.pendingStatus !== "done" && bubble.pendingStatus !== "cancelled";
  }
  if (bubble.kind === "assistant") {
    const visibleParts = visibleConversationParts(conversationPartsFromAssistantBubble(bubble));
    return Boolean(
      bubble.streaming ||
        (bubble.meta && assistantMetaHasVisibleContent(bubble.meta)) ||
        visibleParts.length > 0,
    );
  }
  if (bubble.kind === "tool") {
    return true;
  }
  if (bubble.kind === "system") {
    return isVisibleSystemMessage(bubble.text);
  }
  if (bubble.kind === "user") {
    return Boolean(
      (bubble.text && bubble.text.trim()) ||
        (bubble.transientImageAttachments && bubble.transientImageAttachments.length > 0),
    );
  }
  if (bubble.kind === "error") {
    return Boolean(bubble.text && bubble.text.trim());
  }
  if (bubble.kind === "confirm") {
    return true;
  }
  return false;
}

function isVisibleSystemMessage(text: string | null | undefined): boolean {
  const trimmed = text?.trim();
  if (!trimmed) return false;
  return trimmed !== "Session restored";
}

function ChatBubbleRow({
  bubble,
  selectedArtifactId,
  confirmPendingAction,
  cancelPendingAction,
  resolveConfirm,
  selectArtifact,
  selectSource,
  openPrInsightSourceInActivity,
  openPrInsightSourceInWorkspace,
}: {
  bubble: Bubble;
  selectedArtifactId: string | null;
  confirmPendingAction: (id: string) => void;
  cancelPendingAction: (id: string, feedback?: string) => void;
  resolveConfirm: (id: string, confirmed: boolean) => Promise<void>;
  selectArtifact: (artifact: ConversationArtifactPart) => void;
  selectSource: (source: ConversationSourcePart) => void;
  openPrInsightSourceInActivity: (source: { artifactId: string }) => void;
  openPrInsightSourceInWorkspace: (source: SavedPrInsightSource) => void;
}) {
  if (bubble.kind === "user") {
    const attachments = bubble.transientImageAttachments ?? [];
    const text = attachments.length > 0 ? visibleUserTextWithoutImagePlaceholders(bubble.text ?? "") : bubble.text;
    return (
      <div className="mb-3 flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[rgb(var(--app-accent))] px-4 py-2.5 text-sm text-white shadow-md ring-1 ring-[rgb(var(--app-accent))]/25">
          {text && <p className="whitespace-pre-wrap">{text}</p>}
          {attachments.length > 0 && (
            <div className={text ? "mt-2 flex flex-wrap justify-end gap-1.5" : "flex flex-wrap justify-end gap-1.5"}>
              {attachments.map((attachment) => (
                <figure
                  key={attachment.id}
                  className="max-w-[112px] overflow-hidden rounded-md border border-white/20 bg-white/10"
                  title={imageAttachmentLabel(attachment)}
                >
                  <img
                    src={attachment.dataUrl}
                    alt={attachment.name}
                    className="h-16 w-28 object-cover"
                  />
                  <figcaption className="truncate px-1.5 py-1 text-[10px] leading-none text-white/85">
                    {attachment.name}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (bubble.kind === "assistant") {
    return (
      <div className="mb-3 flex justify-start">
        <div className="max-w-[72ch] text-sm leading-relaxed text-[rgb(var(--app-text))]">
          <ConversationPartRenderer
            parts={conversationPartsFromAssistantBubble(bubble)}
            streaming={bubble.streaming}
            selectedArtifactId={selectedArtifactId}
            onArtifactSelect={selectArtifact}
            onSourceSelect={selectSource}
          />
          {bubble.meta?.evidence && <FinalEvidencePanel evidence={bubble.meta.evidence} />}
          {bubble.meta && (
            <ChatAssistantMetaPanel
              meta={bubble.meta}
              onOpenPrInsightSource={openPrInsightSourceInActivity}
              onOpenPrInsightWorkspace={openPrInsightSourceInWorkspace}
            />
          )}
          <AssistantResponseFooter bubble={bubble} />
        </div>
      </div>
    );
  }

  if (bubble.kind === "confirm") {
    return (
      <div className="mb-3">
        <ConfirmCard
          bubble={bubble}
          onConfirm={() => void resolveConfirm(bubble.id, true)}
          onCancel={() => void resolveConfirm(bubble.id, false)}
        />
      </div>
    );
  }

  if (bubble.kind === "pending_confirm") {
    if (bubble.pendingStatus === "done" || bubble.pendingStatus === "cancelled") return null;
    return (
      <div className="mb-3">
        <PendingActionCard
          bubble={bubble}
          onConfirm={() => confirmPendingAction(bubble.id)}
          onCancel={(feedback) => cancelPendingAction(bubble.id, feedback)}
        />
      </div>
    );
  }

  if (bubble.kind === "system") {
    if (!isVisibleSystemMessage(bubble.text)) return null;
    return (
      <div className="mb-2 flex items-center justify-center gap-1">
        <span className="h-px w-8 bg-[rgb(var(--app-border))]" />
        <span className="text-xs text-[rgb(var(--app-text-subtle))]">{bubble.text}</span>
        <span className="h-px w-8 bg-[rgb(var(--app-border))]" />
      </div>
    );
  }

  if (bubble.kind === "error") {
    return (
      <div className="mb-3 rounded-xl border border-[rgb(var(--app-danger))]/30 bg-[rgb(var(--app-danger)_/_0.10)] px-3 py-2 text-sm text-[rgb(var(--app-danger))]">
        {bubble.text}
      </div>
    );
  }

  return null;
}

function AssistantResponseFooter({ bubble }: { bubble: Bubble }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const text = assistantTextForClipboard(bubble);
  const timestamp = bubble.meta?.timestamp;

  // A response footer is the terminal affordance for this assistant turn.
  // While the final is streaming it must not expose Copy or a completion time.
  if (bubble.streaming || (!text && !timestamp)) return null;

  const copy = async () => {
    if (!text) return;
    const copied = await copyText(text);
    setCopyState(copied ? "copied" : "failed");
    window.setTimeout(() => setCopyState("idle"), 1600);
  };

  return (
    <footer className="mt-2 flex items-center gap-1 text-[11px] text-[rgb(var(--app-text-subtle))]">
      {text && (
        <button
          type="button"
          onClick={() => void copy()}
          title={copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy"}
          aria-label={copyState === "copied" ? "Copied response" : copyState === "failed" ? "Copy failed" : "Copy response"}
          className={`inline-flex h-6 w-6 items-center justify-center rounded transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 ${
            copyState === "copied"
              ? "bg-[rgb(var(--app-success)_/_0.10)] text-[rgb(var(--app-success))]"
              : "hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
          }`}
        >
          {copyState === "copied" ? <CheckIcon /> : <CopyIcon />}
        </button>
      )}
      {timestamp && (
        <time dateTime={new Date(timestamp).toISOString()} className="px-1.5" title={new Date(timestamp).toLocaleString()}>
          {formatMessageTime(timestamp)}
        </time>
      )}
    </footer>
  );
}

export function assistantTextForClipboard(bubble: Bubble): string {
  return (bubble.text?.trim() || conversationTextFromParts(bubble.parts).trim());
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    return copied;
  } catch {
    return false;
  }
}

function formatMessageTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function CopyIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="1.5" />
      <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-10A1.5 1.5 0 0 0 3 5.5v10A1.5 1.5 0 0 0 4.5 17H8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="m5 12.5 4.2 4.2L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function visibleUserTextWithoutImagePlaceholders(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\[image: .+\]$/.test(line.trim()))
    .join("\n")
    .trim();
}
