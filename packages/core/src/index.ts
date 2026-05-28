export * from "./settings.js";
export * from "./logger.js";
export * from "./profiles.js";
export * from "./llm.js";
export * from "./contextBuilder.js";
export * from "./planner.js";
export * from "./queue.js";
export * from "./pipelineAgent.js";
export * from "./indexer/types.js";
export * from "./indexer/parsers.js";
export * from "./indexer/chunks.js";
export * from "./tools/executor.js";
export * from "./tools/git.js";
export * from "./tools/dotnet.js";
export * from "./tools/npm.js";
export * from "./tools/pytest.js";
export * from "./tools/azureDevOps.js";
export * from "./tools/gitIntent.js";
export * from "./telemetry.js";
export * from "./chatPlanner.js";

// Azure cloud persistence (opt-in — requires env vars)
export * from "./store/azureAuth.js";
export * from "./store/tableProfileStore.js";
export * from "./store/keyVaultSecrets.js";
export * from "./store/cosmosSessionStore.js";

// SQLite-heavy modules — import directly when needed, not via barrel:
// import { openRepoDb } from "@cicd-agent/core/db/database"
// import { VectorIndex } from "@cicd-agent/core/vectorIndex"
// import { MemoryStore } from "@cicd-agent/core/memoryStore"
// import { RepoIndexer } from "@cicd-agent/core/indexer/repoIndexer"
