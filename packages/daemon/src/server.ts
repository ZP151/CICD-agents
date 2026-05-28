import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import nodePath from "node:path";
import nodeFs from "node:fs";
import nodeOs from "node:os";

// Resolve .env in priority order:
//   1. CICD_AGENT_ENV_FILE env var (explicit override)
//   2. ~/.cicd-agent/.env  (production / after installer)
//   3. <cwd>/.env          (docker / manual)
//   4. monorepo root       (development)
(function loadEnv() {
  const candidates = [
    process.env.CICD_AGENT_ENV_FILE,
    nodePath.join(nodeOs.homedir(), ".cicd-agent", ".env"),
    nodePath.join(process.cwd(), ".env"),
    // Development: walk up from packages/daemon/src to repo root
    (() => {
      try {
        return nodePath.resolve(fileURLToPath(import.meta.url), "../../../../.env");
      } catch {
        return null;
      }
    })(),
  ].filter((p): p is string => typeof p === "string");

  for (const p of candidates) {
    if (nodeFs.existsSync(p)) {
      dotenv.config({ path: p });
      break;
    }
  }
})();
import Fastify, { type FastifyInstance } from "fastify";
import {
  getSettings,
  runPipelineTask,
  TaskQueue,
  type TaskRunner,
  type TaskView,
  listWorkspaceProfiles,
  getWorkspaceProfile,
  createWorkspaceProfile,
  updateWorkspaceProfile,
  deleteWorkspaceProfile,
  type WorkspaceProfileInput,
  listAzurePullRequests,
  listAzurePipelineRuns,
  listReviewQueueItems,
  AzureTableProfileStore,
  KeyVaultSecrets,
  getCurrentUser,
  isAzureAuthAvailable,
  persistUserCache,
  loadPersistedUser,
  clearPersistedUser,
  resetUserCache,
  runCommand,
} from "@cicd-agent/core";
import { spawn, spawnSync } from "node:child_process";
import { SubmitPipelineSchema, TaskIdParam } from "./schemas.js";
import { ChatSessionManager, type InlineLlmConfig, type InlineProfile } from "./chatSession.js";
import { z } from "zod";

export interface BuildAppOptions {
  /** Override the task runner. Defaults to runPipelineTask. */
  runner?: TaskRunner;
}

// Inline LLM config sent from the frontend Settings page (localStorage).
// All fields are optional — missing ones fall back to env / .env defaults.
const LlmConfigSchema = z.object({
  llmProvider:     z.enum(["azure", "openai"]).optional(),
  azureEndpoint:   z.string().optional(),
  azureApiKey:     z.string().optional(),
  azureDeployment: z.string().optional(),
  azureApiVersion: z.string().optional(),
  openaiApiKey:    z.string().optional(),
  openaiModel:     z.string().optional(),
}).optional();

// Inline profile data sent from the frontend Profiles page (localStorage).
// Skips the daemon-side DB lookup entirely.
const InlineProfileSchema = z.object({
  id:              z.string().optional(),
  name:            z.string().optional(),
  repoPath:        z.string().default(""),
  defaultBranch:   z.string().default("main"),
  targetBranch:    z.string().default("main"),
  adoOrgUrl:       z.string().default(""),
  adoProject:      z.string().default(""),
  adoRepoName:     z.string().default(""),
  adoPat:          z.string().default(""),
  adoPipelineId:   z.string().default(""),
  adoPipelineName: z.string().default(""),
  templateProfile: z.string().default(""),
  buildCommand:    z.string().default(""),
  testCommand:     z.string().default(""),
}).optional();


