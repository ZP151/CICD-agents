import {
  adoAuthDiagnosticFromError,
  getAzureDevOpsAuth,
  LLMClient,
} from "@mergepilot/core";
import {
  buildChatContext,
  chatContextSources,
  describeChatContext,
  type ChatContextBundle,
} from "@mergepilot/core/chatContext";
import type { ChatSessionManager } from "../chatSession.js";
import type { ChatWorkflowActionPayload } from "../routes/chat-workflow.routes.js";
import { inlineProjectLinkToChatContextProjectLink } from "../chatContextPrompt.js";
import {
  gitOperationBlockForAction,
  gitOperationStateFromTools,
  dirtyWorkingTreeSummary,
} from "./gitOperation.js";
import { runGitWorkflowProbes } from "./gitProbes.js";
import {
  isAdoPipelineWorkflowAction,
  isAdoPullRequestWorkflowAction,
} from "./workflowActions.js";
import { runAdoPipelineWorkflowAction } from "./pipelineWorkflow.js";
import { runAdoPullRequestWorkflowAction } from "./prWorkflow.js";
import { prPreflightFromPayload } from "./workspacePrPreflight.js";
import { changedFilesFromGitOutputs } from "./validationPreflight.js";
import {
  buildWorkspaceWorkflowProposal,
  isGitRecoveryWorkflowAction,
  preflightFromTools,
  pushReadinessFromTools,
  summarizeWorkspaceWorkflow,
  workflowRiskForAction,
} from "./workspaceWorkflow.js";

export async function runWorkspaceWorkflowAction(
  chatSessions: ChatSessionManager,
  payload: ChatWorkflowActionPayload,
) {
  const { action, repoPath } = payload;
  if (isAdoPullRequestWorkflowAction(action)) {
    return runAdoPullRequestWorkflowAction(chatSessions, payload);
  }
  if (isAdoPipelineWorkflowAction(action)) {
    return runAdoPipelineWorkflowAction(chatSessions, payload);
  }
  if (action === "inspect_validation_failure") {
    return await runValidationFailureInspection(chatSessions, payload);
  }
  if (action === "inspect_ci_recovery_context") {
    return await runCiRecoveryContextInspection(chatSessions, payload);
  }
  if (action === "inspect_source_context") {
    return await runSourceContextInspection(chatSessions, payload);
  }
  if (action === "inspect_architecture_context") {
    return await runArchitectureContextInspection(chatSessions, payload);
  }
  if (action === "inspect_ado_auth_context") {
    return await runAdoAuthContextInspection(chatSessions, payload);
  }
  if (action === "inspect_pr_plan_context") {
    return await runPrPlanContextInspection(payload);
  }

  const { tools, failed } = await runGitWorkflowProbes(repoPath, action, {
    isRecoveryAction: isGitRecoveryWorkflowAction,
  });
  const currentBranch = tools.find((tool) => tool.name === "git_current_branch")?.stdout.trim() || "";
  const statusText = tools.find((tool) => tool.name === "git_status")?.stdout.trim() || "";
  const diffStat = (
    tools.find((tool) => tool.name === "git_diff") ??
    tools.find((tool) => tool.name === "git_diff_staged")
  )?.stdout.trim() || "";
  const stagedNameOnly = tools.find((tool) => tool.name === "git_diff_staged_name_only")?.stdout ?? "";
  const changedFiles = action === "inspect_staged_changes"
    ? changedFilesFromGitOutputs(stagedNameOnly, "")
    : changedFilesFromGitOutputs(
      [
        tools.find((tool) => tool.name === "git_diff_name_only")?.stdout ?? "",
        stagedNameOnly,
      ].filter(Boolean).join("\n"),
      statusText,
    );
  const operationState = gitOperationStateFromTools(repoPath, statusText, tools);
  const operationBlock = gitOperationBlockForAction(action, operationState);
  const pushReadiness = pushReadinessFromTools(tools);
  const latestCommitSubject = tools.find((tool) => tool.name === "git_log_subject")?.stdout.trim() || "";
  const latestCommitStat = tools.find((tool) => tool.name === "git_show_head_stat")?.stdout.trim() || "";

  if (!failed && operationBlock) {
    return {
      ok: false,
      action,
      repoPath,
      sessionId: payload.sessionId,
      summary: summarizeWorkspaceWorkflow(action, { currentBranch, statusText, diffStat, changedFiles, operationState, pushReadiness, latestCommitSubject, latestCommitStat }),
      workflowState: {
        status: "blocked",
        workflowKind: "git",
        workflowPhase: operationBlock.workflowPhase,
        currentStep: operationBlock.summary,
        completedTools: tools.filter((tool) => tool.ok).map((tool) => tool.name),
      },
      tools,
    };
  }

  const preflight = failed ? undefined : await preflightFromTools(chatSessions, action, payload, tools, statusText);
  const proposal = failed ? undefined : buildWorkspaceWorkflowProposal(
    action,
    payload,
    currentBranch,
    statusText,
    pushReadiness,
    preflight,
    operationState,
  );
  if (proposal) {
    const { sessionId, workflowState } = await chatSessions.createApprovalProposal({
      sessionId: payload.sessionId,
      repoPath,
      projectLinkId: payload.projectLinkId,
      inlineProjectLink: payload.projectLink,
      proposal,
      currentStep: proposal.description,
      riskLevel: workflowRiskForAction(action, statusText, proposal.preflight),
      explanation: proposal.description,
      completedTools: tools.filter((tool) => tool.ok).map((tool) => tool.name),
    });
    return {
      ok: true,
      action,
      sessionId,
      repoPath,
      summary: summarizeWorkspaceWorkflow(action, { currentBranch, statusText, diffStat, changedFiles, operationState, pushReadiness, latestCommitSubject, latestCommitStat }),
      workflowState,
      tools,
    };
  }

  return {
    ok: !failed,
    action,
    repoPath,
    sessionId: payload.sessionId,
    summary: summarizeWorkspaceWorkflow(action, { currentBranch, statusText, diffStat, changedFiles, operationState, pushReadiness, latestCommitSubject, latestCommitStat }),
    workflowState: {
      status: failed ? "failed" : "done",
      currentStep: failed ? `${failed.name} failed` : `${action} complete`,
      completedTools: tools.filter((tool) => tool.ok).map((tool) => tool.name),
      workflowKind: "git" as const,
      workflowPhase: action,
    },
    tools,
  };
}

