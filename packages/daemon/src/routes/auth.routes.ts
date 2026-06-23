import type { FastifyInstance } from "fastify";
import {
  adoAuthDiagnosticFromError,
  clearPersistedUser,
  getAzureDevOpsToken,
  getCachedAzureAccounts,
  getCurrentUser,
  getDesktopAzureAuthConfig,
  isAzureAuthAvailable,
  loadPersistedUser,
  loginWithBrowser,
  loginWithCachedAccount,
  persistUserCache,
  resetUserCache,
  type BrowserLoginChoice,
  type Settings,
} from "@mergepilot/core";
import { z } from "zod";

const AuthAzureDevOpsEnableSchema = z.object({
  browser: z.enum(["default", "edge", "chrome"]).default("default"),
  loginHint: z.string().optional(),
  accountHomeId: z.string().optional(),
}).default({});

export function registerAuthRoutes(app: FastifyInstance, { settings }: { settings: Settings }): void {
  app.get("/auth/status", async () => {
    const azureAuthConfig = getDesktopAzureAuthConfig();
    const cached = loadPersistedUser(settings.dataDir);
    if (cached && cached.oid !== "anonymous") {
      return {
        authenticated: true,
        oid: cached.oid,
        homeAccountId: cached.homeAccountId,
        tenantId: cached.tenantId,
        username: cached.username,
        upn: cached.upn,
        name: cached.name,
        avatarDataUrl: cached.avatarDataUrl,
        fromCache: true,
        azureAuthConfig,
      };
    }
    return { authenticated: false, fromCache: true, azureAuthConfig };
  });

  app.get("/auth/me", async (_req, reply) => {
    const available = await isAzureAuthAvailable();
    if (!available) {
      return reply.code(200).send({
        authenticated: false,
        message: "No Azure credential found. Use the Sign-in button to enable cloud persistence.",
      });
    }
    const user = await getCurrentUser({ refreshProfile: true });
    persistUserCache(user, settings.dataDir);
    return {
      authenticated: true,
      oid:  user.oid,
      homeAccountId: user.homeAccountId,
      tenantId: user.tenantId,
      username: user.username,
      upn:  user.upn,
      name: user.name,
      avatarDataUrl: user.avatarDataUrl,
      azureAuthConfig: getDesktopAzureAuthConfig(),
    };
  });

  app.get("/auth/accounts", async () => ({
    accounts: await getCachedAzureAccounts(),
  }));

  app.post("/auth/login", async (req, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");
    reply.raw.flushHeaders();

    const send = (event: string, data: unknown): void => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const requestedBrowser = (req.body as { browser?: string } | undefined)?.browser;
    const loginHint = (req.body as { loginHint?: string } | undefined)?.loginHint;
    const accountHomeId = (req.body as { accountHomeId?: string } | undefined)?.accountHomeId;
    const browser: BrowserLoginChoice =
      requestedBrowser === "edge" || requestedBrowser === "chrome" || requestedBrowser === "default"
        ? requestedBrowser
        : "default";

    let cancelled = false;
    reply.raw.on("close", () => {
      cancelled = true;
    });

    try {
      if (accountHomeId) {
        send("status", { message: "Signing in..." });
        const cachedUser = await loginWithCachedAccount(accountHomeId);
        if (cachedUser && !cancelled) {
          persistUserCache(cachedUser, settings.dataDir);
          send("done", {
            authenticated: true,
            oid:  cachedUser.oid,
            homeAccountId: cachedUser.homeAccountId,
            tenantId: cachedUser.tenantId,
            username: cachedUser.username,
            upn:  cachedUser.upn,
            name: cachedUser.name,
            avatarDataUrl: cachedUser.avatarDataUrl,
          });
          return;
        }
      }

      send("status", { message: "Preparing Microsoft Entra sign-in..." });
      send("browser", {
        browser,
        message: browser === "default"
          ? "Opening your default browser..."
          : `Opening ${browser === "edge" ? "Microsoft Edge" : "Google Chrome"}...`,
      });
      resetUserCache();
      const user = await loginWithBrowser(browser, { loginHint });

      if (cancelled) return;
      persistUserCache(user, settings.dataDir);
      send("done", {
        authenticated: user.oid !== "anonymous",
        oid:  user.oid,
        homeAccountId: user.homeAccountId,
        tenantId: user.tenantId,
        username: user.username,
        upn:  user.upn,
        name: user.name,
        avatarDataUrl: user.avatarDataUrl,
      });
    } catch (err) {
      if (!cancelled) send("error", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      if (!reply.raw.destroyed) reply.raw.end();
    }
  });

  app.post("/auth/azure-devops/enable", async (req, reply) => {
    const parsed = AuthAzureDevOpsEnableSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      const token = await getAzureDevOpsToken({
        interactive: true,
        browser: parsed.data.browser,
        loginHint: parsed.data.loginHint,
        homeAccountId: parsed.data.accountHomeId,
      });
      const user = await getCurrentUser();
      if (user.oid !== "anonymous") persistUserCache(user, settings.dataDir);
      return {
        ok: true,
        authMode: "oauth" as const,
        tokenAvailable: Boolean(token),
        message: "Azure DevOps OAuth consent is available for this signed-in account.",
        user,
      };
    } catch (err) {
      const diagnostic = adoAuthDiagnosticFromError(err, "oauth");
      return reply.code(401).send({
        ok: false,
        authMode: "oauth" as const,
        authStatus: diagnostic.status,
        authMessage: diagnostic.message,
        retryable: diagnostic.retryable,
      });
    }
  });

  app.post("/auth/logout", async (_req, reply) => {
    clearPersistedUser(settings.dataDir);
    resetUserCache();
    reply.send({ ok: true });
  });
}
