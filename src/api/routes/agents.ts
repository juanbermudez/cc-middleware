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

const ListAgentsQuerySchema = z.object({
  q: z.string().optional(),
  sessionId: z.string().optional(),
  sessionIds: z.string().optional(),
});

const ListTeamsQuerySchema = z.object({
  q: z.string().optional(),
  sessionId: z.string().optional(),
  sessionIds: z.string().optional(),
});

const TaskQuerySchema = z.object({
  q: z.string().optional(),
  team: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed", "failed"]).optional(),
  assignee: z.string().optional(),
  sessionId: z.string().optional(),
  sessionIds: z.string().optional(),
});

interface SessionScopedResourceFilters {
  sessionId?: string;
  sessionIds?: string;
}

interface SessionResourceScope {
  sessionIds: string[];
  teamNames: Set<string>;
  teammateNames: Set<string>;
  agentIds: Set<string>;
  slugs: Set<string>;
}

interface ApiTeamTask {
  resourceId: string;
  id: string;
  teamName: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  assignee?: string;
  dependencies: string[];
  filePath?: string;
  teamConfigPath: string;
  taskListPath: string;
}

function normalizeTaskFilter(value?: string): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function normalizeSessionIds(filters: SessionScopedResourceFilters): string[] {
  const values = [filters.sessionId, filters.sessionIds]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(values)];
}

function matchesQuery(
  query: string | undefined,
  values: Array<string | undefined>
): boolean {
  if (!query) {
    return true;
  }

  return values
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(query));
}

async function buildTeamMembershipLookup(
  ctx: MiddlewareContext
): Promise<Map<string, { teamName: string; teammateName: string }>> {
  const teams = await ctx.teamManager.discoverTeams();
  const memberships = new Map<string, { teamName: string; teammateName: string }>();

  for (const team of teams) {
    for (const member of team.members) {
      if (!member.agentId) {
        continue;
      }

      memberships.set(member.agentId, {
        teamName: team.name,
        teammateName: member.name,
      });
    }
  }

  return memberships;
}

async function resolveSessionScope(
  ctx: MiddlewareContext,
  filters: SessionScopedResourceFilters
): Promise<SessionResourceScope | undefined> {
  const sessionIds = normalizeSessionIds(filters);
  if (sessionIds.length === 0) {
    return undefined;
  }

  if (!ctx.sessionStore) {
    throw new Error("SESSION_STORE_UNAVAILABLE");
  }

  const memberships = await buildTeamMembershipLookup(ctx);
  const scope: SessionResourceScope = {
    sessionIds,
    teamNames: new Set<string>(),
    teammateNames: new Set<string>(),
    agentIds: new Set<string>(),
    slugs: new Set<string>(),
  };

  for (const sessionId of sessionIds) {
    const relationships = ctx.sessionStore.getRelationships(sessionId);

    for (const relationship of relationships) {
      const normalizedAgentId = normalizeTaskFilter(relationship.agentId);
      const normalizedSlug = normalizeTaskFilter(relationship.slug);
      const membership = relationship.agentId ? memberships.get(relationship.agentId) : undefined;
      const normalizedTeamName = normalizeTaskFilter(relationship.teamName ?? membership?.teamName);
      const normalizedTeammateName = normalizeTaskFilter(
        relationship.teammateName ?? membership?.teammateName
      );

      if (normalizedTeamName) {
        scope.teamNames.add(normalizedTeamName);
      }
      if (normalizedTeammateName) {
        scope.teammateNames.add(normalizedTeammateName);
      }
      if (normalizedAgentId) {
        scope.agentIds.add(normalizedAgentId);
      }
      if (normalizedSlug) {
        scope.slugs.add(normalizedSlug);
      }
    }
  }

  return scope;
}

function matchesSessionScopedTeam(
  teamName: string,
  scope?: SessionResourceScope
): boolean {
  if (!scope) {
    return true;
  }

  return scope.teamNames.has(teamName.toLowerCase());
}

function matchesSessionScopedAgent(
  agentName: string,
  scope?: SessionResourceScope
): boolean {
  if (!scope) {
    return true;
  }

  const normalized = agentName.toLowerCase();
  return scope.agentIds.has(normalized)
    || scope.slugs.has(normalized)
    || scope.teammateNames.has(normalized);
}

async function listTasksForTeam(
  ctx: MiddlewareContext,
  teamName: string
): Promise<ApiTeamTask[] | undefined> {
  const team = await ctx.teamManager.getTeam(teamName);
  if (!team) {
    return undefined;
  }

  const tasks = await ctx.teamManager.getTeamTasks(teamName);
  return tasks.map((task) => ({
    resourceId: `${team.name}::${task.id}`,
    id: task.id,
    teamName: team.name,
    description: task.description,
    status: task.status,
    assignee: task.assignee,
    dependencies: task.dependencies,
    filePath: task.filePath,
    teamConfigPath: team.configPath,
    taskListPath: team.taskListPath,
  }));
}

async function listAllTeamTasks(ctx: MiddlewareContext): Promise<ApiTeamTask[]> {
  const teams = await ctx.teamManager.discoverTeams();
  const tasks = await Promise.all(
    teams.map(async (team) => {
      const teamTasks = await ctx.teamManager.getTeamTasks(team.name);
      return teamTasks.map((task) => ({
        resourceId: `${team.name}::${task.id}`,
        id: task.id,
        teamName: team.name,
        description: task.description,
        status: task.status,
        assignee: task.assignee,
        dependencies: task.dependencies,
        filePath: task.filePath,
        teamConfigPath: team.configPath,
        taskListPath: team.taskListPath,
      }));
    })
  );

  return tasks.flat();
}

