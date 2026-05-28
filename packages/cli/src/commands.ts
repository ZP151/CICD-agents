import { Command } from "commander";
import chalk from "chalk";
import { ensureRunning, RuntimeClient, RuntimeUnavailableError } from "./runtimeClient.js";
import { getSettings, translateIntent, type IntentPlan } from "@cicd-agent/core";
import { detectRepoKind, suggestProfileFor, writeProfileFile } from "./init.js";
import { enableReview } from "./reviewEnable.js";

const PAT_KEYRING_SERVICE = "cicd-agent";
const PAT_KEYRING_USER = "azure-devops-pat";

async function client(): Promise<RuntimeClient> {
  const url = await ensureRunning();
  return new RuntimeClient(url);
}

export function createProgram(): Command {
  const program = new Command();
  program.name("dev-agent").description("Local Agent Runtime for CI/CD (entrance only).");

  program
    .command("healthz")
    .description("Print runtime health (auto-starts the runtime).")
    .action(async () => {
      try {
        const c = await client();
        const data = await c.healthz();
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(data, null, 2));
      } catch (err) {
        if (err instanceof RuntimeUnavailableError) {
          // eslint-disable-next-line no-console
          console.error(chalk.red("Runtime unavailable:"), err.message);
          process.exit(2);
        }
        throw err;
      }
    });

  program
    .command("submit-pipeline")
    .description("Submit a pipeline task and (by default) wait for completion.")
    .option("-r, --repo <path>", "path to the local git repo", process.cwd())
    .option("-p, --profile <name>", "profile name", "default")
    .option("-t, --target-branch <name>", "target branch")
    .option("-w, --work-item <id>", "Azure DevOps work item id")
    .option("--title <title>", "PR title")
    .option("--draft", "create the PR as draft", false)
    .option("--no-pr", "skip PR creation")
    .option("--trigger-pipeline", "queue the ADO pipeline after PR creation", false)
    .option("--no-wait", "do not wait for completion")
    .action(async (opts: Record<string, unknown>) => {
      const payload = {
        repoPath: String(opts["repo"]),
        profile: String(opts["profile"]),
        targetBranch: opts["targetBranch"] ?? null,
        workItem: opts["workItem"] ?? null,
        title: opts["title"] ?? null,
        draft: Boolean(opts["draft"]),
        autoCreatePr: opts["pr"] !== false,
        triggerPipeline: Boolean(opts["triggerPipeline"]),
      };
      const c = await client();
      const resp = await c.submitPipeline(payload);
      // eslint-disable-next-line no-console
      console.log(`submitted ${chalk.bold(resp.taskId)} (status=${resp.status})`);
      if (opts["wait"] === false) return;
      await streamTask(c, resp.taskId);
    });

  program
    .command("status <taskId>")
    .description("Show task status as JSON.")
    .action(async (taskId: string) => {
      const c = await client();
      const view = await c.getTask(taskId);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(view, null, 2));
    });

  program
    .command("logs <taskId>")
    .description("Print task steps. With --tail, follow until terminal status.")
    .option("--tail", "follow the live stream", false)
    .action(async (taskId: string, opts: Record<string, unknown>) => {
      const c = await client();
      if (opts["tail"]) {
        await streamTask(c, taskId);
      } else {
        const view = await c.getTask(taskId);
        renderSteps(view);
      }
    });

  program
    .command("stop")
    .description("Ask the runtime to shut down.")
    .action(async () => {
      try {
        const settings = getSettings();
        const c = new RuntimeClient(settings.runtimeUrl);
        await c.shutdown();
        // eslint-disable-next-line no-console
        console.log(chalk.green("runtime shutdown requested."));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log(
          chalk.yellow(`could not reach runtime: ${err instanceof Error ? err.message : err}`),
        );
      }
    });

  program
    .command("tui")
    .description("Launch the multi-panel terminal UI.")
    .option("--view <name>", "initial view (feed|profiles|init)", "feed")
    .action(async (opts: Record<string, unknown>) => {
      const url = await ensureRunning();
      const client = new RuntimeClient(url);
      const { render } = await import("ink");
      const { App } = await import("./tui/App.js");
      const React = (await import("react")).default;
      render(
        React.createElement(App, { client, initialView: String(opts["view"] ?? "feed") }),
      );
    });

  program
    .command("ai <intent...>")
    .description(
      "Translate a natural-language git intent into a planned sequence of tool calls (dry-run).",
    )
    .option("--json", "emit the plan as JSON", false)
    .option("--yes", "execute the plan instead of just printing it (work in progress)", false)
    .action(async (intent: string[], opts: Record<string, unknown>) => {
      const text = intent.join(" ");
      const plan = translateIntent(text);
      if (opts["json"]) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(plan, null, 2));
        return;
      }
      renderIntentPlan(plan);
      if (opts["yes"]) {
        // eslint-disable-next-line no-console
        console.log(
          chalk.yellow(
            "execution is not enabled yet; this command currently runs in dry-run mode only.",
          ),
        );
      }
    });

  program
    .command("init")
    .description("Detect the repo type and write .cicd-agent/profile.yaml.")
    .option("-r, --repo <path>", "path to the local git repo", process.cwd())
    .option("-p, --profile <name>", "override the detected profile")
    .option("--organization <name>", "Azure DevOps organization")
    .option("--project <name>", "Azure DevOps project")
    .option("--repository <name>", "Azure DevOps repository")
    .option("--target-branch <name>", "target branch", "main")
    .action(async (opts: Record<string, unknown>) => {
      const repoPath = String(opts["repo"]);
      const kind = detectRepoKind(repoPath);
      const profile = String(opts["profile"] ?? suggestProfileFor(kind));
      const result = writeProfileFile({
        repoPath,
        profile,
        organization: opts["organization"] as string | undefined,
        project: opts["project"] as string | undefined,
        repository: opts["repository"] as string | undefined,
        targetBranch: opts["targetBranch"] as string | undefined,
      });
      // eslint-disable-next-line no-console
      console.log(chalk.green(`wrote ${result.configPath}`));
      // eslint-disable-next-line no-console
      console.log(result.contents);
    });

  const review = program.command("review").description("Manage the cloud Review Agent.");
  review
    .command("enable")
    .description("Register Azure DevOps service-hook subscriptions for PR events.")
    .requiredOption("--project <name>", "Azure DevOps project id or name")
    .requiredOption("--repository <id>", "Azure DevOps repository id (uuid)")
    .requiredOption("--url <url>", "public URL of the deployed review-agent")
    .requiredOption("--password <secret>", "shared secret for HTTP Basic webhook auth")
    .option("--organization <name>", "Azure DevOps organization (defaults to env)")
    .action(async (opts: Record<string, unknown>) => {
      try {
        const subs = await enableReview({
          organization: opts["organization"] as string | undefined,
          project: String(opts["project"]),
          repositoryId: String(opts["repository"]),
          reviewAgentUrl: String(opts["url"]),
          webhookPassword: String(opts["password"]),
        });
        // eslint-disable-next-line no-console
        console.log(
          chalk.green(`registered ${subs.length} subscription(s):`),
        );
        for (const s of subs) {
          // eslint-disable-next-line no-console
          console.log(`  ${s.eventType}  id=${s.id}`);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  program
    .command("settings")
    .description("Inspect or toggle local settings (telemetry, etc).")
    .option("--telemetry <on|off>", "enable or disable App Insights metrics")
    .action(async (opts: Record<string, unknown>) => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const settings = getSettings();
      const file = path.join(settings.dataDir, "settings.json");
      let saved: Record<string, unknown> = {};
      if (fs.existsSync(file)) {
        try {
          saved = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
        } catch {
          saved = {};
        }
      }
      const tel = opts["telemetry"];
      if (tel === "on" || tel === "off") {
        saved["telemetryEnabled"] = tel === "on";
        fs.writeFileSync(file, JSON.stringify(saved, null, 2), "utf8");
        // eslint-disable-next-line no-console
        console.log(chalk.green(`telemetry: ${tel}`));
        // eslint-disable-next-line no-console
        console.log(`Set TELEMETRY_ENABLED=${tel === "on" ? "1" : "0"} in your environment to apply at startup.`);
        return;
      }
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ file, saved, runtime: settings }, null, 2));
    });

  program
    .command("setup-global")
    .description(
      "Write a global dev-agent wrapper to ~/.cicd-agent/bin so it can be invoked from any directory.",
    )
    .option("--uninstall", "remove the global wrapper instead of creating it", false)
    .action(async (opts: Record<string, unknown>) => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const os = await import("node:os");

      const binDir = path.join(os.homedir(), ".cicd-agent", "bin");
      const batPath = path.join(binDir, "dev-agent.bat");
      const ps1Path = path.join(binDir, "dev-agent.ps1");

      if (opts["uninstall"]) {
        [batPath, ps1Path].forEach((f) => {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        });
        // eslint-disable-next-line no-console
        console.log(chalk.green("Removed global dev-agent wrappers."));
        // eslint-disable-next-line no-console
        console.log(chalk.dim(`You can also remove ${binDir} from your PATH.`));
        return;
      }

      // Resolve the absolute path to the tsx entry point in this package
      const repoRoot = findGlobalRepoRoot();
      const tsxBin = path.join(repoRoot, "node_modules", ".bin", "tsx.cmd");
      const entry = path.join(repoRoot, "packages", "cli", "src", "bin.ts");

      // Check for the compiled dist as a better option
      const distBin = path.join(repoRoot, "packages", "cli", "dist", "bin.js");
      const useNode = fs.existsSync(distBin);
      const runner = useNode ? "node" : tsxBin;
      const script = useNode ? distBin : entry;

      fs.mkdirSync(binDir, { recursive: true });

      // Windows CMD batch wrapper
      fs.writeFileSync(
        batPath,
        `@echo off\r\n"${runner}" "${script}" %*\r\n`,
        "utf8",
      );

      // PowerShell wrapper
      fs.writeFileSync(
        ps1Path,
        `& "${runner}" "${script}" @args\r\n`,
        "utf8",
      );

      // eslint-disable-next-line no-console
      console.log(chalk.green("Global dev-agent wrapper written."));
      // eslint-disable-next-line no-console
      console.log(chalk.bold("\nTo finish setup, add this directory to your PATH:"));
      // eslint-disable-next-line no-console
      console.log(chalk.cyan(`  ${binDir}`));
      // eslint-disable-next-line no-console
      console.log(chalk.dim("\nPowerShell (run once):"));
      // eslint-disable-next-line no-console
      console.log(
        chalk.dim(
          `  [Environment]::SetEnvironmentVariable('PATH', $env:PATH + ';${binDir}', 'User')`,
        ),
      );
      // eslint-disable-next-line no-console
      console.log(chalk.dim("\nThen open a new terminal and run: dev-agent healthz"));
    });

  // ── auth subcommand ───────────────────────────────────────────────────────────
  const auth = program.command("auth").description("Azure account management.");

  auth
    .command("login")
    .description("Sign in with Microsoft (opens browser via az login).")
    .action(async () => {
      const c = await client();
      const baseUrl = c.baseUrl;
      const { default: EventSource } = await import("eventsource");
      const url = `${baseUrl}/auth/login`;

      console.log(chalk.dim("Opening browser for Microsoft sign-in…\n"));

      await new Promise<void>((resolve) => {
        // POST via fetch-then-EventSource pattern: daemon streams SSE from az login
        const controller = new AbortController();

        fetch(url, { method: "POST", signal: controller.signal })
          .then(async (r) => {
            if (!r.ok || !r.body) {
              console.error(chalk.red(`Login request failed: HTTP ${r.status}`));
              resolve();
              return;
            }
            const reader = r.body.getReader();
            const dec = new TextDecoder();
            let buf = "";
            let currentEvent = "output";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const lines = buf.split("\n");
              buf = lines.pop() ?? "";
              for (const line of lines) {
                if (line.startsWith("event: ")) { currentEvent = line.slice(7).trim(); }
                else if (line.startsWith("data: ")) {
                  try {
                    const d = JSON.parse(line.slice(6)) as Record<string, unknown>;
                    if (currentEvent === "output" && d["line"]) {
                      console.log(chalk.dim(String(d["line"])));
                    } else if (currentEvent === "status") {
                      console.log(chalk.cyan(String(d["message"] ?? "")));
                    } else if (currentEvent === "done") {
                      if (d["authenticated"]) {
                        console.log();
                        console.log(chalk.green("Signed in successfully."));
                        console.log(`  ${chalk.bold("Name:")} ${d["name"] ?? "-"}`);
                        console.log(`  ${chalk.bold("Email:")} ${d["upn"] ?? "-"}`);
                        console.log(`  ${chalk.bold("OID:")} ${d["oid"] ?? "-"}`);
                      } else {
                        console.log(chalk.red("Sign-in did not complete."));
                      }
                    } else if (currentEvent === "error") {
                      console.error(chalk.red(String(d["message"] ?? "Login error")));
                    }
                  } catch { /* ignore */ }
                }
              }
            }
            resolve();
          })
          .catch((err: unknown) => {
            console.error(chalk.red(err instanceof Error ? err.message : String(err)));
            resolve();
          });
      });
    });

  auth
    .command("logout")
    .description("Sign out of Microsoft account (az logout).")
    .action(async () => {
      const c = await client();
      const baseUrl = c.baseUrl;
      const r = await fetch(`${baseUrl}/auth/logout`, { method: "POST" });
      if (r.ok) {
        console.log(chalk.green("Signed out successfully."));
      } else {
        console.error(chalk.red(`Logout failed: HTTP ${r.status}`));
      }
    });

  auth
    .command("status")
    .description("Show current Azure account (cached, instant).")
    .action(async () => {
      const c = await client();
      const baseUrl = c.baseUrl;

      // Try live check first, fall back to cache
      const r = await fetch(`${baseUrl}/auth/me`);
      const user = await r.json() as Record<string, unknown>;

      if (user["authenticated"]) {
        console.log(chalk.green("Signed in"));
        console.log(`  ${chalk.bold("Name:")}  ${user["name"] ?? "-"}`);
        console.log(`  ${chalk.bold("Email:")} ${user["upn"] ?? "-"}`);
        console.log(`  ${chalk.bold("OID:")}   ${user["oid"] ?? "-"}`);
      } else {
        console.log(chalk.yellow("Not signed in."));
        console.log(chalk.dim("Run: dev-agent auth login"));
        if (user["message"]) console.log(chalk.dim(String(user["message"])));
      }
    });

  program
    .command("configure-pat")
    .description("Store the Azure DevOps PAT in the OS keyring.")
    .action(async () => {
      const readline = await import("node:readline/promises");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const pat = (await rl.question("Azure DevOps PAT: ")).trim();
      rl.close();
      if (!pat) {
        // eslint-disable-next-line no-console
        console.error(chalk.red("empty PAT, aborted."));
        process.exit(1);
      }
      const keytarMod = await import("keytar");
      const keytar = keytarMod.default ?? keytarMod;
      await keytar.setPassword(PAT_KEYRING_SERVICE, PAT_KEYRING_USER, pat);
      // eslint-disable-next-line no-console
      console.log(chalk.green(`stored PAT in OS keyring under service '${PAT_KEYRING_SERVICE}'.`));
    });

  return program;
}

