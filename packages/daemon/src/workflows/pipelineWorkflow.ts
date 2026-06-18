import {
  getAzureBuildLogExcerpt,
  getAzureBuildTimeline,
  getAzureDevOpsAuth,
  listAzurePipelineRuns,
  type PendingToolAction,
} from "@mergepilot/core";
import type { ChatSessionManager } from "../chatSession.js";
import type { ChatWorkflowActionPayload } from "../routes/chat-workflow.routes.js";
import {
  pipelineFailureArtifacts,
  summarizePipelineRuns,
  type PipelineLogExcerpt,
  type WorkflowActionArtifact,
} from "./pipelineWorkflowArtifacts.js";

type WorkflowProjectLink = NonNullable<ChatWorkflowActionPayload["projectLink"]>;

export { pipelineFailureArtifacts, summarizePipelineRuns } from "./pipelineWorkflowArtifacts.js";

export async function runAdoPipelineWorkflowAction(
  chatSessions: ChatSessionManager,
  payload: ChatWorkflowActionPayload,
) {
  const { action, repoPath } = payload;
  const projectLink = adoPipelineProjectLinkFromWorkflowPayload(payload);
  const pipelineId = pipelineIdFromWorkflowPayload(payload, projectLink);
  const auth = await getAzureDevOpsAuth(projectLink.adoPat);

  if (action === "trigger_pipeline") {
    const branch = String(payload.branch ?? projectLink.defaultBranch ?? "").trim();
    const proposal: PendingToolAction = {
      tool: "ado_trigger_pipeline",
      args: {
        organization: projectLink.adoOrgUrl,
        project: projectLink.adoProject,
        pipeline_id: pipelineId,
        ...(branch ? { branch } : {}),
      },
      description: `Trigger Azure Pipeline #${pipelineId}${branch ? ` on ${branch}` : ""}.`,
      nextHint: "inspect pipeline run status",
      workflow: {
        kind: "ci",
        phase: "pipeline_trigger",
        branch: branch || undefined,
        message: `Pipeline #${pipelineId}`,
      },
    };
    const { sessionId, workflowState } = await chatSessions.createApprovalProposal({
      sessionId: payload.sessionId,
      repoPath,
      projectLinkId: payload.projectLinkId,
      inlineProjectLink: payload.projectLink,
      proposal,
      currentStep: proposal.description,
      riskLevel: "high",
      explanation: proposal.description,
      completedTools: [],
    });
    return {
      ok: true,
      action,
      sessionId,
      repoPath,
      summary: proposal.description,
      workflowState,
      tools: [],
    };
  }

  const sessionId = payload.sessionId ?? chatSessions.createSession(repoPath, payload.projectLinkId);
  const runs = await listAzurePipelineRuns({
    organization: projectLink.adoOrgUrl,
    project: projectLink.adoProject,
    pipelineId,
    auth,
    top: 10,
  });
  const failureTimeline = await pipelineFailureTimeline(projectLink, runs, auth);
  const timelineTools = failureTimeline.timeline
    ? [
        adoWorkflowTool("ado_get_build_timeline", failureTimeline.timeline),
        ...(failureTimeline.logExcerpts?.length
          ? [adoWorkflowTool("ado_get_build_log_excerpt", {
              buildId: failureTimeline.timeline.buildId,
              excerpts: failureTimeline.logExcerpts,
              count: failureTimeline.logExcerpts.length,
            })]
          : []),
      ]
    : [];
  const result = adoWorkflowDoneResult({
    action,
    repoPath,
    sessionId,
    workflowKind: "ci",
    phase: "pipeline_inspected",
    currentStep: `Pipeline #${pipelineId} readiness inspected`,
    summary: summarizePipelineRuns(pipelineId, runs),
    tools: [
      adoWorkflowTool("ado_list_pipeline_runs", { pipelineId, runs, count: runs.length }),
      ...timelineTools,
    ],
    artifacts: pipelineFailureArtifacts(
      pipelineId,
      runs,
      failureTimeline.timeline,
      failureTimeline.logExcerpts,
      failureTimeline.error,
    ),
  });
  await appendWorkflowActionAssistantBubble(chatSessions, sessionId, result.summary, result.artifacts);
  return result;
}

