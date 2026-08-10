import { type Tool } from "../tools/executor.js";
import { listAzurePullRequestPolicyEvaluations } from "./policy.js";
import {
  createAzurePullRequest,
  updateAzurePullRequest,
} from "./pullRequestMutations.js";
import {
  listAzurePullRequestWorkItems,
} from "./workItems.js";
import {
  commonPullRequestToolProperties,
  resolveAdoAuth,
  resolveOrgProject,
  resolvePullRequestPayload,
  resolveRepository,
} from "./toolRegistryContext.js";
import { pullRequestMutationRegistryTools } from "./toolRegistryPullRequestMutations.js";

export function pullRequestRegistryTools(): Tool[] {
  return [
    pullRequestWorkItemsTool(),
    pullRequestPolicyTool(),
    createPullRequestTool(),
    updatePullRequestTool(),
    ...pullRequestMutationRegistryTools(),
  ];
}

function pullRequestWorkItemsTool(): Tool {
  return {
    name: "ado_list_pull_request_work_items",
    description: "List work item details linked to an Azure DevOps pull request.",
    parameters: {
      type: "object",
      required: ["pull_request_id"],
      properties: commonPullRequestToolProperties(),
    },
    handler: async (ctx, payload) => {
      const ids = resolvePullRequestPayload(ctx, payload, "list_pull_request_work_items");
      const auth = await resolveAdoAuth(ctx);
      const workItems = await listAzurePullRequestWorkItems({ ...ids, auth });
      return {
        workItems,
        count: workItems.length,
      };
    },
  };
}

function pullRequestPolicyTool(): Tool {
  return {
    name: "ado_list_pull_request_policy_evaluations",
    description: "List branch policy evaluations for an Azure DevOps pull request.",
    parameters: {
      type: "object",
      required: ["pull_request_id"],
      properties: commonPullRequestToolProperties(),
    },
    handler: async (ctx, payload) => {
      const ids = resolvePullRequestPayload(ctx, payload, "list_pull_request_policy_evaluations");
      const auth = await resolveAdoAuth(ctx);
      const policies = await listAzurePullRequestPolicyEvaluations({ ...ids, auth });
      return {
        policies,
        count: policies.length,
        blocking: policies.filter((policy) => policy.isBlocking),
      };
    },
  };
}

function createPullRequestTool(): Tool {
  return {
    name: "ado_create_pr",
    description: "Create an Azure DevOps pull request.",
    parameters: {
      type: "object",
      required: ["source_branch", "target_branch", "title"],
      properties: {
        organization: { type: "string" },
        project: { type: "string" },
        repository: { type: "string" },
        source_branch: { type: "string" },
        target_branch: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        draft: { type: "boolean", default: false },
      },
    },
    handler: async (ctx, payload) => {
      const { org, project } = resolveOrgProject(ctx, payload);
      const repository = resolveRepository(ctx, payload);
      const sourceBranch = String(payload["source_branch"] ?? "");
      const targetBranch = String(payload["target_branch"] ?? "");
      const title = String(payload["title"] ?? "");
      const auth = await resolveAdoAuth(ctx);
      return { ...(await createAzurePullRequest({
        organization: org,
        project,
        repository,
        sourceBranch,
        targetBranch,
        title,
        description: String(payload["description"] ?? ""),
        draft: Boolean(payload["draft"] ?? false),
        auth,
      })) };
    },
  };
}

function updatePullRequestTool(): Tool {
  return {
    name: "ado_update_pull_request",
    description: "Update an Azure DevOps pull request title, description, or status.",
    parameters: {
      type: "object",
      required: ["pull_request_id"],
      properties: {
        ...commonPullRequestToolProperties(),
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: ["active", "abandoned", "completed"] },
      },
    },
    handler: async (ctx, payload) => {
      const ids = resolvePullRequestPayload(ctx, payload, "update_pull_request");
      const auth = await resolveAdoAuth(ctx);
      return { ...(await updateAzurePullRequest({
        ...ids,
        title: payload["title"] === undefined ? undefined : String(payload["title"]),
        description: payload["description"] === undefined ? undefined : String(payload["description"]),
        status: payload["status"] === undefined
          ? undefined
          : String(payload["status"]) as "active" | "abandoned" | "completed",
        auth,
      })) };
    },
  };
}
