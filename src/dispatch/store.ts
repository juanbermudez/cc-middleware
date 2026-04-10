import Database from "better-sqlite3";
import { generateId } from "../utils/id.js";
import type {
  CreateDispatchJobInput,
  DispatchCue,
  DispatchCueAction,
  DispatchCueTrigger,
  DispatchJob,
  DispatchJobListOptions,
  DispatchJobStatus,
  DispatchRun,
  DispatchRunInput,
  DispatchSchedule,
  DispatchSourceType,
  DispatchStatusSummary,
  HeartbeatRule,
  JsonObject,
  JsonValue,
} from "./types.js";

type DispatchJobRow = {
  id: string;
  status: DispatchJobStatus;
  source_type: DispatchSourceType;
  target_type: DispatchJob["targetType"];
  runtime_profile: DispatchJob["runtimeProfile"];
  prompt: string;
  cwd: string | null;
  session_id: string | null;
  agent: string | null;
  payload_json: string | null;
  variables_json: string | null;
  priority: number;
  run_at: number;
  next_run_at: number;
  created_at: number;
  updated_at: number;
  attempt_count: number;
  max_attempts: number;
  lease_duration_ms: number;
  lease_owner: string | null;
  lease_expires_at: number | null;
  dedupe_key: string | null;
  concurrency_key: string | null;
  cue_id: string | null;
  schedule_id: string | null;
  heartbeat_rule_id: string | null;
  last_started_at: number | null;
  completed_at: number | null;
  failed_at: number | null;
  cancelled_at: number | null;
  last_error: string | null;
  result_json: string | null;
};

type DispatchRunRow = {
  id: string;
  job_id: string;
  attempt: number;
  worker_id: string;
  status: string;
  started_at: number;
  finished_at: number | null;
  duration_ms: number | null;
  error: string | null;
  input_json: string | null;
  output_json: string | null;
  created_at: number;
};

type DispatchCueRow = {
  id: string;
  name: string;
  enabled: number;
  once: number;
  cooldown_ms: number | null;
  trigger_json: string;
  action_json: string;
  created_at: number;
  updated_at: number;
  last_triggered_at: number | null;
  last_job_id: string | null;
};

type DispatchScheduleRow = {
  id: string;
  name: string;
  enabled: number;
  cron: string;
  timezone: string;
  source_type: DispatchSourceType;
  target_type: DispatchJob["targetType"];
  runtime_profile: DispatchJob["runtimeProfile"];
  prompt: string;
  cwd: string | null;
  session_id: string | null;
  agent: string | null;
  priority: number | null;
  max_attempts: number | null;
  lease_duration_ms: number | null;
  concurrency_key: string | null;
  payload_json: string | null;
  variables_json: string | null;
  created_at: number;
  updated_at: number;
  last_run_at: number | null;
  next_run_at: number | null;
  last_job_id: string | null;
};

type HeartbeatRuleRow = {
  id: string;
  name: string;
  enabled: number;
  interval_ms: number;
  source_type: DispatchSourceType;
  target_type: DispatchJob["targetType"];
  runtime_profile: DispatchJob["runtimeProfile"];
  prompt: string;
  cwd: string | null;
  session_id: string | null;
  agent: string | null;
  priority: number | null;
  max_attempts: number | null;
  lease_duration_ms: number | null;
  concurrency_key: string | null;
  conditions_json: string | null;
  payload_json: string | null;
  variables_json: string | null;
  created_at: number;
  updated_at: number;
  last_run_at: number | null;
  next_run_at: number | null;
  last_job_id: string | null;
};

const DEFAULT_RUNTIME_PROFILE: DispatchJob["runtimeProfile"] = "isolated_sdk";
const DEFAULT_TARGET_TYPE: DispatchJob["targetType"] = "new_session";
const DEFAULT_LEASE_DURATION_MS = 60_000;

