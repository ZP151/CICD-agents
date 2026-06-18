import fs from "node:fs";
import path from "node:path";
import { ContextBuilder } from "./contextBuilder.js";
import { LLMClient } from "./llm.js";
import { Planner } from "./planner.js";
import { emitTaskMetrics } from "./telemetry.js";
import { getProjectTemplate } from "./projectTemplates.js";
import {
  applyProjectLinkConfigToProjectTemplate,
  readProjectLinkConfig,
  resolveProjectTemplateName,
} from "./projectLinkConfig.js";
import {
  ToolExecutor,
  type ToolContext,
} from "./tools/executor.js";
import {
  computePipelineDiff,
  maybeCreatePipelinePr,
  recordPipelineToolError,
  runValidationCommand,
} from "./pipelineAgentSupport.js";
import { azureDevOpsTools } from "./tools/azureDevOps.js";
import { dotnetTools } from "./tools/dotnet.js";
import { gitTools } from "./tools/git.js";
import { gitIntentTool } from "./tools/gitIntent.js";
import { npmTools } from "./tools/npm.js";
import { pytestTools } from "./tools/pytest.js";
import type { TaskHandle } from "./queue.js";

export interface PipelinePayload {
  repoPath: string;
  projectTemplate?: string;
  targetBranch?: string;
  workItem?: string | number | null;
  title?: string | null;
  draft?: boolean;
  autoCreatePr?: boolean;
  triggerPipeline?: boolean;
}

