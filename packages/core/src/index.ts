export * from "./settings.js";
export * from "./logger.js";
export * from "./projectLinks.js";
export * from "./pipelineConnections.js";
export * from "./projectTemplates.js";
export * from "./projectLinkConfig.js";
export * from "./llm.js";
export * from "./contextBuilder.js";
export * from "./planner.js";
export * from "./queue.js";
export * from "./pipelineAgent.js";
export * from "./indexer/types.js";
export * from "./indexer/parsers.js";
export * from "./indexer/chunks.js";
export * from "./tools/executor.js";
export * from "./tools/capabilities.js";
export * from "./tools/git.js";
export * from "./tools/dotnet.js";
export * from "./tools/npm.js";
export * from "./tools/pytest.js";
export * from "./tools/validation.js";
export * from "./tools/azureDevOps.js";
export * from "./tools/gitIntent.js";
export * from "./tools/mcp.js";
export * from "./telemetry.js";
export * from "./chatPlanner.js";
export * from "./chatPlannerControl.js";
export { isReviewOnlyChangeRequest } from "./chatPlannerGuards.js";
export * from "./aiInsightQuality.js";
export * from "./chatUseCases.js";
export * from "./chatUiStream.js";
export * from "./reviewQueue.js";
export * from "./reviewHistoryLocal.js";
export * from "./reviewOperationsLocal.js";
export * from "./prInsightArtifactsLocal.js";
export * from "./review/index.js";

// Azure cloud persistence (opt-in — requires env vars)
export * from "./store/azureAuth.js";
export * from "./store/tableProjectLinkStore.js";
export * from "./store/keyVaultSecrets.js";
export * from "./store/cosmosSessionStore.js";

// SQLite-heavy modules — import directly when needed, not via barrel:
// import { openRepoDb } from "@mergepilot/core/db/database"
// import { VectorIndex } from "@mergepilot/core/vectorIndex"
// import { MemoryStore } from "@mergepilot/core/memoryStore"
// import { RepoIndexer } from "@mergepilot/core/indexer/repoIndexer"
