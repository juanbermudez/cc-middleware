/**
 * Session REST endpoints.
 * Provides CRUD operations for sessions: list, get, launch, resume, abort, update.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { discoverSessions } from "../../sessions/discovery.js";
import {
  buildSessionCatalog,
  buildTeamMemberships,
  groupSessionCatalogByDirectory,
} from "../../sessions/catalog.js";
import { buildSessionDetail } from "../../sessions/detail.js";
import { readSessionMessages } from "../../sessions/messages.js";
import { getSession, updateSessionTitle, updateSessionTag } from "../../sessions/info.js";
import { createCanUseTool } from "../../permissions/handler.js";
import { mergeSDKHooks } from "../../sessions/utils.js";
import type { MiddlewareContext } from "../server.js";
import { toError } from "../../utils/errors.js";
import { createFullSDKHooks } from "../../hooks/sdk-bridge.js";

/** Request schemas */
const LaunchSessionSchema = z.object({
  prompt: z.string().min(1),
  allowedTools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  permissionMode: z
    .enum(["default", "acceptEdits", "plan", "dontAsk", "bypassPermissions", "auto"])
    .optional(),
  maxTurns: z.number().int().positive().optional(),
  maxBudgetUsd: z.number().positive().optional(),
  systemPrompt: z.string().optional(),
  cwd: z.string().optional(),
  effort: z.enum(["low", "medium", "high", "max"]).optional(),
  model: z.string().optional(),
  agent: z.string().optional(),
  analytics: z
    .object({
      captureRawMessages: z.boolean().optional(),
      label: z.string().optional(),
      source: z.enum(["api", "websocket", "plugin", "cli", "internal"]).optional(),
    })
    .optional(),
});

const ResumeSessionSchema = z.object({
  prompt: z.string().min(1),
  maxTurns: z.number().int().positive().optional(),
  agent: z.string().optional(),
  model: z.string().optional(),
  analytics: z
    .object({
      captureRawMessages: z.boolean().optional(),
      label: z.string().optional(),
      source: z.enum(["api", "websocket", "plugin", "cli", "internal"]).optional(),
    })
    .optional(),
});

const UpdateSessionSchema = z.object({
  title: z.string().min(1).optional(),
  tag: z.string().nullable().optional(),
});

const PaginationSchema = z.object({
  limit: z.coerce.number().int().positive().default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const SessionDetailQuerySchema = z.object({
  rootSessionId: z.string().min(1).optional(),
});

const ListSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
  project: z.string().optional(),
  metadataKey: z.string().optional(),
  metadataValue: z.string().optional(),
  lineage: z.enum(["all", "standalone", "subagent", "team"]).optional(),
  team: z.string().optional(),
});

const ListSessionDirectoriesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(12),
  offset: z.coerce.number().int().nonnegative().default(0),
  sessionLimit: z.coerce.number().int().positive().default(3),
  project: z.string().optional(),
  metadataKey: z.string().optional(),
  metadataValue: z.string().optional(),
  lineage: z.enum(["all", "standalone", "subagent", "team"]).optional(),
  team: z.string().optional(),
});

const UpsertSessionMetadataDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1).optional(),
  searchable: z.boolean().optional(),
  filterable: z.boolean().optional(),
});

const UpsertSessionMetadataValueSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});

/**
 * Register session routes on the Fastify instance.
 */
