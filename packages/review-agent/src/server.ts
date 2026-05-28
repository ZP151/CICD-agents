import "dotenv/config";
import Fastify, { type FastifyInstance } from "fastify";
import { loadConfig, type ReviewAgentConfig } from "./config.js";
import { AdoPrEventSchema, eventKey } from "./webhook.js";
import { verifyBasicSecret, verifyHmacSha256 } from "./signature.js";
import { IdempotentQueue } from "./queue.js";
import { AdoClient } from "./adoClient.js";
import { ReviewService } from "./reviewService.js";
import { InMemoryStateStore, TableStateStore, type StateStore } from "./stateStore.js";
import { defaultSecretProvider } from "./secrets.js";

export interface BuildOptions {
  config?: ReviewAgentConfig;
  state?: StateStore;
  reviewService?: ReviewService;
}

export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const config = opts.config ?? loadConfig();
  const app = Fastify({ logger: true });

  let service = opts.reviewService;
  if (!service) {
    const state = opts.state ?? (await pickState(config));
    let spnSecret = config.servicePrincipalSecret;
    if (!spnSecret && config.keyVaultName) {
      try {
        spnSecret = await defaultSecretProvider(config.keyVaultName).get("ado-spn-secret");
      } catch (err) {
        app.log.warn({ err }, "Key Vault unavailable; falling back to env");
      }
    }
    const ado = new AdoClient({
      organization: config.azureDevOpsOrg,
      spn: spnSecret
        ? {
            tenantId: config.servicePrincipalTenantId,
            clientId: config.servicePrincipalClientId,
            clientSecret: spnSecret,
          }
        : undefined,
    });
    service = new ReviewService({
      ado,
      state,
      maxFilesPerPr: config.reviewMaxFilesPerPr,
      autoApprovalPolicy: {
        enabled: config.reviewAutoApproveEnabled,
        reviewerId: config.reviewAutoApproveReviewerId,
        maxChangedFiles: config.reviewAutoApproveMaxChangedFiles,
        allowedTargetBranches: config.reviewAutoApproveTargetBranches,
        sensitivePathPatterns: config.reviewAutoApproveSensitivePaths,
      },
      log: app.log,
    });
  }

  const queue = new IdempotentQueue<{ key: string; raw: unknown }>(async (job) => {
    const parsed = AdoPrEventSchema.safeParse(job.payload.raw);
    if (!parsed.success) {
      app.log.warn({ key: job.key }, "dropping invalid PR webhook payload");
      return;
    }
    try {
      const result = await service!.handle(parsed.data);
      app.log.info({ key: job.key, status: result.status, findings: result.findings, decision: result.decision }, "review handled");
    } catch (err) {
      app.log.error({ err, key: job.key }, "review handler failed");
    }
  });
  void queue.start();

  app.addHook("onClose", async () => {
    queue.stop();
  });

  app.get("/healthz", async () => ({ ok: true }));

  app.post("/webhooks/ado/pr", async (req, reply) => {
    const raw = (req.body ?? {}) as { eventType?: unknown };
    const auth = req.headers["authorization"] as string | undefined;
    const hmac = req.headers["x-hub-signature-256"] as string | undefined;
    const okBasic = verifyBasicSecret(auth, config.webhookSecret);
    const okHmac = verifyHmacSha256(JSON.stringify(raw), hmac, config.webhookSecret);
    if (!okBasic && !okHmac) {
      return reply.code(401).send({ error: "invalid webhook signature" });
    }
    const parsed = AdoPrEventSchema.safeParse(raw);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    if (!parsed.data.eventType.startsWith("git.pullrequest")) {
      return reply.code(202).send({ status: "ignored", eventType: parsed.data.eventType });
    }
    const key = eventKey(parsed.data);
    const state = queue.enqueue({ key, payload: { key, raw } });
    return reply.code(202).send({ status: state, key });
  });

  return app;
}

async function pickState(config: ReviewAgentConfig): Promise<StateStore> {
  if (!config.tablesConnectionString) return new InMemoryStateStore();
  const store = new TableStateStore(config.tablesConnectionString);
  try {
    await store.ensureTables();
  } catch {
    // ignored: table may already exist
  }
  return store;
}

export async function startServer(): Promise<FastifyInstance> {
  const config = loadConfig();
  const app = await buildApp({ config });
  await app.listen({ host: config.host, port: config.port });
  return app;
}
