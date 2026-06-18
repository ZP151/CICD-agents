import { useCallback, useEffect, useRef, useState } from "react";
import {
  constrainHistoryPanelWidth,
  constrainRightPanelWidth,
  nextPanelVisibilityForWorkspace,
  requiredChatWindowWidth,
} from "./chatPanelLayout.js";

export function useResizableChatPanels({ mini }: { mini: boolean }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [summaryPinnedOpen, setSummaryPinnedOpen] = useState(true);
  const [historyWidth, setHistoryWidth] = useState(220);
  const [rightWidth, setRightWidth] = useState(420);
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

    const required = requiredChatWindowWidth({
      historyOpen,
      historyWidth,
      rightPanelOpen,
      rightWidth,
    });
    if (window.innerWidth >= required) return;

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { LogicalSize } = await import("@tauri-apps/api/dpi");
        const win = getCurrentWindow();
        await win.setSize(new LogicalSize(required, window.innerHeight));
      } catch (err) {
        console.warn("[auto-expand]", err);
      }
    })();
  }, [mini, historyOpen, rightPanelOpen, historyWidth, rightWidth]);

  useEffect(() => {
    if (mini) return;
    const checkFit = () => {
      const next = nextPanelVisibilityForWorkspace({
        workspaceWidth: workspaceRef.current?.clientWidth ?? 0,
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
    rightWidth,
    workspaceRef,
    startHistoryDrag,
    startRightDrag,
  };
}
