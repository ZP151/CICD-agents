import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppData } from "../../App.js";
import {
  ACTIVITY_HANDOFF_KEY,
  buildActivityPrInsightHandoffDraft,
} from "../../checkpointHandoff.js";
import { useArtifactWorkspace } from "./artifacts/useArtifactWorkspace.js";
import { buildChatShellProps } from "./chatShellPropsAdapter.js";
import { useActiveProjectLinkRuntime } from "./useActiveProjectLinkRuntime.js";
import { useChatHistoryRuntime } from "./useChatHistoryRuntime.js";
import { useChatPageReadModel } from "./useChatPageReadModel.js";
import { useChatPageState } from "./useChatPageState.js";
import { useChatScrollFollow } from "./useChatScrollFollow.js";
import { useChatSuggestionRuntime } from "./useChatSuggestionRuntime.js";
import { useChatTurnRuntime } from "./useChatTurnRuntime.js";
import { useWorkspaceActionRuntime } from "./useWorkspaceActionRuntime.js";
import { HISTORY_PAGE_SIZE } from "./layout/HistorySidebar.js";
import type { ChatShellProps } from "./layout/ChatShell.js";
import { useResizableChatPanels } from "./layout/useResizableChatPanels.js";

export function useChatPageRuntime(mini: boolean): ChatShellProps {
  const navigate = useNavigate();
  const location = useLocation();
  const pageState = useChatPageState(location.search);
  const panelRuntime = useResizableChatPanels({ mini });
  const {
    projectLinks: availableProjectLinks,
    projectLinksLoading,
    createProjectLink,
    updateProjectLink,
  } = useAppData();
  const scrollRuntime = useChatScrollFollow(pageState.bubbles);

  const focusComposer = useCallback(() => {
    setTimeout(() => pageState.textareaRef.current?.focus(), 0);
  }, [pageState.textareaRef]);

  const activeProjectLinkRuntime = useActiveProjectLinkRuntime({
    availableProjectLinks,
    initialActiveProjectLinkId: pageState.initialDraft?.activeProjectLinkId,
    repoPath: pageState.repoPath,
    setRepoPath: pageState.setRepoPath,
    focusComposer,
  });

  const historyRuntime = useChatHistoryRuntime({
    mini,
    sessionId: pageState.sessionId,
    pageSize: HISTORY_PAGE_SIZE,
    onActiveSessionDeleted: pageState.newChat,
    onCurrentTitleUpdated: pageState.setCustomTitle,
    onTitleEditCancelled: () => pageState.setTitleEditing(false),
  });

  const openPrInsightSourceInActivity = useCallback((source: { artifactId: string }) => {
    sessionStorage.setItem(ACTIVITY_HANDOFF_KEY, JSON.stringify(buildActivityPrInsightHandoffDraft({
      artifactId: source.artifactId,
    })));
    navigate("/activity");
  }, [navigate]);

  const navigateToChat = useCallback(() => {
    navigate("/chat", { replace: true });
  }, [navigate]);

  const openWorkspacePanel = useCallback(() => {
    if (!mini) panelRuntime.setRightPanelOpen(true);
  }, [mini, panelRuntime.setRightPanelOpen]);

  const artifactRuntime = useArtifactWorkspace({
    activeProjectLinkId: activeProjectLinkRuntime.activeProjectLinkId,
    bubbles: pageState.bubbles,
    onOpenPanel: openWorkspacePanel,
  });

  const readModel = useChatPageReadModel({
    activeProjectLink: activeProjectLinkRuntime.activeProjectLink,
    activeProjectLinkId: activeProjectLinkRuntime.activeProjectLinkId,
    bubbles: pageState.bubbles,
    busy: pageState.busy,
    input: pageState.input,
    queuedSuggestionLabel: pageState.queuedSuggestion?.label,
    repoPath: pageState.repoPath,
    statusText: pageState.statusText,
    workflowState: pageState.workflowState,
  });

  const turnRuntime = useChatTurnRuntime({
    activeCustomModel: readModel.activeCustomModel,
    activeModel: readModel.activeModel,
    activeProjectLinkId: activeProjectLinkRuntime.activeProjectLinkId,
    activeProjectLink: activeProjectLinkRuntime.activeProjectLink,
    bubbles: pageState.bubbles,
    busy: pageState.busy,
    cancelRef: pageState.cancelRef,
    composerInputState: readModel.composerInputState,
    customTitle: pageState.customTitle,
    forceNextScrollToBottom: scrollRuntime.forceNextScrollToBottom,
    history: historyRuntime.history,
    input: pageState.input,
    locationSearch: location.search,
    markIncomingContentScrollIntent: scrollRuntime.markIncomingContentScrollIntent,
    mini,
    navigateToChat,
    newChat: pageState.newChat,
    repoPath: pageState.repoPath,
    sessionId: pageState.sessionId,
    statusText: pageState.statusText,
    textareaRef: pageState.textareaRef,
    uiStreamAvailableRef: pageState.uiStreamAvailableRef,
    workflowState: pageState.workflowState,
    setActiveProjectLinkId: activeProjectLinkRuntime.setActiveProjectLinkId,
    setBubbles: pageState.setBubbles,
    setBusy: pageState.setBusy,
    setCustomTitle: pageState.setCustomTitle,
    setHistory: historyRuntime.setHistory,
    setHistoryOpen: panelRuntime.setHistoryOpen,
    setInput: pageState.setInput,
    setRepoPath: pageState.setRepoPath,
    setSessionId: pageState.setSessionId,
    setStatusText: pageState.setStatusText,
    setTitleEditing: pageState.setTitleEditing,
    setWorkflowState: pageState.setWorkflowState,
  });

  const workspaceRuntime = useWorkspaceActionRuntime({
    activeProjectLinkId: activeProjectLinkRuntime.activeProjectLinkId,
    addBubble: turnRuntime.addBubble,
    bubbles: pageState.bubbles,
    busy: pageState.busy,
    confirmPendingAction: turnRuntime.confirmPendingAction,
    repoPath: pageState.repoPath,
    sessionId: pageState.sessionId,
    showApprovalRequest: turnRuntime.showApprovalRequest,
    statusText: pageState.statusText,
    workflowState: pageState.workflowState,
    setBubbles: pageState.setBubbles,
    setBusy: pageState.setBusy,
    setSessionId: pageState.setSessionId,
    setStatusText: pageState.setStatusText,
    setWorkflowState: pageState.setWorkflowState,
  });

  const suggestionRuntime = useChatSuggestionRuntime({
    activeProjectLinkId: activeProjectLinkRuntime.activeProjectLinkId,
    busy: pageState.busy,
    focusComposer,
    queuedSuggestion: pageState.queuedSuggestion,
    runWorkspaceAction: workspaceRuntime.runWorkspaceAction,
    setInput: pageState.setInput,
    setQueuedSuggestion: pageState.setQueuedSuggestion,
    setStatusText: pageState.setStatusText,
    updateProjectLink,
    workflowStatus: pageState.workflowState?.status,
  });

  return buildChatShellProps({
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
  });
}