async function runValidationFailureInspection(
  chatSessions: ChatSessionManager,
  payload: ChatWorkflowActionPayload,
) {
  const sessionId = payload.sessionId ?? chatSessions.createSession(payload.repoPath, payload.projectLinkId);
  const bubbles = await chatSessions.getBubbles(sessionId).catch(() => []);
  const artifact = latestValidationFailureArtifact(bubbles);
  const inspection = validationFailureInspectionFromArtifact(artifact);
  const tool = {
    name: "validation_failure_artifact",
    command: "internal validation_failure_artifact",
    ok: Boolean(artifact),
    stdout: JSON.stringify(inspection),
    stderr: artifact ? "" : "No validation failure artifact found in this chat session.",
    returncode: artifact ? 0 : 1,
  };
  return {
    ok: Boolean(artifact),
    action: payload.action,
    repoPath: payload.repoPath,
    sessionId,
    summary: validationFailureSummary(inspection),
    workflowState: {
      status: artifact ? "done" as const : "failed" as const,
      currentStep: artifact ? "inspect_validation_failure complete" : "No validation failure artifact found",
      completedTools: artifact ? [tool.name] : [],
      workflowKind: "ci" as const,
      workflowPhase: artifact ? "validation_failure_inspected" : "validation_failure_missing",
    },
    tools: [tool],
  };
}

interface ValidationFailureArtifactLike {
  artifactId?: string;
  title?: string;
  artifactType?: string;
  status?: string;
  content?: string;
}

interface ValidationFailureInspection {
  artifactId: string;
  title: string;
  framework: string;
  failingFiles: string[];
  candidateReruns: string[];
  diagnostics: string[];
  found: boolean;
}

interface PipelineFailureInspection {
  artifactId: string;
  title: string;
  failedRecords: string[];
  logExcerpts: string[];
  candidateActions: string[];
  found: boolean;
}

interface CiRecoveryContextInspection {
  validation: ValidationFailureInspection;
  pipeline: PipelineFailureInspection;
}

interface SourceContextDocument {
  title: string;
  file: string;
  line?: number;
  snippet?: string;
}

interface SourceContextUrl {
  title: string;
  url: string;
  domain?: string;
  snippet?: string;
}

interface SourceContextInspection {
  documents: SourceContextDocument[];
  urls: SourceContextUrl[];
  found: boolean;
}

