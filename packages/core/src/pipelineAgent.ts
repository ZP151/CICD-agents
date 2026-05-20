import fs from "node:fs";
import path from "node:path";
import { ContextBuilder } from "./contextBuilder.js";
import { LLMClient } from "./llm.js";
import { Planner, type PlannerResult } from "./planner.js";
import { emitTaskMetrics } from "./telemetry.js";
import { getProfile, type Profile } from "./profiles.js";
import {
  ToolExecutor,
  ToolError,
  runCommand,
  splitCommand,
  type ToolContext,
} from "./tools/executor.js";
import { azureDevOpsTools } from "./tools/azureDevOps.js";
import { dotnetTools } from "./tools/dotnet.js";
import { gitTools } from "./tools/git.js";
import { gitIntentTool } from "./tools/gitIntent.js";
import { npmTools } from "./tools/npm.js";
import { pytestTools } from "./tools/pytest.js";
import type { TaskHandle } from "./queue.js";

export interface PipelinePayload {
  repoPath: string;
  profile?: string;
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
  const profileName = payload.profile ?? "default";
  handle.step("load_profile", "info", `profile=${profileName}`);
  const profile = getProfile(profileName);

  const { RepoIndexer } = await import("./indexer/repoIndexer.js");
  const { VectorIndex } = await import("./vectorIndex.js");
  const { MemoryStore } = await import("./memoryStore.js");
  const indexer = new RepoIndexer(repoPath, profile);
  const vectors = new VectorIndex(repoPath);
  const memory = new MemoryStore(repoPath);
  const llm = new LLMClient();
  const startedAt = Date.now();
  let plan: PlannerResult | null = null;

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
      payload.targetBranch || profile.azure_devops.default_target_branch || "main";
    handle.step("compute_diff", "info", `target=${targetBranch}`);
    const { diffText, currentBranch } = await computeDiff(repoPath, targetBranch);
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
        ado_org: profile.azure_devops.organization,
        ado_project: profile.azure_devops.project,
        ado_repository: profile.azure_devops.repository,
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

    const buildResult = await maybeRun(repoPath, profile.build.command, handle, "build");
    const testResult = await maybeRun(repoPath, profile.test.command, handle, "test");

    let prInfo: Record<string, unknown> = {};
    if (payload.autoCreatePr ?? true) {
      try {
        prInfo = await maybeCreatePr({
          executor,
          profile,
          payload,
          plan,
          sourceBranch: currentBranch,
          handle,
        });
      } catch (err) {
        if (err instanceof ToolError) handle.step("create_pr", "error", err.message);
        else throw err;
      }
    }

    let pipelineRun: Record<string, unknown> = {};
    if (payload.triggerPipeline && profile.azure_devops.pipeline_id) {
      try {
        pipelineRun = await executor.call("ado_trigger_pipeline", {
          pipeline_id: Number(profile.azure_devops.pipeline_id),
          branch: currentBranch,
        });
        handle.step("trigger_pipeline", "ok", `run_id=${pipelineRun["run_id"]}`);
      } catch (err) {
        if (err instanceof ToolError) handle.step("trigger_pipeline", "error", err.message);
        else throw err;
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

async function computeDiff(
  repoPath: string,
  targetBranch: string,
): Promise<{ diffText: string; currentBranch: string }> {
  const branchRes = await runCommand(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: repoPath,
    allowed: ["git"],
  });
  const currentBranch = branchRes.stdout.trim() || "HEAD";
  const diffRes = await runCommand(["git", "diff", `${targetBranch}...HEAD`], {
    cwd: repoPath,
    allowed: ["git"],
  });
  if (diffRes.returncode !== 0 || !diffRes.stdout.trim()) {
    const fallback = await runCommand(["git", "diff", "HEAD"], {
      cwd: repoPath,
      allowed: ["git"],
    });
    return { diffText: fallback.stdout, currentBranch };
  }
  return { diffText: diffRes.stdout, currentBranch };
}

async function maybeRun(
  repoPath: string,
  command: string,
  handle: TaskHandle,
  label: string,
): Promise<Record<string, unknown>> {
  if (command.trim().length === 0) {
    handle.step(label, "info", "skipped (no command in profile)");
    return { skipped: true };
  }
  const cmd = splitCommand(command);
  handle.step(label, "info", cmd.join(" "));
  try {
    const res = await runCommand(cmd, { cwd: repoPath, timeoutSec: 900 });
    handle.step(
      label,
      res.returncode === 0 ? "ok" : "error",
      `exit=${res.returncode} in ${res.durationMs}ms`,
    );
    return {
      ok: res.returncode === 0,
      returncode: res.returncode,
      stdout_tail: res.stdout.slice(-4000),
      stderr_tail: res.stderr.slice(-2000),
      duration_ms: res.durationMs,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    handle.step(label, "error", msg);
    return { ok: false, error: msg };
  }
}

async function maybeCreatePr(args: {
  executor: ToolExecutor;
  profile: Profile;
  payload: PipelinePayload;
  plan: PlannerResult;
  sourceBranch: string;
  handle: TaskHandle;
}): Promise<Record<string, unknown>> {
  const { executor, profile, payload, plan, sourceBranch, handle } = args;
  if (!profile.azure_devops.repository) {
    handle.step(
      "create_pr",
      "warn",
      "profile missing azure_devops.repository; skipping PR creation",
    );
    return { skipped: true };
  }
  if (sourceBranch === "HEAD" || sourceBranch === profile.azure_devops.default_target_branch) {
    handle.step(
      "create_pr",
      "warn",
      `source branch '${sourceBranch}' is invalid for a PR; checkout a feature branch first`,
    );
    return { skipped: true };
  }
  const title = (payload.title ?? "").toString().trim() || plan.title || `Update from ${sourceBranch}`;
  let description = plan.summary;
  if (payload.workItem) {
    description = `Work Item: AB#${payload.workItem}\n\n${description}`;
  }
  handle.step(
    "create_pr",
    "info",
    `opening PR ${sourceBranch} -> ${profile.azure_devops.default_target_branch}`,
  );
  const pr = await executor.call("ado_create_pr", {
    source_branch: sourceBranch,
    target_branch: payload.targetBranch ?? profile.azure_devops.default_target_branch,
    title,
    description,
    draft: Boolean(payload.draft ?? false),
  });
  handle.step("create_pr", "ok", `PR #${pr["pull_request_id"]} (${pr["url"]})`);
  if (payload.workItem) {
    try {
      const link = await executor.call("ado_link_work_item", {
        pull_request_id: Number(pr["pull_request_id"] ?? 0),
        work_item_id: Number(payload.workItem),
      });
      handle.step(
        "link_work_item",
        link["ok"] ? "ok" : "warn",
        `work_item=${payload.workItem}, ok=${link["ok"]}`,
      );
    } catch (err) {
      handle.step("link_work_item", "warn", err instanceof Error ? err.message : String(err));
    }
  }
  return pr;
}