export function registerSessionRoutes(app: FastifyInstance, ctx: MiddlewareContext): void {
  function buildPermissionLaunchOptions(options: {
    source: "api";
    cwd?: string;
    initialSessionId?: string;
  }) {
    let currentSessionId = options.initialSessionId;
    const { canUseTool } = createCanUseTool({
      policyEngine: ctx.policyEngine,
      eventBus: ctx.eventBus,
      permissionManager: ctx.permissionManager,
      getContext: () => ({
        sessionId: currentSessionId,
        cwd: options.cwd,
      }),
      analytics: {
        source: options.source,
        cwd: options.cwd,
        sessionId: currentSessionId,
      },
    });
    const hooks = mergeSDKHooks(createFullSDKHooks(ctx.eventBus, ctx.blockingRegistry));

    return {
      canUseTool,
      hooks,
      onSessionId: (sessionId: string) => {
        currentSessionId = sessionId;
      },
    };
  }

  // GET /api/v1/sessions/metadata/definitions - list searchable metadata definitions
  app.get("/api/v1/sessions/metadata/definitions", async (_request, reply) => {
    if (!ctx.sessionStore) {
      return reply.status(501).send({
        error: {
          code: "SESSION_STORE_UNAVAILABLE",
          message: "Session metadata requires an indexed session store",
        },
      });
    }

    return reply.send({
      definitions: ctx.sessionStore.listSessionMetadataDefinitions(),
    });
  });

  // POST /api/v1/sessions/metadata/definitions - create or update a metadata definition
  app.post<{
    Body: unknown;
  }>("/api/v1/sessions/metadata/definitions", async (request, reply) => {
    if (!ctx.sessionStore) {
      return reply.status(501).send({
        error: {
          code: "SESSION_STORE_UNAVAILABLE",
          message: "Session metadata requires an indexed session store",
        },
      });
    }

    const parseResult = UpsertSessionMetadataDefinitionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parseResult.error.issues,
        },
      });
    }

    const now = Date.now();
    const existing = ctx.sessionStore.getSessionMetadataDefinition(parseResult.data.key);
    const definition = {
      key: parseResult.data.key,
      label: parseResult.data.label,
      description: parseResult.data.description,
      valueType: "string" as const,
      searchable: parseResult.data.searchable ?? existing?.searchable ?? true,
      filterable: parseResult.data.filterable ?? existing?.filterable ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    ctx.sessionStore.upsertSessionMetadataDefinition(definition);

    return reply.status(existing ? 200 : 201).send({
      definition: ctx.sessionStore.getSessionMetadataDefinition(definition.key),
    });
  });

  // DELETE /api/v1/sessions/metadata/definitions/:key - remove a metadata definition and its values
  app.delete<{
    Params: { key: string };
  }>("/api/v1/sessions/metadata/definitions/:key", async (request, reply) => {
    if (!ctx.sessionStore) {
      return reply.status(501).send({
        error: {
          code: "SESSION_STORE_UNAVAILABLE",
          message: "Session metadata requires an indexed session store",
        },
      });
    }

    const existing = ctx.sessionStore.getSessionMetadataDefinition(request.params.key);
    if (!existing) {
      return reply.status(404).send({
        error: {
          code: "SESSION_METADATA_DEFINITION_NOT_FOUND",
          message: `Metadata definition ${request.params.key} not found`,
        },
      });
    }

    ctx.sessionStore.deleteSessionMetadataDefinition(request.params.key);

    return reply.send({
      definitions: ctx.sessionStore.listSessionMetadataDefinitions(),
    });
  });

  // GET /api/v1/sessions - List sessions
  app.get<{
    Querystring: {
      limit?: string;
      offset?: string;
      project?: string;
      metadataKey?: string;
      metadataValue?: string;
      lineage?: string;
      team?: string;
    };
  }>("/api/v1/sessions", async (request, reply) => {
    const query = ListSessionsQuerySchema.parse(request.query);

    const allSessions = await discoverSessions({
      dir: query.project,
    });
    const teamMemberships = await buildTeamMemberships(ctx.teamManager);
    const catalog = buildSessionCatalog(allSessions, {
      store: ctx.sessionStore,
      lineage: query.lineage,
      team: query.team,
      metadataKey: query.metadataKey,
      metadataValue: query.metadataValue,
      teamMemberships,
    });

    const paginated = catalog.slice(query.offset, query.offset + query.limit);

    return reply.send({
      sessions: paginated,
      total: catalog.length,
    });
  });

  // GET /api/v1/sessions/directories - List grouped session directories
  app.get<{
    Querystring: {
      limit?: string;
      offset?: string;
      sessionLimit?: string;
      project?: string;
      metadataKey?: string;
      metadataValue?: string;
      lineage?: string;
      team?: string;
    };
  }>("/api/v1/sessions/directories", async (request, reply) => {
    const query = ListSessionDirectoriesQuerySchema.parse(request.query);

    const allSessions = await discoverSessions({
      dir: query.project,
    });
    const teamMemberships = await buildTeamMemberships(ctx.teamManager);
    const catalog = buildSessionCatalog(allSessions, {
      store: ctx.sessionStore,
      lineage: query.lineage,
      team: query.team,
      metadataKey: query.metadataKey,
      metadataValue: query.metadataValue,
      teamMemberships,
    });
    const groups = groupSessionCatalogByDirectory(catalog, {
      sessionLimit: query.sessionLimit,
    });
    const paginated = groups.slice(query.offset, query.offset + query.limit);

    return reply.send({
      groups: paginated,
      totalDirectories: groups.length,
      totalSessions: catalog.length,
    });
  });

  // GET /api/v1/sessions/:id/metadata - list metadata for a session
  app.get<{
    Params: { id: string };
  }>("/api/v1/sessions/:id/metadata", async (request, reply) => {
    if (!ctx.sessionStore) {
      return reply.status(501).send({
        error: {
          code: "SESSION_STORE_UNAVAILABLE",
          message: "Session metadata requires an indexed session store",
        },
      });
    }

    return reply.send({
      metadata: ctx.sessionStore.listSessionMetadataValues(request.params.id),
    });
  });

  // PUT /api/v1/sessions/:id/metadata - set a metadata value for a session
  app.put<{
    Params: { id: string };
    Body: unknown;
  }>("/api/v1/sessions/:id/metadata", async (request, reply) => {
    if (!ctx.sessionStore) {
      return reply.status(501).send({
        error: {
          code: "SESSION_STORE_UNAVAILABLE",
          message: "Session metadata requires an indexed session store",
        },
      });
    }

    const parseResult = UpsertSessionMetadataValueSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parseResult.error.issues,
        },
      });
    }

    const definition = ctx.sessionStore.getSessionMetadataDefinition(parseResult.data.key);
    if (!definition) {
      return reply.status(404).send({
        error: {
          code: "SESSION_METADATA_DEFINITION_NOT_FOUND",
          message: `Metadata definition ${parseResult.data.key} not found`,
        },
      });
    }

    const now = Date.now();
    const existing = ctx.sessionStore
      .listSessionMetadataValues(request.params.id)
      .find((entry) => entry.key === parseResult.data.key);

    ctx.sessionStore.setSessionMetadataValue({
      sessionId: request.params.id,
      key: parseResult.data.key,
      value: parseResult.data.value,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    return reply.send({
      metadata: ctx.sessionStore.listSessionMetadataValues(request.params.id),
    });
  });

  // DELETE /api/v1/sessions/:id/metadata/:key - remove a metadata value
  app.delete<{
    Params: { id: string; key: string };
  }>("/api/v1/sessions/:id/metadata/:key", async (request, reply) => {
    if (!ctx.sessionStore) {
      return reply.status(501).send({
        error: {
          code: "SESSION_STORE_UNAVAILABLE",
          message: "Session metadata requires an indexed session store",
        },
      });
    }

    ctx.sessionStore.deleteSessionMetadataValue(request.params.id, request.params.key);

    return reply.send({
      metadata: ctx.sessionStore.listSessionMetadataValues(request.params.id),
    });
  });

  // GET /api/v1/sessions/:id - Get session details
  app.get<{
    Params: { id: string };
  }>("/api/v1/sessions/:id", async (request, reply) => {
    const { id } = request.params;

    const info = await getSession(id);
    if (!info) {
      return reply.status(404).send({
        error: { code: "SESSION_NOT_FOUND", message: `Session ${id} not found` },
      });
    }

    return reply.send(info);
  });

  // GET /api/v1/sessions/:id/messages - Get session messages
  app.get<{
    Params: { id: string };
    Querystring: { limit?: string; offset?: string };
  }>("/api/v1/sessions/:id/messages", async (request, reply) => {
    const { id } = request.params;
    const query = PaginationSchema.parse(request.query);

    try {
      const messages = await readSessionMessages(id, {
        limit: query.limit,
        offset: query.offset,
      });

      return reply.send({
        messages,
        total: messages.length,
      });
    } catch (error) {
      const err = toError(error);
      if (err.message.includes("not found") || err.message.includes("ENOENT")) {
        return reply.status(404).send({
          error: { code: "SESSION_NOT_FOUND", message: `Session ${id} not found` },
        });
      }
      throw error;
    }
  });

  // GET /api/v1/sessions/:id/detail - Get a source-of-truth session detail view
  app.get<{
    Params: { id: string };
    Querystring: { rootSessionId?: string };
  }>("/api/v1/sessions/:id/detail", async (request, reply) => {
    const { id } = request.params;
    const query = SessionDetailQuerySchema.parse(request.query);

    try {
      const detail = await buildSessionDetail(id, {
        rootSessionId: query.rootSessionId,
        metadata: ctx.sessionStore?.listSessionMetadataValues(id),
      });

      if (!detail) {
        return reply.status(404).send({
          error: { code: "SESSION_NOT_FOUND", message: `Session ${id} not found` },
        });
      }

      return reply.send(detail);
    } catch (error) {
      const err = toError(error);
      if (err.message.includes("not found") || err.message.includes("ENOENT")) {
        return reply.status(404).send({
          error: { code: "SESSION_NOT_FOUND", message: `Session ${id} not found` },
        });
      }
      throw error;
    }
  });

  // POST /api/v1/sessions - Launch new session
  app.post<{
    Body: unknown;
  }>("/api/v1/sessions", async (request, reply) => {
    const parseResult = LaunchSessionSchema.safeParse(request.body);
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

    try {
      const permissionLaunch = buildPermissionLaunchOptions({
        source: "api",
        cwd: body.cwd,
      });
      const result = await ctx.sessionManager.launch({
        prompt: body.prompt,
        allowedTools: body.allowedTools,
        disallowedTools: body.disallowedTools,
        permissionMode: body.permissionMode,
        maxTurns: body.maxTurns,
        maxBudgetUsd: body.maxBudgetUsd,
        systemPrompt: body.systemPrompt,
        cwd: body.cwd,
        effort: body.effort,
        agent: body.agent,
        model: body.model,
        canUseTool: permissionLaunch.canUseTool,
        hooks: permissionLaunch.hooks,
        onSessionId: permissionLaunch.onSessionId,
        analytics: {
          ...body.analytics,
          source: "api",
        },
      });

      return reply.status(201).send(result);
    } catch (error) {
      const err = toError(error);
      return reply.status(500).send({
        error: {
          code: "SESSION_LAUNCH_ERROR",
          message: err.message,
        },
      });
    }
  });

  // POST /api/v1/sessions/:id/resume - Resume session
  app.post<{
    Params: { id: string };
    Body: unknown;
  }>("/api/v1/sessions/:id/resume", async (request, reply) => {
    const { id } = request.params;
    const parseResult = ResumeSessionSchema.safeParse(request.body);
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

    try {
      const permissionLaunch = buildPermissionLaunchOptions({
        source: "api",
        initialSessionId: id,
      });
      const result = await ctx.sessionManager.launch({
        prompt: body.prompt,
        resume: id,
        maxTurns: body.maxTurns,
        agent: body.agent,
        model: body.model,
        canUseTool: permissionLaunch.canUseTool,
        hooks: permissionLaunch.hooks,
        onSessionId: permissionLaunch.onSessionId,
        analytics: {
          ...body.analytics,
          source: "api",
        },
      });

      return reply.send(result);
    } catch (error) {
      const err = toError(error);
      return reply.status(500).send({
        error: {
          code: "SESSION_RESUME_ERROR",
          message: err.message,
        },
      });
    }
  });

  // POST /api/v1/sessions/:id/abort - Abort active session
  app.post<{
    Params: { id: string };
  }>("/api/v1/sessions/:id/abort", async (request, reply) => {
    const { id } = request.params;

    const tracked = ctx.sessionManager.getSession(id);
    if (!tracked) {
      return reply.status(404).send({
        error: { code: "SESSION_NOT_FOUND", message: `Active session ${id} not found` },
      });
    }

    if (tracked.status !== "running") {
      return reply.status(409).send({
        error: { code: "SESSION_NOT_RUNNING", message: `Session ${id} is ${tracked.status}` },
      });
    }

    await ctx.sessionManager.abort(id);

    return reply.send({ status: "aborted", sessionId: id });
  });

  // PUT /api/v1/sessions/:id - Update session (rename/tag)
  app.put<{
    Params: { id: string };
    Body: unknown;
  }>("/api/v1/sessions/:id", async (request, reply) => {
    const { id } = request.params;
    const parseResult = UpdateSessionSchema.safeParse(request.body);
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

    // Check session exists
    const info = await getSession(id);
    if (!info) {
      return reply.status(404).send({
        error: { code: "SESSION_NOT_FOUND", message: `Session ${id} not found` },
      });
    }

    // Update title if provided
    if (body.title !== undefined) {
      await updateSessionTitle(id, body.title);
    }

    // Update tag if provided (null = clear)
    if (body.tag !== undefined) {
      await updateSessionTag(id, body.tag);
    }

    // Read back updated info
    const updated = await getSession(id);
    return reply.send(updated);
  });
}