interface ArchitectureContextInspection {
  contextSummary: string;
  repoSummary: string;
  projectLink?: {
    targetBranch?: string;
    buildCommand?: string;
    testCommand?: string;
    pipelineName?: string;
  };
  projectStructure: Array<{ path: string; kind: string; reason: string }>;
  relevantChunks: Array<{ path: string; startLine: number; endLine: number; reason: string; text: string }>;
  sources: ReturnType<typeof chatContextSources>;
  found: boolean;
}

async function runCiRecoveryContextInspection(
  chatSessions: ChatSessionManager,
  payload: ChatWorkflowActionPayload,
) {
  const sessionId = payload.sessionId ?? chatSessions.createSession(payload.repoPath, payload.projectLinkId);
  const bubbles = await chatSessions.getBubbles(sessionId).catch(() => []);
  const validationArtifact = latestValidationFailureArtifact(bubbles);
  const pipelineArtifact = latestPipelineFailureArtifact(bubbles);
  const inspection: CiRecoveryContextInspection = {
    validation: validationFailureInspectionFromArtifact(validationArtifact),
    pipeline: pipelineFailureInspectionFromArtifact(pipelineArtifact),
  };
  const hasEvidence = inspection.validation.found || inspection.pipeline.found;
  const tools = [
    {
      name: "validation_failure_artifact",
      command: "internal validation_failure_artifact",
      ok: inspection.validation.found,
      stdout: JSON.stringify(inspection.validation),
      stderr: inspection.validation.found ? "" : "No validation failure artifact found in this chat session.",
      returncode: inspection.validation.found ? 0 : 1,
    },
    {
      name: "pipeline_failure_artifact",
      command: "internal pipeline_failure_artifact",
      ok: inspection.pipeline.found,
      stdout: JSON.stringify(inspection.pipeline),
      stderr: inspection.pipeline.found ? "" : "No pipeline failure artifact found in this chat session.",
      returncode: inspection.pipeline.found ? 0 : 1,
    },
  ];
  return {
    ok: hasEvidence,
    action: payload.action,
    repoPath: payload.repoPath,
    sessionId,
    summary: ciRecoveryContextSummary(inspection),
    workflowState: {
      status: hasEvidence ? "done" as const : "failed" as const,
      currentStep: hasEvidence ? "inspect_ci_recovery_context complete" : "No CI recovery evidence found",
      completedTools: tools.filter((tool) => tool.ok).map((tool) => tool.name),
      workflowKind: "ci" as const,
      workflowPhase: hasEvidence ? "ci_recovery_context_inspected" : "ci_recovery_context_missing",
    },
    tools,
  };
}

function latestValidationFailureArtifact(bubbles: Array<{
  role?: string;
  artifacts?: ValidationFailureArtifactLike[];
}>): ValidationFailureArtifactLike | undefined {
  return [...bubbles]
    .reverse()
    .flatMap((bubble) => bubble.role === "assistant" ? bubble.artifacts ?? [] : [])
    .find((artifact) =>
      artifact.artifactType === "markdown" &&
      artifact.status === "error" &&
      Boolean(artifact.artifactId?.startsWith("validation-"))
    );
}

function latestPipelineFailureArtifact(bubbles: Array<{
  role?: string;
  artifacts?: ValidationFailureArtifactLike[];
}>): ValidationFailureArtifactLike | undefined {
  return [...bubbles]
    .reverse()
    .flatMap((bubble) => bubble.role === "assistant" ? bubble.artifacts ?? [] : [])
    .find((artifact) =>
      artifact.artifactType === "markdown" &&
      artifact.status === "error" &&
      Boolean(artifact.artifactId?.startsWith("pipeline-"))
    );
}

async function runSourceContextInspection(
  chatSessions: ChatSessionManager,
  payload: ChatWorkflowActionPayload,
) {
  const sessionId = payload.sessionId ?? chatSessions.createSession(payload.repoPath, payload.projectLinkId);
  const bubbles = await chatSessions.getBubbles(sessionId).catch(() => []);
  const inspection = sourceContextInspectionFromBubbles(bubbles);
  const summary = sourceContextSummary(inspection);
  const tool = {
    name: "source_context",
    command: "internal source_context",
    ok: inspection.found,
    stdout: summary,
    stderr: inspection.found ? "" : "No source references found in this chat session.",
    returncode: inspection.found ? 0 : 1,
  };
  return {
    ok: inspection.found,
    action: payload.action,
    repoPath: payload.repoPath,
    sessionId,
    summary,
    workflowState: {
      status: inspection.found ? "done" as const : "failed" as const,
      currentStep: inspection.found ? "inspect_source_context complete" : "No source context found",
      completedTools: inspection.found ? [tool.name] : [],
      workflowKind: "git" as const,
      workflowPhase: inspection.found ? "source_context_inspected" : "source_context_missing",
    },
    tools: [tool],
  };
}

