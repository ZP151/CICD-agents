import { ToolError, type Tool } from "../tools/executor.js";
import {
  getAzureBuildLogExcerpt,
  getAzureBuildTimeline,
} from "./builds.js";
import { triggerAzurePipelineRun } from "./pipelines.js";
import {
  resolveAdoAuth,
  resolveOrgProject,
} from "./toolRegistryContext.js";

export function buildPipelineRegistryTools(): Tool[] {
  return [
    buildTimelineTool(),
    buildLogExcerptTool(),
    triggerPipelineTool(),
  ];
}

function buildTimelineTool(): Tool {
  return {
    name: "ado_get_build_timeline",
    description: "Get failed task and issue details from an Azure DevOps build timeline.",
    parameters: {
      type: "object",
      required: ["build_id"],
      properties: {
        organization: { type: "string" },
        project: { type: "string" },
        build_id: { type: "integer" },
      },
    },
    handler: async (ctx, payload) => {
      const { org, project } = resolveOrgProject(ctx, payload);
      const buildId = Number(payload["build_id"] ?? 0);
      if (!buildId) throw new ToolError("get_build_timeline requires 'build_id'.");
      const auth = await resolveAdoAuth(ctx);
      const timeline = await getAzureBuildTimeline({ organization: org, project, buildId, auth });
      return {
        buildId: timeline.buildId,
        failedRecords: timeline.failedRecords,
        errorIssues: timeline.errorIssues,
        warningIssues: timeline.warningIssues,
      };
    },
  };
}

function buildLogExcerptTool(): Tool {
  return {
    name: "ado_get_build_log_excerpt",
    description: "Get a concise diagnostic excerpt from an Azure DevOps build log.",
    parameters: {
      type: "object",
      required: ["build_id", "log_id"],
      properties: {
        organization: { type: "string" },
        project: { type: "string" },
        build_id: { type: "integer" },
        log_id: { type: "integer" },
        max_chars: { type: "integer" },
      },
    },
    handler: async (ctx, payload) => {
      const { org, project } = resolveOrgProject(ctx, payload);
      const buildId = Number(payload["build_id"] ?? 0);
      const logId = Number(payload["log_id"] ?? 0);
      if (!buildId || !logId) throw new ToolError("get_build_log_excerpt requires 'build_id' and 'log_id'.");
      const auth = await resolveAdoAuth(ctx);
      return { ...(await getAzureBuildLogExcerpt({
        organization: org,
        project,
        buildId,
        logId,
        maxChars: Number(payload["max_chars"] ?? 6000),
        auth,
      })) };
    },
  };
}

function triggerPipelineTool(): Tool {
  return {
    name: "ado_trigger_pipeline",
    description: "Queue a run of an Azure DevOps pipeline.",
    parameters: {
      type: "object",
      required: ["pipeline_id"],
      properties: {
        organization: { type: "string" },
        project: { type: "string" },
        pipeline_id: { type: "integer" },
        branch: { type: "string" },
      },
    },
    handler: async (ctx, payload) => {
      const { org, project } = resolveOrgProject(ctx, payload);
      const pipelineId = Number(payload["pipeline_id"] ?? 0);
      const branch = String(payload["branch"] ?? "");
      const auth = await resolveAdoAuth(ctx);
      return { ...(await triggerAzurePipelineRun({ organization: org, project, pipelineId, branch, auth })) };
    },
  };
}
