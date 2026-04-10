import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { createDispatchStore, type DispatchStore } from "../../src/dispatch/store.js";
import { computeNextCronRun, materializeDueSchedules } from "../../src/dispatch/scheduler.js";
import { createHeartbeatSnapshot, materializeDueHeartbeatRules } from "../../src/dispatch/heartbeat.js";
import { SessionManager } from "../../src/sessions/manager.js";
import { PermissionManager } from "../../src/permissions/handler.js";
import { AskUserQuestionManager } from "../../src/permissions/ask-user.js";

let db: Database.Database;
let store: DispatchStore;

beforeEach(() => {
  db = new Database(":memory:");
  store = createDispatchStore(db);
  store.migrate();
});

afterEach(() => {
  db.close();
});

describe("Dispatch scheduler", () => {
  it("computes the next cron run in a timezone-aware way", () => {
    const after = Date.UTC(2026, 3, 8, 14, 3, 0, 0);
    const next = computeNextCronRun("5 14 * * *", "UTC", after);
    expect(next).toBe(Date.UTC(2026, 3, 8, 14, 5, 0, 0));
  });

  it("uses standard OR semantics for day-of-month and day-of-week", () => {
    const after = Date.UTC(2026, 3, 1, 8, 0, 0, 0);
    const next = computeNextCronRun("0 9 1 * MON", "UTC", after);
    expect(next).toBe(Date.UTC(2026, 3, 1, 9, 0, 0, 0));
  });

  it("materializes due schedules and advances nextRunAt", () => {
    const now = Date.UTC(2026, 3, 8, 14, 5, 0, 0);
    store.upsertSchedule({
      id: "schedule-1",
      name: "Quarter past",
      enabled: true,
      cron: "10 14 * * *",
      timezone: "UTC",
      sourceType: "cron",
      runtimeProfile: "claude_runtime",
      prompt: "Check the queue",
      targetType: "resume_session",
      sessionId: "session-5",
      createdAt: now - 10_000,
      updatedAt: now - 10_000,
      nextRunAt: now,
    });

    const triggered = materializeDueSchedules(store, now);
    expect(triggered).toBe(1);
    expect(store.listJobs()).toHaveLength(1);
    expect(store.listJobs()[0].input.sessionId).toBe("session-5");
    expect(store.getSchedule("schedule-1")?.nextRunAt).toBe(
      Date.UTC(2026, 3, 8, 14, 10, 0, 0)
    );
  });

  it("materializes heartbeat jobs when conditions match", () => {
    const now = Date.now();
    store.upsertHeartbeatRule({
      id: "heartbeat-1",
      name: "Queue pressure",
      enabled: true,
      intervalMs: 60_000,
      sourceType: "heartbeat",
      targetType: "new_session",
      runtimeProfile: "claude_runtime",
      prompt: "Investigate queue depth",
      sessionId: "session-heartbeat",
      conditions: {
        queuedJobsGte: 1,
      },
      createdAt: now - 1_000,
      updatedAt: now - 1_000,
      nextRunAt: now,
    });

    store.enqueueJob({
      sourceType: "manual",
      targetType: "new_session",
      runtimeProfile: "isolated_sdk",
      prompt: "Existing job",
    });

    const snapshot = createHeartbeatSnapshot(
      {
        sessionManager: new SessionManager(),
        permissionManager: new PermissionManager(),
        askUserManager: new AskUserQuestionManager(),
        store,
      },
      now
    );

    const triggered = materializeDueHeartbeatRules(store, snapshot);
    expect(triggered).toBe(1);
    expect(store.listJobs().filter((job) => job.sourceType === "heartbeat")).toHaveLength(1);
    expect(
      store.listJobs().find((job) => job.sourceType === "heartbeat")?.input.sessionId
    ).toBe("session-heartbeat");
    expect(store.getHeartbeatRule("heartbeat-1")?.nextRunAt).toBe(now + 60_000);
  });
});
