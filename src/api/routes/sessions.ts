/**
 * Session REST endpoints.
 * Provides CRUD operations for sessions: list, get, launch, resume, abort, update.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { discoverSessions } from "../../sessions/discovery.js";
import { readSessionMessages } from "../../sessions/messages.js";
import { getSession, updateSessionTitle, updateSessionTag } from "../../sessions/info.js";
import type { MiddlewareContext } from "../server.js";
import { toError } from "../../utils/errors.js";

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
});

const ResumeSessionSchema = z.object({
  prompt: z.string().min(1),
  maxTurns: z.number().int().positive().optional(),
  model: z.string().optional(),
});

const UpdateSessionSchema = z.object({
  title: z.string().min(1).optional(),
  tag: z.string().nullable().optional(),
});

const PaginationSchema = z.object({
  limit: z.coerce.number().int().positive().default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const ListSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
  project: z.string().optional(),
});

/**
 * Register session routes on the Fastify instance.
 */
export function registerSessionRoutes(app: FastifyInstance, ctx: MiddlewareContext): void {
  // GET /api/v1/sessions - List sessions
  app.get<{
    Querystring: { limit?: string; offset?: string; project?: string };
  }>("/api/v1/sessions", async (request, reply) => {
    const query = ListSessionsQuerySchema.parse(request.query);

    const allSessions = await discoverSessions({
      dir: query.project,
      limit: query.limit + query.offset, // Over-fetch for offset support
    });

    const paginated = allSessions.slice(query.offset, query.offset + query.limit);

    return reply.send({
      sessions: paginated,
      total: allSessions.length,
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
        model: body.model,
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
      const result = await ctx.sessionManager.launch({
        prompt: body.prompt,
        resume: id,
        maxTurns: body.maxTurns,
        model: body.model,
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