function hasSqliteUniqueConstraint(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code?: string }).code === "string" &&
    (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

function getDefaultConcurrencyKey(input: {
  targetType: DispatchJob["targetType"];
  sessionId?: string;
  cwd?: string;
}): string | undefined {
  if (
    (input.targetType === "resume_session" || input.targetType === "fork_session") &&
    input.sessionId
  ) {
    return `session:${input.sessionId}`;
  }

  if (input.targetType === "continue_session" && input.cwd) {
    return `continue:${input.cwd}`;
  }

  return undefined;
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonOrNull(value: JsonValue | undefined): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function optionalNumber(value: number | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : value;
}

function optionalString(value: string | null | undefined): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : value;
}

function asJob(row: DispatchJobRow): DispatchJob {
  return {
    id: row.id,
    status: row.status,
    sourceType: row.source_type,
    targetType: row.target_type,
    runtimeProfile: row.runtime_profile,
    input: {
      prompt: row.prompt,
      cwd: optionalString(row.cwd),
      sessionId: optionalString(row.session_id),
      agent: optionalString(row.agent),
      payload: parseJson<JsonValue | undefined>(row.payload_json, undefined),
      variables: parseJson<JsonObject | undefined>(row.variables_json, undefined),
    },
    priority: row.priority,
    runAt: row.run_at,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    leaseDurationMs: row.lease_duration_ms,
    leaseOwner: optionalString(row.lease_owner),
    leaseExpiresAt: optionalNumber(row.lease_expires_at),
    dedupeKey: optionalString(row.dedupe_key),
    concurrencyKey: optionalString(row.concurrency_key),
    cueId: optionalString(row.cue_id),
    scheduleId: optionalString(row.schedule_id),
    heartbeatRuleId: optionalString(row.heartbeat_rule_id),
    lastStartedAt: optionalNumber(row.last_started_at),
    completedAt: optionalNumber(row.completed_at),
    failedAt: optionalNumber(row.failed_at),
    cancelledAt: optionalNumber(row.cancelled_at),
    lastError: optionalString(row.last_error),
    result: parseJson<JsonValue | undefined>(row.result_json, undefined),
  };
}

function asRun(row: DispatchRunRow): DispatchRun {
  return {
    id: row.id,
    jobId: row.job_id,
    attempt: row.attempt,
    workerId: row.worker_id,
    status: row.status as DispatchRun["status"],
    startedAt: row.started_at,
    finishedAt: optionalNumber(row.finished_at),
    durationMs: optionalNumber(row.duration_ms),
    error: optionalString(row.error),
    input: parseJson<JsonValue | undefined>(row.input_json, undefined),
    output: parseJson<JsonValue | undefined>(row.output_json, undefined),
    createdAt: row.created_at,
  };
}

function asCue(row: DispatchCueRow): DispatchCue {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    once: row.once === 1,
    cooldownMs: optionalNumber(row.cooldown_ms),
    trigger: parseJson<DispatchCueTrigger>(row.trigger_json, { eventType: "*" }),
    action: parseJson<DispatchCueAction>(row.action_json, {
      prompt: "",
      targetType: DEFAULT_TARGET_TYPE,
      runtimeProfile: DEFAULT_RUNTIME_PROFILE,
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastTriggeredAt: optionalNumber(row.last_triggered_at),
    lastJobId: optionalString(row.last_job_id),
  };
}

function asSchedule(row: DispatchScheduleRow): DispatchSchedule {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    cron: row.cron,
    timezone: row.timezone,
    sourceType: row.source_type,
    targetType: row.target_type,
    runtimeProfile: row.runtime_profile,
    prompt: row.prompt,
    cwd: optionalString(row.cwd),
    sessionId: optionalString(row.session_id),
    agent: optionalString(row.agent),
    priority: optionalNumber(row.priority),
    maxAttempts: optionalNumber(row.max_attempts),
    leaseDurationMs: optionalNumber(row.lease_duration_ms),
    concurrencyKey: optionalString(row.concurrency_key),
    payload: parseJson<JsonValue | undefined>(row.payload_json, undefined),
    variables: parseJson<JsonObject | undefined>(row.variables_json, undefined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRunAt: optionalNumber(row.last_run_at),
    nextRunAt: optionalNumber(row.next_run_at),
    lastJobId: optionalString(row.last_job_id),
  };
}

function asHeartbeat(row: HeartbeatRuleRow): HeartbeatRule {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    intervalMs: row.interval_ms,
    sourceType: row.source_type,
    targetType: row.target_type,
    runtimeProfile: row.runtime_profile,
    prompt: row.prompt,
    cwd: optionalString(row.cwd),
    sessionId: optionalString(row.session_id),
    agent: optionalString(row.agent),
    priority: optionalNumber(row.priority),
    maxAttempts: optionalNumber(row.max_attempts),
    leaseDurationMs: optionalNumber(row.lease_duration_ms),
    concurrencyKey: optionalString(row.concurrency_key),
    conditions: parseJson<JsonObject | undefined>(row.conditions_json, undefined),
    payload: parseJson<JsonValue | undefined>(row.payload_json, undefined),
    variables: parseJson<JsonObject | undefined>(row.variables_json, undefined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRunAt: optionalNumber(row.last_run_at),
    nextRunAt: optionalNumber(row.next_run_at),
    lastJobId: optionalString(row.last_job_id),
  };
}

function jobOrderByClause(options?: DispatchJobListOptions): string {
  const field = options?.orderBy ?? "createdAt";
  const direction = options?.orderDirection ?? "desc";

  const columnMap: Record<NonNullable<DispatchJobListOptions["orderBy"]>, string> = {
    createdAt: "created_at",
    updatedAt: "updated_at",
    runAt: "run_at",
    nextRunAt: "next_run_at",
    priority: "priority",
    attemptCount: "attempt_count",
  };

  return `${columnMap[field]} ${direction.toUpperCase()}`;
}

function ensureDispatchRuleColumns(db: Database.Database): void {
  const ensureColumn = (table: string, column: string, definition: string) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((entry) => entry.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    }
  };

  ensureColumn("dispatch_schedules", "session_id", "session_id TEXT");
  ensureColumn("dispatch_heartbeat_rules", "session_id", "session_id TEXT");
}

export class DispatchStore {
  constructor(public readonly db: Database.Database) {}

  migrate(): void {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS dispatch_jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        source_type TEXT NOT NULL,
        target_type TEXT NOT NULL,
        runtime_profile TEXT NOT NULL,
        prompt TEXT NOT NULL,
        cwd TEXT,
        session_id TEXT,
        agent TEXT,
        payload_json TEXT,
        variables_json TEXT,
        priority INTEGER NOT NULL DEFAULT 0,
        run_at INTEGER NOT NULL,
        next_run_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 1,
        lease_duration_ms INTEGER NOT NULL DEFAULT ${DEFAULT_LEASE_DURATION_MS},
        lease_owner TEXT,
        lease_expires_at INTEGER,
        dedupe_key TEXT,
        concurrency_key TEXT,
        cue_id TEXT,
        schedule_id TEXT,
        heartbeat_rule_id TEXT,
        last_started_at INTEGER,
        completed_at INTEGER,
        failed_at INTEGER,
        cancelled_at INTEGER,
        last_error TEXT,
        result_json TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_jobs_dedupe_key
        ON dispatch_jobs(dedupe_key)
        WHERE dedupe_key IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_status_run
        ON dispatch_jobs(status, next_run_at, run_at, priority DESC, created_at ASC);

      CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_source_target
        ON dispatch_jobs(source_type, target_type);

      CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_lease
        ON dispatch_jobs(lease_owner, lease_expires_at);

      CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_concurrency
        ON dispatch_jobs(concurrency_key, status, lease_expires_at);

      CREATE TABLE IF NOT EXISTS dispatch_runs (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
        attempt INTEGER NOT NULL,
        worker_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        duration_ms INTEGER,
        error TEXT,
        input_json TEXT,
        output_json TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_dispatch_runs_job
        ON dispatch_runs(job_id, attempt, created_at DESC);

      CREATE TABLE IF NOT EXISTS dispatch_cues (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        once INTEGER NOT NULL DEFAULT 0,
        cooldown_ms INTEGER,
        trigger_json TEXT NOT NULL,
        action_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_triggered_at INTEGER,
        last_job_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_dispatch_cues_enabled
        ON dispatch_cues(enabled, updated_at DESC);

      CREATE TABLE IF NOT EXISTS dispatch_schedules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        cron TEXT NOT NULL,
        timezone TEXT NOT NULL,
        source_type TEXT NOT NULL,
        target_type TEXT NOT NULL,
        runtime_profile TEXT NOT NULL,
        prompt TEXT NOT NULL,
        cwd TEXT,
        session_id TEXT,
        agent TEXT,
        priority INTEGER,
        max_attempts INTEGER,
        lease_duration_ms INTEGER,
        concurrency_key TEXT,
        payload_json TEXT,
        variables_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_run_at INTEGER,
        next_run_at INTEGER,
        last_job_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_dispatch_schedules_enabled_next_run
        ON dispatch_schedules(enabled, next_run_at);

      CREATE TABLE IF NOT EXISTS dispatch_heartbeat_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        interval_ms INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        target_type TEXT NOT NULL,
        runtime_profile TEXT NOT NULL,
        prompt TEXT NOT NULL,
        cwd TEXT,
        session_id TEXT,
        agent TEXT,
        priority INTEGER,
        max_attempts INTEGER,
        lease_duration_ms INTEGER,
        concurrency_key TEXT,
        conditions_json TEXT,
        payload_json TEXT,
        variables_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_run_at INTEGER,
        next_run_at INTEGER,
        last_job_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_dispatch_heartbeat_rules_enabled_next_run
        ON dispatch_heartbeat_rules(enabled, next_run_at);
    `);

    ensureDispatchRuleColumns(this.db);
  }

  enqueueJob(input: CreateDispatchJobInput): DispatchJob {
    const existing = input.dedupeKey ? this.getJobByDedupeKey(input.dedupeKey) : undefined;
    if (existing) {
      return existing;
    }

    const now = Date.now();
    const id = input.id ?? generateId("dispatch-job");
    const jobInput = this.normalizeJobInput(input);
    const runAt = input.runAt ?? now;
    const nextRunAt = input.nextRunAt ?? runAt;
    const leaseDurationMs = input.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
    const runtimeProfile = input.runtimeProfile ?? DEFAULT_RUNTIME_PROFILE;
    const maxAttempts = input.maxAttempts ?? 1;

    const concurrencyKey =
      input.concurrencyKey ??
      getDefaultConcurrencyKey({
        targetType: input.targetType,
        sessionId: jobInput.sessionId,
        cwd: jobInput.cwd,
      });

    try {
      this.db.prepare(`
        INSERT INTO dispatch_jobs (
          id, status, source_type, target_type, runtime_profile,
          prompt, cwd, session_id, agent, payload_json, variables_json,
          priority, run_at, next_run_at, created_at, updated_at,
          attempt_count, max_attempts, lease_duration_ms, dedupe_key,
          concurrency_key, cue_id, schedule_id, heartbeat_rule_id
        ) VALUES (
          @id, @status, @sourceType, @targetType, @runtimeProfile,
          @prompt, @cwd, @sessionId, @agent, @payloadJson, @variablesJson,
          @priority, @runAt, @nextRunAt, @createdAt, @updatedAt,
          @attemptCount, @maxAttempts, @leaseDurationMs, @dedupeKey,
          @concurrencyKey, @cueId, @scheduleId, @heartbeatRuleId
        )
      `).run({
        id,
        status: "queued",
        sourceType: input.sourceType,
        targetType: input.targetType,
        runtimeProfile,
        prompt: jobInput.prompt,
        cwd: jobInput.cwd ?? null,
        sessionId: jobInput.sessionId ?? null,
        agent: jobInput.agent ?? null,
        payloadJson: jsonOrNull(jobInput.payload),
        variablesJson: jsonOrNull(jobInput.variables),
        priority: input.priority ?? 0,
        runAt,
        nextRunAt,
        createdAt: now,
        updatedAt: now,
        attemptCount: 0,
        maxAttempts,
        leaseDurationMs,
        dedupeKey: input.dedupeKey ?? null,
        concurrencyKey: concurrencyKey ?? null,
        cueId: input.cueId ?? null,
        scheduleId: input.scheduleId ?? null,
        heartbeatRuleId: input.heartbeatRuleId ?? null,
      });
    } catch (error) {
      if (input.dedupeKey && hasSqliteUniqueConstraint(error)) {
        const deduped = this.getJobByDedupeKey(input.dedupeKey);
        if (deduped) {
          return deduped;
        }
      }

      throw error;
    }

    return this.getJob(id)!;
  }

  getJob(id: string): DispatchJob | undefined {
    const row = this.db.prepare("SELECT * FROM dispatch_jobs WHERE id = ?").get(id) as
      | DispatchJobRow
      | undefined;
    return row ? asJob(row) : undefined;
  }

  getJobByDedupeKey(dedupeKey: string): DispatchJob | undefined {
    const row = this.db
      .prepare("SELECT * FROM dispatch_jobs WHERE dedupe_key = ? LIMIT 1")
      .get(dedupeKey) as DispatchJobRow | undefined;
    return row ? asJob(row) : undefined;
  }

  listJobs(options?: DispatchJobListOptions): DispatchJob[] {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};

    if (options?.statuses?.length) {
      clauses.push(`status IN (${options.statuses.map((_, index) => `@status${index}`).join(", ")})`);
      options.statuses.forEach((status, index) => {
        params[`status${index}`] = status;
      });
    }

    if (options?.sourceTypes?.length) {
      clauses.push(`source_type IN (${options.sourceTypes.map((_, index) => `@sourceType${index}`).join(", ")})`);
      options.sourceTypes.forEach((sourceType, index) => {
        params[`sourceType${index}`] = sourceType;
      });
    }

    if (options?.targetTypes?.length) {
      clauses.push(`target_type IN (${options.targetTypes.map((_, index) => `@targetType${index}`).join(", ")})`);
      options.targetTypes.forEach((targetType, index) => {
        params[`targetType${index}`] = targetType;
      });
    }

    if (options?.runtimeProfiles?.length) {
      clauses.push(`runtime_profile IN (${options.runtimeProfiles.map((_, index) => `@runtimeProfile${index}`).join(", ")})`);
      options.runtimeProfiles.forEach((runtimeProfile, index) => {
        params[`runtimeProfile${index}`] = runtimeProfile;
      });
    }

    if (options?.cueId) {
      clauses.push("cue_id = @cueId");
      params.cueId = options.cueId;
    }

    if (options?.scheduleId) {
      clauses.push("schedule_id = @scheduleId");
      params.scheduleId = options.scheduleId;
    }

    if (options?.heartbeatRuleId) {
      clauses.push("heartbeat_rule_id = @heartbeatRuleId");
      params.heartbeatRuleId = options.heartbeatRuleId;
    }

    if (options?.dedupeKey) {
      clauses.push("dedupe_key = @dedupeKey");
      params.dedupeKey = options.dedupeKey;
    }

    if (options?.concurrencyKey) {
      clauses.push("concurrency_key = @concurrencyKey");
      params.concurrencyKey = options.concurrencyKey;
    }

    if (options?.leaseOwner) {
      clauses.push("lease_owner = @leaseOwner");
      params.leaseOwner = options.leaseOwner;
    }

    if (options?.createdAfter !== undefined) {
      clauses.push("created_at >= @createdAfter");
      params.createdAfter = options.createdAfter;
    }

    if (options?.createdBefore !== undefined) {
      clauses.push("created_at <= @createdBefore");
      params.createdBefore = options.createdBefore;
    }

    if (options?.runAfter !== undefined) {
      clauses.push("COALESCE(last_started_at, run_at) >= @runAfter");
      params.runAfter = options.runAfter;
    }

    if (options?.runBefore !== undefined) {
      clauses.push("COALESCE(last_started_at, run_at) <= @runBefore");
      params.runBefore = options.runBefore;
    }

    if (options?.nextRunAfter !== undefined) {
      clauses.push("next_run_at >= @nextRunAfter");
      params.nextRunAfter = options.nextRunAfter;
    }

    if (options?.nextRunBefore !== undefined) {
      clauses.push("next_run_at <= @nextRunBefore");
      params.nextRunBefore = options.nextRunBefore;
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const rows = this.db
      .prepare(`
        SELECT *
        FROM dispatch_jobs
        ${where}
        ORDER BY ${jobOrderByClause(options)}, id ASC
        LIMIT @limit OFFSET @offset
      `)
      .all({ ...params, limit, offset }) as DispatchJobRow[];

    return rows.map(asJob);
  }

  claimDueJobs(options: {
    limit: number;
    now?: number;
    workerId: string;
    leaseDurationMs?: number;
  }): DispatchJob[] {
    const now = options.now ?? Date.now();
    const limit = options.limit;
    const scanLimit = Math.max(limit, limit * 4);
    const candidateRows = this.db
      .prepare(`
        SELECT *
        FROM dispatch_jobs
        WHERE status IN ('queued', 'running')
          AND COALESCE(next_run_at, run_at) <= @now
          AND (status = 'queued' OR lease_expires_at IS NULL OR lease_expires_at <= @now)
        ORDER BY priority DESC, COALESCE(next_run_at, run_at) ASC, created_at ASC, id ASC
        LIMIT @scanLimit
      `)
      .all({ now, scanLimit }) as DispatchJobRow[];

    const claimed: DispatchJob[] = [];
    const tx = this.db.transaction((rows: DispatchJobRow[]) => {
      for (const row of rows) {
        if (claimed.length >= limit) {
          break;
        }

        const updated = this.markJobRunning(row.id, {
          workerId: options.workerId,
          now,
          leaseDurationMs: options.leaseDurationMs,
          appendRun: true,
        });
        if (updated) {
          claimed.push(updated);
        }
      }
    });

    tx(candidateRows);
    return claimed;
  }

  markJobRunning(
    jobId: string,
    options: {
      workerId: string;
      now?: number;
      leaseDurationMs?: number;
      appendRun?: boolean;
    }
  ): DispatchJob | undefined {
    const now = options.now ?? Date.now();
    const job = this.getJob(jobId);
    if (!job) {
      return undefined;
    }

    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      return undefined;
    }

    const nextAttempt = job.attemptCount + 1;
    const leaseDurationMs = options.leaseDurationMs ?? job.leaseDurationMs;

    const result = this.db.prepare(`
      UPDATE dispatch_jobs
      SET status = 'running',
          attempt_count = @attemptCount,
          lease_owner = @leaseOwner,
          lease_expires_at = @leaseExpiresAt,
          last_started_at = @lastStartedAt,
          updated_at = @updatedAt,
          last_error = NULL
      WHERE id = @id
        AND status IN ('queued', 'running')
        AND (status = 'queued' OR lease_expires_at IS NULL OR lease_expires_at <= @now)
        AND (
          @concurrencyKey IS NULL OR NOT EXISTS (
            SELECT 1
            FROM dispatch_jobs AS conflicting
            WHERE conflicting.id <> @id
              AND conflicting.concurrency_key = @concurrencyKey
              AND conflicting.status = 'running'
              AND conflicting.lease_expires_at IS NOT NULL
              AND conflicting.lease_expires_at > @now
          )
        )
    `).run({
      id: jobId,
      attemptCount: nextAttempt,
      leaseOwner: options.workerId,
      leaseExpiresAt: now + leaseDurationMs,
      lastStartedAt: now,
      updatedAt: now,
      now,
      concurrencyKey: job.concurrencyKey ?? null,
    });

    if (result.changes === 0) {
      return undefined;
    }

    const updated = this.getJob(jobId);
    if (!updated) {
      return undefined;
    }

    if (options.appendRun) {
      this.appendRun({
        jobId,
        attempt: nextAttempt,
        workerId: options.workerId,
        status: "running",
        startedAt: now,
      });
    }

    return updated;
  }

  markJobCompleted(
    jobId: string,
    options: {
      workerId?: string;
      now?: number;
      result?: JsonValue;
    } = {}
  ): DispatchJob | undefined {
    const now = options.now ?? Date.now();
    const job = this.getJob(jobId);
    if (!job) {
      return undefined;
    }

    this.db.prepare(`
      UPDATE dispatch_jobs
      SET status = 'completed',
          updated_at = @updatedAt,
          completed_at = @completedAt,
          lease_owner = NULL,
          lease_expires_at = NULL,
          last_error = NULL,
          result_json = @resultJson
      WHERE id = @id
    `).run({
      id: jobId,
      updatedAt: now,
      completedAt: now,
      resultJson: jsonOrNull(options.result),
    });

    const workerId = options.workerId ?? job.leaseOwner ?? "system";
    if (workerId) {
      this.finishLatestRun(jobId, {
        status: "completed",
        workerId,
        now,
        output: options.result,
      });
    }

    return this.getJob(jobId);
  }

  markJobFailed(
    jobId: string,
    error: string,
    options: {
      workerId?: string;
      now?: number;
      retryAt?: number;
    } = {}
  ): DispatchJob | undefined {
    const now = options.now ?? Date.now();
    const job = this.getJob(jobId);
    if (!job) {
      return undefined;
    }

    const retryAt = options.retryAt ?? now;
    const shouldRetry = job.attemptCount < job.maxAttempts;
    const status: DispatchJobStatus = shouldRetry ? "queued" : "failed";

    this.db.prepare(`
      UPDATE dispatch_jobs
      SET status = @status,
          updated_at = @updatedAt,
          failed_at = @failedAt,
          next_run_at = @nextRunAt,
          lease_owner = NULL,
          lease_expires_at = NULL,
          last_error = @lastError
      WHERE id = @id
    `).run({
      id: jobId,
      status,
      updatedAt: now,
      failedAt: now,
      nextRunAt: shouldRetry ? retryAt : job.nextRunAt,
      lastError: error,
    });

    const workerId = options.workerId ?? job.leaseOwner ?? "system";
    if (workerId) {
      this.finishLatestRun(jobId, {
        status: "failed",
        workerId,
        now,
        error,
      });
    }

    return this.getJob(jobId);
  }

  cancelJob(
    jobId: string,
    now = Date.now()
  ): DispatchJob | undefined {
    const job = this.getJob(jobId);
    if (!job) {
      return undefined;
    }

    this.db.prepare(`
      UPDATE dispatch_jobs
      SET status = 'cancelled',
          updated_at = @updatedAt,
          cancelled_at = @cancelledAt,
          lease_owner = NULL,
          lease_expires_at = NULL
      WHERE id = @id
    `).run({
      id: jobId,
      updatedAt: now,
      cancelledAt: now,
    });

    return this.getJob(jobId);
  }

  appendRun(input: DispatchRunInput): DispatchRun {
    const id = generateId("dispatch-run");
    const createdAt = Date.now();

    this.db.prepare(`
      INSERT INTO dispatch_runs (
        id, job_id, attempt, worker_id, status, started_at,
        finished_at, duration_ms, error, input_json, output_json, created_at
      ) VALUES (
        @id, @jobId, @attempt, @workerId, @status, @startedAt,
        @finishedAt, @durationMs, @error, @inputJson, @outputJson, @createdAt
      )
    `).run({
      id,
      jobId: input.jobId,
      attempt: input.attempt,
      workerId: input.workerId,
      status: input.status,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt ?? null,
      durationMs: input.durationMs ?? null,
      error: input.error ?? null,
      inputJson: jsonOrNull(input.input),
      outputJson: jsonOrNull(input.output),
      createdAt,
    });

    return this.getRunById(id)!;
  }

  listRuns(jobId: string): DispatchRun[] {
    const rows = this.db
      .prepare("SELECT * FROM dispatch_runs WHERE job_id = ? ORDER BY created_at ASC, attempt ASC")
      .all(jobId) as DispatchRunRow[];
    return rows.map(asRun);
  }

  upsertCue(cue: DispatchCue): DispatchCue {
    this.db.prepare(`
      INSERT INTO dispatch_cues (
        id, name, enabled, once, cooldown_ms, trigger_json, action_json,
        created_at, updated_at, last_triggered_at, last_job_id
      ) VALUES (
        @id, @name, @enabled, @once, @cooldownMs, @triggerJson, @actionJson,
        @createdAt, @updatedAt, @lastTriggeredAt, @lastJobId
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        enabled = excluded.enabled,
        once = excluded.once,
        cooldown_ms = excluded.cooldown_ms,
        trigger_json = excluded.trigger_json,
        action_json = excluded.action_json,
        updated_at = excluded.updated_at,
        last_triggered_at = excluded.last_triggered_at,
        last_job_id = excluded.last_job_id
    `).run({
      id: cue.id,
      name: cue.name,
      enabled: cue.enabled ? 1 : 0,
      once: cue.once ? 1 : 0,
      cooldownMs: cue.cooldownMs ?? null,
      triggerJson: JSON.stringify(cue.trigger),
      actionJson: JSON.stringify(cue.action),
      createdAt: cue.createdAt,
      updatedAt: cue.updatedAt,
      lastTriggeredAt: cue.lastTriggeredAt ?? null,
      lastJobId: cue.lastJobId ?? null,
    });

    return this.getCue(cue.id)!;
  }

  getCue(id: string): DispatchCue | undefined {
    const row = this.db.prepare("SELECT * FROM dispatch_cues WHERE id = ?").get(id) as
      | DispatchCueRow
      | undefined;
    return row ? asCue(row) : undefined;
  }

  listCues(): DispatchCue[] {
    const rows = this.db.prepare("SELECT * FROM dispatch_cues ORDER BY updated_at DESC").all() as DispatchCueRow[];
    return rows.map(asCue);
  }

  deleteCue(id: string): void {
    this.db.prepare("DELETE FROM dispatch_cues WHERE id = ?").run(id);
  }

  upsertSchedule(schedule: DispatchSchedule): DispatchSchedule {
    this.db.prepare(`
      INSERT INTO dispatch_schedules (
        id, name, enabled, cron, timezone, source_type, target_type,
        runtime_profile, prompt, cwd, session_id, agent, priority, max_attempts,
        lease_duration_ms, concurrency_key, payload_json, variables_json,
        created_at, updated_at, last_run_at, next_run_at, last_job_id
      ) VALUES (
        @id, @name, @enabled, @cron, @timezone, @sourceType, @targetType,
        @runtimeProfile, @prompt, @cwd, @sessionId, @agent, @priority, @maxAttempts,
        @leaseDurationMs, @concurrencyKey, @payloadJson, @variablesJson,
        @createdAt, @updatedAt, @lastRunAt, @nextRunAt, @lastJobId
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        enabled = excluded.enabled,
        cron = excluded.cron,
        timezone = excluded.timezone,
        source_type = excluded.source_type,
        target_type = excluded.target_type,
        runtime_profile = excluded.runtime_profile,
        prompt = excluded.prompt,
        cwd = excluded.cwd,
        session_id = excluded.session_id,
        agent = excluded.agent,
        priority = excluded.priority,
        max_attempts = excluded.max_attempts,
        lease_duration_ms = excluded.lease_duration_ms,
        concurrency_key = excluded.concurrency_key,
        payload_json = excluded.payload_json,
        variables_json = excluded.variables_json,
        updated_at = excluded.updated_at,
        last_run_at = excluded.last_run_at,
        next_run_at = excluded.next_run_at,
        last_job_id = excluded.last_job_id
    `).run({
      id: schedule.id,
      name: schedule.name,
      enabled: schedule.enabled ? 1 : 0,
      cron: schedule.cron,
      timezone: schedule.timezone,
      sourceType: schedule.sourceType,
      targetType: schedule.targetType,
      runtimeProfile: schedule.runtimeProfile,
      prompt: schedule.prompt,
      cwd: schedule.cwd ?? null,
      sessionId: schedule.sessionId ?? null,
      agent: schedule.agent ?? null,
      priority: schedule.priority ?? null,
      maxAttempts: schedule.maxAttempts ?? null,
      leaseDurationMs: schedule.leaseDurationMs ?? null,
      concurrencyKey: schedule.concurrencyKey ?? null,
      payloadJson: jsonOrNull(schedule.payload),
      variablesJson: jsonOrNull(schedule.variables),
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
      lastRunAt: schedule.lastRunAt ?? null,
      nextRunAt: schedule.nextRunAt ?? null,
      lastJobId: schedule.lastJobId ?? null,
    });

    return this.getSchedule(schedule.id)!;
  }

  getSchedule(id: string): DispatchSchedule | undefined {
    const row = this.db.prepare("SELECT * FROM dispatch_schedules WHERE id = ?").get(id) as
      | DispatchScheduleRow
      | undefined;
    return row ? asSchedule(row) : undefined;
  }

  listSchedules(): DispatchSchedule[] {
    const rows = this.db.prepare("SELECT * FROM dispatch_schedules ORDER BY updated_at DESC").all() as DispatchScheduleRow[];
    return rows.map(asSchedule);
  }

  deleteSchedule(id: string): void {
    this.db.prepare("DELETE FROM dispatch_schedules WHERE id = ?").run(id);
  }

  upsertHeartbeatRule(rule: HeartbeatRule): HeartbeatRule {
    this.db.prepare(`
      INSERT INTO dispatch_heartbeat_rules (
        id, name, enabled, interval_ms, source_type, target_type,
        runtime_profile, prompt, cwd, session_id, agent, priority, max_attempts,
        lease_duration_ms, concurrency_key, conditions_json, payload_json,
        variables_json, created_at, updated_at, last_run_at, next_run_at, last_job_id
      ) VALUES (
        @id, @name, @enabled, @intervalMs, @sourceType, @targetType,
        @runtimeProfile, @prompt, @cwd, @sessionId, @agent, @priority, @maxAttempts,
        @leaseDurationMs, @concurrencyKey, @conditionsJson, @payloadJson,
        @variablesJson, @createdAt, @updatedAt, @lastRunAt, @nextRunAt, @lastJobId
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        enabled = excluded.enabled,
        interval_ms = excluded.interval_ms,
        source_type = excluded.source_type,
        target_type = excluded.target_type,
        runtime_profile = excluded.runtime_profile,
        prompt = excluded.prompt,
        cwd = excluded.cwd,
        session_id = excluded.session_id,
        agent = excluded.agent,
        priority = excluded.priority,
        max_attempts = excluded.max_attempts,
        lease_duration_ms = excluded.lease_duration_ms,
        concurrency_key = excluded.concurrency_key,
        conditions_json = excluded.conditions_json,
        payload_json = excluded.payload_json,
        variables_json = excluded.variables_json,
        updated_at = excluded.updated_at,
        last_run_at = excluded.last_run_at,
        next_run_at = excluded.next_run_at,
        last_job_id = excluded.last_job_id
    `).run({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled ? 1 : 0,
      intervalMs: rule.intervalMs,
      sourceType: rule.sourceType,
      targetType: rule.targetType,
      runtimeProfile: rule.runtimeProfile,
      prompt: rule.prompt,
      cwd: rule.cwd ?? null,
      sessionId: rule.sessionId ?? null,
      agent: rule.agent ?? null,
      priority: rule.priority ?? null,
      maxAttempts: rule.maxAttempts ?? null,
      leaseDurationMs: rule.leaseDurationMs ?? null,
      concurrencyKey: rule.concurrencyKey ?? null,
      conditionsJson: jsonOrNull(rule.conditions),
      payloadJson: jsonOrNull(rule.payload),
      variablesJson: jsonOrNull(rule.variables),
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      lastRunAt: rule.lastRunAt ?? null,
      nextRunAt: rule.nextRunAt ?? null,
      lastJobId: rule.lastJobId ?? null,
    });

    return this.getHeartbeatRule(rule.id)!;
  }

  getHeartbeatRule(id: string): HeartbeatRule | undefined {
    const row = this.db.prepare("SELECT * FROM dispatch_heartbeat_rules WHERE id = ?").get(id) as
      | HeartbeatRuleRow
      | undefined;
    return row ? asHeartbeat(row) : undefined;
  }

  listHeartbeatRules(): HeartbeatRule[] {
    const rows = this.db.prepare("SELECT * FROM dispatch_heartbeat_rules ORDER BY updated_at DESC").all() as HeartbeatRuleRow[];
    return rows.map(asHeartbeat);
  }

  deleteHeartbeatRule(id: string): void {
    this.db.prepare("DELETE FROM dispatch_heartbeat_rules WHERE id = ?").run(id);
  }

  getSummary(now = Date.now()): DispatchStatusSummary {
    const counts = this.db
      .prepare(`
        SELECT
          COUNT(*) AS totalJobs,
          SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queuedJobs,
          SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS runningJobs,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedJobs,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failedJobs,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelledJobs,
          SUM(CASE WHEN status IN ('queued', 'running')
                    AND COALESCE(next_run_at, run_at) <= @now
                    AND (status = 'queued' OR lease_expires_at IS NULL OR lease_expires_at <= @now)
                   THEN 1 ELSE 0 END) AS dueJobs
        FROM dispatch_jobs
      `)
      .get({ now }) as Record<string, number | null>;

    const activeCues = this.db.prepare("SELECT COUNT(*) AS total FROM dispatch_cues WHERE enabled = 1").get() as {
      total: number;
    };
    const activeSchedules = this.db.prepare("SELECT COUNT(*) AS total FROM dispatch_schedules WHERE enabled = 1").get() as {
      total: number;
    };
    const activeHeartbeatRules = this.db.prepare("SELECT COUNT(*) AS total FROM dispatch_heartbeat_rules WHERE enabled = 1").get() as {
      total: number;
    };

    return {
      totalJobs: Number(counts.totalJobs ?? 0),
      queuedJobs: Number(counts.queuedJobs ?? 0),
      runningJobs: Number(counts.runningJobs ?? 0),
      completedJobs: Number(counts.completedJobs ?? 0),
      failedJobs: Number(counts.failedJobs ?? 0),
      cancelledJobs: Number(counts.cancelledJobs ?? 0),
      dueJobs: Number(counts.dueJobs ?? 0),
      activeCues: activeCues.total,
      activeSchedules: activeSchedules.total,
      activeHeartbeatRules: activeHeartbeatRules.total,
    };
  }

  private getRunById(id: string): DispatchRun | undefined {
    const row = this.db.prepare("SELECT * FROM dispatch_runs WHERE id = ?").get(id) as
      | DispatchRunRow
      | undefined;
    return row ? asRun(row) : undefined;
  }

  private finishLatestRun(
    jobId: string,
    options: {
      status: DispatchRun["status"];
      workerId: string;
      now: number;
      error?: string;
      output?: JsonValue;
    }
  ): void {
    const latestRun = this.db
      .prepare("SELECT * FROM dispatch_runs WHERE job_id = ? ORDER BY attempt DESC, created_at DESC LIMIT 1")
      .get(jobId) as DispatchRunRow | undefined;
    if (!latestRun) {
      return;
    }

    const durationMs = Math.max(0, options.now - latestRun.started_at);
    this.db.prepare(`
      UPDATE dispatch_runs
      SET status = @status,
          worker_id = @workerId,
          finished_at = @finishedAt,
          duration_ms = @durationMs,
          error = @error,
          output_json = @outputJson
      WHERE id = @id
    `).run({
      id: latestRun.id,
      status: options.status,
      workerId: options.workerId,
      finishedAt: options.now,
      durationMs,
      error: options.error ?? null,
      outputJson: jsonOrNull(options.output),
    });
  }

  private normalizeJobInput(input: CreateDispatchJobInput): DispatchJob["input"] {
    return {
      prompt: input.prompt,
      cwd: input.cwd,
      sessionId: input.sessionId,
      agent: input.agent,
      payload: input.payload,
      variables: input.variables,
    };
  }
}

export function createDispatchStore(db: Database.Database): DispatchStore {
  return new DispatchStore(db);
}