async function runArchitectureContextInspection(
  chatSessions: ChatSessionManager,
  payload: ChatWorkflowActionPayload,
) {
  const sessionId = payload.sessionId ?? chatSessions.createSession(payload.repoPath, payload.projectLinkId);
  const message = [
    "Explain architecture",
    "Trace request flow",
    "List entry points",
    "Explain data model",
    "Find test surface",
  ].join("\n");
  const bundle = await buildChatContext({
    repoPath: payload.repoPath,
    message,
    llm: new LLMClient(),
    projectLink: inlineProjectLinkToChatContextProjectLink(payload.projectLink),
    maxChunks: 8,
  });
  const inspection = architectureContextInspectionFromBundle(bundle);
  const summary = architectureContextSummary(inspection);
  const tool = {
    name: "repository_context",
    command: "internal repository_context",
    ok: inspection.found,
    stdout: summary,
    stderr: inspection.found ? "" : "No repository context could be inspected for this Project Link.",
    returncode: inspection.found ? 0 : 1,
  };
  return {
    ok: inspection.found,
    action: payload.action,
    repoPath: payload.repoPath,
    sessionId,
    summary,
    workflowState: {
      status: inspection.found ? "done" as const : "failed" as const,
      currentStep: inspection.found ? "inspect_architecture_context complete" : "No architecture context found",
      completedTools: inspection.found ? [tool.name] : [],
      workflowKind: "git" as const,
      workflowPhase: inspection.found ? "architecture_context_inspected" : "architecture_context_missing",
    },
    tools: [tool],
  };
}

async function runAdoAuthContextInspection(
  chatSessions: ChatSessionManager,
  payload: ChatWorkflowActionPayload,
) {
  const sessionId = payload.sessionId ?? chatSessions.createSession(payload.repoPath, payload.projectLinkId);
  const projectLink = payload.projectLink;
  const authMode = projectLink?.adoPat ? "pat" as const : "oauth" as const;
  const missingMapping = adoMappingMissing(projectLink);
  let authAvailable = false;
  let authMessage = "";
  let authStatus: "ok" | ReturnType<typeof adoAuthDiagnosticFromError>["status"] = "ok";
  try {
    const auth = await getAzureDevOpsAuth(projectLink?.adoPat);
    authAvailable = true;
    authMessage = `Azure DevOps credentials are available through ${auth.mode.toUpperCase()}.`;
  } catch (err) {
    const diagnostic = adoAuthDiagnosticFromError(err, authMode);
    authStatus = diagnostic.status;
    authMessage = diagnostic.message;
  }
  const ok = authAvailable && !missingMapping;
  const summary = adoAuthContextSummary({
    authAvailable,
    authMode,
    authStatus,
    authMessage,
    missingMapping,
    orgUrl: projectLink?.adoOrgUrl ?? "",
    project: projectLink?.adoProject ?? "",
    repository: projectLink?.adoRepoName ?? "",
  });
  const tool = {
    name: "ado_auth_context",
    command: "internal ado_auth_context",
    ok,
    stdout: summary,
    stderr: ok ? "" : authMessage || "Azure DevOps authentication or Project Link mapping is incomplete.",
    returncode: ok ? 0 : 1,
  };
  return {
    ok,
    action: payload.action,
    repoPath: payload.repoPath,
    sessionId,
    summary,
    authStatus,
    authMode,
    authMessage,
    workflowState: {
      status: ok ? "done" as const : "failed" as const,
      currentStep: ok ? "inspect_ado_auth_context complete" : "Azure DevOps auth context incomplete",
      completedTools: ok ? [tool.name] : [],
      workflowKind: "ado" as const,
      workflowPhase: ok ? "auth_context_ready" : "auth_context_missing",
      authStatus,
      authMode,
      authMessage,
      retryable: !projectLink?.adoPat,
    },
    tools: [tool],
  };
}

