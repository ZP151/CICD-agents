import type { FastifyInstance } from "fastify";
import { z } from "zod";

export const InlineProjectLinkSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  repoPath: z.string().default(""),
  defaultBranch: z.string().default("main"),
  targetBranch: z.string().default("main"),
  adoOrgUrl: z.string().default(""),
  adoProject: z.string().default(""),
  adoRepoName: z.string().default(""),
  adoPat: z.string().default(""),
  adoPipelineId: z.string().default(""),
  adoPipelineName: z.string().default(""),
  adoMcpEnabled: z.coerce.boolean().default(false),
  adoMcpCommand: z.string().default(""),
  adoMcpAuthentication: z.string().default(""),
  adoMcpDomains: z.string().default("repositories,pipelines,work-items"),
  projectTemplate: z.string().default(""),
  buildCommand: z.string().default(""),
  testCommand: z.string().default(""),
  ignoredGlobs: z.array(z.string()).default([]),
}).optional();

export const ChatWorkflowActionSchema = z.object({
  action: z.enum([
    "inspect_environment",
    "inspect_changes",
    "inspect_staged_changes",
    "draft_commit_message",
    "explain_change_scope",
    "refresh_branch",
    "inspect_remote_target",
    "inspect_latest_commit",
    "fetch_remotes",
    "inspect_validation_failure",
    "inspect_ci_recovery_context",
    "inspect_source_context",
    "inspect_architecture_context",
    "inspect_ado_auth_context",
    "inspect_pr_plan_context",
    "checkout_branch",
    "create_branch",
    "sync_branch_rebase",
    "push_branch",
    "prepare_commit",
    "run_tests",
    "run_build",
    "stage_resolved_conflicts",
    "continue_rebase",
    "abort_rebase",
    "skip_rebase",
    "continue_merge",
    "abort_merge",
    "continue_cherry_pick",
    "abort_cherry_pick",
    "skip_cherry_pick",
    "continue_revert",
    "abort_revert",
    "skip_revert",
    "create_pr",
    "inspect_pr_insight",
    "check_pr_policy",
    "list_pr_work_items",
    "link_work_item",
    "inspect_pipeline",
    "trigger_pipeline",
  ]),
  repoPath: z.string().min(1),
  sessionId: z.string().optional(),
  projectLinkId: z.string().optional(),
  pullRequestId: z.coerce.number().int().positive().optional(),
  workItemId: z.coerce.number().int().positive().optional(),
  branch: z.string().optional(),
  targetBranch: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  draft: z.coerce.boolean().default(false),
  message: z.string().optional(),
  paths: z.array(z.string()).default([]),
  includeUnstaged: z.coerce.boolean().default(true),
  commitMode: z.enum(["commit", "commit-push"]).optional(),
  validationTool: z.enum(["npm_test", "npm_build", "pytest_run", "dotnet_test", "dotnet_build"]).optional(),
  validationScript: z.string().optional(),
  validationArgs: z.array(z.string()).default([]),
  pipelineId: z.coerce.number().int().positive().optional(),
  projectLink: InlineProjectLinkSchema,
});

export type ChatWorkflowActionPayload = z.infer<typeof ChatWorkflowActionSchema>;

export interface ChatWorkflowFailureResponse {
  httpStatus: number;
  body: unknown;
}

interface ChatWorkflowRouteDependencies {
  runWorkflowAction(payload: ChatWorkflowActionPayload): Promise<unknown>;
  failureResponse(payload: ChatWorkflowActionPayload, err: unknown): ChatWorkflowFailureResponse;
}

export function projectLinkIdFromWorkflowActionPayload(payload: {
  projectLinkId?: string;
}): string | undefined {
  return payload.projectLinkId;
}

export function projectLinkFromWorkflowActionPayload(
  payload: ChatWorkflowActionPayload,
): ChatWorkflowActionPayload["projectLink"] {
  return payload.projectLink;
}

export function registerChatWorkflowRoutes(
  app: FastifyInstance,
  { runWorkflowAction, failureResponse }: ChatWorkflowRouteDependencies,
): void {
  app.post("/chat/workflow-action", async (req, reply) => {
    const parsed = ChatWorkflowActionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const projectLinkId = projectLinkIdFromWorkflowActionPayload(parsed.data);
    const projectLink = projectLinkFromWorkflowActionPayload(parsed.data);
    const payload = {
      ...parsed.data,
      projectLink,
    };
    try {
      return await runWorkflowAction(payload);
    } catch (err) {
      const failure = failureResponse(payload, err);
      return reply.code(failure.httpStatus).send(failure.body);
    }
  });
}
