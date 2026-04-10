import type { HookEventType } from "../types/hooks.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type DispatchJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type DispatchSourceType = "manual" | "cue" | "cron" | "heartbeat";

export type DispatchTargetType =
  | "new_session"
  | "resume_session"
  | "continue_session"
  | "fork_session"
  | "agent";

export type DispatchRuntimeProfile = "claude_runtime" | "isolated_sdk";

export type DispatchSortField =
  | "createdAt"
  | "updatedAt"
  | "runAt"
  | "nextRunAt"
  | "priority"
  | "attemptCount";

export type DispatchSortDirection = "asc" | "desc";

export interface DispatchJobInput {
  prompt: string;
  cwd?: string;
  sessionId?: string;
  agent?: string;
  payload?: JsonValue;
  variables?: JsonObject;
}

export interface DispatchJobInputMeta {
  id?: string;
  sourceType: DispatchSourceType;
  targetType: DispatchTargetType;
  runtimeProfile?: DispatchRuntimeProfile;
  priority?: number;
  runAt?: number;
  nextRunAt?: number;
  maxAttempts?: number;
  leaseDurationMs?: number;
  dedupeKey?: string;
  concurrencyKey?: string;
  cueId?: string;
  scheduleId?: string;
  heartbeatRuleId?: string;
}

export interface CreateDispatchJobInput extends DispatchJobInput, DispatchJobInputMeta {}

export interface DispatchJobListOptions {
  limit?: number;
  offset?: number;
  statuses?: DispatchJobStatus[];
  sourceTypes?: DispatchSourceType[];
  targetTypes?: DispatchTargetType[];
  runtimeProfiles?: DispatchRuntimeProfile[];
  cueId?: string;
  scheduleId?: string;
  heartbeatRuleId?: string;
  dedupeKey?: string;
  concurrencyKey?: string;
  leaseOwner?: string;
  createdAfter?: number;
  createdBefore?: number;
  runAfter?: number;
  runBefore?: number;
  nextRunAfter?: number;
  nextRunBefore?: number;
  orderBy?: DispatchSortField;
  orderDirection?: DispatchSortDirection;
}

export interface DispatchJob {
  id: string;
  status: DispatchJobStatus;
  sourceType: DispatchSourceType;
  targetType: DispatchTargetType;
  runtimeProfile: DispatchRuntimeProfile;
  input: DispatchJobInput;
  priority: number;
  runAt: number;
  nextRunAt: number;
  createdAt: number;
  updatedAt: number;
  attemptCount: number;
  maxAttempts: number;
  leaseDurationMs: number;
  leaseOwner?: string;
  leaseExpiresAt?: number;
  dedupeKey?: string;
  concurrencyKey?: string;
  cueId?: string;
  scheduleId?: string;
  heartbeatRuleId?: string;
  lastStartedAt?: number;
  completedAt?: number;
  failedAt?: number;
  cancelledAt?: number;
  lastError?: string;
  result?: JsonValue;
}

export type DispatchRunStatus = "running" | "completed" | "failed" | "cancelled";

export interface DispatchRun {
  id: string;
  jobId: string;
  attempt: number;
  workerId: string;
  status: DispatchRunStatus;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  error?: string;
  input?: JsonValue;
  output?: JsonValue;
  createdAt: number;
}

export interface DispatchRunInput {
  jobId: string;
  attempt: number;
  workerId: string;
  status: DispatchRunStatus;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  error?: string;
  input?: JsonValue;
  output?: JsonValue;
}

export interface DispatchCueTrigger {
  eventType: HookEventType | "*";
  matcher?: string;
  toolName?: string;
  sessionId?: string;
  cwd?: string;
  agentId?: string;
  agentType?: string;
  teamName?: string;
}

export interface DispatchCueAction {
  prompt: string;
  targetType: DispatchTargetType;
  runtimeProfile: DispatchRuntimeProfile;
  cwd?: string;
  sessionId?: string;
  agent?: string;
  priority?: number;
  maxAttempts?: number;
  leaseDurationMs?: number;
  concurrencyKey?: string;
  payload?: JsonValue;
  variables?: JsonObject;
}

export interface DispatchCue {
  id: string;
  name: string;
  enabled: boolean;
  once: boolean;
  cooldownMs?: number;
  trigger: DispatchCueTrigger;
  action: DispatchCueAction;
  createdAt: number;
  updatedAt: number;
  lastTriggeredAt?: number;
  lastJobId?: string;
}

export interface DispatchSchedule {
  id: string;
  name: string;
  enabled: boolean;
  cron: string;
  timezone: string;
  sourceType: DispatchSourceType;
  targetType: DispatchTargetType;
  runtimeProfile: DispatchRuntimeProfile;
  prompt: string;
  cwd?: string;
  sessionId?: string;
  agent?: string;
  priority?: number;
  maxAttempts?: number;
  leaseDurationMs?: number;
  concurrencyKey?: string;
  payload?: JsonValue;
  variables?: JsonObject;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  lastJobId?: string;
}

export interface HeartbeatRule {
  id: string;
  name: string;
  enabled: boolean;
  intervalMs: number;
  sourceType: DispatchSourceType;
  targetType: DispatchTargetType;
  runtimeProfile: DispatchRuntimeProfile;
  prompt: string;
  cwd?: string;
  sessionId?: string;
  agent?: string;
  priority?: number;
  maxAttempts?: number;
  leaseDurationMs?: number;
  concurrencyKey?: string;
  conditions?: JsonObject;
  payload?: JsonValue;
  variables?: JsonObject;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  lastJobId?: string;
}

export interface DispatchStatusSummary {
  totalJobs: number;
  queuedJobs: number;
  runningJobs: number;
  completedJobs: number;
  failedJobs: number;
  cancelledJobs: number;
  dueJobs: number;
  activeCues: number;
  activeSchedules: number;
  activeHeartbeatRules: number;
}
