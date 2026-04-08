/**
 * Session catalog utilities.
 * Combines raw Claude session discovery with indexed metadata so frontends can
 * render stable session and directory views without guessing how to join data.
 */

import { basename, dirname } from "node:path";
import type { TeamManager } from "../agents/teams.js";
import type {
  IndexedSession,
  IndexedSessionRelationship,
  SessionMetadataEntry,
  SessionStore,
} from "../store/db.js";
import type { SessionInfo } from "../types/sessions.js";

export interface SessionCatalogTeamMembership {
  teamName: string;
  teammateName: string;
}

export type SessionCatalogLineageFilter = "all" | "standalone" | "subagent" | "team";

export interface SessionCatalogLineage {
  kind: "root" | "subagent";
  parentSessionId?: string;
  hasSubagents: boolean;
  subagentCount: number;
  hasTeamMembers: boolean;
  teamNames: string[];
  teammateNames: string[];
  relationships: IndexedSessionRelationship[];
}

export interface SessionCatalogEntry extends SessionInfo {
  id: string;
  project: string;
  directoryPath: string;
  directoryName: string;
  parentDirectoryPath?: string;
  directoryDepth: number;
  indexed: boolean;
  messageCount?: number;
  metadata: SessionMetadataEntry[];
  lineage: SessionCatalogLineage;
}

export interface SessionDirectoryGroup {
  path: string;
  name: string;
  parentPath?: string;
  depth: number;
  sessionCount: number;
  indexedSessionCount: number;
  unindexedSessionCount: number;
  mainSessionCount: number;
  subagentSessionCount: number;
  teamSessionCount: number;
  lastModified: number;
  gitBranches: string[];
  sessions: SessionCatalogEntry[];
  hasMoreSessions: boolean;
}

export interface BuildSessionCatalogOptions {
  store?: SessionStore;
  lineage?: SessionCatalogLineageFilter;
  team?: string;
  metadataKey?: string;
  metadataValue?: string;
  teamMemberships?: ReadonlyMap<string, SessionCatalogTeamMembership>;
}

export interface GroupCatalogOptions {
  sessionLimit?: number;
}

interface IndexedCatalogContext {
  sessions: Map<string, IndexedSession>;
  relationships: Map<string, IndexedSessionRelationship[]>;
  metadata: Map<string, SessionMetadataEntry[]>;
}

export function buildSessionCatalog(
  sessions: SessionInfo[],
  options?: BuildSessionCatalogOptions
): SessionCatalogEntry[] {
  const indexed = buildIndexedCatalogContext(options?.store);

  return sessions
    .map((session) => buildSessionCatalogEntry(session, indexed, options?.teamMemberships))
    .filter((session) => matchesCatalogFilters(session, options))
    .sort((left, right) => right.lastModified - left.lastModified);
}

export function groupSessionCatalogByDirectory(
  sessions: SessionCatalogEntry[],
  options?: GroupCatalogOptions
): SessionDirectoryGroup[] {
  const sessionLimit = options?.sessionLimit ?? 3;
  const groups = new Map<string, SessionCatalogEntry[]>();

  for (const session of sessions) {
    const key = session.directoryPath;
    const existing = groups.get(key);
    if (existing) {
      existing.push(session);
      continue;
    }
    groups.set(key, [session]);
  }

  return [...groups.entries()]
    .map(([path, entries]) => buildDirectoryGroup(path, entries, sessionLimit))
    .sort((left, right) => right.lastModified - left.lastModified);
}

