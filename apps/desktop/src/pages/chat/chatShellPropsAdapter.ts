import type {
  ProjectLink,
  ProjectLinkInput,
} from "../../api.js";
import type { useArtifactWorkspace } from "./artifacts/useArtifactWorkspace.js";
import type { useActiveProjectLinkRuntime } from "./useActiveProjectLinkRuntime.js";
import type { useChatHistoryRuntime } from "./useChatHistoryRuntime.js";
import type { useChatPageReadModel } from "./useChatPageReadModel.js";
import type { useChatPageState } from "./useChatPageState.js";
import type { useChatScrollFollow } from "./useChatScrollFollow.js";
import type { useChatSuggestionRuntime } from "./useChatSuggestionRuntime.js";
import type { useChatTurnRuntime } from "./useChatTurnRuntime.js";
import type { useWorkspaceActionRuntime } from "./useWorkspaceActionRuntime.js";
import type { ChatShellProps } from "./layout/ChatShell.js";
import type { useResizableChatPanels } from "./layout/useResizableChatPanels.js";

interface BuildChatShellPropsOptions {
  activeProjectLinkRuntime: ReturnType<typeof useActiveProjectLinkRuntime>;
  artifactRuntime: ReturnType<typeof useArtifactWorkspace>;
  availableProjectLinks: ProjectLink[];
  createProjectLink: (data: ProjectLinkInput) => Promise<ProjectLink>;
  historyRuntime: ReturnType<typeof useChatHistoryRuntime>;
  mini: boolean;
  openPrInsightSourceInActivity: ChatShellProps["openPrInsightSourceInActivity"];
  pageState: ReturnType<typeof useChatPageState>;
  panelRuntime: ReturnType<typeof useResizableChatPanels>;
  readModel: ReturnType<typeof useChatPageReadModel>;
  scrollRuntime: ReturnType<typeof useChatScrollFollow>;
  suggestionRuntime: ReturnType<typeof useChatSuggestionRuntime>;
  turnRuntime: ReturnType<typeof useChatTurnRuntime>;
  workspaceRuntime: ReturnType<typeof useWorkspaceActionRuntime>;
  projectLinksLoading: boolean;
}

