import {
  ToolError,
  runCommand,
  splitCommand,
  type ToolExecutor,
} from "./tools/executor.js";
import type { PlannerResult } from "./planner.js";
import type { ProjectTemplate } from "./projectTemplates.js";
import type { TaskHandle } from "./queue.js";
import type { PipelinePayload } from "./pipelineAgent.js";

export async function computePipelineDiff(
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

export async function runValidationCommand(
  repoPath: string,
  command: string,
  handle: TaskHandle,
  label: string,
): Promise<Record<string, unknown>> {
  if (command.trim().length === 0) {
    handle.step(label, "info", "skipped (no command in project template)");
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

export async function maybeCreatePipelinePr(args: {
  executor: ToolExecutor;
  projectTemplate: ProjectTemplate;
  payload: PipelinePayload;
  plan: PlannerResult;
  sourceBranch: string;
  handle: TaskHandle;
}): Promise<Record<string, unknown>> {
  const { executor, projectTemplate, payload, plan, sourceBranch, handle } = args;
  if (!projectTemplate.azure_devops.repository) {
    handle.step(
      "create_pr",
      "warn",
      "Project Link config missing azure_devops.repository; skipping PR creation",
    );
    return { skipped: true };
  }
  if (sourceBranch === "HEAD" || sourceBranch === projectTemplate.azure_devops.default_target_branch) {
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
    `opening PR ${sourceBranch} -> ${projectTemplate.azure_devops.default_target_branch}`,
  );
  const pr = await executor.call("ado_create_pr", {
    source_branch: sourceBranch,
    target_branch: payload.targetBranch ?? projectTemplate.azure_devops.default_target_branch,
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

export function recordPipelineToolError(handle: TaskHandle, step: string, err: unknown): void {
  if (err instanceof ToolError) {
    handle.step(step, "error", err.message);
    return;
  }
  throw err;
}
