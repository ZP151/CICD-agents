import { useCallback, useEffect, useRef } from "react";
import {
  isNearChatBottom,
  readChatScrollMetrics,
  shouldFollowIncomingChatContent,
} from "../../chatScroll.js";

export function useChatScrollFollow(trigger: unknown) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const shouldScrollRef = useRef(false);

  const scrollToBottomIfNeeded = useCallback(() => {
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  const markIncomingContentScrollIntent = useCallback(() => {
    const shouldFollow = shouldFollowIncomingChatContent(readChatScrollMetrics(scrollContainerRef.current));
    atBottomRef.current = shouldFollow;
    shouldScrollRef.current = shouldFollow;
  }, []);

  const forceNextScrollToBottom = useCallback(() => {
    atBottomRef.current = true;
    shouldScrollRef.current = true;
  }, []);

  useEffect(() => {
    if (shouldScrollRef.current) {
      scrollToBottomIfNeeded();
      shouldScrollRef.current = false;
    }
  }, [trigger, scrollToBottomIfNeeded]);

  const handleContainerScroll = useCallback(() => {
    const metrics = readChatScrollMetrics(scrollContainerRef.current);
    if (!metrics) return;
    atBottomRef.current = isNearChatBottom(metrics);
  }, []);

  return {
    bottomRef,
    scrollContainerRef,
    markIncomingContentScrollIntent,
    forceNextScrollToBottom,
    handleContainerScroll,
  };
}
