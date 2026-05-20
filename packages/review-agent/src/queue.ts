import { EventEmitter } from "node:events";

export interface QueuedJob<T> {
  key: string;
  payload: T;
}

/**
 * In-memory single-worker queue with built-in idempotency. A job whose key
 * has already been processed (or is currently in-flight) is dropped. The
 * worker invokes the handler one job at a time so that we never overwhelm
 * the LLM or Azure DevOps.
 */
export class IdempotentQueue<T> extends EventEmitter {
  private readonly pending = new Map<string, QueuedJob<T>>();
  private readonly done = new Set<string>();
  private inFlight: string | null = null;
  private stopped = false;
  private wake: (() => void) | null = null;

  constructor(
    private readonly handler: (job: QueuedJob<T>) => Promise<void>,
    private readonly doneLimit = 4096,
  ) {
    super();
  }

  enqueue(job: QueuedJob<T>): "queued" | "duplicate" {
    if (this.done.has(job.key)) return "duplicate";
    if (this.pending.has(job.key)) return "duplicate";
    if (this.inFlight === job.key) return "duplicate";
    this.pending.set(job.key, job);
    if (this.wake) this.wake();
    return "queued";
  }

  async start(): Promise<void> {
    while (!this.stopped) {
      const next = [...this.pending.values()][0];
      if (!next) {
        await new Promise<void>((resolve) => {
          this.wake = resolve;
        });
        this.wake = null;
        continue;
      }
      this.pending.delete(next.key);
      this.inFlight = next.key;
      try {
        await this.handler(next);
        this.emit("done", next.key);
      } catch (err) {
        this.emit("error", { key: next.key, error: err });
      } finally {
        this.inFlight = null;
        this.done.add(next.key);
        if (this.done.size > this.doneLimit) {
          // Trim oldest entries (set preserves insertion order).
          const it = this.done.values();
          for (let i = 0; i < this.done.size - this.doneLimit; i++) {
            this.done.delete(it.next().value as string);
          }
        }
      }
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.wake) this.wake();
  }

  hasSeen(key: string): boolean {
    return this.done.has(key) || this.pending.has(key) || this.inFlight === key;
  }
}