function findGlobalRepoRoot(): string {
  // Walk up from __dirname (packages/cli/src) to find the monorepo root
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { existsSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { dirname, join } = require("node:path") as typeof import("node:path");
  let dir = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function renderIntentPlan(plan: IntentPlan): void {
  // eslint-disable-next-line no-console
  console.log(chalk.cyan(`intent: ${plan.intent}`));
  // eslint-disable-next-line no-console
  console.log(chalk.dim(plan.notes));
  // eslint-disable-next-line no-console
  console.log();
  plan.steps.forEach((s, idx) => {
    // eslint-disable-next-line no-console
    console.log(`  ${idx + 1}. ${chalk.bold(s.tool)} - ${s.note}`);
    // eslint-disable-next-line no-console
    console.log(`     ${JSON.stringify(s.args)}`);
  });
}

function renderSteps(view: Record<string, unknown>): void {
  const steps = (view["steps"] as Array<Record<string, unknown>>) ?? [];
  for (const s of steps) {
    const colorFn = pickColor(String(s["status"] ?? "info"));
    // eslint-disable-next-line no-console
    console.log(
      `  ${colorFn(String(s["status"]).padStart(5))} ${s["name"]}${s["detail"] ? ` - ${s["detail"]}` : ""}`,
    );
  }
  if (view["error"]) {
    // eslint-disable-next-line no-console
    console.log(chalk.red(`error: ${view["error"]}`));
  }
}

function pickColor(status: string): (s: string) => string {
  switch (status) {
    case "ok":
      return chalk.green;
    case "warn":
      return chalk.yellow;
    case "error":
      return chalk.red;
    default:
      return chalk.white;
  }
}

async function streamTask(c: RuntimeClient, taskId: string): Promise<void> {
  // Use SSE if available; fall back to polling otherwise.
  const { default: EventSource } = await import("eventsource");
  const url = `${c.baseUrl}/tasks/${taskId}/events`;
  let resolved = false;
  await new Promise<void>((resolve) => {
    const es = new EventSource(url);
    es.addEventListener("step", (ev) => {
      try {
        const s = JSON.parse(ev.data) as Record<string, unknown>;
        const colorFn = pickColor(String(s["status"] ?? "info"));
        // eslint-disable-next-line no-console
        console.log(
          `  ${colorFn(String(s["status"]).padStart(5))} ${s["name"]}${s["detail"] ? ` - ${s["detail"]}` : ""}`,
        );
      } catch {
        // ignored
      }
    });
    es.addEventListener("done", () => {
      es.close();
      if (!resolved) {
        resolved = true;
        resolve();
      }
    });
    es.addEventListener("error", () => {
      es.close();
      if (!resolved) {
        resolved = true;
        resolve();
      }
    });
  });
  const view = await c.getTask(taskId);
  const status = String(view["status"] ?? "");
  const color = status === "succeeded" ? chalk.green : status === "failed" ? chalk.red : chalk.yellow;
  // eslint-disable-next-line no-console
  console.log(color(`task ${status}`));
  if (view["result"]) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(view["result"], null, 2));
  }
  if (status !== "succeeded") process.exit(1);
}
