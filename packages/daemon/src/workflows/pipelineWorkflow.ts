import {
  adoAuthDiagnosticFromError,
  getAzureBuildLogExcerpt,
  getAzureBuildTimeline,
  getAzureDevOpsAuth,
  listAzureBuildDefinitions,
  listAzurePipelineRuns,
  listPipelineConnections,
  PipelineTargetResolver,
  redact,
  type AdoAuth,
  type PendingToolAction,
  type PipelineTargetResolution,
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
  dataDir: string,
) {
  const { action, repoPath } = payload;
  const projectLink = adoPipelineProjectLinkFromWorkflowPayload(payload);
  let pipelineId = pipelineIdFromWorkflowPayload(payload);

  if (!pipelineId && payload.projectLinkId) {
    // GAP-01: the persisted pipeline selection lives in PipelineConnection
    // (default connection for the Project Link), never in Project Link
    // legacy fields. If nothing is saved, repository-identity discovery
    // below resolves the single target.
    const connection = listPipelineConnections(dataDir, payload.projectLinkId).find(
      (candidate) => candidate.isDefault,
    );
    const connectionPipelineId = Number(connection?.pipelineId ?? 0);
    if (Number.isFinite(connectionPipelineId) && connectionPipelineId > 0) {
      pipelineId = connectionPipelineId;
    }
  }

  if (!pipelineId) {
    // MP-010: resolve the single target through the typed resolver instead of
    // falling into a blob message. Ambiguity and authorization keep their own
    // typed failure shapes so the page can offer the right recovery.
    let auth: AdoAuth;
    try {
      auth = await getAzureDevOpsAuth(projectLink.adoPat);
    } catch (err) {
      return pipelineTargetFailureResult(payload, projectLink, {
        status: "unauthorized",
        source: "none",
        message: adoAuthDiagnosticFromError(err, projectLink.adoPat ? "pat" : "oauth").message,
      });
    }
    const resolver = new PipelineTargetResolver({
      listDefinitions: async (input) =>
        (
          await listAzureBuildDefinitions({
            organization: input.organization,
            project: input.project,
            repositoryId: input.repositoryId,
            repositoryType: input.repositoryType,
            auth: input.auth,
            top: input.top,
          })
        ).map((definition) => ({
          id: Number(definition.id),
          name: definition.name,
          description: definition.description,
        })),
    });
    const resolution = await resolver.resolve({
      explicitId: payload.pipelineId,
      projectLink,
      auth,
    });
    if (resolution.status !== "resolved" || resolution.pipelineId === undefined) {
      return pipelineTargetFailureResult(payload, projectLink, resolution);
    }
    pipelineId = resolution.pipelineId;
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

  // MP-006: a page-originated action (no sessionId) stays on the page; only
  // an explicit Chat handoff carries a session. Never create a session here.
  const sessionId = payload.sessionId;
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

function pipelineIdFromWorkflowPayload(payload: ChatWorkflowActionPayload): number | undefined {
  // Explicit payload IDs only (GAP-01): the Project Link never carries a
  // pipeline ID, so the legacy fallback is gone.
  const pipelineId = Number(payload.pipelineId ?? 0);
  if (!Number.isFinite(pipelineId) || pipelineId <= 0) {
    return undefined;
  }
  return pipelineId;
}

/**
 * MP-010/MP-006: typed target resolution failure. The page keeps the result
 * in its own run surface; no chat session is created or written.
 */
function pipelineTargetFailureResult(
  payload: ChatWorkflowActionPayload,
  projectLink: WorkflowProjectLink,
  resolution: PipelineTargetResolution,
) {
  const kind =
    resolution.status === "ambiguous"
      ? "ambiguous_target"
      : resolution.status === "unauthorized"
        ? "unauthorized"
        : resolution.status === "capability_missing"
          ? "capability_missing"
          : resolution.status === "connector_unavailable"
            ? "connector_unavailable"
            : "target_not_found";
  return {
    ok: false,
    action: payload.action,
    repoPath: payload.repoPath,
    sessionId: payload.sessionId,
    summary: resolution.message,
    workflowState: {
      status: "blocked" as const,
      currentStep: resolution.message,
      completedTools: [],
      workflowKind: "ci" as const,
      workflowPhase:
        resolution.status === "ambiguous"
          ? "pipeline_target_ambiguous"
          : resolution.status === "unauthorized"
            ? "pipeline_target_unauthorized"
            : resolution.status === "capability_missing"
              ? "pipeline_target_capability_missing"
              : "pipeline_target_not_found",
    },
    tools: [],
    failure: {
      kind,
      message: resolution.message,
      ...(resolution.candidates ? { candidates: resolution.candidates } : {}),
    },
  };
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
