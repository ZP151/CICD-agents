import path from "node:path";
import type { LLMClient } from "./llm.js";
import { RepoIndexer } from "./indexer/repoIndexer.js";
import { VectorIndex, type VectorIndexStats } from "./vectorIndex.js";
import {
  getChangedFiles,
  getChangeDiffExcerpt,
  inferChangeSummary,
  shouldInspectGit,
} from "./chatContextChanges.js";
import {
  dedupeChunks,
  heuristicChunks,
  listQuickRepoFiles,
  projectLinkToIndexerProjectTemplate,
  readImportantFiles,
  summarizeProjectStructure,
  summarizeRepo,
} from "./chatContextScan.js";
import type {
  ChatContextBundle,
  ChatContextChunk,
  ChatContextProjectLink,
} from "./chatContextTypes.js";

export type {
  ChatContextBundle,
  ChatContextChunk,
  ChatContextProjectLink,
  ChatContextProjectStructureItem,
} from "./chatContextTypes.js";
export {
  chatContextSources,
  chatContextToPrompt,
  describeChatContext,
} from "./chatContextFormat.js";
export { shouldInspectGit } from "./chatContextChanges.js";

export async function buildChatContext(args: {
  repoPath: string;
  message: string;
  llm: LLMClient;
  projectLink?: ChatContextProjectLink;
  maxChunks?: number;
  useSemanticIndex?: boolean;
}): Promise<ChatContextBundle> {
  const repoPath = path.resolve(args.repoPath);
  const maxChunks = args.maxChunks ?? 8;
  const projectLink = args.projectLink;

  const repoFiles = await listQuickRepoFiles(repoPath, projectLink?.ignoredGlobs ?? []);
  const projectStructure = summarizeProjectStructure(repoFiles);
  const importantChunks = readImportantFiles(repoPath);
  const semanticEnabled = args.useSemanticIndex ?? true;
  let indexStats: VectorIndexStats = {
    filesIndexed: 0,
    chunksIndexed: 0,
    chunksEmbedded: 0,
    chunksPendingEmbedding: 0,
  };

  let relevantChunks: ChatContextChunk[] = [];
  let semanticUsed = false;
  if (semanticEnabled) {
    const vectors = new VectorIndex(repoPath);
    try {
      indexStats = vectors.stats();
      if (args.llm.configured && indexStats.chunksEmbedded > 0) {
        try {
          const hits = await vectors.searchText(args.llm, args.message, maxChunks);
          relevantChunks = hits.map((hit) => ({
            path: hit.filePath,
            startLine: hit.startLine,
            endLine: hit.endLine,
            text: hit.text,
            score: hit.score,
            reason: "semantic-search",
          }));
          semanticUsed = relevantChunks.length > 0;
        } catch {
          semanticUsed = false;
          relevantChunks = [];
        }
      }
    } finally {
      vectors.close();
    }
  }

  let fallbackUsed = !semanticUsed;
  if (relevantChunks.length === 0) {
    relevantChunks = heuristicChunks(repoPath, repoFiles, args.message, maxChunks);
  }

  const inspectGit = shouldInspectGit(args.message);
  const changedFiles = inspectGit
    ? await getChangedFiles(repoPath, projectLink?.targetBranch)
    : [];
  const changeDiffExcerpt = inspectGit && changedFiles.length > 0
    ? await getChangeDiffExcerpt(repoPath, projectLink?.targetBranch)
    : "";

  return {
    repoSummary: summarizeRepo(repoFiles, 0, repoFiles.length),
    projectStructure,
    relevantChunks: dedupeChunks([...importantChunks, ...relevantChunks]).slice(0, maxChunks + importantChunks.length),
    changedFiles,
    changeSummary: changedFiles.length > 0 ? inferChangeSummary(changedFiles, changeDiffExcerpt) : undefined,
    changeDiffExcerpt,
    memories: [],
    projectLink,
    indexStats,
    indexed: indexStats.filesIndexed > 0 || indexStats.chunksIndexed > 0,
    embedded: semanticUsed,
    fallbackUsed,
  };
}

export async function refreshChatIndex(args: {
  repoPath: string;
  llm: LLMClient;
  projectLink?: ChatContextProjectLink;
}): Promise<{ filesSeen: number; filesIndexed: number; embedded: number; embeddingError?: string }> {
  const repoPath = path.resolve(args.repoPath);
  const projectLink = args.projectLink;
  const indexer = new RepoIndexer(repoPath, projectLinkToIndexerProjectTemplate(projectLink));
  const vectors = new VectorIndex(repoPath);
  try {
    const stats = await indexer.update();
    try {
      const embedded = args.llm.configured ? await vectors.embedPending(args.llm) : 0;
      return { filesSeen: stats.filesSeen, filesIndexed: stats.filesIndexed, embedded };
    } catch (err) {
      return {
        filesSeen: stats.filesSeen,
        filesIndexed: stats.filesIndexed,
        embedded: 0,
        embeddingError: err instanceof Error ? err.message : String(err),
      };
    }
  } finally {
    indexer.close();
    vectors.close();
  }
}

export function getChatIndexStatus(repoPath: string): {
  repoPath: string;
  indexed: boolean;
  semanticReady: boolean;
  stats: VectorIndexStats;
  retrievalMode: "semantic-index" | "quick-scan";
  summary: string;
} {
  const resolvedRepoPath = path.resolve(repoPath);
  const vectors = new VectorIndex(resolvedRepoPath);
  try {
    const stats = vectors.stats();
    const indexed = stats.filesIndexed > 0 || stats.chunksIndexed > 0;
    const semanticReady = stats.chunksEmbedded > 0;
    return {
      repoPath: resolvedRepoPath,
      indexed,
      semanticReady,
      stats,
      retrievalMode: semanticReady ? "semantic-index" : "quick-scan",
      summary: semanticReady
        ? `Semantic index ready (${stats.filesIndexed} files, ${stats.chunksEmbedded} embedded chunks).`
        : indexed
          ? `Index exists but embeddings are pending (${stats.filesIndexed} files, ${stats.chunksEmbedded}/${stats.chunksIndexed} embedded chunks).`
          : "Quick scan only; refresh the project index for stronger repository context.",
    };
  } finally {
    vectors.close();
  }
}
