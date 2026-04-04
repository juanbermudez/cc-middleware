/**
 * Permission REST endpoints.
 * Provides policy management, pending permission resolution, and question answering.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { MiddlewareContext } from "../server.js";

/** Request schemas */
const AddPolicyRuleSchema = z.object({
  id: z.string().min(1),
  toolName: z.string().min(1),
  behavior: z.enum(["allow", "deny"]),
  condition: z.string().optional(),
  priority: z.number().int(),
});

const ResolvePermissionSchema = z.object({
  behavior: z.enum(["allow", "deny"]),
  message: z.string().optional(),
});

const AnswerQuestionSchema = z.object({
  answers: z.record(z.string(), z.string()),
});

/**
 * Register permission routes on the Fastify instance.
 */
export function registerPermissionRoutes(app: FastifyInstance, ctx: MiddlewareContext): void {
  // GET /api/v1/permissions/policies - List policies
  app.get("/api/v1/permissions/policies", async () => {
    const rules = ctx.policyEngine.getRules();
    return {
      rules,
      total: rules.length,
    };
  });

  // POST /api/v1/permissions/policies - Add policy rule
  app.post<{ Body: unknown }>("/api/v1/permissions/policies", async (request, reply) => {
    const parseResult = AddPolicyRuleSchema.safeParse(request.body);
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

    // Check for duplicate rule ID
    const existing = ctx.policyEngine.getRules().find((r) => r.id === body.id);
    if (existing) {
      return reply.status(409).send({
        error: {
          code: "RULE_EXISTS",
          message: `Policy rule '${body.id}' already exists`,
        },
      });
    }

    ctx.policyEngine.addRule({
      id: body.id,
      toolName: body.toolName,
      behavior: body.behavior,
      condition: body.condition,
      priority: body.priority,
    });

    return reply.status(201).send({
      id: body.id,
      toolName: body.toolName,
      behavior: body.behavior,
      priority: body.priority,
    });
  });

  // DELETE /api/v1/permissions/policies/:id - Remove rule
  app.delete<{
    Params: { id: string };
  }>("/api/v1/permissions/policies/:id", async (request, reply) => {
    const { id } = request.params;

    const existing = ctx.policyEngine.getRules().find((r) => r.id === id);
    if (!existing) {
      return reply.status(404).send({
        error: { code: "RULE_NOT_FOUND", message: `Policy rule '${id}' not found` },
      });
    }

    ctx.policyEngine.removeRule(id);
    return { status: "deleted", id };
  });

  // GET /api/v1/permissions/pending - List pending requests
  app.get("/api/v1/permissions/pending", async () => {
    const pending = ctx.permissionManager.getPendingPermissions();
    return {
      pending: pending.map((p) => ({
        id: p.id,
        toolName: p.toolName,
        toolUseID: p.toolUseID,
        agentID: p.agentID,
        createdAt: p.createdAt,
        input: p.input,
      })),
      total: pending.length,
    };
  });

  // POST /api/v1/permissions/pending/:id/resolve - Resolve request
  app.post<{
    Params: { id: string };
    Body: unknown;
  }>("/api/v1/permissions/pending/:id/resolve", async (request, reply) => {
    const { id } = request.params;
    const parseResult = ResolvePermissionSchema.safeParse(request.body);
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
    const pending = ctx.permissionManager.getPendingPermissions().find((p) => p.id === id);

    if (!pending) {
      return reply.status(404).send({
        error: { code: "PERMISSION_NOT_FOUND", message: `Pending permission '${id}' not found` },
      });
    }

    if (body.behavior === "allow") {
      ctx.permissionManager.resolvePermission(id, { behavior: "allow" });
    } else {
      ctx.permissionManager.resolvePermission(id, {
        behavior: "deny",
        message: body.message ?? "Denied via API",
      });
    }

    return { status: "resolved", id, behavior: body.behavior };
  });

  // GET /api/v1/permissions/questions - List pending questions
  app.get("/api/v1/permissions/questions", async () => {
    const pending = ctx.askUserManager.getPendingQuestions();
    return {
      questions: pending.map((q) => ({
        id: q.id,
        createdAt: q.createdAt,
        questions: q.input.questions,
        toolUseID: q.input.toolUseID,
        sessionId: q.input.sessionId,
      })),
      total: pending.length,
    };
  });

  // POST /api/v1/permissions/questions/:id/answer - Answer question
  app.post<{
    Params: { id: string };
    Body: unknown;
  }>("/api/v1/permissions/questions/:id/answer", async (request, reply) => {
    const { id } = request.params;
    const parseResult = AnswerQuestionSchema.safeParse(request.body);
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
    const pending = ctx.askUserManager.getPendingQuestions().find((q) => q.id === id);

    if (!pending) {
      return reply.status(404).send({
        error: { code: "QUESTION_NOT_FOUND", message: `Pending question '${id}' not found` },
      });
    }

    ctx.askUserManager.answerQuestion(id, body.answers);
    return { status: "answered", id };
  });
}
