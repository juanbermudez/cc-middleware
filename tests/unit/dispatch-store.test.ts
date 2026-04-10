import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { DispatchStore, createDispatchStore } from "../../src/dispatch/store.js";
import type { DispatchCue, DispatchJob, DispatchSchedule, HeartbeatRule } from "../../src/dispatch/types.js";

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

function makeJob(overrides?: Partial<DispatchJob>): DispatchJob {
  const now = Date.now();
  return {
    id: overrides?.id ?? "job-1",
    status: overrides?.status ?? "queued",
    sourceType: overrides?.sourceType ?? "manual",
    targetType: overrides?.targetType ?? "new_session",
    runtimeProfile: overrides?.runtimeProfile ?? "isolated_sdk",
    input: overrides?.input ?? {
      prompt: "Follow up",
      cwd: "/tmp/project",
      sessionId: "session-1",
      agent: "writer",
      payload: { hello: "world" },
    },
    priority: overrides?.priority ?? 0,
    runAt: overrides?.runAt ?? now,
    nextRunAt: overrides?.nextRunAt ?? now,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    attemptCount: overrides?.attemptCount ?? 0,
    maxAttempts: overrides?.maxAttempts ?? 3,
    leaseDurationMs: overrides?.leaseDurationMs ?? 60_000,
    leaseOwner: overrides?.leaseOwner,
    leaseExpiresAt: overrides?.leaseExpiresAt,
    dedupeKey: overrides?.dedupeKey,
    concurrencyKey: overrides?.concurrencyKey,
    cueId: overrides?.cueId,
    scheduleId: overrides?.scheduleId,
    heartbeatRuleId: overrides?.heartbeatRuleId,
    lastStartedAt: overrides?.lastStartedAt,
    completedAt: overrides?.completedAt,
    failedAt: overrides?.failedAt,
    cancelledAt: overrides?.cancelledAt,
    lastError: overrides?.lastError,
    result: overrides?.result,
  };
}

function makeCue(overrides?: Partial<DispatchCue>): DispatchCue {
  const now = Date.now();
  return {
    id: overrides?.id ?? "cue-1",
    name: overrides?.name ?? "On PreToolUse",
    enabled: overrides?.enabled ?? true,
    once: overrides?.once ?? false,
    cooldownMs: overrides?.cooldownMs,
    trigger: overrides?.trigger ?? {
      eventType: "PreToolUse",
      matcher: "^Bash$",
      toolName: "Bash",
    },
    action: overrides?.action ?? {
      prompt: "Review the bash output",
      targetType: "new_session",
      runtimeProfile: "claude_runtime",
      cwd: "/tmp/project",
    },
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    lastTriggeredAt: overrides?.lastTriggeredAt,
    lastJobId: overrides?.lastJobId,
  };
}

function makeSchedule(overrides?: Partial<DispatchSchedule>): DispatchSchedule {
  const now = Date.now();
  return {
    id: overrides?.id ?? "schedule-1",
    name: overrides?.name ?? "Nightly check",
    enabled: overrides?.enabled ?? true,
    cron: overrides?.cron ?? "0 0 * * *",
    timezone: overrides?.timezone ?? "UTC",
    sourceType: overrides?.sourceType ?? "cron",
    targetType: overrides?.targetType ?? "new_session",
    runtimeProfile: overrides?.runtimeProfile ?? "claude_runtime",
    prompt: overrides?.prompt ?? "Run the nightly check",
    cwd: overrides?.cwd,
    sessionId: overrides?.sessionId,
    agent: overrides?.agent,
    priority: overrides?.priority,
    maxAttempts: overrides?.maxAttempts,
    leaseDurationMs: overrides?.leaseDurationMs,
    concurrencyKey: overrides?.concurrencyKey,
    payload: overrides?.payload,
    variables: overrides?.variables,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    lastRunAt: overrides?.lastRunAt,
    nextRunAt: overrides?.nextRunAt,
    lastJobId: overrides?.lastJobId,
  };
}

function makeHeartbeatRule(overrides?: Partial<HeartbeatRule>): HeartbeatRule {
  const now = Date.now();
  return {
    id: overrides?.id ?? "heartbeat-1",
    name: overrides?.name ?? "Runtime heartbeat",
    enabled: overrides?.enabled ?? true,
    intervalMs: overrides?.intervalMs ?? 30_000,
    sourceType: overrides?.sourceType ?? "heartbeat",
    targetType: overrides?.targetType ?? "new_session",
    runtimeProfile: overrides?.runtimeProfile ?? "claude_runtime",
    prompt: overrides?.prompt ?? "Check middleware health",
    cwd: overrides?.cwd,
    sessionId: overrides?.sessionId,
    agent: overrides?.agent,
    priority: overrides?.priority,
    maxAttempts: overrides?.maxAttempts,
    leaseDurationMs: overrides?.leaseDurationMs,
    concurrencyKey: overrides?.concurrencyKey,
    conditions: overrides?.conditions,
    payload: overrides?.payload,
    variables: overrides?.variables,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
    lastRunAt: overrides?.lastRunAt,
    nextRunAt: overrides?.nextRunAt,
    lastJobId: overrides?.lastJobId,
  };
}

