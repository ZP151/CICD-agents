import { getSettings } from "../settings.js";
import { ToolError, type ToolContext } from "../tools/executor.js";
import { resolveAdoContextAuth, type AdoAuth } from "./auth.js";

export function commonPullRequestToolProperties(): Record<string, unknown> {
  return {
    organization: { type: "string" },
    project: { type: "string" },
    repository: { type: "string" },
    pull_request_id: { type: "integer" },
  };
}

export function resolveOrgProject(ctx: ToolContext, payload: Record<string, unknown>): {
  org: string;
  project: string;
} {
  const settings = getSettings();
  const org =
    String(payload["organization"] ?? "") ||
    String(ctx.extra["ado_org"] ?? "") ||
    settings.azureDevOpsOrg;
  const project =
    String(payload["project"] ?? "") ||
    String(ctx.extra["ado_project"] ?? "") ||
    settings.azureDevOpsProject;
  if (!org || !project) {
    throw new ToolError(
      "Azure DevOps org/project missing. Set AZURE_DEVOPS_ORG and AZURE_DEVOPS_PROJECT, or pass them in the payload.",
    );
  }
  return { org, project };
}

export function resolveRepository(ctx: ToolContext, payload: Record<string, unknown>): string {
  const repository = String(payload["repository"] ?? "") || String(ctx.extra["ado_repository"] ?? "");
  if (!repository) throw new ToolError("create_pull_request requires 'repository'.");
  return repository;
}

export function resolvePullRequestPayload(ctx: ToolContext, payload: Record<string, unknown>, toolName: string): {
  organization: string;
  project: string;
  repository: string;
  pullRequestId: number;
} {
  const { org, project } = resolveOrgProject(ctx, payload);
  const repository = String(payload["repository"] ?? "") || String(ctx.extra["ado_repository"] ?? "");
  const pullRequestId = Number(payload["pull_request_id"] ?? 0);
  if (!repository || !pullRequestId) {
    throw new ToolError(`${toolName} requires 'repository' and 'pull_request_id'.`);
  }
  return {
    organization: org,
    project,
    repository,
    pullRequestId,
  };
}

export async function resolveAdoAuth(ctx: ToolContext): Promise<AdoAuth> {
  return resolveAdoContextAuth(ctx);
}
