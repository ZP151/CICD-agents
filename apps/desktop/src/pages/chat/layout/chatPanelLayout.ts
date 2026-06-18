export const CHAT_PANEL_LAYOUT = {
  leftSidebarWidth: 192,
  panelHandleWidth: 4,
  viewportBuffer: 32,
  middleMin: 320,
  historyMin: 160,
  historyMax: 400,
  rightMin: 280,
  rightMax: 780,
  handleGap: 8,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function requiredChatWindowWidth({
  historyOpen,
  historyWidth,
  rightPanelOpen,
  rightWidth,
}: {
  historyOpen: boolean;
  historyWidth: number;
  rightPanelOpen: boolean;
  rightWidth: number;
}): number {
  return (
    CHAT_PANEL_LAYOUT.leftSidebarWidth +
    (historyOpen ? historyWidth + CHAT_PANEL_LAYOUT.panelHandleWidth : 0) +
    CHAT_PANEL_LAYOUT.middleMin +
    (rightPanelOpen ? rightWidth + CHAT_PANEL_LAYOUT.panelHandleWidth : 0) +
    CHAT_PANEL_LAYOUT.viewportBuffer
  );
}

export function constrainHistoryPanelWidth({
  startWidth,
  deltaX,
  workspaceWidth,
  rightPanelOpen,
  rightWidth,
}: {
  startWidth: number;
  deltaX: number;
  workspaceWidth: number;
  rightPanelOpen: boolean;
  rightWidth: number;
}): number {
  const otherPanel = rightPanelOpen ? rightWidth : 0;
  const maxFromWorkspace = Math.max(
    CHAT_PANEL_LAYOUT.historyMin,
    workspaceWidth - otherPanel - CHAT_PANEL_LAYOUT.middleMin - CHAT_PANEL_LAYOUT.handleGap,
  );
  return clamp(
    startWidth + deltaX,
    CHAT_PANEL_LAYOUT.historyMin,
    Math.min(CHAT_PANEL_LAYOUT.historyMax, maxFromWorkspace),
  );
}

export function constrainRightPanelWidth({
  startWidth,
  deltaX,
  workspaceWidth,
  historyOpen,
  historyWidth,
}: {
  startWidth: number;
  deltaX: number;
  workspaceWidth: number;
  historyOpen: boolean;
  historyWidth: number;
}): number {
  const otherPanel = historyOpen ? historyWidth : 0;
  const maxFromWorkspace = Math.max(
    CHAT_PANEL_LAYOUT.rightMin,
    workspaceWidth - otherPanel - CHAT_PANEL_LAYOUT.middleMin - CHAT_PANEL_LAYOUT.handleGap,
  );
  return clamp(
    startWidth - deltaX,
    CHAT_PANEL_LAYOUT.rightMin,
    Math.min(CHAT_PANEL_LAYOUT.rightMax, maxFromWorkspace),
  );
}

export function nextPanelVisibilityForWorkspace({
  workspaceWidth,
  historyOpen,
  rightPanelOpen,
  historyWidth,
  rightWidth,
}: {
  workspaceWidth: number;
  historyOpen: boolean;
  rightPanelOpen: boolean;
  historyWidth: number;
  rightWidth: number;
}): { historyOpen: boolean; rightPanelOpen: boolean } {
  if (workspaceWidth <= 0) return { historyOpen, rightPanelOpen };
  return {
    rightPanelOpen: rightPanelOpen && (
      workspaceWidth - rightWidth - (historyOpen ? historyWidth : 0) >= CHAT_PANEL_LAYOUT.middleMin
    ),
    historyOpen: historyOpen && (
      workspaceWidth - historyWidth >= CHAT_PANEL_LAYOUT.middleMin
    ),
  };
}
