export interface SmoothStreamingTextOptions {
  minCharsPerSecond: number;
  maxCharsPerSecond: number;
  catchupCharsPerSecondPerPendingChar: number;
  drainCharsPerSecond: number;
}

export const DEFAULT_SMOOTH_STREAMING_TEXT_OPTIONS: SmoothStreamingTextOptions = {
  minCharsPerSecond: 48,
  maxCharsPerSecond: 340,
  catchupCharsPerSecondPerPendingChar: 2.2,
  drainCharsPerSecond: 1000,
};

export function smoothStreamingTextTakeLength(
  pendingLength: number,
  elapsedMs: number,
  draining = false,
  options: SmoothStreamingTextOptions = DEFAULT_SMOOTH_STREAMING_TEXT_OPTIONS,
): number {
  if (pendingLength <= 0) return 0;
  const elapsedSeconds = Math.max(0, elapsedMs) / 1000;
  const speed = draining
    ? options.drainCharsPerSecond
    : Math.min(
      options.maxCharsPerSecond,
      options.minCharsPerSecond + pendingLength * options.catchupCharsPerSecondPerPendingChar,
    );
  return Math.min(pendingLength, Math.max(1, Math.floor(speed * elapsedSeconds)));
}