const ChatStartSchema = z.object({
  message:   z.string().min(1),
  repoPath:  z.string().default(process.cwd()),
  sessionId: z.string().optional(),
  profileId: z.string().optional(),  // kept for backwards compat; ignored when profile is provided
  llmConfig: LlmConfigSchema,        // inline LLM config from localStorage Settings
  profile:   InlineProfileSchema,    // inline profile data from localStorage Profiles
});
const SessionIdParam = z.object({ sessionId: z.string().min(1) });
const ProfileIdParam = z.object({ id: z.string().min(1) });
const ProfileBodySchema = z.object({
  name: z.string().min(1),
  repoPath: z.string().default(""),
  defaultBranch: z.string().default("main"),
  targetBranch: z.string().default("main"),
  adoOrgUrl: z.string().default(""),
  adoProject: z.string().default(""),
  adoRepoName: z.string().default(""),
  adoPat: z.string().default(""),
  adoPipelineId: z.string().default(""),
  adoPipelineName: z.string().default(""),
  templateProfile: z.string().default(""),
  buildCommand: z.string().default(""),
  testCommand: z.string().default(""),
});

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const settings = getSettings();
  const app = Fastify({
    logger: { level: settings.runtimeLogLevel.toLowerCase() },
  });

  // Lazy store getters — re-evaluated on every request so hot-reloaded settings
  // (after /daemon/configure) are always reflected without a daemon restart.
  let _tableCache: { url: string; store: AzureTableProfileStore } | null = null;
  const getTableStore = (): AzureTableProfileStore | null => {
    const url = settings.azureStorageAccount;
    if (!url) return null;
    if (_tableCache?.url !== url) _tableCache = { url, store: new AzureTableProfileStore(url) };
    return _tableCache.store;
  };

  let _kvCache: { url: string; kv: KeyVaultSecrets } | null = null;
  const getKvSecrets = (): KeyVaultSecrets | null => {
    const url = settings.azureKeyVaultUrl;
    if (!url) return null;
    if (_kvCache?.url !== url) _kvCache = { url, kv: new KeyVaultSecrets(url) };
    return _kvCache.kv;
  };

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
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "content-type");
  });
  app.options("*", async (_req, reply) => reply.code(204).send());

  // Global Azure auth error handler: map 401/403 from Azure SDK into a structured
  // response the frontend can distinguish from generic server errors.
  app.setErrorHandler(async (error, _req, reply) => {
    const status = (error as { statusCode?: number }).statusCode
      ?? (error as { status?: number }).status;
    if (status === 401 || status === 403) {
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

  app.get("/healthz", async () => ({
    ok: true,
    version: process.env.npm_package_version ?? "0.1.0",
    uptimeSec: (Date.now() - startedAt) / 1000,
    llmConfigured: settings.llmConfigured,
    // Read live settings values so Apply in the UI is reflected immediately
    cloudProfileStore: !!(settings.azureStorageAccount),
    cloudSecrets:      !!(settings.azureKeyVaultUrl),
    cloudSessions:     !!(settings.azureCosmosEndpoint),
  }));

  // ── /auth/status — instant cached user (no Azure round-trip) ────────────────
  app.get("/auth/status", async () => {
    const cached = loadPersistedUser(settings.dataDir);
    if (cached && cached.oid !== "anonymous") {
      return { authenticated: true, oid: cached.oid, upn: cached.upn, name: cached.name, fromCache: true };
    }
    return { authenticated: false, fromCache: true };
  });

  // ── /auth/me — resolve live Azure user identity and persist result ───────────
  app.get("/auth/me", async (_req, reply) => {
    const available = await isAzureAuthAvailable();
    if (!available) {
      return reply.code(200).send({
        authenticated: false,
        message: "No Azure credential found. Run `az login` (or use the Sign-in button) to enable cloud persistence.",
      });
    }
    const user = await getCurrentUser();
    // Persist so /auth/status is instant next time
    persistUserCache(user, settings.dataDir);
    return {
      authenticated: true,
      oid:  user.oid,
      upn:  user.upn,
      name: user.name,
    };
  });

  // ── /auth/login — spawn `az login` and stream output via SSE ────────────────
  // Streams lines from the az subprocess until it exits, then resolves user.
  app.post("/auth/login", async (req, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");
    reply.raw.flushHeaders();

    const send = (event: string, data: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    return new Promise<void>((resolve) => {
      send("status", { message: "Starting az login…" });

      // Sidecar processes have no GUI access, so browser-based login cannot open
      // a window. --use-device-code shows a URL + code the user pastes manually.
      const proc = spawn("az", ["login", "--use-device-code"], {
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const emit = (line: string): void => {
        if (line.trim()) send("output", { line: line.trim() });
      };

      proc.stdout?.on("data", (chunk: Buffer) => {
        chunk.toString().split("\n").forEach(emit);
      });
      proc.stderr?.on("data", (chunk: Buffer) => {
        chunk.toString().split("\n").forEach(emit);
      });

      proc.on("close", async (code) => {
        if (code !== 0) {
          send("error", { message: `az login exited with code ${code}` });
          reply.raw.end();
          resolve();
          return;
        }
        // Refresh cached credential after successful login
        resetUserCache();
        const user = await getCurrentUser();
        persistUserCache(user, settings.dataDir);
        send("done", {
          authenticated: user.oid !== "anonymous",
          oid:  user.oid,
          upn:  user.upn,
          name: user.name,
        });
        reply.raw.end();
        resolve();
      });

      req.raw.on("close", () => {
        proc.kill();
        resolve();
      });
    });
  });

  // ── /auth/logout — run `az logout` and clear cache ───────────────────────────
  app.post("/auth/logout", async (_req, reply) => {
    return new Promise<void>((resolve) => {
      const proc = spawn("az", ["logout"], { shell: true, stdio: "ignore" });
      proc.on("close", () => {
        clearPersistedUser(settings.dataDir);
        resetUserCache();
        reply.send({ ok: true });
        resolve();
      });
    });
  });

  // ── /daemon/config — read current non-secret configuration ──────────────────
  // ── /git/branches — list local+remote branches for a given repo path ────────
  app.get("/git/branches", async (req, reply) => {
    const repoPath = (req.query as Record<string, string>)["repoPath"] ?? "";
    if (!repoPath) return reply.code(400).send({ error: "repoPath required" });
    try {
      // runCommand uses the PATH already enriched by injectGitPath() at startup,
      // and never spawns via shell so % characters are never misinterpreted.
      const result = await runCommand(["git", "branch", "-a"], {
        cwd: repoPath,
        allowed: ["git"],
        timeoutSec: 8,
      });
      if (result.returncode !== 0) {
        return reply.send({ branches: [], error: result.stderr?.trim() || `git exited ${result.returncode}` });
      }
      const stdout = result.stdout ?? "";
      const branches = stdout
        .split(/\r?\n/)
        .map((l) => {
          // Strip leading "* " (current branch marker) or spaces
          const trimmed = l.replace(/^\*?\s+/, "").trim();
          // Normalise remote tracking refs: "remotes/origin/main" → "main"
          if (trimmed.startsWith("remotes/")) {
            const afterRemotes = trimmed.slice("remotes/".length);
            const slashIdx = afterRemotes.indexOf("/");
            return slashIdx >= 0 ? afterRemotes.slice(slashIdx + 1) : afterRemotes;
          }
          return trimmed;
        })
        .filter((l) => l && !l.includes(" -> "))
        .filter((l, i, arr) => arr.indexOf(l) === i);
      return reply.send({ branches });
    } catch (err) {
      return reply.send({ branches: [], error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Returns everything the Settings UI needs to pre-fill its fields, but never
  // returns API keys, PATs, or other credentials.
  app.get("/daemon/config", async () => ({
    llmProvider:     process.env["AZURE_OPENAI_ENDPOINT"] ? "azure"
                   : process.env["OPENAI_API_KEY"]        ? "openai"
                   : "",
    azureDeployment:  process.env["AZURE_OPENAI_DEPLOYMENT"] ?? "",
    azureApiVersion:  process.env["AZURE_OPENAI_API_VERSION"] ?? "",
    azureEndpoint:    process.env["AZURE_OPENAI_ENDPOINT"] ?? "",
    openaiModel:      process.env["OPENAI_MODEL"] ?? "",
    // true when AOAI key is stored in Key Vault (value is a sentinel)
    aoaiKeyInVault:   (process.env["AZURE_OPENAI_API_KEY"] ?? "").startsWith("kv://"),
    // Azure cloud persistence — URLs are not secrets
    azureStorageAccount: settings.azureStorageAccount ?? "",
    azureKeyVaultUrl:    settings.azureKeyVaultUrl ?? "",
    azureCosmosEndpoint: settings.azureCosmosEndpoint ?? "",
  }));

  // ── /daemon/configure — persist LLM credentials and hot-reload settings ───
  // The frontend Settings page calls this so credentials survive daemon restarts
  // without users ever touching a .env file.
  const DaemonConfigureSchema = z.object({
    // LLM config
    llmProvider:     z.enum(["azure", "openai"]).optional(),
    azureEndpoint:   z.string().optional(),
    azureApiKey:     z.string().optional(),
    azureDeployment: z.string().optional(),
    azureApiVersion: z.string().optional(),
    openaiApiKey:    z.string().optional(),
    openaiModel:     z.string().optional(),
    // Azure cloud persistence config
    azureStorageAccount: z.string().optional(),
    azureKeyVaultUrl:    z.string().optional(),
    azureCosmosEndpoint: z.string().optional(),
  });

  app.post("/daemon/configure", async (req, reply) => {
    const parsed = DaemonConfigureSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const cfg = parsed.data;
    const envDir = nodePath.join(nodeOs.homedir(), ".cicd-agent");
    const envFile = nodePath.join(envDir, ".env");

    // Build env lines from provided (non-empty) values
    const lines: string[] = [];
    // Determine effective KV URL: either from the payload (new value) or existing settings
    const effectiveKvUrl = cfg.azureKeyVaultUrl ?? settings.azureKeyVaultUrl;

    if (cfg.llmProvider === "azure" || (!cfg.llmProvider && cfg.azureEndpoint)) {
      if (cfg.azureEndpoint)   lines.push(`AZURE_OPENAI_ENDPOINT=${cfg.azureEndpoint}`);
      if (cfg.azureDeployment) lines.push(`AZURE_OPENAI_DEPLOYMENT=${cfg.azureDeployment}`);
      if (cfg.azureApiVersion) lines.push(`AZURE_OPENAI_API_VERSION=${cfg.azureApiVersion}`);
      if (cfg.azureApiKey) {
        if (effectiveKvUrl) {
          // Store AOAI key in Key Vault instead of .env for better security
          try {
            const tempKv = new KeyVaultSecrets(effectiveKvUrl);
            await tempKv.setAoaiKey(cfg.azureApiKey);
            lines.push(`AZURE_OPENAI_API_KEY=kv://aoai-key`); // sentinel — key lives in KV
          } catch {
            // KV not ready yet (e.g. first Apply before az login) — fall back to .env
            lines.push(`AZURE_OPENAI_API_KEY=${cfg.azureApiKey}`);
          }
        } else {
          lines.push(`AZURE_OPENAI_API_KEY=${cfg.azureApiKey}`);
        }
      }
    } else if (cfg.llmProvider === "openai" || cfg.openaiApiKey) {
      if (cfg.openaiApiKey) lines.push(`OPENAI_API_KEY=${cfg.openaiApiKey}`);
      if (cfg.openaiModel)  lines.push(`OPENAI_MODEL=${cfg.openaiModel}`);
    }
    // Azure cloud persistence — write even if empty so the user can clear them
    if (cfg.azureStorageAccount !== undefined) lines.push(`AZURE_STORAGE_ACCOUNT=${cfg.azureStorageAccount}`);
    if (cfg.azureKeyVaultUrl    !== undefined) lines.push(`AZURE_KEYVAULT_URL=${cfg.azureKeyVaultUrl}`);
    if (cfg.azureCosmosEndpoint !== undefined) lines.push(`AZURE_COSMOS_ENDPOINT=${cfg.azureCosmosEndpoint}`);

    if (lines.length > 0) {
      // Merge with existing file: keep lines whose key we are NOT overwriting
      const newKeys = new Set(lines.map((l) => l.split("=")[0] ?? ""));
      let existing: string[] = [];
      if (nodeFs.existsSync(envFile)) {
        existing = nodeFs.readFileSync(envFile, "utf8")
          .split("\n")
          .filter((l) => {
            const key = (l.split("=")[0] ?? "").trim();
            return key && !newKeys.has(key);
          });
      }
      nodeFs.mkdirSync(envDir, { recursive: true });
      nodeFs.writeFileSync(envFile, [...existing, ...lines].join("\n") + "\n", "utf8");

      // Hot-reload: update process.env so new sessions pick up the new creds
      for (const line of lines) {
        const eqIdx = line.indexOf("=");
        if (eqIdx > 0) {
          process.env[line.slice(0, eqIdx)] = line.slice(eqIdx + 1);
        }
      }
    }

    // Re-evaluate llmConfigured from the freshly set env vars
    const isAzure = !!(process.env["AZURE_OPENAI_ENDPOINT"] && process.env["AZURE_OPENAI_API_KEY"]);
    const isOpenAI = !!process.env["OPENAI_API_KEY"];
    const nowConfigured = isAzure || isOpenAI;

    // Patch the live settings object so /healthz reflects the new state immediately
    (settings as Record<string, unknown>)["llmConfigured"] = nowConfigured;
    if (cfg.azureStorageAccount !== undefined)
      (settings as Record<string, unknown>)["azureStorageAccount"] = cfg.azureStorageAccount;
    if (cfg.azureKeyVaultUrl !== undefined)
      (settings as Record<string, unknown>)["azureKeyVaultUrl"] = cfg.azureKeyVaultUrl;
    if (cfg.azureCosmosEndpoint !== undefined)
      (settings as Record<string, unknown>)["azureCosmosEndpoint"] = cfg.azureCosmosEndpoint;

    const cloudStores = {
      cloudProfileStore: !!(settings.azureStorageAccount),
      cloudSecrets:      !!(settings.azureKeyVaultUrl),
      cloudSessions:     !!(settings.azureCosmosEndpoint),
    };

    return { ok: true, llmConfigured: nowConfigured, ...cloudStores };
  });

  app.post("/tasks/submit-pipeline", async (req, reply) => {
    const parsed = SubmitPipelineSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const taskId = queue.submit("submit-pipeline", parsed.data);
    return reply.code(202).send({ taskId, status: "queued" });
  });

  app.get("/tasks", async () => queue.list(50));

  app.get("/tasks/:taskId", async (req, reply) => {
    const parsed = TaskIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const view = queue.get(parsed.data.taskId);
    if (!view) return reply.code(404).send({ error: "task not found" });
    return view as TaskView;
  });

  app.get("/tasks/:taskId/events", async (req, reply) => {
    const parsed = TaskIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const taskId = parsed.data.taskId;
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");
    reply.raw.flushHeaders();

    const view = queue.get(taskId);
    if (!view) {
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: "task not found" })}\n\n`);
      reply.raw.end();
      return;
    }

    const send = (event: string, payload: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    // Replay existing steps.
    for (const step of view.steps) send("step", step);
    send("status", view.status);

    if (view.status === "succeeded" || view.status === "failed" || view.status === "cancelled") {
      send("done", { status: view.status, result: view.result, error: view.error });
      reply.raw.end();
      return;
    }

    const em = queue.emitterFor(taskId);
    if (!em) {
      reply.raw.end();
      return;
    }
    const onStep = (s: unknown) => send("step", s);
    const onStatus = (s: unknown) => send("status", s);
    const onDone = (s: unknown) => {
      send("done", s);
      cleanup();
      reply.raw.end();
    };
    const cleanup = (): void => {
      em.off("step", onStep);
      em.off("status", onStatus);
      em.off("done", onDone);
    };
    em.on("step", onStep);
    em.on("status", onStatus);
    em.on("done", onDone);
    req.raw.on("close", () => {
      cleanup();
    });
  });

  // ── Workspace profile endpoints ──────────────────────────────────────────────
  // Cloud-first: use AzureTableProfileStore when configured, else local JSON.
  // Key Vault integration: when kvSecrets is available, adoPat is transparently
  // stored in Key Vault and stripped/injected on read.

  async function resolveAdoPat(profileId: string, bodyPat: string): Promise<string> {
    const kv = getKvSecrets();
    if (kv && bodyPat) {
      await kv.setAdoPat(profileId, bodyPat);
      return "";
    }
    return bodyPat;
  }

  async function injectAdoPat<T extends { id: string; adoPat: string }>(profile: T): Promise<T> {
    const kv = getKvSecrets();
    if (kv) {
      const pat = await kv.getAdoPat(profile.id);
      return { ...profile, adoPat: pat ?? "" };
    }
    return profile;
  }

  app.get("/profiles", async () => {
    const ts = getTableStore();
    if (ts) {
      const profiles = await ts.list();
      return Promise.all(profiles.map(injectAdoPat));
    }
    return listWorkspaceProfiles(settings.dataDir);
  });

  app.get("/profiles/:id", async (req, reply) => {
    const parsed = ProfileIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const ts = getTableStore();
    if (ts) {
      const profile = await ts.get(parsed.data.id);
      if (!profile) return reply.code(404).send({ error: "profile not found" });
      return injectAdoPat(profile);
    }
    const profile = getWorkspaceProfile(settings.dataDir, parsed.data.id);
    if (!profile) return reply.code(404).send({ error: "profile not found" });
    return profile;
  });

  app.post("/profiles", async (req, reply) => {
    const parsed = ProfileBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const data = parsed.data as WorkspaceProfileInput;
    const ts = getTableStore();
    if (ts) {
      const safePat = await resolveAdoPat("__new__", data.adoPat);
      const profile = await ts.create({ ...data, adoPat: safePat });
      const kv = getKvSecrets();
      if (kv && parsed.data.adoPat) await kv.setAdoPat(profile.id, parsed.data.adoPat);
      return reply.code(201).send(await injectAdoPat(profile));
    }
    const profile = createWorkspaceProfile(settings.dataDir, data);
    return reply.code(201).send(profile);
  });

  app.put("/profiles/:id", async (req, reply) => {
    const paramParsed = ProfileIdParam.safeParse(req.params);
    if (!paramParsed.success) return reply.code(400).send({ error: "invalid id" });
    const bodyParsed = ProfileBodySchema.partial().safeParse(req.body);
    if (!bodyParsed.success) return reply.code(400).send({ error: bodyParsed.error.flatten() });
    const id = paramParsed.data.id;
    const data = bodyParsed.data;
    const ts = getTableStore();
    if (ts) {
      const kv = getKvSecrets();
      if (data.adoPat !== undefined && kv) {
        if (data.adoPat) await kv.setAdoPat(id, data.adoPat);
        data.adoPat = "";
      }
      const updated = await ts.update(id, data);
      if (!updated) return reply.code(404).send({ error: "profile not found" });
      return injectAdoPat(updated);
    }
    const updated = updateWorkspaceProfile(settings.dataDir, id, data);
    if (!updated) return reply.code(404).send({ error: "profile not found" });
    return updated;
  });

  app.delete("/profiles/:id", async (req, reply) => {
    const parsed = ProfileIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const id = parsed.data.id;
    const ts = getTableStore();
    if (ts) {
      const kv = getKvSecrets();
      if (kv) await kv.deleteAdoPat(id);
      const ok = await ts.delete(id);
      if (!ok) return reply.code(404).send({ error: "profile not found" });
      return { ok: true };
    }
    const ok = deleteWorkspaceProfile(settings.dataDir, id);
    if (!ok) return reply.code(404).send({ error: "profile not found" });
    return { ok: true };
  });

  app.get("/profiles/:id/pull-requests", async (req, reply) => {
    const parsed = ProfileIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });
    const statusParam = typeof (req.query as Record<string, unknown>)["status"] === "string"
      ? String((req.query as Record<string, unknown>)["status"])
      : "active";
    const status = ["active", "completed", "abandoned", "all"].includes(statusParam)
      ? statusParam as "active" | "completed" | "abandoned" | "all"
      : "active";

    const ts = getTableStore();
    let profile: Awaited<ReturnType<typeof getWorkspaceProfile>> | null = null;
    if (ts) {
      try {
        const cloudProfile = await ts.get(parsed.data.id);
        profile = cloudProfile ? await injectAdoPat(cloudProfile) : null;
      } catch {
        // Azure auth unavailable (e.g. not logged in) — fall back to local storage
        profile = getWorkspaceProfile(settings.dataDir, parsed.data.id);
      }
    } else {
      profile = getWorkspaceProfile(settings.dataDir, parsed.data.id);
    }
    if (!profile) return reply.code(404).send({ error: "profile not found" });
    if (!profile.adoOrgUrl || !profile.adoProject || !profile.adoRepoName) {
      return reply.code(400).send({ error: "ado_profile_incomplete" });
    }
    if (!profile.adoPat) {
      return reply.code(400).send({ error: "ado_pat_missing" });
    }

    const prs = await listAzurePullRequests({
      organization: profile.adoOrgUrl,
      project: profile.adoProject,
      repository: profile.adoRepoName,
      pat: profile.adoPat,
      status,
      top: 50,
    });
    const runs = profile.adoPipelineId
      ? await listAzurePipelineRuns({
        organization: profile.adoOrgUrl,
        project: profile.adoProject,
        pipelineId: profile.adoPipelineId,
        pat: profile.adoPat,
        top: 100,
      })
      : [];
    return {
      pullRequests: prs.map((pr) => ({
        ...pr,
        pipelineRun: runs.find((run) => run.sourceBranch === pr.sourceBranch),
      })),
    };
  });

  app.get("/profiles/:id/review-queue", async (req, reply) => {
    const parsed = ProfileIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid id" });

    const ts = getTableStore();
    let profile: Awaited<ReturnType<typeof getWorkspaceProfile>> | null = null;
    if (ts) {
      try {
        profile = await ts.get(parsed.data.id);
      } catch {
        // Azure auth unavailable — fall back to local storage
        profile = getWorkspaceProfile(settings.dataDir, parsed.data.id);
      }
    } else {
      profile = getWorkspaceProfile(settings.dataDir, parsed.data.id);
    }
    if (!profile) return reply.code(404).send({ error: "profile not found" });
    if (!settings.azureStorageAccount) {
      return { items: [], configured: false };
    }
    // If Azure auth is unavailable, return empty queue instead of crashing
    let items: Awaited<ReturnType<typeof listReviewQueueItems>>;
    try {
      items = await listReviewQueueItems({
        storageAccount: settings.azureStorageAccount,
        repository: profile.adoRepoName,
        limit: 100,
      });
    } catch {
      return { items: [], configured: true, error: "Azure authentication unavailable. Sign in to load queue." };
    }
    return { items, configured: true };
  });

  // ── Profile migration: local JSON → Azure Table Storage ─────────────────────
  // One-shot; idempotent (upsert).  Returns counts of migrated vs skipped profiles.
  app.post("/profiles/migrate", async (_req, reply) => {
    const ts = getTableStore();
    if (!ts) {
      return reply.code(400).send({
        error: "cloud_not_configured",
        message: "AZURE_STORAGE_ACCOUNT is not set. Configure it in Settings first.",
      });
    }
    const local = listWorkspaceProfiles(settings.dataDir);
    if (local.length === 0) return { migrated: 0, skipped: 0, total: 0 };

    const kv = getKvSecrets();
    let migrated = 0;
    let skipped = 0;
    for (const p of local) {
      try {
        const existing = await ts.get(p.id);
        if (existing) { skipped++; continue; }
        if (kv && p.adoPat) {
          await kv.setAdoPat(p.id, p.adoPat);
          await ts.create({ ...p, adoPat: "" });
        } else {
          await ts.create(p);
        }
        migrated++;
      } catch {
        skipped++;
      }
    }
    return { migrated, skipped, total: local.length };
  });

  // ── Chat endpoints ───────────────────────────────────────────────────────────

  app.post("/chat", async (req, reply) => {
    const parsed = ChatStartSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { message, repoPath, sessionId: existingId, profileId, llmConfig, profile } = parsed.data;
    const sessionId = existingId ?? chatSessions.createSession(repoPath, profileId);

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");
    reply.raw.setHeader("X-Chat-Session-Id", sessionId);
    reply.raw.flushHeaders();

    const send = (event: string, payload: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    // Always send the sessionId first so the client can store it
    send("session", { sessionId });

    return new Promise<void>((resolve) => {
      (async () => {
        try {
          for await (const event of chatSessions.run(sessionId, message, repoPath, profileId, llmConfig, profile)) {
            send(event.type, event);
            if (
              event.type === "done" ||
              event.type === "error" ||
              event.type === "cancelled"
            ) {
              reply.raw.end();
              resolve();
              return;
            }
          }
        } catch (err) {
          send("error", { type: "error", message: err instanceof Error ? err.message : String(err) });
        }
        reply.raw.end();
        resolve();
      })();

      req.raw.on("close", () => {
        chatSessions.cancel(sessionId);
        resolve();
      });
    });
  });

  app.post("/chat/:sessionId/confirm", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    const ok = chatSessions.confirm(parsed.data.sessionId, true);
    if (!ok) return reply.code(404).send({ error: "no pending confirmation for this session" });
    return { ok: true };
  });

  // Dedicated confirm-action endpoint: directly executes the stored approval proposal
  // and streams tool + LLM continuation events back (same SSE format as /chat).
  app.post("/chat/:sessionId/confirm-action", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });

    const sessionId = parsed.data.sessionId;
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");
    reply.raw.flushHeaders();

    const send = (event: string, payload: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    return new Promise<void>((resolve) => {
      (async () => {
        try {
          for await (const event of chatSessions.confirmAction(sessionId)) {
            send(event.type, event);
            if (event.type === "done" || event.type === "error" || event.type === "cancelled") {
              reply.raw.end();
              resolve();
              return;
            }
          }
        } catch (err) {
          send("error", { type: "error", message: err instanceof Error ? err.message : String(err) });
        }
        reply.raw.end();
        resolve();
      })();

      req.raw.on("close", () => {
        chatSessions.cancel(sessionId);
        resolve();
      });
    });
  });

  app.post("/chat/:sessionId/cancel", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    chatSessions.cancel(parsed.data.sessionId);
    return { ok: true };
  });

  app.get("/chat/history", async () => {
    return chatSessions.listRecent(30);
  });

  app.get("/chat/:sessionId/messages", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    return chatSessions.getBubbles(parsed.data.sessionId);
  });

  app.get("/chat/:sessionId/state", async (req, reply) => {
    const parsed = SessionIdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid sessionId" });
    return { workflowState: await chatSessions.getWorkflowState(parsed.data.sessionId) };
  });

  app.post("/shutdown", async () => {
    setTimeout(() => {
      process.exit(0);
    }, 250);
    return { ok: true, message: "shutting down" };
  });

  return app;
}

/** On Windows, inject git into process PATH so git tools work when the
 *  daemon runs as a Tauri sidecar (which inherits a minimal PATH). */
function injectGitPath(): void {
  if (process.platform !== "win32") return;
  // Already reachable — nothing to do.
  const probe = spawnSync("git", ["--version"], { shell: false, encoding: "utf8", timeout: 3000 });
  if (probe.status === 0) return;

  const sep = ";";
  const currentPath = process.env["PATH"] ?? "";

  // Try well-known Windows installation locations (checked synchronously — fast)
  const home = nodeOs.homedir();
  const userProfile = process.env["USERPROFILE"] ?? "";
  const candidates = [
    "C:\\Program Files\\Git\\cmd",
    "C:\\Program Files\\Git\\bin",
    "C:\\Program Files (x86)\\Git\\cmd",
    nodePath.join(home, "AppData", "Local", "Programs", "Git", "cmd"),
    ...(userProfile ? [nodePath.join(userProfile, "AppData", "Local", "Programs", "Git", "cmd")] : []),
    "C:\\ProgramData\\scoop\\apps\\git\\current\\cmd",
    nodePath.join(home, "scoop", "apps", "git", "current", "cmd"),
  ];
  const found = candidates.find((p) => { try { return nodeFs.existsSync(p); } catch { return false; } });
  if (found) {
    process.env["PATH"] = `${found}${sep}${currentPath}`;
  }
}

export async function startServer(): Promise<FastifyInstance> {
  injectGitPath();
  const settings = getSettings();
  const app = await buildApp();
  await app.listen({ host: settings.runtimeHost, port: settings.runtimePort });
  return app;
}
