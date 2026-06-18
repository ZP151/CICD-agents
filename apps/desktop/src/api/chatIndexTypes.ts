export interface ChatIndexStatus {
  repoPath: string;
  indexed: boolean;
  semanticReady: boolean;
  retrievalMode: "semantic-index" | "quick-scan";
  stats: {
    filesIndexed: number;
    chunksIndexed: number;
    chunksEmbedded: number;
    chunksPendingEmbedding: number;
  };
  summary: string;
}

export interface ChatIndexRefreshResult {
  ok: boolean;
  refresh: {
    filesSeen: number;
    filesIndexed: number;
    embedded: number;
  };
  status: ChatIndexStatus;
}