export function buildChatShellProps({
  activeProjectLinkRuntime,
  artifactRuntime,
  availableProjectLinks,
  createProjectLink,
  historyRuntime,
  mini,
  openPrInsightSourceInActivity,
  pageState,
  panelRuntime,
  readModel,
  scrollRuntime,
  suggestionRuntime,
  turnRuntime,
  workspaceRuntime,
  projectLinksLoading,
}: BuildChatShellPropsOptions): ChatShellProps {
  return {
    activeCustomModel: readModel.activeCustomModel,
    activeModel: readModel.activeModel,
    activeProjectLinkId: activeProjectLinkRuntime.activeProjectLinkId,
    artifactCount: artifactRuntime.artifactParts.length,
    availableProjectLinks,
    beginRenameHistory: historyRuntime.beginRenameHistory,
    bottomRef: scrollRuntime.bottomRef,
    branchList: readModel.branchList,
    bubbles: pageState.bubbles,
    busy: pageState.busy,
    cancelHistoryRename: historyRuntime.cancelHistoryRename,
    cancelPendingAction: turnRuntime.cancelPendingAction,
    cancelQueuedSuggestion: suggestionRuntime.cancelQueuedSuggestion,
    clearArtifact: artifactRuntime.clearArtifact,
    closeModelMenuFromChatSurface: readModel.closeModelMenuFromChatSurface,
    codePanelWidth: panelRuntime.rightWidth,
    commitHistoryRename: historyRuntime.commitHistoryRename,
    composerInputState: readModel.composerInputState,
    composerStateNotice: readModel.composerStateNotice,
    confirmPendingAction: turnRuntime.confirmPendingAction,
    conversationTitle: readModel.conversationTitle,
    createProjectLink,
    currentBranch: readModel.currentBranch,
    customModels: readModel.customModels,
    customTitle: pageState.customTitle,
    deleteHistoryEntry: historyRuntime.deleteHistoryEntry,
    diffStats: readModel.diffStats,
    gitStatus: readModel.gitStatus,
    handleContainerScroll: scrollRuntime.handleContainerScroll,
    handleSuggestionReply: suggestionRuntime.handleSuggestionReply,
    history: historyRuntime.history,
    historyError: historyRuntime.historyError,
    historyExpanded: historyRuntime.historyExpanded,
    historyLoading: historyRuntime.historyLoading,
    historyMenu: historyRuntime.historyMenu,
    historyOpen: panelRuntime.historyOpen,
    historyPage: historyRuntime.historyPage,
    historyWidth: panelRuntime.historyWidth,
    input: pageState.input,
    loadSession: turnRuntime.loadSession,
    mini,
    modelMenuOpen: readModel.modelMenuOpen,
    modelMenuRef: readModel.modelMenuRef,
    openPrInsightSourceInActivity,
    openPrInsightSourceInWorkspace: artifactRuntime.openPrInsightSourceInWorkspace,
    queuePrompt: suggestionRuntime.queuePrompt,
    projectLinksLoading,
    queuedSuggestionId: pageState.queuedSuggestion?.id ?? null,
    renameCurrentSession: historyRuntime.renameCurrentSession,
    renamingHistoryId: historyRuntime.renamingHistoryId,
    renamingHistoryValue: historyRuntime.renamingHistoryValue,
    renderItems: readModel.renderItems,
    repoPath: pageState.repoPath,
    resolveConfirm: turnRuntime.resolveConfirm,
    rightPanelOpen: panelRuntime.rightPanelOpen,
    rightWidth: panelRuntime.rightWidth,
    runWorkspaceAction: workspaceRuntime.runWorkspaceAction,
    scrollContainerRef: scrollRuntime.scrollContainerRef,
    selectArtifact: artifactRuntime.selectArtifact,
    selectedArtifact: artifactRuntime.selectedArtifact,
    selectedArtifactId: artifactRuntime.selectedArtifactId,
    selectedArtifactLookupState: artifactRuntime.selectedArtifactLookupState,
    selectedSource: artifactRuntime.selectedSource,
    openSources: artifactRuntime.openSources,
    closeSource: artifactRuntime.closeSource,
    clearSources: artifactRuntime.clearSources,
    selectProjectLink: activeProjectLinkRuntime.selectProjectLink,
    selectSource: artifactRuntime.selectSource,
    send: turnRuntime.send,
    sessionId: pageState.sessionId,
    setActiveModel: readModel.setActiveModel,
    setActiveProjectLinkId: activeProjectLinkRuntime.setActiveProjectLinkId,
    setHistoryExpanded: historyRuntime.setHistoryExpanded,
    setHistoryMenu: historyRuntime.setHistoryMenu,
    setHistoryOpen: panelRuntime.setHistoryOpen,
    setHistoryPage: historyRuntime.setHistoryPage,
    setInput: pageState.setInput,
    setModelMenuOpen: readModel.setModelMenuOpen,
    setRepoPath: pageState.setRepoPath,
    setRenamingHistoryValue: historyRuntime.setRenamingHistoryValue,
    setRightPanelOpen: panelRuntime.setRightPanelOpen,
    setSummaryPinnedOpen: panelRuntime.setSummaryPinnedOpen,
    setTitleEditing: pageState.setTitleEditing,
    sourceParts: artifactRuntime.sourceParts,
    startHistoryDrag: panelRuntime.startHistoryDrag,
    startRightDrag: panelRuntime.startRightDrag,
    statusText: pageState.statusText,
    stopCurrentTurn: turnRuntime.stopCurrentTurn,
    suggestionReplies: readModel.suggestionReplies,
    summaryPinnedOpen: panelRuntime.summaryPinnedOpen,
    taskState: readModel.taskState,
    textareaRef: pageState.textareaRef,
    titleEditing: pageState.titleEditing,
    titleInputRef: pageState.titleInputRef,
    toggleHistoryPin: historyRuntime.toggleHistoryPin,
    toggleTool: turnRuntime.toggleTool,
    workflowState: pageState.workflowState,
    workspaceRef: panelRuntime.workspaceRef,
  };
}