function adoPipelineProjectLinkFromWorkflowPayload(payload: ChatWorkflowActionPayload): WorkflowProjectLink {
  const projectLink = payload.projectLink;
  const missing = [
    !projectLink?.adoOrgUrl ? "Azure DevOps organization URL" : "",
    !projectLink?.adoProject ? "ADO project" : "",
  ].filter(Boolean);
  if (missing.length > 0 || !projectLink) {
    throw new Error(`Project Link is missing ${missing.join(", ") || "Azure DevOps details"} before pipeline workflow actions can run.`);
  }
  return projectLink;
}

function pipelineIdFromWorkflowPayload(
  payload: ChatWorkflowActionPayload,
  projectLink: WorkflowProjectLink,
): number {
  const pipelineId = Number(payload.pipelineId ?? projectLink.adoPipelineId ?? 0);
  if (!Number.isFinite(pipelineId) || pipelineId <= 0) {
    throw new Error("Project Link is missing Azure DevOps pipeline ID before pipeline workflow actions can run.");
  }
  return pipelineId;
}

async function pipelineFailureTimeline(
  projectLink: WorkflowProjectLink,
  runs: Awaited<ReturnType<typeof listAzurePipelineRuns>>,
  auth: Awaited<ReturnType<typeof getAzureDevOpsAuth>>,
): Promise<{
  timeline?: Awaited<ReturnType<typeof getAzureBuildTimeline>>;
  logExcerpts?: PipelineLogExcerpt[];
  error?: string;
}> {
  const failedRun = runs.find((run) => run.id && /failed|canceled/i.test(`${run.result} ${run.state}`));
  if (!failedRun) return {};
  try {
    const timeline = await getAzureBuildTimeline({
      organization: projectLink.adoOrgUrl,
      project: projectLink.adoProject,
      buildId: failedRun.id,
      auth,
    });
    const logExcerpts = await pipelineFailureLogExcerpts(projectLink, timeline, auth);
    return { timeline, logExcerpts };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function pipelineFailureLogExcerpts(
  projectLink: WorkflowProjectLink,
  timeline: Awaited<ReturnType<typeof getAzureBuildTimeline>>,
  auth: Awaited<ReturnType<typeof getAzureDevOpsAuth>>,
): Promise<PipelineLogExcerpt[]> {
  const logIds = [...new Set(timeline.failedRecords.map((record) => record.logId).filter((id) => id > 0))].slice(0, 3);
  if (logIds.length === 0) return [];
  const results = await Promise.all(logIds.map(async (logId): Promise<PipelineLogExcerpt | undefined> => {
    try {
      return await getAzureBuildLogExcerpt({
        organization: projectLink.adoOrgUrl,
        project: projectLink.adoProject,
        buildId: timeline.buildId,
        logId,
        auth,
      });
    } catch {
      return undefined;
    }
  }));
  return results.filter((item): item is PipelineLogExcerpt => Boolean(item));
}

function adoWorkflowTool(name: string, result: unknown) {
  return {
    name,
    command: `internal ${name}`,
    ok: true,
    stdout: JSON.stringify(result),
    stderr: "",
    returncode: 0,
  };
}

function adoWorkflowDoneResult(args: {
  action: ChatWorkflowActionPayload["action"];
  repoPath: string;
  sessionId?: string;
  workflowKind?: "pr" | "ci";
  phase: string;
  currentStep: string;
  summary: string;
  tools: Array<ReturnType<typeof adoWorkflowTool>>;
  artifacts?: WorkflowActionArtifact[];
}) {
  return {
    ok: true,
    action: args.action,
    repoPath: args.repoPath,
    sessionId: args.sessionId,
    summary: args.summary,
    workflowState: {
      status: "done" as const,
      currentStep: args.currentStep,
      completedTools: args.tools.map((tool) => tool.name),
      workflowKind: args.workflowKind ?? "pr" as const,
      workflowPhase: args.phase,
    },
    tools: args.tools,
    artifacts: args.artifacts,
  };
}

async function appendWorkflowActionAssistantBubble(
  chatSessions: ChatSessionManager,
  sessionId: string | undefined,
  content: string,
  artifacts: WorkflowActionArtifact[] | undefined,
): Promise<void> {
  if (!sessionId) return;
  await chatSessions.appendBubble(sessionId, {
    role: "assistant",
    content,
    timestamp: Math.floor(Date.now() / 1000),
    artifacts: artifacts?.length ? artifacts : undefined,
  });
}
