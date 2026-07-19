export const CHAT_PANEL_LAYOUT = {
  middleMin: 320,
  historyMin: 160,
  historyMax: 400,
  rightMin: 280,
  rightMax: 780,
  rightOverlayBreakpoint: 1040,
  rightOverlayMin: 240,
  rightOverlayMax: 560,
  rightOverlayWidthRatio: 0.88,
  handleGap: 8,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

export function shouldOverlayRightPanel(workspaceWidth: number): boolean {
  return workspaceWidth > 0 && workspaceWidth < CHAT_PANEL_LAYOUT.rightOverlayBreakpoint;
}

export function effectiveRightPanelWidth({
  rightWidth,
  workspaceWidth,
}: {
  rightWidth: number;
  workspaceWidth: number;
}): number {
  if (!shouldOverlayRightPanel(workspaceWidth)) return rightWidth;

  const overlayMax = Math.max(
    CHAT_PANEL_LAYOUT.rightOverlayMin,
    Math.min(
      CHAT_PANEL_LAYOUT.rightMax,
      CHAT_PANEL_LAYOUT.rightOverlayMax,
      Math.floor(workspaceWidth * CHAT_PANEL_LAYOUT.rightOverlayWidthRatio),
    ),
  );
  return clamp(rightWidth, Math.min(CHAT_PANEL_LAYOUT.rightMin, overlayMax), overlayMax);
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
  const rightPanelConsumesLayout = rightPanelOpen && !shouldOverlayRightPanel(workspaceWidth);
  return {
    rightPanelOpen: rightPanelOpen && (
      shouldOverlayRightPanel(workspaceWidth) ||
      workspaceWidth - rightWidth - (historyOpen ? historyWidth : 0) >= CHAT_PANEL_LAYOUT.middleMin
    ),
    historyOpen: historyOpen && (
      workspaceWidth - historyWidth - (rightPanelConsumesLayout ? rightWidth : 0) >= CHAT_PANEL_LAYOUT.middleMin
    ),
  };
}