async function runPrPlanContextInspection(payload: ChatWorkflowActionPayload) {
  const { tools, failed } = await runGitWorkflowProbes(payload.repoPath, payload.action, {
    isRecoveryAction: isGitRecoveryWorkflowAction,
  });
  const currentBranch = tools.find((tool) => tool.name === "git_current_branch")?.stdout.trim() || "";
  const statusText = tools.find((tool) => tool.name === "git_status")?.stdout.trim() || "";
  const latestSubject = tools.find((tool) => tool.name === "git_log_subject" && tool.ok)?.stdout.trim() || "";
  const pushReadiness = pushReadinessFromTools(tools);
  const prPreflight = prPreflightFromPayload(payload, currentBranch, statusText, latestSubject);
  const summary = prPlanContextSummary({
    currentBranch,
    statusText,
    pushReadiness,
    prPreflight,
    failedTool: failed?.name,
  });
  const ok = !failed;
  return {
    ok,
    action: payload.action,
    repoPath: payload.repoPath,
    sessionId: payload.sessionId,
    summary,
    workflowState: {
      status: ok ? "done" as const : "failed" as const,
      currentStep: ok ? "inspect_pr_plan_context complete" : `${failed?.name ?? "PR plan context"} failed`,
      completedTools: tools.filter((tool) => tool.ok).map((tool) => tool.name),
      workflowKind: "pr" as const,
      workflowPhase: ok ? "pr_plan_context_inspected" : "pr_plan_context_failed",
    },
    tools,
  };
}

function prPlanContextSummary(args: {
  currentBranch: string;
  statusText: string;
  pushReadiness?: ReturnType<typeof pushReadinessFromTools>;
  prPreflight: ReturnType<typeof prPreflightFromPayload>;
  failedTool?: string;
}): string {
  const lines: string[] = ["PR plan context:"];
  if (args.currentBranch) lines.push(`- Source branch: ${args.currentBranch}`);
  if (args.prPreflight.targetBranch) lines.push(`- Target branch: ${args.prPreflight.targetBranch}`);
  if (args.prPreflight.project || args.prPreflight.repository) {
    lines.push(`- Azure DevOps target: ${[args.prPreflight.project, args.prPreflight.repository].filter(Boolean).join("/") || "missing"}`);
  }
  if (args.prPreflight.organization) lines.push(`- Organization: ${args.prPreflight.organization}`);
  if (args.prPreflight.title) lines.push(`- Proposed PR title: ${args.prPreflight.title}`);
  const dirtySummary = dirtyWorkingTreeSummary(args.statusText);
  lines.push(`- Working tree: ${dirtySummary || "clean"}`);
  if (args.pushReadiness?.summary) lines.push(`- Push readiness: ${args.pushReadiness.summary}`);
  lines.push(`- PR readiness: ${args.prPreflight.summary}`);
  if (args.failedTool) lines.push(`- Probe warning: ${args.failedTool} failed before the PR plan could be fully inspected.`);

  lines.push("", "Suggested sequence:");
  if (dirtySummary) {
    lines.push("- Review and commit local changes before expecting them in a PR.");
  }
  if (args.pushReadiness?.status === "behind" || args.pushReadiness?.status === "diverged") {
    lines.push("- Pull or rebase before pushing because the branch is behind or diverged.");
  }
  if (args.pushReadiness?.status === "no_upstream") {
    lines.push("- Push the branch with upstream tracking before opening the PR.");
  } else {
    lines.push("- Push committed branch updates when ready.");
  }
  if (args.prPreflight.status === "missing_ado_mapping") {
    lines.push("- Complete Project Link Azure DevOps organization, project, and repository mapping before creating the PR.");
  } else if (args.prPreflight.status === "dirty_worktree") {
    lines.push("- Create the PR after the working tree is committed and pushed.");
  } else if (args.prPreflight.status === "ready") {
    lines.push("- Create the PR after confirming the branch contains the intended commits.");
  } else {
    lines.push("- Resolve the PR readiness issue before creating the PR.");
  }
  lines.push("- Use explicit approval cards for any push or PR creation step.");
  return lines.join("\n");
}

function adoMappingMissing(projectLink: ChatWorkflowActionPayload["projectLink"]): boolean {
  if (!projectLink) return true;
  return !projectLink.adoOrgUrl || !projectLink.adoProject || !projectLink.adoRepoName;
}

