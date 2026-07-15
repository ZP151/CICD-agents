import type { Command } from "commander";
import chalk from "chalk";
import { createRuntimeClient } from "./cliRuntime.js";

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Azure account management.");

  auth
    .command("login")
    .description("Sign in with Microsoft (opens browser via az login).")
    .action(async () => {
      const c = await createRuntimeClient();
      const url = `${c.baseUrl}/auth/login`;

      // eslint-disable-next-line no-console
      console.log(chalk.dim("Opening browser for Microsoft sign-in...\n"));

      await new Promise<void>((resolve) => {
        const controller = new AbortController();

        fetch(url, { method: "POST", signal: controller.signal })
          .then(async (r) => {
            if (!r.ok || !r.body) {
              // eslint-disable-next-line no-console
              console.error(chalk.red(`Login request failed: HTTP ${r.status}`));
              resolve();
              return;
            }

            await renderLoginStream(r.body.getReader());
            resolve();
          })
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error(chalk.red(err instanceof Error ? err.message : String(err)));
            resolve();
          });
      });
    });

  auth
    .command("logout")
    .description("Sign out of Microsoft account (az logout).")
    .action(async () => {
      const c = await createRuntimeClient();
      const r = await fetch(`${c.baseUrl}/auth/logout`, { method: "POST" });
      if (r.ok) {
        // eslint-disable-next-line no-console
        console.log(chalk.green("Signed out successfully."));
      } else {
        // eslint-disable-next-line no-console
        console.error(chalk.red(`Logout failed: HTTP ${r.status}`));
      }
    });

  auth
    .command("status")
    .description("Show current Azure account (cached, instant).")
    .action(async () => {
      const c = await createRuntimeClient();
      const r = await fetch(`${c.baseUrl}/auth/me`);
      const user = (await r.json()) as Record<string, unknown>;

      if (user["authenticated"]) {
        // eslint-disable-next-line no-console
        console.log(chalk.green("Signed in"));
        // eslint-disable-next-line no-console
        console.log(`  ${chalk.bold("Name:")}  ${user["name"] ?? "-"}`);
        // eslint-disable-next-line no-console
        console.log(`  ${chalk.bold("Email:")} ${user["upn"] ?? "-"}`);
        // eslint-disable-next-line no-console
        console.log(`  ${chalk.bold("OID:")}   ${user["oid"] ?? "-"}`);
      } else {
        // eslint-disable-next-line no-console
        console.log(chalk.yellow("Not signed in."));
        // eslint-disable-next-line no-console
        console.log(chalk.dim("Run: mergepilot auth login"));
        if (user["message"]) {
          // eslint-disable-next-line no-console
          console.log(chalk.dim(String(user["message"])));
        }
      }
    });
}

async function renderLoginStream(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
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
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        renderLoginEvent(currentEvent, line.slice(6));
      }
    }
  }
}

function renderLoginEvent(eventName: string, rawData: string): void {
  try {
    const d = JSON.parse(rawData) as Record<string, unknown>;
    if (eventName === "output" && d["line"]) {
      // eslint-disable-next-line no-console
      console.log(chalk.dim(String(d["line"])));
    } else if (eventName === "status") {
      // eslint-disable-next-line no-console
      console.log(chalk.cyan(String(d["message"] ?? "")));
    } else if (eventName === "done") {
      renderLoginDone(d);
    } else if (eventName === "error") {
      // eslint-disable-next-line no-console
      console.error(chalk.red(String(d["message"] ?? "Login error")));
    }
  } catch {
    // ignore malformed SSE payloads
  }
}

function renderLoginDone(d: Record<string, unknown>): void {
  if (d["authenticated"]) {
    // eslint-disable-next-line no-console
    console.log();
    // eslint-disable-next-line no-console
    console.log(chalk.green("Signed in successfully."));
    // eslint-disable-next-line no-console
    console.log(`  ${chalk.bold("Name:")} ${d["name"] ?? "-"}`);
    // eslint-disable-next-line no-console
    console.log(`  ${chalk.bold("Email:")} ${d["upn"] ?? "-"}`);
    // eslint-disable-next-line no-console
    console.log(`  ${chalk.bold("OID:")} ${d["oid"] ?? "-"}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(chalk.red("Sign-in did not complete."));
  }
}