export async function buildTeamMemberships(
  teamManager: TeamManager
): Promise<Map<string, SessionCatalogTeamMembership>> {
  const teams = await teamManager.discoverTeams();
  const memberships = new Map<string, SessionCatalogTeamMembership>();

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

function buildSessionCatalogEntry(
  session: SessionInfo,
  indexed: IndexedCatalogContext,
  teamMemberships?: ReadonlyMap<string, SessionCatalogTeamMembership>
): SessionCatalogEntry {
  const indexedSession = indexed.sessions.get(session.sessionId);
  const directoryPath = session.cwd ?? indexedSession?.cwd ?? "";
  const relationships = indexed.relationships.get(session.sessionId) ?? [];
  const metadata = indexed.metadata.get(session.sessionId) ?? [];
  const lineage = buildSessionLineage(relationships, teamMemberships);

  return {
    ...session,
    id: session.sessionId,
    project: deriveProjectName(directoryPath),
    directoryPath,
    directoryName: deriveDirectoryName(directoryPath),
    parentDirectoryPath: deriveParentDirectory(directoryPath),
    directoryDepth: deriveDirectoryDepth(directoryPath),
    indexed: Boolean(indexedSession),
    messageCount: indexedSession?.messageCount,
    metadata,
    lineage,
  };
}

function buildIndexedCatalogContext(store?: SessionStore): IndexedCatalogContext {
  if (!store) {
    return {
      sessions: new Map(),
      relationships: new Map(),
      metadata: new Map(),
    };
  }

  const totalSessions = store.getSessionCount();
  const sessions = totalSessions > 0
    ? store.listSessions({ limit: totalSessions, offset: 0 })
    : [];
  const sessionMap = new Map(sessions.map((session) => [session.id, session]));

  const relationshipRows = store.db.prepare(`
    SELECT
      id,
      session_id AS sessionId,
      relationship_type AS relationshipType,
      path,
      agent_id AS agentId,
      slug,
      source_tool_assistant_uuid AS sourceToolAssistantUUID,
      team_name AS teamName,
      teammate_name AS teammateName,
      started_at AS startedAt,
      last_modified AS lastModified
    FROM session_relationships
    ORDER BY session_id ASC, started_at ASC, last_modified ASC
  `).all() as Array<{
    id: string;
    sessionId: string;
    relationshipType: "subagent";
    path: string;
    agentId: string | null;
    slug: string | null;
    sourceToolAssistantUUID: string | null;
    teamName: string | null;
    teammateName: string | null;
    startedAt: number | null;
    lastModified: number;
  }>;

  const relationshipMap = new Map<string, IndexedSessionRelationship[]>();
  for (const row of relationshipRows) {
    const relationship: IndexedSessionRelationship = {
      id: row.id,
      sessionId: row.sessionId,
      relationshipType: row.relationshipType,
      path: row.path,
      agentId: row.agentId ?? undefined,
      slug: row.slug ?? undefined,
      sourceToolAssistantUUID: row.sourceToolAssistantUUID ?? undefined,
      teamName: row.teamName ?? undefined,
      teammateName: row.teammateName ?? undefined,
      startedAt: row.startedAt ?? undefined,
      lastModified: row.lastModified,
    };
    const entries = relationshipMap.get(row.sessionId);
    if (entries) {
      entries.push(relationship);
      continue;
    }
    relationshipMap.set(row.sessionId, [relationship]);
  }

  const metadataMap = new Map<string, SessionMetadataEntry[]>();
  for (const entry of store.listSessionMetadataValues()) {
    const entries = metadataMap.get(entry.sessionId);
    if (entries) {
      entries.push(entry);
      continue;
    }
    metadataMap.set(entry.sessionId, [entry]);
  }

  return {
    sessions: sessionMap,
    relationships: relationshipMap,
    metadata: metadataMap,
  };
}

function buildSessionLineage(
  relationships: IndexedSessionRelationship[],
  teamMemberships?: ReadonlyMap<string, SessionCatalogTeamMembership>
): SessionCatalogLineage {
  const normalizedRelationships = relationships.map((relationship) => {
    if (!relationship.agentId || !teamMemberships) {
      return relationship;
    }

    const match = teamMemberships.get(relationship.agentId);
    if (!match) {
      return relationship;
    }

    if (relationship.teamName && relationship.teammateName) {
      return relationship;
    }

    return {
      ...relationship,
      teamName: relationship.teamName ?? match.teamName,
      teammateName: relationship.teammateName ?? match.teammateName,
    };
  });

  const teamNames = new Set<string>();
  const teammateNames = new Set<string>();

  for (const relationship of normalizedRelationships) {
    if (relationship.teamName) {
      teamNames.add(relationship.teamName);
    }
    if (relationship.teammateName) {
      teammateNames.add(relationship.teammateName);
    }
  }

  return {
    kind: "root",
    parentSessionId: undefined,
    hasSubagents: normalizedRelationships.length > 0,
    subagentCount: normalizedRelationships.length,
    hasTeamMembers: teamNames.size > 0 || teammateNames.size > 0,
    teamNames: [...teamNames].sort(),
    teammateNames: [...teammateNames].sort(),
    relationships: normalizedRelationships,
  };
}

function matchesCatalogFilters(
  session: SessionCatalogEntry,
  options?: BuildSessionCatalogOptions
): boolean {
  const lineage = options?.lineage ?? "all";

  if (lineage === "standalone" && (session.lineage.hasSubagents || session.lineage.hasTeamMembers)) {
    return false;
  }

  if (lineage === "subagent" && !session.lineage.hasSubagents) {
    return false;
  }

  if (lineage === "team" && !session.lineage.hasTeamMembers) {
    return false;
  }

  if (options?.team) {
    const team = options.team.trim().toLowerCase();
    if (!session.lineage.teamNames.some((name) => name.toLowerCase() === team)) {
      return false;
    }
  }

  const normalizedMetadataKey = options?.metadataKey?.trim().toLowerCase();
  const normalizedMetadataValue = options?.metadataValue?.trim().toLowerCase();
  if (normalizedMetadataKey || normalizedMetadataValue) {
    const matchesMetadata = session.metadata.some((entry) => {
      if (!entry.filterable) {
        return false;
      }

      const matchesKey = normalizedMetadataKey
        ? entry.key.toLowerCase() === normalizedMetadataKey
        : true;
      const matchesValue = normalizedMetadataValue
        ? entry.value.toLowerCase().includes(normalizedMetadataValue)
        : true;
      return matchesKey && matchesValue;
    });

    if (!matchesMetadata) {
      return false;
    }
  }

  return true;
}

function buildDirectoryGroup(
  path: string,
  entries: SessionCatalogEntry[],
  sessionLimit: number
): SessionDirectoryGroup {
  const gitBranches = new Set<string>();

  for (const entry of entries) {
    if (entry.gitBranch) {
      gitBranches.add(entry.gitBranch);
    }
  }

  return {
    path,
    name: deriveDirectoryName(path),
    parentPath: deriveParentDirectory(path),
    depth: deriveDirectoryDepth(path),
    sessionCount: entries.length,
    indexedSessionCount: entries.filter((entry) => entry.indexed).length,
    unindexedSessionCount: entries.filter((entry) => !entry.indexed).length,
    mainSessionCount: entries.filter(
      (entry) => !entry.lineage.hasSubagents && !entry.lineage.hasTeamMembers
    ).length,
    subagentSessionCount: entries.filter((entry) => entry.lineage.hasSubagents).length,
    teamSessionCount: entries.filter((entry) => entry.lineage.hasTeamMembers).length,
    lastModified: entries[0]?.lastModified ?? 0,
    gitBranches: [...gitBranches].sort(),
    sessions: entries.slice(0, sessionLimit),
    hasMoreSessions: entries.length > sessionLimit,
  };
}

function deriveProjectName(directoryPath?: string): string {
  if (!directoryPath) {
    return "Unknown project";
  }

  const name = basename(directoryPath);
  return name || directoryPath;
}

function deriveDirectoryName(directoryPath?: string): string {
  if (!directoryPath) {
    return "Unknown cwd";
  }

  const name = basename(directoryPath);
  return name || directoryPath;
}

function deriveParentDirectory(directoryPath?: string): string | undefined {
  if (!directoryPath) {
    return undefined;
  }

  const parent = dirname(directoryPath);
  return parent === directoryPath ? undefined : parent;
}

function deriveDirectoryDepth(directoryPath?: string): number {
  if (!directoryPath) {
    return 0;
  }

  return directoryPath
    .split(/[\\/]+/)
    .filter(Boolean)
    .length;
}
