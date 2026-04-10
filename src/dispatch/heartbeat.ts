import type { AskUserQuestionManager } from "../permissions/ask-user.js";
import type { PermissionManager } from "../permissions/handler.js";
import type { SessionManager } from "../sessions/manager.js";
import type { DispatchStore } from "./store.js";
import type { HeartbeatRule, JsonObject } from "./types.js";

export interface HeartbeatSnapshot {
  timestamp: number;
  activeSessions: number;
  pendingPermissions: number;
  pendingQuestions: number;
  queuedJobs: number;
  runningJobs: number;
  dueJobs: number;
  failedJobs: number;
}

export interface HeartbeatContext {
  sessionManager: SessionManager;
  permissionManager: PermissionManager;
  askUserManager: AskUserQuestionManager;
  store: DispatchStore;
}

function readNumericCondition(
  conditions: JsonObject | undefined,
  key: string
): number | undefined {
  const value = conditions?.[key];
  return typeof value === "number" ? value : undefined;
}

function matchesHeartbeatConditions(
  rule: HeartbeatRule,
  snapshot: HeartbeatSnapshot
): boolean {
  const conditions = rule.conditions;
  if (!conditions) {
    return true;
  }

  const checks: Array<[number | undefined, number, (left: number, right: number) => boolean]> = [
    [readNumericCondition(conditions, "activeSessionsGte"), snapshot.activeSessions, (a, b) => b >= a],
    [readNumericCondition(conditions, "activeSessionsLte"), snapshot.activeSessions, (a, b) => b <= a],
    [readNumericCondition(conditions, "pendingPermissionsGte"), snapshot.pendingPermissions, (a, b) => b >= a],
    [readNumericCondition(conditions, "pendingPermissionsLte"), snapshot.pendingPermissions, (a, b) => b <= a],
    [readNumericCondition(conditions, "pendingQuestionsGte"), snapshot.pendingQuestions, (a, b) => b >= a],
    [readNumericCondition(conditions, "pendingQuestionsLte"), snapshot.pendingQuestions, (a, b) => b <= a],
    [readNumericCondition(conditions, "queuedJobsGte"), snapshot.queuedJobs, (a, b) => b >= a],
    [readNumericCondition(conditions, "queuedJobsLte"), snapshot.queuedJobs, (a, b) => b <= a],
    [readNumericCondition(conditions, "runningJobsGte"), snapshot.runningJobs, (a, b) => b >= a],
    [readNumericCondition(conditions, "runningJobsLte"), snapshot.runningJobs, (a, b) => b <= a],
    [readNumericCondition(conditions, "dueJobsGte"), snapshot.dueJobs, (a, b) => b >= a],
    [readNumericCondition(conditions, "dueJobsLte"), snapshot.dueJobs, (a, b) => b <= a],
    [readNumericCondition(conditions, "failedJobsGte"), snapshot.failedJobs, (a, b) => b >= a],
    [readNumericCondition(conditions, "failedJobsLte"), snapshot.failedJobs, (a, b) => b <= a],
  ];

  return checks.every(([threshold, actual, predicate]) => {
    if (threshold === undefined) {
      return true;
    }
    return predicate(threshold, actual);
  });
}

export function createHeartbeatSnapshot(
  context: HeartbeatContext,
  now = Date.now()
): HeartbeatSnapshot {
  const summary = context.store.getSummary(now);
  return {
    timestamp: now,
    activeSessions: context.sessionManager.getActiveSessions().length,
    pendingPermissions: context.permissionManager.getPendingPermissions().length,
    pendingQuestions: context.askUserManager.getPendingQuestions().length,
    queuedJobs: summary.queuedJobs,
    runningJobs: summary.runningJobs,
    dueJobs: summary.dueJobs,
    failedJobs: summary.failedJobs,
  };
}

export function materializeDueHeartbeatRules(
  store: DispatchStore,
  snapshot: HeartbeatSnapshot,
  onTriggered?: (rule: HeartbeatRule, jobId: string) => void
): number {
  let triggered = 0;

  for (const rule of store.listHeartbeatRules()) {
    if (!rule.enabled || rule.nextRunAt === undefined || rule.nextRunAt > snapshot.timestamp) {
      continue;
    }

    const nextRunAt = snapshot.timestamp + rule.intervalMs;
    const shouldDispatch = matchesHeartbeatConditions(rule, snapshot);

    if (shouldDispatch) {
      const payload: JsonObject = {
        snapshot: snapshot as unknown as JsonObject,
      };
      if (rule.payload !== undefined) {
        payload.payload = rule.payload;
      }

      const job = store.enqueueJob({
        sourceType: rule.sourceType,
        targetType: rule.targetType,
        runtimeProfile: rule.runtimeProfile,
        prompt: rule.prompt,
        cwd: rule.cwd,
        sessionId: rule.sessionId,
        agent: rule.agent,
        priority: rule.priority,
        maxAttempts: rule.maxAttempts,
        leaseDurationMs: rule.leaseDurationMs,
        concurrencyKey: rule.concurrencyKey,
        dedupeKey: `heartbeat:${rule.id}:${rule.nextRunAt ?? snapshot.timestamp}`,
        heartbeatRuleId: rule.id,
        payload,
        variables: {
          snapshot: snapshot as unknown as JsonObject,
          ...(rule.variables ?? {}),
        },
        runAt: snapshot.timestamp,
        nextRunAt: snapshot.timestamp,
      });

      store.upsertHeartbeatRule({
        ...rule,
        updatedAt: snapshot.timestamp,
        lastRunAt: snapshot.timestamp,
        nextRunAt,
        lastJobId: job.id,
      });

      triggered += 1;
      onTriggered?.(rule, job.id);
      continue;
    }

    store.upsertHeartbeatRule({
      ...rule,
      updatedAt: snapshot.timestamp,
      lastRunAt: snapshot.timestamp,
      nextRunAt,
    });
  }

  return triggered;
}