export async function runPipelineTask(handle: TaskHandle): Promise<Record<string, unknown>> {
  const payload = handle.payload as unknown as PipelinePayload;
  const repoPath = path.resolve(payload.repoPath);
  if (!fs.existsSync(repoPath) || !fs.statSync(repoPath).isDirectory()) {
    throw new Error(`repoPath does not exist: ${repoPath}`);
  }
  const localConfig = readProjectLinkConfig(repoPath);
  const projectTemplateName = resolveProjectTemplateName({
    projectTemplate: payload.projectTemplate,
    config: localConfig,
  });
  handle.step(
    "load_project_link_config",
    "info",
    `project_template=${projectTemplateName}${localConfig ? `, config=${path.relative(repoPath, localConfig.path)}` : ""}`,
  );
  const projectTemplate = applyProjectLinkConfigToProjectTemplate(
    getProjectTemplate(projectTemplateName),
    localConfig,
  );

  const { RepoIndexer } = await import("./indexer/repoIndexer.js");
  const { VectorIndex } = await import("./vectorIndex.js");
  const { MemoryStore } = await import("./memoryStore.js");
  const indexer = new RepoIndexer(repoPath, projectTemplate);
  const vectors = new VectorIndex(repoPath);
  const memory = new MemoryStore(repoPath);
  const llm = new LLMClient();
  const startedAt = Date.now();
  let plan: Awaited<ReturnType<Planner["run"]>> | null = null;

  try {
    handle.step("index_repo", "info", "incremental scan");
    const stats = await indexer.update();
    handle.step(
      "index_repo",
      "ok",
      `files seen=${stats.filesSeen}, indexed=${stats.filesIndexed}, removed=${stats.filesRemoved}, symbols=${stats.symbolsAdded}`,
    );

    if (llm.configured) {
      handle.step("embed_chunks", "info", "embedding new chunks");
      const embedded = await vectors.embedPending(llm);
      handle.step("embed_chunks", "ok", `embedded ${embedded} chunks`);
    } else {
      handle.step(
        "embed_chunks",
        "warn",
        "Azure OpenAI not configured; skipping embeddings (vector search disabled)",
      );
    }

    const targetBranch =
      payload.targetBranch || projectTemplate.azure_devops.default_target_branch || "main";
    handle.step("compute_diff", "info", `target=${targetBranch}`);
    const { diffText, currentBranch } = await computePipelineDiff(repoPath, targetBranch);
    handle.step(
      "compute_diff",
      "ok",
      `current_branch=${currentBranch}, diff_chars=${diffText.length}`,
    );

    const builder = new ContextBuilder(repoPath, indexer, vectors);
    const bundle = await builder.build(diffText, targetBranch, llm);
    handle.step(
      "build_context",
      "ok",
      `changed_files=${bundle.changedFiles.length}, related_chunks=${bundle.relatedChunks.length}`,
    );

    const ctx: ToolContext = {
      repoPath,
      env: {},
      timeoutSec: 900,
      extra: {
        ado_org: projectTemplate.azure_devops.organization,
        ado_project: projectTemplate.azure_devops.project,
        ado_repository: projectTemplate.azure_devops.repository,
      },
    };
    const executor = new ToolExecutor(ctx);
    executor.registerMany([
      ...gitTools(),
      ...dotnetTools(),
      ...npmTools(),
      ...pytestTools(),
      ...azureDevOpsTools(),
      gitIntentTool(),
    ]);

    const planner = new Planner(llm, executor);
    if (llm.configured) handle.step("plan", "info", "calling Azure OpenAI");
    else handle.step("plan", "warn", "LLM unavailable; using deterministic summary");
    plan = await planner.run(bundle);
    handle.step(
      "plan",
      "ok",
      `risk=${plan.riskLevel}, tool_calls=${plan.toolCallsMade.length}, used_llm=${plan.usedLlm}`,
    );

    const buildResult = await runValidationCommand(repoPath, projectTemplate.build.command, handle, "build");
    const testResult = await runValidationCommand(repoPath, projectTemplate.test.command, handle, "test");

    let prInfo: Record<string, unknown> = {};
    if (payload.autoCreatePr ?? true) {
      try {
        prInfo = await maybeCreatePipelinePr({
          executor,
          projectTemplate,
          payload,
          plan,
          sourceBranch: currentBranch,
          handle,
        });
      } catch (err) {
        recordPipelineToolError(handle, "create_pr", err);
      }
    }

    let pipelineRun: Record<string, unknown> = {};
    if (payload.triggerPipeline && projectTemplate.azure_devops.pipeline_id) {
      try {
        pipelineRun = await executor.call("ado_trigger_pipeline", {
          pipeline_id: Number(projectTemplate.azure_devops.pipeline_id),
          branch: currentBranch,
        });
        handle.step("trigger_pipeline", "ok", `run_id=${pipelineRun["run_id"]}`);
      } catch (err) {
        recordPipelineToolError(handle, "trigger_pipeline", err);
      }
    }

    memory.recordPr({
      taskId: handle.taskId,
      prId: Number(prInfo["pull_request_id"] ?? 0) || null,
      prUrl: String(prInfo["url"] ?? ""),
      title: plan.title,
      summary: plan.summary,
      riskLevel: plan.riskLevel,
    });

    return {
      plan: {
        title: plan.title,
        summary: plan.summary,
        risk_level: plan.riskLevel,
        reasoning: plan.reasoning,
        next_actions: plan.nextActions,
        tool_calls_made: plan.toolCallsMade,
        used_llm: plan.usedLlm,
      },
      changed_files: bundle.changedFiles.map((cf) => ({
        path: cf.path,
        status: cf.status,
        additions: cf.additions,
        deletions: cf.deletions,
      })),
      build: buildResult,
      test: testResult,
      pull_request: prInfo,
      pipeline_run: pipelineRun,
      llm_usage: {
        prompt_tokens: llm.usage.promptTokens,
        completion_tokens: llm.usage.completionTokens,
        embed_tokens: llm.usage.embedTokens,
      },
    };
  } finally {
    indexer.close();
    vectors.close();
    memory.close();
    void emitTaskMetrics({
      taskId: handle.taskId,
      kind: "submit-pipeline",
      durationMs: Date.now() - startedAt,
      status: plan ? "succeeded" : "failed",
      tokensIn: llm.usage.promptTokens,
      tokensOut: llm.usage.completionTokens,
      embedTokens: llm.usage.embedTokens,
      toolCallCount: plan?.toolCallsMade.length ?? 0,
    });
  }
}
