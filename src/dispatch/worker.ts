import EventEmitter from "eventemitter3";
import { generateId } from "../utils/id.js";
import { createHeartbeatSnapshot, materializeDueHeartbeatRules, type HeartbeatContext } from "./heartbeat.js";
import { materializeDueSchedules } from "./scheduler.js";
import type { DispatchExecutor } from "./executor.js";
import type { DispatchStore } from "./store.js";
import type { DispatchJob, HeartbeatRule, DispatchSchedule } from "./types.js";

export interface DispatchWorkerOptions extends HeartbeatContext {
  store: DispatchStore;
  executor: DispatchExecutor;
  workerId?: string;
  pollIntervalMs?: number;
  batchSize?: number;
}

export interface DispatchWorkerEvents {
  "job:started": [job: DispatchJob];
  "job:completed": [job: DispatchJob];
  "job:failed": [job: DispatchJob, error: string];
  "schedule:triggered": [schedule: DispatchSchedule, jobId: string];
  "heartbeat:triggered": [rule: HeartbeatRule, jobId: string];
}

export class DispatchWorker extends EventEmitter<DispatchWorkerEvents> {
  private readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private timer: NodeJS.Timeout | undefined;
  private draining = false;

  constructor(private readonly options: DispatchWorkerOptions) {
    super();
    this.workerId = options.workerId ?? generateId("dispatch-worker");
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
    this.batchSize = options.batchSize ?? 4;
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.drainOnce();
    }, this.pollIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    while (this.draining) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  async drainOnce(now = Date.now()): Promise<number> {
    if (this.draining) {
      return 0;
    }

    this.draining = true;

    try {
      materializeDueSchedules(this.options.store, now, (schedule, jobId) => {
        this.emit("schedule:triggered", schedule, jobId);
      });

      const heartbeatSnapshot = createHeartbeatSnapshot(this.options, now);
      materializeDueHeartbeatRules(this.options.store, heartbeatSnapshot, (rule, jobId) => {
        this.emit("heartbeat:triggered", rule, jobId);
      });

      const claimedJobs = this.options.store.claimDueJobs({
        limit: this.batchSize,
        workerId: this.workerId,
        now,
      });

      await Promise.all(claimedJobs.map(async (job) => {
        this.emit("job:started", job);

        try {
          const result = await this.options.executor.executeJob(job);
          const completedJob = this.options.store.markJobCompleted(job.id, {
            workerId: this.workerId,
            now: Date.now(),
            result: result as unknown as DispatchJob["result"],
          });
          if (completedJob) {
            this.emit("job:completed", completedJob);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const failedJob = this.options.store.markJobFailed(job.id, message, {
            workerId: this.workerId,
            now: Date.now(),
            retryAt: Date.now() + Math.min(60_000, Math.max(1_000, job.attemptCount * 5_000)),
          });
          if (failedJob) {
            this.emit("job:failed", failedJob, message);
          }
        }
      }));

      return claimedJobs.length;
    } finally {
      this.draining = false;
    }
  }
}

export function createDispatchWorker(
  options: DispatchWorkerOptions
): DispatchWorker {
  return new DispatchWorker(options);
}
