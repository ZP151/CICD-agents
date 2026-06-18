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
import type { WorkspaceAction } from "../workflowTaskState.js";
import { ChatAssistantMetaPanel } from "./ChatAssistantMetaPanel.js";
import { ChatEmptyState } from "./ChatEmptyState.js";
import { ChatThinkingDots } from "./ChatThinkingDots.js";

interface ChatMessageListProps {
  bubbles: Bubble[];
  renderItems: ChatRenderItem<Bubble>[];
  busy: boolean;
  statusText: string | null;
  repoPath: string;
  availableProjectLinks: ProjectLink[];
  activeProjectLinkId: string | null;
  selectedArtifactId: string | null;
  welcomeSuggestions: string[];
  createProjectLink: (data: ProjectLinkInput) => Promise<ProjectLink>;
  selectProjectLink: (projectLink: ProjectLink) => void;
  queuePrompt: (prompt: string) => void;
  runWorkspaceAction: (action: WorkspaceAction) => void;
  toggleTool: (id: string) => void;
  confirmPendingAction: (id: string) => void;
  cancelPendingAction: (id: string) => void;
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
  statusText,
  repoPath,
  availableProjectLinks,
  activeProjectLinkId,
  selectedArtifactId,
  welcomeSuggestions,
  createProjectLink,
  selectProjectLink,
  queuePrompt,
  runWorkspaceAction,
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
          activeProjectLinkId={activeProjectLinkId}
          welcomeSuggestions={welcomeSuggestions}
          createProjectLink={createProjectLink}
          selectProjectLink={selectProjectLink}
          runWorkspaceAction={runWorkspaceAction}
          queuePrompt={queuePrompt}
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

      {busy && statusText && !bubbles.some((bubble) => bubble.kind === "assistant" && bubble.streaming) && (
        <div className="mb-2 flex items-center gap-2 pl-1">
          <div className="rounded-2xl rounded-tl-sm border border-[rgb(var(--app-border))]/70 bg-[rgb(var(--app-surface-raised))] px-4 py-2.5 text-sm text-[rgb(var(--app-text-muted))]">
            {statusText}
            <ChatThinkingDots />
          </div>
        </div>
      )}
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
  cancelPendingAction: (id: string) => void;
  resolveConfirm: (id: string, confirmed: boolean) => Promise<void>;
  selectArtifact: (artifact: ConversationArtifactPart) => void;
  selectSource: (source: ConversationSourcePart) => void;
  openPrInsightSourceInActivity: (source: { artifactId: string }) => void;
  openPrInsightSourceInWorkspace: (source: SavedPrInsightSource) => void;
}) {
  if (bubble.kind === "user") {
    return (
      <div className="mb-3 flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[rgb(var(--app-accent))] px-4 py-2.5 text-sm text-white shadow-md ring-1 ring-[rgb(var(--app-accent))]/25">
          {bubble.text}
        </div>
      </div>
    );
  }

  if (bubble.kind === "assistant") {
    return (
      <div className="mb-3 flex justify-start">
        <div className="max-w-[85%]">
          <div className="rounded-2xl rounded-tl-sm border border-[rgb(var(--app-border))]/70 bg-[rgb(var(--app-surface))] px-4 py-2.5 text-sm text-[rgb(var(--app-text))] shadow-sm">
            <ConversationPartRenderer
              parts={conversationPartsFromAssistantBubble(bubble)}
              streaming={bubble.streaming}
              typingIndicator={<ChatThinkingDots />}
              selectedArtifactId={selectedArtifactId}
              onArtifactSelect={selectArtifact}
              onSourceSelect={selectSource}
            />
          </div>
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
    return (
      <div className="mb-3">
        <PendingActionCard
          bubble={bubble}
          onConfirm={() => confirmPendingAction(bubble.id)}
          onCancel={() => cancelPendingAction(bubble.id)}
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
