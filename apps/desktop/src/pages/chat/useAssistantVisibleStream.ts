import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { smoothStreamingTextTakeLength } from "../../smoothStreamingText.js";
import { reduceChatBubbles } from "./chatBubbleReducer.js";
import { uid } from "./chatStreamDispatcher.js";
import type { Bubble } from "./chat.types.js";

interface AssistantDisplayStreamState {
  textPartId: string | null;
  pendingText: string;
  active: boolean;
  draining: boolean;
  lastFrameAt: number | null;
}

interface UseAssistantVisibleStreamArgs {
  markIncomingContentScrollIntent: () => void;
  setBubbles: Dispatch<SetStateAction<Bubble[]>>;
}

export interface AssistantVisibleStreamActions {
  appendAssistantDelta: (delta: string, textPartId?: string) => void;
  startAssistantTextPart: (textPartId: string) => void;
  stopStreaming: (textPartId?: string) => void;
}

export function useAssistantVisibleStream({
  markIncomingContentScrollIntent,
  setBubbles,
}: UseAssistantVisibleStreamArgs): AssistantVisibleStreamActions {
  const assistantDisplayStreamRef = useRef<AssistantDisplayStreamState>({
    textPartId: null,
    pendingText: "",
    active: false,
    draining: false,
    lastFrameAt: null,
  });
  const assistantDisplayFrameRef = useRef<number | null>(null);

  const appendVisibleAssistantDelta = useCallback((delta: string) => {
    if (!delta) return;
    markIncomingContentScrollIntent();
    setBubbles((prev) => reduceChatBubbles(prev, { type: "append_visible_assistant_delta", delta }, uid));
  }, [markIncomingContentScrollIntent, setBubbles]);

  const runAssistantDisplayFrame = useCallback((now: number) => {
    assistantDisplayFrameRef.current = null;
    const state = assistantDisplayStreamRef.current;
    const pendingLength = state.pendingText.length;
    if (pendingLength <= 0) {
      state.lastFrameAt = null;
      state.draining = false;
      return;
    }

    const elapsedMs = state.lastFrameAt === null ? 16.7 : now - state.lastFrameAt;
    state.lastFrameAt = now;
    const takeLength = smoothStreamingTextTakeLength(pendingLength, elapsedMs, state.draining);
    const visibleText = state.pendingText.slice(0, takeLength);
    state.pendingText = state.pendingText.slice(takeLength);
    appendVisibleAssistantDelta(visibleText);

    if (state.pendingText.length > 0) {
      assistantDisplayFrameRef.current = window.requestAnimationFrame(runAssistantDisplayFrame);
    } else {
      state.lastFrameAt = null;
      state.draining = false;
    }
  }, [appendVisibleAssistantDelta]);

  const ensureAssistantDisplayLoop = useCallback(() => {
    if (assistantDisplayFrameRef.current !== null) return;
    if (!assistantDisplayStreamRef.current.pendingText) return;
    assistantDisplayFrameRef.current = window.requestAnimationFrame(runAssistantDisplayFrame);
  }, [runAssistantDisplayFrame]);

  const cancelAssistantDisplayFrame = useCallback(() => {
    if (assistantDisplayFrameRef.current === null) return;
    window.cancelAnimationFrame(assistantDisplayFrameRef.current);
    assistantDisplayFrameRef.current = null;
  }, []);

  const drainAssistantDisplayNow = useCallback((textPartId?: string) => {
    const state = assistantDisplayStreamRef.current;
    if (textPartId && state.textPartId && state.textPartId !== textPartId) return;
    cancelAssistantDisplayFrame();
    if (state.pendingText) {
      const pendingText = state.pendingText;
      state.pendingText = "";
      appendVisibleAssistantDelta(pendingText);
    }
    state.lastFrameAt = null;
    state.draining = false;
  }, [appendVisibleAssistantDelta, cancelAssistantDisplayFrame]);

  const startAssistantTextPart = useCallback((textPartId: string) => {
    const state = assistantDisplayStreamRef.current;
    if (state.pendingText && state.textPartId && state.textPartId !== textPartId) {
      drainAssistantDisplayNow(state.textPartId);
    }
    state.textPartId = textPartId;
    state.active = true;
    state.draining = false;
  }, [drainAssistantDisplayNow]);

  const stopStreaming = useCallback((textPartId?: string) => {
    const state = assistantDisplayStreamRef.current;
    if (textPartId && state.textPartId && state.textPartId !== textPartId) return;
    state.active = false;
    state.draining = true;
    drainAssistantDisplayNow(textPartId);
    state.textPartId = null;
    setBubbles((prev) => reduceChatBubbles(prev, { type: "stop_streaming" }, uid));
  }, [drainAssistantDisplayNow, setBubbles]);

  const appendAssistantDelta = useCallback((delta: string, textPartId?: string) => {
    if (!delta) return;
    const state = assistantDisplayStreamRef.current;
    if (state.pendingText && textPartId && state.textPartId && state.textPartId !== textPartId) {
      drainAssistantDisplayNow(state.textPartId);
    }
    state.textPartId = textPartId ?? state.textPartId;
    state.pendingText = `${state.pendingText}${delta}`;
    state.active = true;
    state.draining = false;
    ensureAssistantDisplayLoop();
  }, [drainAssistantDisplayNow, ensureAssistantDisplayLoop]);

  useEffect(() => () => {
    cancelAssistantDisplayFrame();
  }, [cancelAssistantDisplayFrame]);

  return {
    appendAssistantDelta,
    startAssistantTextPart,
    stopStreaming,
  };
}
