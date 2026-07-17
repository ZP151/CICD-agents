export interface SourcePreviewFallbackNoticeInput {
  message?: string;
}

export function sourcePreviewSnippetFallbackNotice({
  message,
}: SourcePreviewFallbackNoticeInput): string {
  const reason = message?.trim();
  return reason
    ? `Showing attached snippet because the full file could not be loaded: ${reason}`
    : "Showing attached snippet because the full file could not be loaded.";
}
