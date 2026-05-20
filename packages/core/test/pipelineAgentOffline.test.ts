import { describe, expect, it, afterEach } from "vitest";
import { runPipelineTask } from "../src/pipelineAgent.js";
import type { TaskHandle } from "../src/queue.js";
import { EventEmitter } from "node:events";
import { makeFixtureRepo, type TempEnv } from "./helpers.js";

let env: TempEnv | null = null;
afterEach(() => {
  if (env) {
    env.cleanup();
    env = null;
  }
});

function fakeHandle(repoPath: string): TaskHandle & { steps: Array<Record<string, string>> } {
  const steps: Array<Record<string, string>> = [];
  return {
    taskId: "task_test",
    payload: { repoPath, profile: "default", autoCreatePr: false, triggerPipeline: false },
    emitter: new EventEmitter(),
    step(name: string, status: string, detail?: string) {
      steps.push({ name, status, detail: detail ?? "" });
    },
    steps,
  };
}

describe("pipeline agent (offline)", () => {
  it("produces a plan without LLM and skips PR/pipeline", async () => {
    env = makeFixtureRepo();
    const handle = fakeHandle(env.repoPath);
    const result = await runPipelineTask(handle);

    const stepNames = handle.steps.map((s) => s.name);
    expect(stepNames).toContain("index_repo");
    expect(stepNames).toContain("plan");

    const plan = result["plan"] as Record<string, unknown>;
    expect(plan["used_llm"]).toBe(false);
    expect(String(plan["risk_level"])).toMatch(/^(low|medium)$/);
    expect(String(plan["title"]).length).toBeGreaterThan(0);

    const pr = (result["pull_request"] ?? {}) as Record<string, unknown>;
    expect(pr["skipped"] ?? true).toBeTruthy();
  }, 60000);
});
