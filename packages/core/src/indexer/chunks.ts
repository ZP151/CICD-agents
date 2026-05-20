import type { ParsedSymbol } from "./types.js";

export const CHUNK_MAX_LINES = 200;

export interface ChunkSlice {
  symbolIndex: number | null;
  startLine: number;
  endLine: number;
  text: string;
}

export function chunksForFile(content: string, symbols: ParsedSymbol[]): ChunkSlice[] {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) return [];

  const chunks: ChunkSlice[] = [];
  const used = new Array<boolean>(lines.length).fill(false);

  symbols.forEach((sym, idx) => {
    const start = Math.max(1, sym.startLine);
    const end = Math.min(lines.length, sym.endLine);
    let cursor = start;
    while (cursor <= end) {
      const sliceEnd = Math.min(cursor + CHUNK_MAX_LINES - 1, end);
      const text = lines.slice(cursor - 1, sliceEnd).join("\n");
      chunks.push({ symbolIndex: idx, startLine: cursor, endLine: sliceEnd, text });
      for (let i = cursor - 1; i < sliceEnd; i++) used[i] = true;
      cursor = sliceEnd + 1;
    }
  });

  let i = 0;
  while (i < lines.length) {
    if (used[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < lines.length && !used[j] && j - i < CHUNK_MAX_LINES) j++;
    const text = lines.slice(i, j).join("\n");
    if (text.trim().length > 0) {
      chunks.push({ symbolIndex: null, startLine: i + 1, endLine: j, text });
    }
    i = j;
  }
  return chunks;
}