function filterTasks(
  tasks: ApiTeamTask[],
  filters: z.infer<typeof TaskQuerySchema>
): ApiTeamTask[] {
  const query = normalizeTaskFilter(filters.q);
  const assignee = normalizeTaskFilter(filters.assignee);
  const team = normalizeTaskFilter(filters.team);

  return tasks.filter((task) => {
    if (team && task.teamName.toLowerCase() !== team) {
      return false;
    }

    if (filters.status && task.status !== filters.status) {
      return false;
    }

    if (assignee && (task.assignee?.toLowerCase() ?? "") !== assignee) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      task.id,
      task.teamName,
      task.description,
      task.assignee,
      ...task.dependencies,
      task.filePath,
      task.teamConfigPath,
      task.taskListPath,
    ]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(query));
  });
}

/**
 * Register agent and team routes on the Fastify instance.
 */
export function registerAgentRoutes(app: FastifyInstance, ctx: MiddlewareContext): void {
  // GET /api/v1/agents - List agents
  app.get<{
    Querystring: { q?: string; sessionId?: string; sessionIds?: string };
  }>("/api/v1/agents", async (request, reply) => {
    const filters = ListAgentsQuerySchema.parse(request.query ?? {});
    const query = normalizeTaskFilter(filters.q);
    let scope: SessionResourceScope | undefined;

    try {
      scope = await resolveSessionScope(ctx, filters);
    } catch (error) {
      if (error instanceof Error && error.message === "SESSION_STORE_UNAVAILABLE") {
        return reply.status(501).send({
          error: {
            code: "SESSION_STORE_UNAVAILABLE",
            message: "Session-scoped resource filters require an indexed session store",
          },
        });
      }
      throw error;
    }

    const agents = ctx.agentRegistry.list().filter((agent) =>
      matchesSessionScopedAgent(agent.name, scope)
      && matchesQuery(query, [
      agent.name,
      agent.description,
      agent.source,
      agent.model,
      ...(agent.tools ?? []),
      ...(agent.disallowedTools ?? []),
    ]));

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
  app.get<{
    Querystring: { q?: string; sessionId?: string; sessionIds?: string };
  }>("/api/v1/teams", async (request, reply) => {
    const filters = ListTeamsQuerySchema.parse(request.query ?? {});
    const query = normalizeTaskFilter(filters.q);
    let scope: SessionResourceScope | undefined;

    try {
      scope = await resolveSessionScope(ctx, filters);
    } catch (error) {
      if (error instanceof Error && error.message === "SESSION_STORE_UNAVAILABLE") {
        return reply.status(501).send({
          error: {
            code: "SESSION_STORE_UNAVAILABLE",
            message: "Session-scoped resource filters require an indexed session store",
          },
        });
      }
      throw error;
    }

    const teams = (await ctx.teamManager.discoverTeams()).filter((team) =>
      matchesSessionScopedTeam(team.name, scope)
      && matchesQuery(query, [
      team.name,
      team.configPath,
      team.taskListPath,
      ...team.members.flatMap((member) => [
        member.name,
        member.agentId,
        member.agentType,
        member.status,
      ]),
    ]));

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
    Querystring: { q?: string; status?: string; assignee?: string; sessionId?: string; sessionIds?: string };
  }>("/api/v1/teams/:name/tasks", async (request, reply) => {
    const { name } = request.params;
    const filters = TaskQuerySchema.parse(request.query ?? {});
    const tasks = await listTasksForTeam(ctx, name);

    if (!tasks) {
      return reply.status(404).send({
        error: { code: "TEAM_NOT_FOUND", message: `Team '${name}' not found` },
      });
    }

    let scope: SessionResourceScope | undefined;
    try {
      scope = await resolveSessionScope(ctx, filters);
    } catch (error) {
      if (error instanceof Error && error.message === "SESSION_STORE_UNAVAILABLE") {
        return reply.status(501).send({
          error: {
            code: "SESSION_STORE_UNAVAILABLE",
            message: "Session-scoped resource filters require an indexed session store",
          },
        });
      }
      throw error;
    }

    if (scope && !matchesSessionScopedTeam(name, scope)) {
      return {
        tasks: [],
        total: 0,
        teamName: name,
      };
    }

    const filteredTasks = filterTasks(tasks, filters);
    return {
      tasks: filteredTasks,
      total: filteredTasks.length,
      teamName: name,
    };
  });

  // GET /api/v1/tasks - List all tasks across discovered teams
  app.get<{
    Querystring: { q?: string; team?: string; status?: string; assignee?: string; sessionId?: string; sessionIds?: string };
  }>("/api/v1/tasks", async (request, reply) => {
    const filters = TaskQuerySchema.parse(request.query ?? {});
    let scope: SessionResourceScope | undefined;

    try {
      scope = await resolveSessionScope(ctx, filters);
    } catch (error) {
      if (error instanceof Error && error.message === "SESSION_STORE_UNAVAILABLE") {
        return reply.status(501).send({
          error: {
            code: "SESSION_STORE_UNAVAILABLE",
            message: "Session-scoped resource filters require an indexed session store",
          },
        });
      }
      throw error;
    }

    const tasks = filterTasks(
      (await listAllTeamTasks(ctx)).filter((task) => matchesSessionScopedTeam(task.teamName, scope)),
      filters
    );

    return {
      tasks,
      total: tasks.length,
    };
  });
}
