import Fastify, { type FastifyInstance } from "fastify";
import {
  getSettings,
  runPipelineTask,
  TaskQueue,
  type TaskRunner,
  KeyVaultSecrets,
  isAzureAuthenticationRequiredError,
} from "@mergepilot/core";
import { ChatSessionManager } from "./chatSession.js";
import { loadDaemonEnv, envSourceLabel } from "./daemonEnv.js";
import { injectGitPath } from "./gitPath.js";
import { buildEffectiveLlmSettings } from "./llmSettings.js";
import { createProjectLinkStoreAdapter } from "./projectLinkStore.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerChatWorkflowRoutes } from "./routes/chat-workflow.routes.js";
import { registerChatRoutes } from "./routes/chat.routes.js";
import { registerCheckpointRoutes } from "./routes/checkpoints.routes.js";
import { registerDaemonConfigRoutes } from "./routes/daemon-config.routes.js";
import { registerGitRoutes } from "./routes/git.routes.js";
import { registerHealthRoutes } from "./routes/health.routes.js";
import { registerPipelineRoutes } from "./routes/pipelines.routes.js";
import { registerProjectLinkRoutes } from "./routes/project-links.routes.js";
import { registerPullRequestRoutes } from "./routes/pull-requests.routes.js";
import { registerReviewRunRoutes } from "./routes/review-run.routes.js";
import { registerReviewRoutes } from "./routes/review.routes.js";
import { registerTaskRoutes } from "./routes/tasks.routes.js";
import { workflowActionFailureResponse } from "./workflows/workflowActions.js";
import { runWorkspaceWorkflowAction } from "./workflows/workspaceWorkflowRunner.js";

loadDaemonEnv();

export { workflowActionFailureResponse } from "./workflows/workflowActions.js";

export interface BuildAppOptions {
  /** Override the task runner. Defaults to runPipelineTask. */
  runner?: TaskRunner;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const settings = getSettings();
  const app = Fastify({
    logger: { level: settings.runtimeLogLevel.toLowerCase() },
  });

  const projectLinkStore = createProjectLinkStoreAdapter(settings);

  // If AOAI key was stored as a KV sentinel on a previous Apply, resolve it now
  // so LLM calls work without a restart.
  if (
    settings.azureKeyVaultUrl &&
    (process.env["AZURE_OPENAI_API_KEY"] ?? "").startsWith("kv://")
  ) {
    try {
      const kv = new KeyVaultSecrets(settings.azureKeyVaultUrl);
      const key = await kv.getAoaiKey();
      if (key) process.env["AZURE_OPENAI_API_KEY"] = key;
    } catch {
      // Non-fatal: if KV is unreachable at startup, leave the sentinel and retry next request
    }
  }

  // Allow cross-origin requests from the Tauri/Vite frontend
  app.addHook("onSend", async (req, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "content-type");
  });
  app.options("*", async (_req, reply) => reply.code(204).send());

  // Global Azure auth error handler: map 401/403 from Azure SDK into a structured
  // response the frontend can distinguish from generic server errors.
  app.setErrorHandler(async (error, _req, reply) => {
    const status = (error as { statusCode?: number }).statusCode
      ?? (error as { status?: number }).status;
    if (isAzureAuthenticationRequiredError(error) || status === 401 || status === 403) {
      return reply.code(401).send({
        error: "azure_auth_required",
        message: "Azure credential expired or missing. Please sign in again.",
      });
    }
    // Re-throw non-auth errors for Fastify's default handler
    reply.code(500).send({ error: error.message ?? "internal error" });
  });

  const queue = new TaskQueue(opts.runner ?? runPipelineTask);
  queue.start();
  const chatSessions = new ChatSessionManager();
  const startedAt = Date.now();

  app.addHook("onClose", async () => {
    await queue.stop();
  });

  registerHealthRoutes(app, { settings, startedAt, envSourceLabel });

  registerAuthRoutes(app, { settings });

  registerGitRoutes(app);

  registerDaemonConfigRoutes(app, { settings, buildInlineLlmSettings: buildEffectiveLlmSettings });

  registerTaskRoutes(app, { queue });

  registerPipelineRoutes(app, { queue });

  registerProjectLinkRoutes(app, { projectLinkStore });

  registerPullRequestRoutes(app, { projectLinkStore, buildReviewLlmSettings: buildEffectiveLlmSettings });

  registerReviewRoutes(app, { settings, projectLinkStore });

  registerReviewRunRoutes(app, {
    settings,
    projectLinkStore,
    buildReviewLlmSettings: buildEffectiveLlmSettings,
  });

  registerChatRoutes(app, {
    settings,
    chatSessions,
    buildInlineLlmSettings: buildEffectiveLlmSettings,
    envSourceLabel,
  });

  registerCheckpointRoutes(app, { settings, chatSessions });

  registerChatWorkflowRoutes(app, {
    runWorkflowAction: (payload) => runWorkspaceWorkflowAction(chatSessions, payload),
    failureResponse: workflowActionFailureResponse,
  });

  app.post("/shutdown", async () => {
    setTimeout(() => {
      process.exit(0);
    }, 250);
    return { ok: true, message: "shutting down" };
  });

  return app;
}

export async function startServer(): Promise<FastifyInstance> {
  injectGitPath();
  const settings = getSettings();
  const app = await buildApp();
  await app.listen({ host: settings.runtimeHost, port: settings.runtimePort });
  return app;
}