function adoAuthContextSummary(args: {
  authAvailable: boolean;
  authMode: "oauth" | "pat";
  authStatus: string;
  authMessage: string;
  missingMapping: boolean;
  orgUrl: string;
  project: string;
  repository: string;
}): string {
  const lines = [
    "Azure DevOps auth context:",
    `- Auth mode: ${args.authMode.toUpperCase()}`,
    `- Credential state: ${args.authAvailable ? "available" : args.authStatus}`,
    `- Organization URL: ${args.orgUrl || "missing"}`,
    `- Project: ${args.project || "missing"}`,
    `- Repository: ${args.repository || "missing"}`,
  ];
  if (args.authMessage) lines.push(`- Detail: ${args.authMessage}`);
  if (args.missingMapping) {
    lines.push("- Project Link mapping is incomplete. Complete organization, project, and repository before Azure DevOps workflow actions can run.");
  }
  if (args.authAvailable && !args.missingMapping) {
    lines.push("- Ready for Azure DevOps read actions. Write actions still require their normal approval cards.");
  }
  if (!args.authAvailable && args.authMode === "oauth") {
    lines.push("- Sign in again and enable Azure DevOps OAuth consent before retrying the workflow.");
  }
  if (!args.authAvailable && args.authMode === "pat") {
    lines.push("- Verify the PAT value and required Azure DevOps scopes.");
  }
  return lines.join("\n");
}

function architectureContextInspectionFromBundle(bundle: ChatContextBundle): ArchitectureContextInspection {
  const projectStructure = bundle.projectStructure.slice(0, 12);
  const relevantChunks = bundle.relevantChunks.slice(0, 8).map((chunk) => ({
    path: chunk.path,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    reason: chunk.reason,
    text: compactSnippet(chunk.text, 220),
  }));
  return {
    contextSummary: describeChatContext(bundle),
    repoSummary: bundle.repoSummary ?? "",
    projectLink: bundle.projectLink
      ? {
          targetBranch: bundle.projectLink.targetBranch,
          buildCommand: bundle.projectLink.buildCommand,
          testCommand: bundle.projectLink.testCommand,
          pipelineName: bundle.projectLink.pipelineName,
        }
      : undefined,
    projectStructure,
    relevantChunks,
    sources: chatContextSources(bundle),
    found: Boolean(bundle.repoSummary || projectStructure.length > 0 || relevantChunks.length > 0),
  };
}

function architectureContextSummary(inspection: ArchitectureContextInspection): string {
  if (!inspection.found) return "No repository context could be inspected for this Project Link.";
  const lines: string[] = [
    "Architecture context prepared.",
  ];
  if (inspection.repoSummary) lines.push(`- ${inspection.repoSummary}`);
  if (
    inspection.projectLink?.targetBranch
    || inspection.projectLink?.buildCommand
    || inspection.projectLink?.testCommand
    || inspection.projectLink?.pipelineName
  ) {
    lines.push("", "Project Link settings:");
    if (inspection.projectLink.targetBranch) lines.push(`- Target branch: ${inspection.projectLink.targetBranch}`);
    if (inspection.projectLink.buildCommand) lines.push(`- Build command: ${inspection.projectLink.buildCommand}`);
    if (inspection.projectLink.testCommand) lines.push(`- Test command: ${inspection.projectLink.testCommand}`);
    if (inspection.projectLink.pipelineName) lines.push(`- Pipeline: ${inspection.projectLink.pipelineName}`);
  }
  if (inspection.projectStructure.length > 0) {
    lines.push("", "Project structure signals:");
    lines.push(...inspection.projectStructure.slice(0, 6).map((item) => `- ${item.path} (${item.kind}): ${item.reason}`));
  }
  if (inspection.relevantChunks.length > 0) {
    lines.push("", "Relevant code and docs:");
    lines.push(...inspection.relevantChunks.slice(0, 6).map((chunk) =>
      `- ${chunk.path}:${chunk.startLine}-${chunk.endLine} (${chunk.reason})`,
    ));
  }
  if (inspection.sources.length > 0) {
    lines.push("", "Inspectable sources:");
    lines.push(...inspection.sources.slice(0, 8).map((source) => {
      if (source.type === "source_document") {
        return `- ${source.line ? `${source.file}:${source.line}` : source.file ?? source.title}`;
      }
      return `- ${source.domain ? `${source.domain}: ` : ""}${source.title}`;
    }));
  }
  lines.push("", "Next: ask a focused question about a listed source to inspect its line-level evidence.");
  return lines.join("\n");
}

