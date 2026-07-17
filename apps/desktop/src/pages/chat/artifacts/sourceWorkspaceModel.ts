import type { ConversationSourcePart } from "../../../chatBubbles.js";
import { stripSourceLineSuffix } from "../../../components/conversation/sourceTitleUtils.js";

export function sourceFileName(source: ConversationSourcePart): string {
  if (source.type === "source_url") return source.domain || source.title || "Web source";
  return source.file?.split(/[\\/]/).filter(Boolean).pop() || source.title || "Source file";
}

export function sourcePathDetail(source: ConversationSourcePart): string {
  if (source.type === "source_url") return source.url;
  return source.file || stripSourceLineSuffix(source.title);
}

export function sourceLineStartOffset(content: string, line: number | undefined): number | null {
  if (!Number.isInteger(line) || (line ?? 0) < 1) return null;
  if (line === 1) return 0;

  let currentLine = 1;
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) !== 10) continue;
    currentLine += 1;
    if (currentLine === line) return index + 1;
  }

  return null;
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
