import type {
  ProjectLink,
  ProjectLinkInput,
} from "../../../api.js";
import type { ChatRenderItem } from "../../../chatRenderItems.js";
import {
  conversationPartsFromAssistantBubble,
  type ConversationArtifactPart,
  type ConversationSourcePart,
} from "../../../chatBubbles.js";
import { ConversationPartRenderer } from "../../../components/conversation/ConversationPartRenderer.js";
import {
  ExecutionLog,
  PendingActionCard,
} from "../approval/ApprovalCards.js";
import { ConfirmCard } from "../approval/ConfirmCard.js";
import type {
  Bubble,
  SavedPrInsightSource,
} from "../chat.types.js";
import { imageAttachmentLabel } from "../chatAttachments.js";
import { ChatAssistantMetaPanel } from "./ChatAssistantMetaPanel.js";
import { ChatEmptyState } from "./ChatEmptyState.js";

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
  repoPath,
  availableProjectLinks,
  projectLinksLoading,
  activeProjectLinkId,
  selectedArtifactId,
  createProjectLink,
  selectProjectLink,
  toggleTool,
  confirmPendingAction,
  cancelPendingAction,
  resolveConfirm,
  selectArtifact,
  selectSource,
  openPrInsightSourceInActivity,
  openPrInsightSourceInWorkspace,
}: ChatMessageListProps) {
  return (
    <>
      {bubbles.length === 0 && (
        <ChatEmptyState
          repoPath={repoPath}
          availableProjectLinks={availableProjectLinks}
          projectLinksLoading={projectLinksLoading}
          activeProjectLinkId={activeProjectLinkId}
          createProjectLink={createProjectLink}
          selectProjectLink={selectProjectLink}
        />
      )}

      {renderItems.map((item) => (
        item.kind === "tool-group"
          ? (
              <div key={item.key} className="mb-3">
                <ExecutionLog
                  tools={item.tools}
                  approval={item.approval}
                  onToggleTool={toggleTool}
                  onConfirmApproval={confirmPendingAction}
                  onCancelApproval={cancelPendingAction}
                />
              </div>
            )
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
          {bubble.meta && (
            <ChatAssistantMetaPanel
              meta={bubble.meta}
              onOpenPrInsightSource={openPrInsightSourceInActivity}
              onOpenPrInsightWorkspace={openPrInsightSourceInWorkspace}
            />
          )}
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
      <div className="mb-3 rounded-xl border border-red-800/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
        {bubble.text}
      </div>
    );
  }

  return null;
}

function visibleUserTextWithoutImagePlaceholders(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\[image: .+\]$/.test(line.trim()))
    .join("\n")
    .trim();
}
