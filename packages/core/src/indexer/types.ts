export interface ParsedSymbol {
  kind: string;
  name: string;
  qualified: string;
  startLine: number;
  endLine: number;
  signature: string;
}

export interface ParsedFile {
  symbols: ParsedSymbol[];
  imports: string[];
}

export interface IndexStats {
  filesSeen: number;
  filesIndexed: number;
  filesSkipped: number;
  filesRemoved: number;
  symbolsAdded: number;
  chunksAdded: number;
}

export interface FileRow {
  id: number;
  path: string;
  language: string;
  size_bytes: number;
  mtime_ns: number;
  content_hash: string;
  is_test: number;
  indexed_at: number;
}

export interface SymbolRow {
  id: number;
  file_id: number;
  kind: string;
  name: string;
  qualified: string;
  start_line: number;
  end_line: number;
  signature: string;
}
