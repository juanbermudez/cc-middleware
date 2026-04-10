import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { MiddlewareContext } from "../server.js";
import { computeNextCronRun } from "../../dispatch/scheduler.js";
import { generateId } from "../../utils/id.js";

function targetRequiresSessionId(targetType: string): boolean {
  return targetType === "resume_session" || targetType === "fork_session";
}

const DispatchJobSchema = z.object({
  prompt: z.string().min(1),
  cwd: z.string().optional(),
  sessionId: z.string().optional(),
  agent: z.string().optional(),
  sourceType: z.enum(["manual", "cue", "cron", "heartbeat"]).default("manual"),
  targetType: z
    .enum(["new_session", "resume_session", "continue_session", "fork_session", "agent"])
    .default("new_session"),
  runtimeProfile: z.enum(["claude_runtime", "isolated_sdk"]).default("claude_runtime"),
  priority: z.number().int().optional(),
  runAt: z.number().int().optional(),
  nextRunAt: z.number().int().optional(),
  maxAttempts: z.number().int().positive().optional(),
  leaseDurationMs: z.number().int().positive().optional(),
  dedupeKey: z.string().min(1).optional(),
  concurrencyKey: z.string().min(1).optional(),
  payload: z.any().optional(),
  variables: z.record(z.string(), z.any()).optional(),
}).superRefine((value, ctx) => {
  if (targetRequiresSessionId(value.targetType) && !value.sessionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "sessionId is required for resume_session and fork_session jobs",
      path: ["sessionId"],
    });
  }
});

const DispatchListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  status: z.string().optional(),
  sourceType: z.string().optional(),
  targetType: z.string().optional(),
  runtimeProfile: z.string().optional(),
});

const DispatchCueSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  once: z.boolean().optional(),
  cooldownMs: z.number().int().nonnegative().optional(),
  trigger: z.object({
    eventType: z.union([
      z.literal("*"),
      z.enum([
        "PreToolUse",
        "PostToolUse",
        "PostToolUseFailure",
        "SessionStart",
        "SessionEnd",
        "InstructionsLoaded",
        "UserPromptSubmit",
        "Stop",
        "StopFailure",
        "SubagentStart",
        "SubagentStop",
        "TaskCreated",
        "TaskCompleted",
        "TeammateIdle",
        "PermissionRequest",
        "PermissionDenied",
        "Notification",
        "ConfigChange",
        "CwdChanged",
        "FileChanged",
        "WorktreeCreate",
        "WorktreeRemove",
        "PreCompact",
        "PostCompact",
        "Elicitation",
        "ElicitationResult",
        "Setup",
      ]),
    ]),
    matcher: z.string().optional(),
    toolName: z.string().optional(),
    sessionId: z.string().optional(),
    cwd: z.string().optional(),
    agentId: z.string().optional(),
    agentType: z.string().optional(),
    teamName: z.string().optional(),
  }),
  action: z.object({
    prompt: z.string().min(1),
    targetType: z.enum(["new_session", "resume_session", "continue_session", "fork_session", "agent"]),
    runtimeProfile: z.enum(["claude_runtime", "isolated_sdk"]),
    cwd: z.string().optional(),
    sessionId: z.string().optional(),
    agent: z.string().optional(),
    priority: z.number().int().optional(),
    maxAttempts: z.number().int().positive().optional(),
    leaseDurationMs: z.number().int().positive().optional(),
    concurrencyKey: z.string().optional(),
    payload: z.any().optional(),
    variables: z.record(z.string(), z.any()).optional(),
  }),
});

const DispatchScheduleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  cron: z.string().min(1),
  timezone: z.string().min(1).default("UTC"),
  sourceType: z.enum(["cron"]).default("cron"),
  targetType: z
    .enum(["new_session", "resume_session", "continue_session", "fork_session", "agent"])
    .default("new_session"),
  runtimeProfile: z.enum(["claude_runtime", "isolated_sdk"]).default("claude_runtime"),
  prompt: z.string().min(1),
  cwd: z.string().optional(),
  sessionId: z.string().optional(),
  agent: z.string().optional(),
  priority: z.number().int().optional(),
  maxAttempts: z.number().int().positive().optional(),
  leaseDurationMs: z.number().int().positive().optional(),
  concurrencyKey: z.string().optional(),
  payload: z.any().optional(),
  variables: z.record(z.string(), z.any()).optional(),
  nextRunAt: z.number().int().optional(),
}).superRefine((value, ctx) => {
  if (targetRequiresSessionId(value.targetType) && !value.sessionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "sessionId is required for resume_session and fork_session schedules",
      path: ["sessionId"],
    });
  }
});

const HeartbeatRuleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  intervalMs: z.number().int().positive(),
  sourceType: z.enum(["heartbeat"]).default("heartbeat"),
  targetType: z
    .enum(["new_session", "resume_session", "continue_session", "fork_session", "agent"])
    .default("new_session"),
  runtimeProfile: z.enum(["claude_runtime", "isolated_sdk"]).default("claude_runtime"),
  prompt: z.string().min(1),
  cwd: z.string().optional(),
  sessionId: z.string().optional(),
  agent: z.string().optional(),
  priority: z.number().int().optional(),
  maxAttempts: z.number().int().positive().optional(),
  leaseDurationMs: z.number().int().positive().optional(),
  concurrencyKey: z.string().optional(),
  conditions: z.record(z.string(), z.any()).optional(),
  payload: z.any().optional(),
  variables: z.record(z.string(), z.any()).optional(),
  nextRunAt: z.number().int().optional(),
}).superRefine((value, ctx) => {
  if (targetRequiresSessionId(value.targetType) && !value.sessionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "sessionId is required for resume_session and fork_session heartbeat rules",
      path: ["sessionId"],
    });
  }
});

function ensureDispatchStore(ctx: MiddlewareContext) {
  return ctx.dispatchStore;
}

function splitQueryValues(value?: string): string[] | undefined {
  const values = value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values?.length ? values : undefined;
}

