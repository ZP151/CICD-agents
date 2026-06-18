import chalk from "chalk";
import type { RuntimeClient } from "./runtimeClient.js";

export function renderSteps(view: Record<string, unknown>): void {
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

export async function streamTask(c: RuntimeClient, taskId: string): Promise<void> {
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
