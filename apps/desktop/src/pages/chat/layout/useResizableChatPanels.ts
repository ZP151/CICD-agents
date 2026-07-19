import { useCallback, useEffect, useRef, useState } from "react";
import {
  constrainHistoryPanelWidth,
  constrainRightPanelWidth,
  effectiveRightPanelWidth,
  nextPanelVisibilityForWorkspace,
  shouldOverlayRightPanel,
} from "./chatPanelLayout.js";

export const DEFAULT_SUMMARY_PINNED_OPEN = false;

export function useResizableChatPanels({ mini }: { mini: boolean }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [summaryPinnedOpen, setSummaryPinnedOpen] = useState(DEFAULT_SUMMARY_PINNED_OPEN);
  const [historyWidth, setHistoryWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(420);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const historyDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const rightDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  const startHistoryDrag = useCallback((startX: number) => {
    historyDragRef.current = { startX, startW: historyWidth };
    const onMove = (event: MouseEvent) => {
      if (!historyDragRef.current) return;
      setHistoryWidth(constrainHistoryPanelWidth({
        startWidth: historyDragRef.current.startW,
        deltaX: event.clientX - historyDragRef.current.startX,
        workspaceWidth: workspaceRef.current?.clientWidth ?? 900,
        rightPanelOpen,
        rightWidth,
      }));
    };
    const onUp = () => {
      historyDragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [historyWidth, rightPanelOpen, rightWidth]);

  const startRightDrag = useCallback((startX: number) => {
    rightDragRef.current = { startX, startW: rightWidth };
    const onMove = (event: MouseEvent) => {
      if (!rightDragRef.current) return;
      setRightWidth(constrainRightPanelWidth({
        startWidth: rightDragRef.current.startW,
        deltaX: event.clientX - rightDragRef.current.startX,
        workspaceWidth: workspaceRef.current?.clientWidth ?? 900,
        historyOpen,
        historyWidth,
      }));
    };
    const onUp = () => {
      rightDragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [historyOpen, historyWidth, rightWidth]);

  useEffect(() => {
    if (mini) return;
    const checkFit = () => {
      const nextWorkspaceWidth = workspaceRef.current?.clientWidth ?? 0;
      setWorkspaceWidth(nextWorkspaceWidth);
      const next = nextPanelVisibilityForWorkspace({
        workspaceWidth: nextWorkspaceWidth,
        historyOpen,
        rightPanelOpen,
        historyWidth,
        rightWidth,
      });
      if (next.rightPanelOpen !== rightPanelOpen) setRightPanelOpen(next.rightPanelOpen);
      if (next.historyOpen !== historyOpen) setHistoryOpen(next.historyOpen);
    };
    if (typeof ResizeObserver === "undefined") {
      checkFit();
      return;
    }
    const observer = new ResizeObserver(checkFit);
    if (workspaceRef.current) observer.observe(workspaceRef.current);
    checkFit();
    return () => observer.disconnect();
  }, [mini, historyOpen, rightPanelOpen, historyWidth, rightWidth]);

  return {
    historyOpen,
    setHistoryOpen,
    rightPanelOpen,
    setRightPanelOpen,
    summaryPinnedOpen,
    setSummaryPinnedOpen,
    historyWidth,
    rightWidth: effectiveRightPanelWidth({ rightWidth, workspaceWidth }),
    rightPanelOverlay: shouldOverlayRightPanel(workspaceWidth),
    workspaceRef,
    startHistoryDrag,
    startRightDrag,
  };
}
