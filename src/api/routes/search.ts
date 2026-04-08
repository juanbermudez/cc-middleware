/**
 * Search API endpoints.
 * Provides session search, reindexing, and index statistics.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  searchSessions,
  type SearchTeamMembership,
} from "../../store/search.js";
import type { SessionStore } from "../../store/db.js";
import type { SessionIndexer } from "../../store/indexer.js";
import type { TeamManager } from "../../agents/teams.js";

/** Search context passed from the server */
export interface SearchContext {
  store: SessionStore;
  indexer: SessionIndexer;
  teamManager?: TeamManager;
}

/** Request schemas */
const SearchQuerySchema = z.object({
  q: z.string().default(""),
  project: z.string().optional(),
  dateFrom: z.coerce.number().optional(),
  dateTo: z.coerce.number().optional(),
  tags: z.string().optional(), // Comma-separated
  status: z.string().optional(),
  metadataKey: z.string().optional(),
  metadataValue: z.string().optional(),
  lineage: z.enum(["all", "standalone", "subagent", "team"]).optional(),
  team: z.string().optional(),
  limit: z.coerce.number().int().positive().default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

/**
 * Register search routes on the Fastify instance.
 */
export function registerSearchRoutes(
  app: FastifyInstance,
  searchCtx: SearchContext
): void {
  // GET /api/v1/search - Full-text search sessions
  app.get<{
    Querystring: Record<string, string>;
  }>("/api/v1/search", async (request, reply) => {
    const params = SearchQuerySchema.parse(request.query);
    const teamMemberships = searchCtx.teamManager
      ? await buildTeamMemberships(searchCtx.teamManager)
      : new Map<string, SearchTeamMembership>();

    const result = searchSessions(searchCtx.store, {
      query: params.q,
      project: params.project,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      tags: params.tags ? params.tags.split(",").filter(Boolean) : undefined,
      status: params.status,
      metadataKey: params.metadataKey,
      metadataValue: params.metadataValue,
      lineage: params.lineage,
      team: params.team,
      teamMemberships,
      limit: params.limit,
      offset: params.offset,
    });

    return reply.send(result);
  });

  // POST /api/v1/search/reindex - Trigger full reindex
  app.post("/api/v1/search/reindex", async (_request, reply) => {
    const result = await searchCtx.indexer.fullIndex();

    return reply.send({
      status: "completed",
      sessionsIndexed: result.sessionsIndexed,
      messagesIndexed: result.messagesIndexed,
      errors: result.errors,
      durationMs: result.durationMs,
    });
  });

  // GET /api/v1/search/stats - Index statistics
  app.get("/api/v1/search/stats", async (_request, reply) => {
    const stats = searchCtx.indexer.getStats();

    return reply.send(stats);
  });
}

async function buildTeamMemberships(
  teamManager: TeamManager
): Promise<Map<string, SearchTeamMembership>> {
  const teams = await teamManager.discoverTeams();
  const memberships = new Map<string, SearchTeamMembership>();

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
