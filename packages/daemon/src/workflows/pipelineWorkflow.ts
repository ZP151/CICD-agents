import {
  adoAuthDiagnosticFromError,
  getAzureBuildLogExcerpt,
  getAzureBuildTimeline,
  getAzureDevOpsAuth,
  listAzureBuildDefinitions,
  listAzurePipelineRuns,
  redact,
  type PendingToolAction,
} from "@mergepilot/core";
import type { ChatSessionManager } from "../chatSession.js";
import type { ChatWorkflowActionPayload } from "../routes/chat-workflow.routes.js";
import {
  pipelineFailureArtifacts,
  preferredPipelineFailureRun,
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

  if (!pipelineId) {
    return await pipelineSetupRequiredResult(chatSessions, payload, projectLink);
  }

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
    summary: summarizePipelineRuns(
      pipelineId,
      runs,
      failureTimeline.timeline,
      failureTimeline.logExcerpts,
      failureTimeline.error,
    ),
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
): number | undefined {
  const pipelineId = Number(payload.pipelineId ?? projectLink.adoPipelineId ?? 0);
  if (!Number.isFinite(pipelineId) || pipelineId <= 0) {
    return undefined;
  }
  return pipelineId;
}

async function pipelineSetupRequiredResult(
  chatSessions: ChatSessionManager,
  payload: ChatWorkflowActionPayload,
  projectLink: WorkflowProjectLink,
) {
  let definitions: Awaited<ReturnType<typeof listAzureBuildDefinitions>> = [];
  let discoveryError = "";

  try {
    const auth = await getAzureDevOpsAuth(projectLink.adoPat);
    definitions = await listAzureBuildDefinitions({
      organization: projectLink.adoOrgUrl,
      project: projectLink.adoProject,
      repositoryId: projectLink.adoRepoName || undefined,
      repositoryType: projectLink.adoRepoName ? "TfsGit" : undefined,
      auth,
      top: 20,
    });
  } catch (err) {
    discoveryError = adoAuthDiagnosticFromError(err, projectLink.adoPat ? "pat" : "oauth").message;
  }

  const visibleDefinitions = definitions.slice(0, 10);
  const lines = [
    "No Azure Pipeline is configured on this Project Link yet.",
    payload.action === "trigger_pipeline"
      ? "I did not trigger a pipeline. Select a pipeline first, then rerun the action."
      : "Select a pipeline for this Project Link before inspecting or running CI.",
  ];
  if (discoveryError) {
    lines.push(
      "",
      "Pipeline candidates could not be discovered yet.",
      discoveryError,
    );
  } else if (visibleDefinitions.length > 0) {
    lines.push(
      "",
      "Available pipeline candidates:",
      ...visibleDefinitions.map((definition) => {
        const description = definition.description ? ` - ${definition.description}` : "";
        return `- #${definition.id} ${definition.name}${description}`;
      }),
    );
  } else {
    lines.push("", "No pipeline candidates were returned for the current Azure DevOps project/repository mapping.");
  }

  const sessionId = payload.sessionId ?? chatSessions.createSession(payload.repoPath, payload.projectLinkId);
  const result = adoWorkflowDoneResult({
    action: payload.action,
    repoPath: payload.repoPath,
    sessionId,
    workflowKind: "ci",
    phase: "pipeline_setup_required",
    currentStep: "Pipeline configuration required",
    summary: lines.join("\n"),
    tools: [
      adoWorkflowTool("ado_discover_pipelines", {
        project: projectLink.adoProject,
        repository: projectLink.adoRepoName,
        candidates: visibleDefinitions,
        count: definitions.length,
        discoveryError,
      }),
    ],
  });
  await appendWorkflowActionAssistantBubble(chatSessions, sessionId, result.summary, undefined);
  return result;
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
  const failedRun = preferredPipelineFailureRun(runs);
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
    stdout: redact(JSON.stringify(result)),
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
