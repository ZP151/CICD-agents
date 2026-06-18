import type { ChangedFile } from "./contextBuilder.js";
import type { VectorIndexStats } from "./vectorIndex.js";

export interface ChatContextProjectLink {
  buildCommand?: string;
  testCommand?: string;
  targetBranch?: string;
  pipelineName?: string;
  ignoredGlobs?: string[];
}

export interface ChatContextChunk {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  score?: number;
  reason: string;
}

export interface ChatContextProjectStructureItem {
  path: string;
  kind: string;
  reason: string;
}

export interface ChatContextBundle {
  repoSummary?: string;
  projectStructure: ChatContextProjectStructureItem[];
  relevantChunks: ChatContextChunk[];
  changedFiles: ChangedFile[];
  changeSummary?: string;
  changeDiffExcerpt?: string;
  memories: Array<{ key: string; value: string }>;
  projectLink?: ChatContextProjectLink;
  indexStats: VectorIndexStats;
  indexed: boolean;
  embedded: boolean;
  fallbackUsed: boolean;
}