function sourceContextInspectionFromBubbles(bubbles: unknown[]): SourceContextInspection {
  const documents = new Map<string, SourceContextDocument>();
  const urls = new Map<string, SourceContextUrl>();

  for (const source of bubbles.flatMap(sourceLikesFromBubble)) {
    const type = stringValue(source.type);
    if (type === "source_document") {
      const file = stringValue(source.file) || stringValue(source.title);
      const title = stringValue(source.title) || file;
      if (!file && !title) continue;
      const key = `${file || title}:${numberValue(source.line) ?? ""}`;
      if (!documents.has(key)) {
        documents.set(key, {
          title: title || file,
          file: file || title,
          line: numberValue(source.line),
          snippet: stringValue(source.snippet),
        });
      }
    }
    if (type === "source_url") {
      const url = stringValue(source.url);
      const title = stringValue(source.title) || url;
      if (!url && !title) continue;
      const key = url || title;
      if (!urls.has(key)) {
        urls.set(key, {
          title: title || url,
          url,
          domain: stringValue(source.domain),
          snippet: stringValue(source.snippet),
        });
      }
    }
  }

  return {
    documents: [...documents.values()].slice(0, 12),
    urls: [...urls.values()].slice(0, 8),
    found: documents.size > 0 || urls.size > 0,
  };
}

function sourceLikesFromBubble(bubble: unknown): Array<Record<string, unknown>> {
  if (!bubble || typeof bubble !== "object") return [];
  const record = bubble as Record<string, unknown>;
  const meta = objectValue(record.meta);
  const candidates = [
    record.sources,
    meta?.sources,
    record.parts,
  ];
  return candidates.flatMap(sourceLikesFromCandidate);
}

function sourceLikesFromCandidate(candidate: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(candidate)) return [];
  return candidate.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const nestedSources = sourceLikesFromCandidate(record.sources);
    const type = stringValue(record.type);
    if (type === "source_document" || type === "source_url") return [record, ...nestedSources];
    return nestedSources;
  });
}