describe("DispatchStore", () => {
  it("enqueues, claims, completes, and fails jobs", () => {
    const now = Date.now();
    const first = store.enqueueJob({
      sourceType: "manual",
      targetType: "new_session",
      runtimeProfile: "claude_runtime",
      prompt: "Summarize the latest hook activity",
      cwd: "/tmp/project",
      priority: 10,
      runAt: now,
      nextRunAt: now,
      maxAttempts: 2,
      leaseDurationMs: 5_000,
      dedupeKey: "job-dedupe-1",
      concurrencyKey: "project-a",
      payload: { kind: "followup" },
    });

    const second = store.enqueueJob({
      sourceType: "cron",
      targetType: "resume_session",
      runtimeProfile: "isolated_sdk",
      prompt: "Resume the weekly digest",
      sessionId: "session-123",
      runAt: now,
      nextRunAt: now,
      maxAttempts: 1,
    });

    expect(store.listJobs()).toHaveLength(2);
    expect(store.getJob(first.id)?.input.prompt).toBe("Summarize the latest hook activity");
    expect(store.getJob(second.id)?.targetType).toBe("resume_session");

    const claimed = store.claimDueJobs({ limit: 2, now, workerId: "worker-a" });
    expect(claimed).toHaveLength(2);
    expect(claimed[0].status).toBe("running");
    expect(claimed[0].leaseOwner).toBe("worker-a");
    expect(claimed[0].attemptCount).toBe(1);

    const completed = store.markJobCompleted(claimed[0].id, {
      workerId: "worker-a",
      now: now + 1_000,
      result: { ok: true },
    });
    expect(completed?.status).toBe("completed");
    expect(completed?.result).toEqual({ ok: true });

    const failed = store.markJobFailed(claimed[1].id, "boom", {
      workerId: "worker-a",
      now: now + 1_500,
    });
    expect(failed?.status).toBe("failed");
    expect(failed?.lastError).toBe("boom");

    const runs = store.listRuns(first.id);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("completed");

    const summary = store.getSummary(now + 2_000);
    expect(summary.totalJobs).toBe(2);
    expect(summary.completedJobs).toBe(1);
    expect(summary.failedJobs).toBe(1);
    expect(summary.runningJobs).toBe(0);
  });

  it("supports cue CRUD and schedule and heartbeat persistence", () => {
    const cue = store.upsertCue(makeCue());
    expect(cue.name).toBe("On PreToolUse");
    expect(store.getCue(cue.id)?.trigger.eventType).toBe("PreToolUse");
    expect(store.listCues()).toHaveLength(1);

    const updated = store.upsertCue(makeCue({ id: cue.id, name: "Updated cue", once: true }));
    expect(updated.name).toBe("Updated cue");
    expect(updated.once).toBe(true);

    store.deleteCue(cue.id);
    expect(store.getCue(cue.id)).toBeUndefined();

    const schedule = store.upsertSchedule(makeSchedule({ sessionId: "session-42" }));
    expect(schedule.cron).toBe("0 0 * * *");
    expect(schedule.sessionId).toBe("session-42");
    expect(store.listSchedules()).toHaveLength(1);
    store.deleteSchedule(schedule.id);
    expect(store.getSchedule(schedule.id)).toBeUndefined();

    const heartbeat = store.upsertHeartbeatRule(makeHeartbeatRule({ sessionId: "session-77" }));
    expect(heartbeat.intervalMs).toBe(30_000);
    expect(heartbeat.sessionId).toBe("session-77");
    expect(store.listHeartbeatRules()).toHaveLength(1);
    store.deleteHeartbeatRule(heartbeat.id);
    expect(store.getHeartbeatRule(heartbeat.id)).toBeUndefined();
  });

  it("serializes claimed jobs for the same session by default concurrency key", () => {
    const now = Date.now();
    const first = store.enqueueJob({
      sourceType: "manual",
      targetType: "resume_session",
      runtimeProfile: "claude_runtime",
      prompt: "First follow-up",
      sessionId: "session-shared",
      runAt: now,
      nextRunAt: now,
    });
    const second = store.enqueueJob({
      sourceType: "manual",
      targetType: "resume_session",
      runtimeProfile: "claude_runtime",
      prompt: "Second follow-up",
      sessionId: "session-shared",
      runAt: now,
      nextRunAt: now,
    });

    expect(store.getJob(first.id)?.concurrencyKey).toBe("session:session-shared");
    expect(store.getJob(second.id)?.concurrencyKey).toBe("session:session-shared");

    const firstClaim = store.claimDueJobs({ limit: 2, now, workerId: "worker-a" });
    expect(firstClaim).toHaveLength(1);
    expect(firstClaim[0].id).toBe(first.id);

    store.markJobCompleted(first.id, { workerId: "worker-a", now: now + 100 });

    const secondClaim = store.claimDueJobs({ limit: 2, now: now + 101, workerId: "worker-a" });
    expect(secondClaim).toHaveLength(1);
    expect(secondClaim[0].id).toBe(second.id);
  });
});