export function registerDispatchRoutes(app: FastifyInstance, ctx: MiddlewareContext): void {
  app.get("/api/v1/dispatch/status", async (_request, reply) => {
    const store = ensureDispatchStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "DISPATCH_STORE_UNAVAILABLE",
          message: "Dispatch storage is not configured",
        },
      });
    }

    return reply.send({
      summary: store.getSummary(),
    });
  });

  app.get<{
    Querystring: {
      limit?: string;
      offset?: string;
      status?: string;
      sourceType?: string;
      targetType?: string;
      runtimeProfile?: string;
    };
  }>("/api/v1/dispatch/jobs", async (request, reply) => {
    const store = ensureDispatchStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "DISPATCH_STORE_UNAVAILABLE",
          message: "Dispatch storage is not configured",
        },
      });
    }

    const query = DispatchListQuerySchema.parse(request.query ?? {});
    return reply.send({
      jobs: store.listJobs({
        limit: query.limit,
        offset: query.offset,
        statuses: splitQueryValues(query.status) as
          | Array<"queued" | "running" | "completed" | "failed" | "cancelled">
          | undefined,
        sourceTypes: splitQueryValues(query.sourceType) as
          | Array<"manual" | "cue" | "cron" | "heartbeat">
          | undefined,
        targetTypes: splitQueryValues(query.targetType) as
          | Array<"new_session" | "resume_session" | "continue_session" | "fork_session" | "agent">
          | undefined,
        runtimeProfiles: splitQueryValues(query.runtimeProfile) as
          | Array<"claude_runtime" | "isolated_sdk">
          | undefined,
      }),
    });
  });

  app.post<{
    Body: unknown;
  }>("/api/v1/dispatch/jobs", async (request, reply) => {
    const store = ensureDispatchStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "DISPATCH_STORE_UNAVAILABLE",
          message: "Dispatch storage is not configured",
        },
      });
    }

    const parseResult = DispatchJobSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parseResult.error.issues,
        },
      });
    }

    const body = parseResult.data;
    const job = store.enqueueJob(body);
    return reply.status(201).send({ job });
  });

  app.get<{
    Params: { id: string };
  }>("/api/v1/dispatch/jobs/:id", async (request, reply) => {
    const store = ensureDispatchStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "DISPATCH_STORE_UNAVAILABLE",
          message: "Dispatch storage is not configured",
        },
      });
    }

    const job = store.getJob(request.params.id);
    if (!job) {
      return reply.status(404).send({
        error: {
          code: "DISPATCH_JOB_NOT_FOUND",
          message: `Dispatch job ${request.params.id} not found`,
        },
      });
    }

    return reply.send({
      job,
      runs: store.listRuns(job.id),
    });
  });

  app.post<{
    Params: { id: string };
  }>("/api/v1/dispatch/jobs/:id/cancel", async (request, reply) => {
    const store = ensureDispatchStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "DISPATCH_STORE_UNAVAILABLE",
          message: "Dispatch storage is not configured",
        },
      });
    }

    const job = store.cancelJob(request.params.id);
    if (!job) {
      return reply.status(404).send({
        error: {
          code: "DISPATCH_JOB_NOT_FOUND",
          message: `Dispatch job ${request.params.id} not found`,
        },
      });
    }

    return reply.send({ job });
  });

  app.post<{
    Params: { id: string };
  }>("/api/v1/dispatch/jobs/:id/retry", async (request, reply) => {
    const store = ensureDispatchStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "DISPATCH_STORE_UNAVAILABLE",
          message: "Dispatch storage is not configured",
        },
      });
    }

    const original = store.getJob(request.params.id);
    if (!original) {
      return reply.status(404).send({
        error: {
          code: "DISPATCH_JOB_NOT_FOUND",
          message: `Dispatch job ${request.params.id} not found`,
        },
      });
    }

    const retriedJob = store.enqueueJob({
      sourceType: original.sourceType,
      targetType: original.targetType,
      runtimeProfile: original.runtimeProfile,
      prompt: original.input.prompt,
      cwd: original.input.cwd,
      sessionId: original.input.sessionId,
      agent: original.input.agent,
      payload: original.input.payload,
      variables: original.input.variables,
      priority: original.priority,
      runAt: Date.now(),
      nextRunAt: Date.now(),
      maxAttempts: original.maxAttempts,
      leaseDurationMs: original.leaseDurationMs,
      concurrencyKey: original.concurrencyKey,
      cueId: original.cueId,
      scheduleId: original.scheduleId,
      heartbeatRuleId: original.heartbeatRuleId,
    });

    return reply.status(201).send({
      retriedFrom: original.id,
      job: retriedJob,
    });
  });

  app.get("/api/v1/dispatch/cues", async (_request, reply) => {
    const store = ensureDispatchStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "DISPATCH_STORE_UNAVAILABLE",
          message: "Dispatch storage is not configured",
        },
      });
    }

    return reply.send({ cues: store.listCues() });
  });

  app.post<{
    Body: unknown;
  }>("/api/v1/dispatch/cues", async (request, reply) => {
    const store = ensureDispatchStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "DISPATCH_STORE_UNAVAILABLE",
          message: "Dispatch storage is not configured",
        },
      });
    }

    const parseResult = DispatchCueSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parseResult.error.issues,
        },
      });
    }

    const body = parseResult.data;
    const now = Date.now();
    const existing = body.id ? store.getCue(body.id) : undefined;
    const cue = store.upsertCue({
      id: body.id ?? generateId("cue"),
      name: body.name,
      enabled: body.enabled ?? true,
      once: body.once ?? false,
      cooldownMs: body.cooldownMs,
      trigger: body.trigger,
      action: body.action,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastTriggeredAt: existing?.lastTriggeredAt,
      lastJobId: existing?.lastJobId,
    });

    return reply.status(body.id ? 200 : 201).send({ cue });
  });

  app.delete<{
    Params: { id: string };
  }>("/api/v1/dispatch/cues/:id", async (request, reply) => {
    const store = ensureDispatchStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "DISPATCH_STORE_UNAVAILABLE",
          message: "Dispatch storage is not configured",
        },
      });
    }

    store.deleteCue(request.params.id);
    return reply.send({ status: "deleted", id: request.params.id });
  });

  app.get("/api/v1/dispatch/schedules", async (_request, reply) => {
    const store = ensureDispatchStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "DISPATCH_STORE_UNAVAILABLE",
          message: "Dispatch storage is not configured",
        },
      });
    }

    return reply.send({ schedules: store.listSchedules() });
  });

  app.post<{
    Body: unknown;
  }>("/api/v1/dispatch/schedules", async (request, reply) => {
    const store = ensureDispatchStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "DISPATCH_STORE_UNAVAILABLE",
          message: "Dispatch storage is not configured",
        },
      });
    }

    const parseResult = DispatchScheduleSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parseResult.error.issues,
        },
      });
    }

    const body = parseResult.data;
    const now = Date.now();
    const existing = body.id ? store.getSchedule(body.id) : undefined;
    const schedule = store.upsertSchedule({
      id: body.id ?? generateId("schedule"),
      name: body.name,
      enabled: body.enabled ?? true,
      cron: body.cron,
      timezone: body.timezone,
      sourceType: body.sourceType,
      targetType: body.targetType,
      runtimeProfile: body.runtimeProfile,
      prompt: body.prompt,
      cwd: body.cwd,
      sessionId: body.sessionId,
      agent: body.agent,
      priority: body.priority,
      maxAttempts: body.maxAttempts,
      leaseDurationMs: body.leaseDurationMs,
      concurrencyKey: body.concurrencyKey,
      payload: body.payload,
      variables: body.variables,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastRunAt: existing?.lastRunAt,
      nextRunAt: body.nextRunAt ?? computeNextCronRun(body.cron, body.timezone, now),
      lastJobId: existing?.lastJobId,
    });

    return reply.status(body.id ? 200 : 201).send({ schedule });
  });

  app.delete<{
    Params: { id: string };
  }>("/api/v1/dispatch/schedules/:id", async (request, reply) => {
    const store = ensureDispatchStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "DISPATCH_STORE_UNAVAILABLE",
          message: "Dispatch storage is not configured",
        },
      });
    }

    store.deleteSchedule(request.params.id);
    return reply.send({ status: "deleted", id: request.params.id });
  });

  app.get("/api/v1/dispatch/heartbeat-rules", async (_request, reply) => {
    const store = ensureDispatchStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "DISPATCH_STORE_UNAVAILABLE",
          message: "Dispatch storage is not configured",
        },
      });
    }

    return reply.send({ rules: store.listHeartbeatRules() });
  });

  app.post<{
    Body: unknown;
  }>("/api/v1/dispatch/heartbeat-rules", async (request, reply) => {
    const store = ensureDispatchStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "DISPATCH_STORE_UNAVAILABLE",
          message: "Dispatch storage is not configured",
        },
      });
    }

    const parseResult = HeartbeatRuleSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parseResult.error.issues,
        },
      });
    }

    const body = parseResult.data;
    const now = Date.now();
    const existing = body.id ? store.getHeartbeatRule(body.id) : undefined;
    const rule = store.upsertHeartbeatRule({
      id: body.id ?? generateId("heartbeat"),
      name: body.name,
      enabled: body.enabled ?? true,
      intervalMs: body.intervalMs,
      sourceType: body.sourceType,
      targetType: body.targetType,
      runtimeProfile: body.runtimeProfile,
      prompt: body.prompt,
      cwd: body.cwd,
      sessionId: body.sessionId,
      agent: body.agent,
      priority: body.priority,
      maxAttempts: body.maxAttempts,
      leaseDurationMs: body.leaseDurationMs,
      concurrencyKey: body.concurrencyKey,
      conditions: body.conditions,
      payload: body.payload,
      variables: body.variables,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastRunAt: existing?.lastRunAt,
      nextRunAt: body.nextRunAt ?? now + body.intervalMs,
      lastJobId: existing?.lastJobId,
    });

    return reply.status(body.id ? 200 : 201).send({ rule });
  });

  app.delete<{
    Params: { id: string };
  }>("/api/v1/dispatch/heartbeat-rules/:id", async (request, reply) => {
    const store = ensureDispatchStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "DISPATCH_STORE_UNAVAILABLE",
          message: "Dispatch storage is not configured",
        },
      });
    }

    store.deleteHeartbeatRule(request.params.id);
    return reply.send({ status: "deleted", id: request.params.id });
  });
}