function sourceContextSummary(inspection: SourceContextInspection): string {
  if (!inspection.found) return "No source references were found in this chat session.";
  const lines: string[] = [
    `Source context: ${inspection.documents.length + inspection.urls.length} reference(s).`,
  ];
  if (inspection.documents.length > 0) {
    lines.push("", "Referenced files:");
    lines.push(...inspection.documents.map((doc) => {
      const location = doc.line ? `${doc.file}:${doc.line}` : doc.file;
      const snippet = compactSnippet(doc.snippet);
      return `- ${location}${doc.title && doc.title !== doc.file ? ` (${doc.title})` : ""}${snippet ? ` - ${snippet}` : ""}`;
    }));
  }
  if (inspection.urls.length > 0) {
    lines.push("", "External sources:");
    lines.push(...inspection.urls.map((source) => {
      const label = source.domain ? `${source.domain}: ${source.title}` : source.title;
      const snippet = compactSnippet(source.snippet);
      return `- ${label}${source.url ? ` (${source.url})` : ""}${snippet ? ` - ${snippet}` : ""}`;
    }));
  }
  lines.push("", "Suggested next reads:");
  lines.push("- Open a referenced file in the preview pane for line-level inspection.");
  lines.push("- Use a structured Git or Azure DevOps action when this source context maps to an actual workflow step.");
  return lines.join("\n");
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function compactSnippet(value: string | undefined, maxLength = 140): string {
  if (!value) return "";
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, Math.max(0, maxLength - 3))}...` : compact;
}

function validationFailureInspectionFromArtifact(
  artifact: ValidationFailureArtifactLike | undefined,
): ValidationFailureInspection {
  if (!artifact) {
    return {
      artifactId: "",
      title: "",
      framework: "",
      failingFiles: [],
      candidateReruns: [],
      diagnostics: [],
      found: false,
    };
  }
  const content = artifact.content ?? "";
  return {
    artifactId: artifact.artifactId ?? "",
    title: artifact.title ?? "Validation failure report",
    framework: firstInlineValue(content, "Framework"),
    failingFiles: inlineCodeValues(firstInlineValue(content, "Failing files")),
    candidateReruns: inlineCodeValues(firstInlineValue(content, "Candidate rerun")),
    diagnostics: validationDiagnosticLines(content),
    found: true,
  };
}

function validationFailureSummary(inspection: ValidationFailureInspection): string {
  if (!inspection.found) return "No validation failure artifact was found in this chat session.";
  const lines = [
    `Validation failure artifact: ${inspection.title || inspection.artifactId}`,
  ];
  if (inspection.artifactId) lines.push(`Artifact id: ${inspection.artifactId}`);
  if (inspection.framework) lines.push(`Framework: ${inspection.framework}`);
  if (inspection.failingFiles.length > 0) lines.push(`Failing files: ${inspection.failingFiles.join(", ")}`);
  if (inspection.candidateReruns.length > 0) lines.push(`Candidate rerun: ${inspection.candidateReruns.join(", ")}`);
  if (inspection.diagnostics.length > 0) {
    lines.push("Diagnostics:");
    lines.push(...inspection.diagnostics.slice(0, 6).map((line) => `- ${line}`));
  }
  return lines.join("\n");
}

function pipelineFailureInspectionFromArtifact(
  artifact: ValidationFailureArtifactLike | undefined,
): PipelineFailureInspection {
  if (!artifact) {
    return {
      artifactId: "",
      title: "",
      failedRecords: [],
      logExcerpts: [],
      candidateActions: [],
      found: false,
    };
  }
  const content = artifact.content ?? "";
  return {
    artifactId: artifact.artifactId ?? "",
    title: artifact.title ?? "Pipeline failure report",
    failedRecords: markdownListSection(content, "Failed timeline records"),
    logExcerpts: fencedCodeSectionLines(content, "Log excerpts"),
    candidateActions: markdownListSection(content, "Candidate next actions"),
    found: true,
  };
}

function ciRecoveryContextSummary(inspection: CiRecoveryContextInspection): string {
  const lines: string[] = [];
  if (inspection.validation.found) {
    lines.push(...validationFailureSummary(inspection.validation).split("\n"));
  }
  if (inspection.pipeline.found) {
    if (lines.length > 0) lines.push("");
    lines.push(`Pipeline failure artifact: ${inspection.pipeline.title || inspection.pipeline.artifactId}`);
    if (inspection.pipeline.artifactId) lines.push(`Artifact id: ${inspection.pipeline.artifactId}`);
    if (inspection.pipeline.failedRecords.length > 0) {
      lines.push("Failed timeline records:");
      lines.push(...inspection.pipeline.failedRecords.slice(0, 5).map((line) => `- ${line}`));
    }
    if (inspection.pipeline.logExcerpts.length > 0) {
      lines.push("Log excerpts:");
      lines.push(...inspection.pipeline.logExcerpts.slice(0, 6).map((line) => `- ${line}`));
    }
    if (inspection.pipeline.candidateActions.length > 0) {
      lines.push("Candidate next actions:");
      lines.push(...inspection.pipeline.candidateActions.slice(0, 5).map((line) => `- ${line}`));
    }
  }
  if (lines.length === 0) return "No validation or pipeline failure artifact was found in this chat session.";
  lines.push("");
  lines.push("Suggested structured checks:");
  lines.push("- Check PR risks for readiness blockers.");
  lines.push("- Check policy status if Azure DevOps reports failed or pending policies.");
  lines.push("- List linked work items when readiness requires traceability.");
  lines.push("- Rerun focused validation or the configured pipeline only after choosing the recovery path.");
  return lines.join("\n");
}

function markdownListSection(content: string, heading: string): string[] {
  const section = markdownSection(content, heading);
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function fencedCodeSectionLines(content: string, heading: string): string[] {
  const section = markdownSection(content, heading);
  const fenced = section.match(/```(?:[a-zA-Z0-9_-]+)?\r?\n([\s\S]*?)```/);
  const raw = fenced?.[1] ?? section;
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function markdownSection(content: string, heading: string): string {
  const escapedHeading = escapeRegExp(heading);
  const pattern = new RegExp(`^##\\s+${escapedHeading}\\s*$([\\s\\S]*?)(?=^##\\s+|$(?![\\s\\S]))`, "im");
  return content.match(pattern)?.[1] ?? "";
}

function firstInlineValue(content: string, label: string): string {
  const pattern = new RegExp(`^-\\s*${escapeRegExp(label)}:\\s*(.+)$`, "im");
  return content.match(pattern)?.[1]?.trim() ?? "";
}

function inlineCodeValues(value: string): string[] {
  const matches = [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1]?.trim()).filter(Boolean) as string[];
  if (matches.length > 0) return matches;
  return value ? [value.replace(/^[-:]\s*/, "").trim()].filter(Boolean) : [];
}

function validationDiagnosticLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /\b(FAIL|FAILED|AssertionError|Error:|error\s+[A-Z0-9]+|Expected|expected)\b/.test(line))
    .map((line) => line.replace(/^[-*]\s*/, ""))
    .slice(0, 8);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
