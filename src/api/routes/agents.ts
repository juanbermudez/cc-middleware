/**
 * Agent and team REST endpoints.
 * Provides CRUD for agents and read-only access to teams.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { MiddlewareContext } from "../server.js";

/** Request schemas */
const RegisterAgentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  prompt: z.string().min(1),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  maxTurns: z.number().int().positive().optional(),
});

/**
 * Register agent and team routes on the Fastify instance.
 */
export function registerAgentRoutes(app: FastifyInstance, ctx: MiddlewareContext): void {
  // GET /api/v1/agents - List agents
  app.get("/api/v1/agents", async () => {
    const agents = ctx.agentRegistry.list();
    return {
      agents: agents.map((a) => ({
        name: a.name,
        description: a.description,
        source: a.source,
        model: a.model,
        tools: a.tools,
        disallowedTools: a.disallowedTools,
        maxTurns: a.maxTurns,
      })),
      total: agents.length,
    };
  });

  // GET /api/v1/agents/:name - Get agent details
  app.get<{
    Params: { name: string };
  }>("/api/v1/agents/:name", async (request, reply) => {
    const { name } = request.params;
    const agent = ctx.agentRegistry.get(name);

    if (!agent) {
      return reply.status(404).send({
        error: { code: "AGENT_NOT_FOUND", message: `Agent '${name}' not found` },
      });
    }

    return {
      name: agent.name,
      description: agent.description,
      prompt: agent.prompt,
      source: agent.source,
      model: agent.model,
      tools: agent.tools,
      disallowedTools: agent.disallowedTools,
      maxTurns: agent.maxTurns,
    };
  });

  // POST /api/v1/agents - Register runtime agent
  app.post<{ Body: unknown }>("/api/v1/agents", async (request, reply) => {
    const parseResult = RegisterAgentSchema.safeParse(request.body);
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

    ctx.agentRegistry.register(body.name, {
      description: body.description,
      prompt: body.prompt,
      model: body.model,
      tools: body.tools,
      disallowedTools: body.disallowedTools,
      maxTurns: body.maxTurns,
    });

    return reply.status(201).send({
      name: body.name,
      description: body.description,
      source: "runtime",
    });
  });

  // DELETE /api/v1/agents/:name - Remove runtime agent
  app.delete<{
    Params: { name: string };
  }>("/api/v1/agents/:name", async (request, reply) => {
    const { name } = request.params;
    const agent = ctx.agentRegistry.get(name);

    if (!agent) {
      return reply.status(404).send({
        error: { code: "AGENT_NOT_FOUND", message: `Agent '${name}' not found` },
      });
    }

    ctx.agentRegistry.unregister(name);
    return { status: "deleted", name };
  });

  // GET /api/v1/teams - List teams
  app.get("/api/v1/teams", async () => {
    const teams = await ctx.teamManager.discoverTeams();
    return {
      teams: teams.map((t) => ({
        name: t.name,
        memberCount: t.members.length,
        configPath: t.configPath,
      })),
      total: teams.length,
    };
  });

  // GET /api/v1/teams/:name - Get team details
  app.get<{
    Params: { name: string };
  }>("/api/v1/teams/:name", async (request, reply) => {
    const { name } = request.params;
    const team = await ctx.teamManager.getTeam(name);

    if (!team) {
      return reply.status(404).send({
        error: { code: "TEAM_NOT_FOUND", message: `Team '${name}' not found` },
      });
    }

    return team;
  });

  // GET /api/v1/teams/:name/tasks - Get team tasks
  app.get<{
    Params: { name: string };
  }>("/api/v1/teams/:name/tasks", async (request, reply) => {
    const { name } = request.params;
    const team = await ctx.teamManager.getTeam(name);

    if (!team) {
      return reply.status(404).send({
        error: { code: "TEAM_NOT_FOUND", message: `Team '${name}' not found` },
      });
    }

    const tasks = await ctx.teamManager.getTeamTasks(name);
    return {
      tasks,
      total: tasks.length,
    };
  });
}
