import { ToolError, type Tool } from "../tools/executor.js";
import {
  addAzurePullRequestLabel,
  addAzurePullRequestReviewer,
  removeAzurePullRequestLabel,
  removeAzurePullRequestReviewer,
} from "./pullRequestMutations.js";
import { linkAzureWorkItemToPullRequest } from "./workItems.js";
import {
  commonPullRequestToolProperties,
  resolveAdoAuth,
  resolvePullRequestPayload,
} from "./toolRegistryContext.js";

export function pullRequestMutationRegistryTools(): Tool[] {
  return [
    addPullRequestReviewerTool(),
    removePullRequestReviewerTool(),
    addPullRequestLabelTool(),
    removePullRequestLabelTool(),
    linkWorkItemTool(),
  ];
}

function addPullRequestReviewerTool(): Tool {
  return {
    name: "ado_add_pull_request_reviewer",
    description: "Add a reviewer to an Azure DevOps pull request or set the caller's reviewer vote.",
    parameters: {
      type: "object",
      required: ["pull_request_id", "reviewer_id"],
      properties: {
        ...commonPullRequestToolProperties(),
        reviewer_id: { type: "string" },
        vote: { type: "integer" },
        is_required: { type: "boolean" },
      },
    },
    handler: async (ctx, payload) => {
      const ids = resolvePullRequestPayload(ctx, payload, "add_pull_request_reviewer");
      const reviewerId = String(payload["reviewer_id"] ?? "");
      if (!reviewerId) {
        throw new ToolError("add_pull_request_reviewer requires 'repository', 'pull_request_id', and 'reviewer_id'.");
      }
      const auth = await resolveAdoAuth(ctx);
      return { ...(await addAzurePullRequestReviewer({
        ...ids,
        reviewerId,
        vote: payload["vote"] === undefined ? undefined : Number(payload["vote"]),
        isRequired: payload["is_required"] === undefined ? undefined : Boolean(payload["is_required"]),
        auth,
      })) };
    },
  };
}

function removePullRequestReviewerTool(): Tool {
  return {
    name: "ado_remove_pull_request_reviewer",
    description: "Remove a reviewer from an Azure DevOps pull request.",
    parameters: {
      type: "object",
      required: ["pull_request_id", "reviewer_id"],
      properties: {
        ...commonPullRequestToolProperties(),
        reviewer_id: { type: "string" },
      },
    },
    handler: async (ctx, payload) => {
      const ids = resolvePullRequestPayload(ctx, payload, "remove_pull_request_reviewer");
      const reviewerId = String(payload["reviewer_id"] ?? "");
      if (!reviewerId) {
        throw new ToolError("remove_pull_request_reviewer requires 'repository', 'pull_request_id', and 'reviewer_id'.");
      }
      const auth = await resolveAdoAuth(ctx);
      return { ...(await removeAzurePullRequestReviewer({ ...ids, reviewerId, auth })) };
    },
  };
}

function addPullRequestLabelTool(): Tool {
  return {
    name: "ado_add_pull_request_label",
    description: "Add a label/tag to an Azure DevOps pull request.",
    parameters: {
      type: "object",
      required: ["pull_request_id", "label"],
      properties: {
        ...commonPullRequestToolProperties(),
        label: { type: "string" },
      },
    },
    handler: async (ctx, payload) => {
      const ids = resolvePullRequestPayload(ctx, payload, "add_pull_request_label");
      const label = String(payload["label"] ?? "");
      if (!label) {
        throw new ToolError("add_pull_request_label requires 'repository', 'pull_request_id', and 'label'.");
      }
      const auth = await resolveAdoAuth(ctx);
      return { ...(await addAzurePullRequestLabel({ ...ids, label, auth })) };
    },
  };
}

function removePullRequestLabelTool(): Tool {
  return {
    name: "ado_remove_pull_request_label",
    description: "Remove a label/tag from an Azure DevOps pull request.",
    parameters: {
      type: "object",
      required: ["pull_request_id", "label"],
      properties: {
        ...commonPullRequestToolProperties(),
        label: { type: "string" },
      },
    },
    handler: async (ctx, payload) => {
      const ids = resolvePullRequestPayload(ctx, payload, "remove_pull_request_label");
      const label = String(payload["label"] ?? "");
      if (!label) {
        throw new ToolError("remove_pull_request_label requires 'repository', 'pull_request_id', and 'label'.");
      }
      const auth = await resolveAdoAuth(ctx);
      return { ...(await removeAzurePullRequestLabel({ ...ids, label, auth })) };
    },
  };
}

function linkWorkItemTool(): Tool {
  return {
    name: "ado_link_work_item",
    description: "Attach a work item to a pull request via ArtifactLink.",
    parameters: {
      type: "object",
      required: ["pull_request_id", "work_item_id"],
      properties: {
        ...commonPullRequestToolProperties(),
        work_item_id: { type: "integer" },
      },
    },
    handler: async (ctx, payload) => {
      const ids = resolvePullRequestPayload(ctx, payload, "link_work_item");
      const workItemId = Number(payload["work_item_id"] ?? 0);
      if (!workItemId) {
        throw new ToolError("link_work_item requires 'repository', 'pull_request_id', 'work_item_id'.");
      }
      const auth = await resolveAdoAuth(ctx);
      return { ...(await linkAzureWorkItemToPullRequest({ ...ids, workItemId, auth })) };
    },
  };
}
