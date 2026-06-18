import { type Tool } from "../tools/executor.js";
import {
  getAzureDevOpsAuth,
  type AdoAuth,
} from "./auth.js";
import { listAzureProjects } from "./core.js";
import { buildPipelineRegistryTools } from "./toolRegistryBuildPipeline.js";
import { pullRequestRegistryTools } from "./toolRegistryPullRequests.js";
import type { AzureDevOpsToolHealth } from "./types.js";

export const INTERNAL_AZURE_DEVOPS_TOOL_MANIFEST: Array<{ name: string; description: string }> = [
  { name: "ado_core_list_projects", description: "List Azure DevOps projects." },
  { name: "ado_repo_list_repos_by_project", description: "List Azure Repos repositories by project." },
  { name: "ado_pipelines_get_build_definitions", description: "List Azure Pipelines build definitions." },
  { name: "ado_list_pull_requests", description: "List Azure DevOps pull requests." },
  { name: "ado_get_pull_request_by_id", description: "Get Azure DevOps pull request details." },
  { name: "ado_list_pull_request_threads", description: "List Azure DevOps pull request comment threads." },
  { name: "ado_get_pull_request_changes", description: "Get Azure DevOps pull request changed files." },
  { name: "ado_list_pull_request_work_items", description: "List work item details linked to an Azure DevOps pull request." },
  { name: "ado_list_pull_request_policy_evaluations", description: "List branch policy evaluations for an Azure DevOps pull request." },
  { name: "ado_pipelines_get_builds", description: "List Azure DevOps builds." },
  { name: "ado_pipelines_get_run", description: "Get an Azure Pipeline run." },
  { name: "ado_list_pipeline_runs", description: "List Azure Pipeline runs." },
  { name: "ado_get_build_timeline", description: "Get failed task and issue details from an Azure DevOps build timeline." },
  { name: "ado_get_build_log_excerpt", description: "Get a concise diagnostic excerpt from an Azure DevOps build log." },
  { name: "ado_create_pr", description: "Create an Azure DevOps pull request." },
  { name: "ado_update_pull_request", description: "Update an Azure DevOps pull request title, description, or status." },
  { name: "ado_add_pull_request_reviewer", description: "Add a reviewer to an Azure DevOps pull request or set the caller's reviewer vote." },
  { name: "ado_remove_pull_request_reviewer", description: "Remove a reviewer from an Azure DevOps pull request." },
  { name: "ado_add_pull_request_label", description: "Add a label/tag to an Azure DevOps pull request." },
  { name: "ado_remove_pull_request_label", description: "Remove a label/tag from an Azure DevOps pull request." },
  { name: "ado_link_work_item", description: "Attach a work item to a pull request." },
  { name: "ado_trigger_pipeline", description: "Queue a run of an Azure DevOps pipeline." },
];

export async function checkAzureDevOpsTools(args: {
  organization: string;
  pat?: string;
  auth?: AdoAuth;
}): Promise<AzureDevOpsToolHealth> {
  const auth = args.auth ?? await getAzureDevOpsAuth(args.pat);
  const projects = await listAzureProjects({
    organization: args.organization,
    auth,
    top: 1,
  });
  return {
    ok: true,
    source: "internal",
    authMode: auth.mode,
    authStatus: "ok",
    authMessage: `ADO tools are reachable via ${auth.mode === "oauth" ? "OAuth" : "PAT"}.`,
    toolCount: INTERNAL_AZURE_DEVOPS_TOOL_MANIFEST.length,
    tools: INTERNAL_AZURE_DEVOPS_TOOL_MANIFEST,
    projectCount: projects.length,
  };
}

export function azureDevOpsTools(): Tool[] {
  return [
    ...pullRequestRegistryTools(),
    ...buildPipelineRegistryTools(),
  ];
}
