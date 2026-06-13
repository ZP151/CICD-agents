export const CHAT_AUTO_SCROLL_THRESHOLD_PX = 80;

export interface ChatScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export function readChatScrollMetrics(el: HTMLElement | null): ChatScrollMetrics | null {
  if (!el) return null;
  return {
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  };
}

export function isNearChatBottom(
  metrics: ChatScrollMetrics,
  thresholdPx = CHAT_AUTO_SCROLL_THRESHOLD_PX,
): boolean {
  const remaining = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
  return remaining <= thresholdPx;
}

export function shouldFollowIncomingChatContent(
  metrics: ChatScrollMetrics | null,
  thresholdPx = CHAT_AUTO_SCROLL_THRESHOLD_PX,
): boolean {
  if (!metrics) return true;
  return isNearChatBottom(metrics, thresholdPx);
}
