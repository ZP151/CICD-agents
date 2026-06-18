import { Command } from "commander";
import chalk from "chalk";
import { getSettings, translateIntent, type IntentPlan } from "@mergepilot/core";
import {
  detectRepoKind,
  suggestProjectTemplateFor,
  writeProjectLinkFile,
} from "./init.js";
import { enableReview } from "./reviewEnable.js";
import { buildSubmitPipelinePayload } from "./submitPipelinePayload.js";
import { createRuntimeClient } from "./cliRuntime.js";
import { registerAuthCommands } from "./authCommands.js";
import { registerConfigurePatCommand } from "./patCommand.js";
import { registerSettingsCommand } from "./settingsCommand.js";
import { registerSetupGlobalCommand } from "./setupGlobalCommand.js";
import { renderSteps, streamTask } from "./taskOutput.js";
import { RuntimeClient, RuntimeUnavailableError } from "./runtimeClient.js";

export function createProgram(): Command {
  const program = new Command();
  program.name("mergepilot").description("Local Agent Runtime for CI/CD (entrance only).");

  program
    .command("healthz")
    .description("Print runtime health (auto-starts the runtime).")
    .action(async () => {
      try {
        const c = await createRuntimeClient();
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
    .option("--project-template <name>", "YAML project template name")
    .option("-t, --target-branch <name>", "target branch")
    .option("-w, --work-item <id>", "Azure DevOps work item id")
    .option("--title <title>", "PR title")
    .option("--draft", "create the PR as draft", false)
    .option("--no-pr", "skip PR creation")
    .option("--trigger-pipeline", "queue the ADO pipeline after PR creation", false)
    .option("--no-wait", "do not wait for completion")
    .action(async (opts: Record<string, unknown>) => {
      const payload = buildSubmitPipelinePayload({
        repoPath: opts["repo"],
        projectTemplate: opts["projectTemplate"],
        targetBranch: opts["targetBranch"],
        workItem: opts["workItem"],
        title: opts["title"],
        draft: opts["draft"],
        autoCreatePr: opts["pr"] !== false,
        triggerPipeline: opts["triggerPipeline"],
      });
      const c = await createRuntimeClient();
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
      const c = await createRuntimeClient();
      const view = await c.getTask(taskId);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(view, null, 2));
    });

  program
    .command("logs <taskId>")
    .description("Print task steps. With --tail, follow until terminal status.")
    .option("--tail", "follow the live stream", false)
    .action(async (taskId: string, opts: Record<string, unknown>) => {
      const c = await createRuntimeClient();
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
    .option("--view <name>", "initial view (feed|submit|templates|init)", "feed")
    .action(async (opts: Record<string, unknown>) => {
      const c = await createRuntimeClient();
      const { render } = await import("ink");
      const { App } = await import("./tui/App.js");
      const React = (await import("react")).default;
      render(React.createElement(App, { client: c, initialView: String(opts["view"] ?? "feed") }));
    });

  program
    .command("ai <intent...>")
    .description(
      "Translate a natural-language git intent into a planned sequence of tool calls (dry-run).",
    )
    .option("--json", "emit the plan as JSON", false)
    .option("--yes", "execute the plan instead of just printing it (work in progress)", false)
    .action(async (intent: string[], opts: Record<string, unknown>) => {
      const plan = translateIntent(intent.join(" "));
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
    .description("Detect the repo type and write .mergepilot/project-link.yaml.")
    .option("-r, --repo <path>", "path to the local git repo", process.cwd())
    .option("--project-template <name>", "override the detected YAML project template")
    .option("--organization <name>", "Azure DevOps organization")
    .option("--project <name>", "Azure DevOps project")
    .option("--repository <name>", "Azure DevOps repository")
    .option("--target-branch <name>", "target branch", "main")
    .action(async (opts: Record<string, unknown>) => {
      const repoPath = String(opts["repo"]);
      const kind = detectRepoKind(repoPath);
      const projectTemplate = String(
        opts["projectTemplate"] ?? suggestProjectTemplateFor(kind),
      );
      const result = writeProjectLinkFile({
        repoPath,
        projectTemplate,
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
        console.log(chalk.green(`registered ${subs.length} subscription(s):`));
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

  registerSettingsCommand(program);
  registerSetupGlobalCommand(program);
  registerAuthCommands(program);
  registerConfigurePatCommand(program);

  return program;
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
