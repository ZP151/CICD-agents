import { ConversationTopBar } from "./ConversationTopBar.js";
import { ChatWorkspaceLayout } from "./ChatWorkspaceLayout.js";
import type { ChatShellProps } from "./ChatShell.types.js";

export type { ChatShellProps } from "./ChatShell.types.js";

export function ChatShell(props: ChatShellProps) {
  const {
    closeModelMenuFromChatSurface,
    activeProjectLinkId,
    bubbles,
    conversationTitle,
    customTitle,
    historyOpen,
    historyWidth,
    mini,
    renameCurrentSession,
    rightPanelOpen,
    rightWidth,
    setHistoryOpen,
    setRightPanelOpen,
    setSummaryPinnedOpen,
    setTitleEditing,
    startRightDrag,
    summaryPinnedOpen,
    titleEditing,
    titleInputRef,
  } = props;
  const summaryPinnedAvailable = Boolean(activeProjectLinkId || bubbles.length > 0);

  return (
    <div
      className={`relative flex flex-col overflow-hidden bg-zinc-950 text-zinc-100 ${mini ? "h-full rounded-xl" : "flex-1 min-w-0 h-full"}`}
      onPointerDownCapture={closeModelMenuFromChatSurface}
      onMouseDownCapture={closeModelMenuFromChatSurface}
      onClickCapture={closeModelMenuFromChatSurface}
      onFocusCapture={closeModelMenuFromChatSurface}
    >
      {!mini && rightPanelOpen && (
        <div
          aria-hidden="true"
          data-testid="right-shell-resize-handle"
          className="chat-shell-right-resize-handle right-panel-resize-handle"
          style={{ right: rightWidth - 3 }}
          onMouseDown={(event) => {
            event.preventDefault();
            startRightDrag(event.clientX);
          }}
        />
      )}
      {!mini ? (
        <ConversationTopBar
          historyOpen={historyOpen}
          historyWidth={historyWidth}
          onToggleHistory={() => setHistoryOpen((value) => !value)}
          rightPanelOpen={rightPanelOpen}
          rightWidth={rightWidth}
          onToggleRight={() => setRightPanelOpen((value) => !value)}
          summaryPinnedAvailable={summaryPinnedAvailable}
          summaryPinnedOpen={summaryPinnedOpen}
          onToggleSummaryPinned={() => setSummaryPinnedOpen((value) => !value)}
          titleEditing={titleEditing}
          customTitle={customTitle}
          conversationTitle={conversationTitle}
          titleInputRef={titleInputRef}
          onStartTitleEdit={() => { setTitleEditing(true); setTimeout(() => titleInputRef.current?.select(), 0); }}
          onConfirmTitle={(value) => { void renameCurrentSession(value); }}
          onCancelTitle={() => setTitleEditing(false)}
        />
      ) : (
        <div className="flex min-h-[36px] shrink-0 items-center border-b border-zinc-800/80 px-3">
          <span className="flex-1 truncate text-xs text-zinc-500">
            {customTitle ?? conversationTitle ?? "Chat"}
          </span>
        </div>
      )}

      <ChatWorkspaceLayout {...props} />
    </div>
  );
}
