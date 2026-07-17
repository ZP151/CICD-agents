import { CodeSidePanel } from "../artifacts/SourceWorkspace.js";
import { ChatMessageList } from "./ChatMessageList.js";
import { ComposerShell } from "./ComposerShell.js";
import {
  HistorySidebar,
} from "./HistorySidebar.js";
import { PinnedSummaryPanel } from "./PinnedSummaryPanel.js";
import type { ChatShellProps } from "./ChatShell.types.js";

export function ChatWorkspaceLayout({
  activeCustomModel,
  activeModel,
  activeProjectLinkId,
  artifactCount,
  availableProjectLinks,
  beginRenameHistory,
  bottomRef,
  branchList,
  bubbles,
  busy,
  cancelHistoryRename,
  cancelPendingAction,
  cancelQueuedSuggestion,
  clearArtifact,
  codePanelWidth,
  commitHistoryRename,
  composerInputState,
  composerStateNotice,
  confirmPendingAction,
  createProjectLink,
  currentBranch,
  customModels,
  deleteHistoryEntry,
  diffStats,
  gitStatus,
  handleContainerScroll,
  handleSuggestionReply,
  history,
  historyError,
  historyExpanded,
  historyLoading,
  historyMenu,
  historyOpen,
  historyPage,
  historyWidth,
  input,
  loadSession,
  mini,
  modelMenuOpen,
  modelMenuRef,
  openPrInsightSourceInActivity,
  openPrInsightSourceInWorkspace,
  openSources,
  projectLinksLoading,
  queuePrompt,
  queuedSuggestionId,
  renamingHistoryId,
  renamingHistoryValue,
  renderItems,
  repoPath,
  resolveConfirm,
  rightPanelOpen,
  rightWidth,
  runWorkspaceAction,
  scrollContainerRef,
  selectArtifact,
  selectedArtifact,
  selectedArtifactId,
  selectedArtifactLookupState,
  selectedSource,
  closeSource,
  clearSources,
  selectProjectLink,
  selectSource,
  send,
  sessionId,
  setActiveModel,
  setActiveProjectLinkId,
  setHistoryExpanded,
  setHistoryMenu,
  setHistoryPage,
  setInput,
  setModelMenuOpen,
  setRepoPath,
  setRenamingHistoryValue,
  startHistoryDrag,
  statusText,
  stopCurrentTurn,
  suggestionReplies,
  summaryPinnedOpen,
  taskState,
  textareaRef,
  toggleHistoryPin,
  toggleTool,
  workflowState,
  workspaceRef,
}: ChatShellProps) {
  const summaryPinnedAvailable = Boolean(activeProjectLinkId || bubbles.length > 0);
  const summaryVisible = summaryPinnedAvailable && summaryPinnedOpen;

  return (
    <div ref={workspaceRef} className={mini ? "flex flex-1 flex-col overflow-hidden" : "chat-workspace"}>
      {!mini && (
        <>
          <HistorySidebar
            open={historyOpen}
            width={historyWidth}
            history={history}
            activeSessionId={sessionId}
            historyError={historyError}
            expanded={historyExpanded}
            loading={historyLoading}
            page={historyPage}
            menu={historyMenu}
            renamingHistoryId={renamingHistoryId}
            renamingHistoryValue={renamingHistoryValue}
            onPageChange={setHistoryPage}
            onExpandedChange={setHistoryExpanded}
            onMenuChange={setHistoryMenu}
            onRenameValueChange={setRenamingHistoryValue}
            onCancelRename={cancelHistoryRename}
            onLoadSession={(targetSessionId) => void loadSession(targetSessionId)}
            onTogglePin={(entry) => void toggleHistoryPin(entry)}
            onBeginRename={beginRenameHistory}
            onCommitRename={(entry, value) => void commitHistoryRename(entry, value)}
            onDeleteEntry={(entry) => { void deleteHistoryEntry(entry); }}
          />
          {historyOpen && (
            <div
              className="panel-resize-handle"
              onMouseDown={(event) => { event.preventDefault(); startHistoryDrag(event.clientX); }}
            />
          )}
        </>
      )}

      <div className={mini ? "flex flex-1 flex-col overflow-hidden" : "middle-panel"}>
        <div className={mini ? "flex flex-1 flex-col overflow-hidden" : "middle-panel-inner"}>
          <div
            ref={scrollContainerRef}
            data-testid="chat-message-panel"
            onScroll={handleContainerScroll}
            className="message-panel flex flex-col px-4 py-4"
          >
            <ChatMessageList
              bubbles={bubbles}
              renderItems={renderItems}
              busy={busy}
              statusText={statusText}
              repoPath={repoPath}
              availableProjectLinks={availableProjectLinks}
              projectLinksLoading={projectLinksLoading}
              activeProjectLinkId={activeProjectLinkId}
              selectedArtifactId={selectedArtifactId}
              createProjectLink={createProjectLink}
              selectProjectLink={(projectLink) => selectProjectLink(projectLink.id)}
              toggleTool={toggleTool}
              confirmPendingAction={confirmPendingAction}
              cancelPendingAction={cancelPendingAction}
              resolveConfirm={resolveConfirm}
              selectArtifact={selectArtifact}
              selectSource={selectSource}
              openPrInsightSourceInActivity={openPrInsightSourceInActivity}
              openPrInsightSourceInWorkspace={openPrInsightSourceInWorkspace}
            />
            <div ref={bottomRef} />
          </div>

          <ComposerShell
            mini={mini}
            input={input}
            textareaRef={textareaRef}
            modelMenuRef={modelMenuRef}
            modelMenuOpen={modelMenuOpen}
            activeModel={activeModel}
            activeCustomModel={activeCustomModel}
            customModels={customModels}
            availableProjectLinks={availableProjectLinks}
            projectLinksLoading={projectLinksLoading}
            activeProjectLinkId={activeProjectLinkId}
            composerStateNotice={composerStateNotice}
            composerInputState={composerInputState}
            suggestionReplies={suggestionReplies}
            busy={busy}
            workflowState={workflowState}
            queuedSuggestionId={queuedSuggestionId}
            onInputChange={setInput}
            onSend={send}
            onStop={stopCurrentTurn}
            onCancelQueuedSuggestion={cancelQueuedSuggestion}
            onSuggestionPick={handleSuggestionReply}
            onProjectLinkSelect={selectProjectLink}
            onModelMenuOpenChange={setModelMenuOpen}
            onActiveModelChange={setActiveModel}
          />
        </div>
      </div>

      {!mini && summaryVisible && (
        <PinnedSummaryPanel
          repoPath={repoPath}
          setRepoPath={setRepoPath}
          currentBranch={currentBranch}
          branchList={branchList}
          gitStatus={gitStatus}
          diffStats={diffStats}
          taskState={taskState}
          workflowState={workflowState}
          busy={busy}
          projectLinks={availableProjectLinks}
          activeProjectLinkId={activeProjectLinkId}
          setActiveProjectLinkId={setActiveProjectLinkId}
          codePanelOpen={rightPanelOpen}
          codePanelWidth={codePanelWidth}
          onAction={runWorkspaceAction}
        />
      )}

      {!mini && (
        <>
          <aside
            className="right-panel"
            style={{
              width: rightPanelOpen ? rightWidth : 0,
              opacity: rightPanelOpen ? 1 : 0,
              pointerEvents: rightPanelOpen ? "auto" : "none",
            }}
          >
            <CodeSidePanel
              repoPath={repoPath}
              source={selectedSource}
              sources={openSources}
              artifact={selectedArtifact}
              artifactLookupState={selectedArtifactLookupState}
              artifactCount={artifactCount}
              onSourceSelect={selectSource}
              onSourceClose={closeSource}
              onClearSources={clearSources}
              onClearArtifact={clearArtifact}
            />
          </aside>
        </>
      )}
    </div>
  );
}
