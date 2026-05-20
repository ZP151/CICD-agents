import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { getSettings } from "./settings.js";
import { logger } from "./logger.js";

export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type StepStatus = "info" | "ok" | "warn" | "error";

export interface TaskStep {
  seq: number;
  name: string;
  detail: string;
  status: StepStatus;
  createdAt: number;
}

export interface TaskView {
  id: string;
  kind: string;
  status: TaskStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  error: string;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  steps: TaskStep[];
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

export interface TaskHandle {
  taskId: string;
  payload: Record<string, unknown>;
  step(name: string, status: StepStatus, detail?: string): void;
  emitter: EventEmitter;
}

export type TaskRunner = (handle: TaskHandle) => Promise<Record<string, unknown>>;

interface TaskStore {
  tasks: Record<string, TaskView>;
}

export class TaskQueue {
  private readonly dbFile: string;
  private store: TaskStore = { tasks: {} };
  private readonly runner: TaskRunner;
  private readonly emitters = new Map<string, EventEmitter>();
  private stopped = false;
  private wake = false;
  private worker: Promise<void> | null = null;

  constructor(runner: TaskRunner) {
    const settings = getSettings();
    fs.mkdirSync(settings.dataDir, { recursive: true });
    this.dbFile = path.join(settings.dataDir, "tasks.json");
    this.load();
    this.runner = runner;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.dbFile)) {
        this.store = JSON.parse(fs.readFileSync(this.dbFile, "utf8")) as TaskStore;
      }
    } catch {
      this.store = { tasks: {} };
    }
  }

  private save(): void {
    fs.writeFileSync(this.dbFile, JSON.stringify(this.store, null, 2), "utf8");
  }

  start(): void {
    // Reset any tasks that were mid-run when the process was killed
    for (const task of Object.values(this.store.tasks)) {
      if (task.status === "running") {
        task.status = "queued";
        task.startedAt = null;
      }
    }
    this.save();
    this.worker = this.loop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.wake = true;
    if (this.worker) {
      try {
        await this.worker;
      } catch {
        // ignored
      }
    }
  }

  submit(kind: string, payload: Record<string, unknown>): string {
    const taskId = `task_${formatTs()}_${crypto.randomBytes(3).toString("hex")}`;
    const task: TaskView = {
      id: taskId,
      kind,
      status: "queued",
      payload,
      result: {},
      error: "",
      createdAt: now(),
      startedAt: null,
      finishedAt: null,
      steps: [],
    };
    this.store.tasks[taskId] = task;
    this.save();
    this.emitters.set(taskId, new EventEmitter());
    this.wake = true;
    return taskId;
  }

  list(limit = 50): TaskView[] {
    return Object.values(this.store.tasks)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  get(taskId: string): TaskView | null {
    return this.store.tasks[taskId] ?? null;
  }

  emitterFor(taskId: string): EventEmitter | null {
    return this.emitters.get(taskId) ?? null;
  }

  private addStep(taskId: string, name: string, status: StepStatus, detail = ""): TaskStep {
    const task = this.store.tasks[taskId];
    if (!task) throw new Error(`Task ${taskId} not found`);
    const seq = task.steps.length + 1;
    const createdAt = now();
    const step: TaskStep = { seq, name, detail, status, createdAt };
    task.steps.push(step);
    this.save();
    const em = this.emitters.get(taskId);
    if (em) em.emit("step", step);
    return step;
  }

  private setStatus(
    taskId: string,
    status: TaskStatus,
    opts: { error?: string; result?: Record<string, unknown>; started?: boolean; finished?: boolean } = {},
  ): void {
    const task = this.store.tasks[taskId];
    if (!task) return;
    task.status = status;
    if (opts.error !== undefined) task.error = opts.error;
    if (opts.result !== undefined) task.result = opts.result;
    if (opts.started) task.startedAt = now();
    if (opts.finished) task.finishedAt = now();
    this.save();
    const em = this.emitters.get(taskId);
    if (em) em.emit("status", status);
  }

  private nextQueued(): string | null {
    const task = Object.values(this.store.tasks)
      .filter((t) => t.status === "queued")
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!task) return null;
    this.setStatus(task.id, "running", { started: true });
    return task.id;
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      const id = this.nextQueued();
      if (!id) {
        this.wake = false;
        await new Promise<void>((resolve) => {
          const t = setInterval(() => {
            if (this.stopped || this.wake) {
              clearInterval(t);
              resolve();
            }
          }, 100);
        });
        continue;
      }
      const task = this.get(id);
      if (!task) continue;
      const emitter = this.emitters.get(id) ?? new EventEmitter();
      this.emitters.set(id, emitter);
      const handle: TaskHandle = {
        taskId: id,
        payload: task.payload,
        step: (name, status, detail = "") => {
          this.addStep(id, name, status, detail);
        },
        emitter,
      };
      try {
        const result = await this.runner(handle);
        this.setStatus(id, "succeeded", { result, finished: true });
        emitter.emit("done", { status: "succeeded", result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger().error({ err: msg, taskId: id }, "task failed");
        this.setStatus(id, "failed", { error: msg, finished: true });
        emitter.emit("done", { status: "failed", error: msg });
      }
    }
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTs(): string {
  const d = new Date();
  return (
    String(d.getFullYear()) +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "_" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}
