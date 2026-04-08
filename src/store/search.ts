/**
 * Full-text search over indexed sessions.
 * Uses SQLite FTS5 MATCH syntax for efficient search with
 * relevance scoring and snippet highlighting.
 */

import type {
  SessionStore,
  IndexedSession,
  IndexedSessionRelationship,
  SessionMetadataEntry,
  SessionRow,
} from "./db.js";

/** Search options */
export interface SearchOptions {
  query: string;
  project?: string;
  dateFrom?: number;
  dateTo?: number;
  tags?: string[];
  status?: string;
  metadataKey?: string;
  metadataValue?: string;
  lineage?: SearchLineageFilter;
  team?: string;
  teamMemberships?: ReadonlyMap<string, SearchTeamMembership>;
  limit?: number;
  offset?: number;
}

/** A search result entry */
export interface SearchResultEntry extends IndexedSession {
  relevanceScore: number;
  matchHighlights: string[];
  metadata: SessionMetadataEntry[];
  lineage: SearchSessionLineage;
}

/** Search result */
export interface SearchResult {
  sessions: SearchResultEntry[];
  total: number;
  queryTimeMs: number;
}

export interface SearchSessionLineage {
  kind: "root" | "subagent";
  parentSessionId?: string;
  hasSubagents: boolean;
  subagentCount: number;
  hasTeamMembers: boolean;
  teamNames: string[];
  teammateNames: string[];
  relationships: IndexedSessionRelationship[];
}

export interface SearchTeamMembership {
  teamName: string;
  teammateName: string;
}

export type SearchLineageFilter = "all" | "standalone" | "subagent" | "team";

/**
 * Search sessions using full-text search.
 */
export function searchSessions(
  store: SessionStore,
  options: SearchOptions
): SearchResult {
  const start = Date.now();
  const query = options.query.trim();
  const metadataContext = buildMetadataContext(store.listSessionMetadataValues());

  // If empty query, return filtered sessions without FTS
  if (!query) {
    return searchWithoutFts(store, options, start, metadataContext);
  }

  // Sanitize the query for FTS5 (escape special chars, create prefix query)
  const ftsQuery = sanitizeFtsQuery(query);

  try {
    // Build dynamic WHERE clauses for filters
    const { filterClauses, filterParams } = buildFilterClauses(options);

    // Search sessions via FTS5
    const sql = `
      SELECT
        s.*,
        sessions_fts.rank AS relevance_score
      FROM sessions_fts
      JOIN sessions s ON s.rowid = sessions_fts.rowid
      WHERE sessions_fts MATCH ?
      ${filterClauses}
      ORDER BY sessions_fts.rank
    `;
    const rows = store.db.prepare(sql).all(ftsQuery, ...filterParams) as SessionFtsRow[];

    const sessions = rows.map((row) =>
      buildSearchEntry(
        store,
        row,
        Math.abs(row.relevance_score ?? 0),
        buildSessionHighlights(row, query),
        options.teamMemberships,
        metadataContext,
        query
      )
    );

    return finalizeFilteredSessions(
      mergeMetadataMatches(store, sessions, metadataContext, query, options.teamMemberships),
      options,
      start
    );
  } catch {
    // FTS query syntax error -- fall back to LIKE search
    return searchWithLike(store, options, query, start, metadataContext);
  }
}

/**
 * Search messages within sessions using full-text search.
 */
export function searchMessages(
  store: SessionStore,
  options: { query: string; sessionId?: string; limit?: number; offset?: number }
): { messages: Array<{ id: string; sessionId: string; role: string; contentPreview: string; toolNames?: string; relevanceScore: number; highlight: string }>; total: number; queryTimeMs: number } {
  const start = Date.now();
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  const query = options.query.trim();

  if (!query) {
    return { messages: [], total: 0, queryTimeMs: Date.now() - start };
  }

  const ftsQuery = sanitizeFtsQuery(query);

  try {
    const sessionFilter = options.sessionId ? "AND m.session_id = ?" : "";
    const sessionParams = options.sessionId ? [options.sessionId] : [];

    const sql = `
      SELECT
        m.*,
        messages_fts.rank AS relevance_score,
        highlight(messages_fts, 0, '<b>', '</b>') AS highlight_text
      FROM messages_fts
      JOIN messages m ON m.rowid = messages_fts.rowid
      WHERE messages_fts MATCH ?
      ${sessionFilter}
      ORDER BY messages_fts.rank
      LIMIT ? OFFSET ?
    `;

    const params = [ftsQuery, ...sessionParams, limit, offset];
    const rows = store.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

    const countSql = `
      SELECT COUNT(*) as total
      FROM messages_fts
      JOIN messages m ON m.rowid = messages_fts.rowid
      WHERE messages_fts MATCH ?
      ${sessionFilter}
    `;
    const countRow = store.db.prepare(countSql).get(ftsQuery, ...sessionParams) as { total: number };

    return {
      messages: rows.map((row) => ({
        id: row.id as string,
        sessionId: row.session_id as string,
        role: row.role as string,
        contentPreview: row.content_preview as string,
        toolNames: (row.tool_names as string) ?? undefined,
        relevanceScore: Math.abs((row.relevance_score as number) ?? 0),
        highlight: (row.highlight_text as string) ?? "",
      })),
      total: countRow.total,
      queryTimeMs: Date.now() - start,
    };
  } catch {
    return { messages: [], total: 0, queryTimeMs: Date.now() - start };
  }
}

/** Sanitize a query for FTS5 */
function sanitizeFtsQuery(query: string): string {
  // Remove FTS5 special operators that could cause syntax errors
  // Keep simple words and add prefix matching with *
  const words = query
    .replace(/['"(){}[\]:^~!@#$%&]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => `"${w}"*`);

  if (words.length === 0) return '""';

  return words.join(" ");
}

/** Build WHERE filter clauses */
function buildFilterClauses(options: SearchOptions): {
  filterClauses: string;
  filterParams: (string | number)[];
} {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (options.project) {
    clauses.push("AND s.project = ?");
    params.push(options.project);
  }

  if (options.dateFrom) {
    clauses.push("AND s.last_modified >= ?");
    params.push(options.dateFrom);
  }

  if (options.dateTo) {
    clauses.push("AND s.last_modified <= ?");
    params.push(options.dateTo);
  }

  if (options.tags && options.tags.length > 0) {
    const placeholders = options.tags.map(() => "?").join(",");
    clauses.push(`AND s.tag IN (${placeholders})`);
    params.push(...options.tags);
  }

  if (options.status) {
    clauses.push("AND s.status = ?");
    params.push(options.status);
  }

  return {
    filterClauses: clauses.join(" "),
    filterParams: params,
  };
}

/** Fallback search without FTS (empty query) */
function searchWithoutFts(
  store: SessionStore,
  options: SearchOptions,
  start: number,
  metadataContext: MetadataContext
): SearchResult {
  const { filterClauses, filterParams } = buildFilterClauses(options);

  const sql = `
    SELECT * FROM sessions s
    WHERE 1=1 ${filterClauses}
    ORDER BY s.last_modified DESC
  `;

  const rows = store.db.prepare(sql).all(...filterParams) as SessionRow[];

  const sessions = rows.map((row) =>
    buildSearchEntry(store, row, 0, [], options.teamMemberships, metadataContext)
  );

  return finalizeFilteredSessions(sessions, options, start);
}

/** Fallback search using LIKE (for invalid FTS queries) */
function searchWithLike(
  store: SessionStore,
  options: SearchOptions,
  query: string,
  start: number,
  metadataContext: MetadataContext
): SearchResult {
  const likePattern = `%${query}%`;
  const { filterClauses, filterParams } = buildFilterClauses(options);

  const sql = `
    SELECT * FROM sessions s
    WHERE (
      s.id LIKE ?
      OR s.project LIKE ?
      OR s.cwd LIKE ?
      OR s.summary LIKE ?
      OR s.custom_title LIKE ?
      OR s.first_prompt LIKE ?
      OR s.git_branch LIKE ?
      OR s.tag LIKE ?
    )
    ${filterClauses}
    ORDER BY s.last_modified DESC
  `;
  const rows = store.db.prepare(sql).all(
    likePattern,
    likePattern,
    likePattern,
    likePattern,
    likePattern,
    likePattern,
    likePattern,
    likePattern,
    ...filterParams,
  ) as SessionRow[];

  const sessions = rows.map((row) =>
    buildSearchEntry(store, row, 0, [], options.teamMemberships, metadataContext, query)
  );

  return finalizeFilteredSessions(
    mergeMetadataMatches(store, sessions, metadataContext, query, options.teamMemberships),
    options,
    start
  );
}

interface SessionFtsRow extends SessionRow {
  relevance_score: number;
}

interface MetadataContext {
  bySessionId: Map<string, SessionMetadataEntry[]>;
}

/** Convert a SessionRow to a SearchResultEntry with score and highlights */
function buildSearchEntry(
  store: SessionStore,
  row: SessionRow,
  relevanceScore: number,
  matchHighlights: string[],
  teamMemberships?: ReadonlyMap<string, SearchTeamMembership>,
  metadataContext?: MetadataContext,
  query?: string
): SearchResultEntry {
  const metadata = metadataContext?.bySessionId.get(row.id) ?? [];
  const metadataHighlights = query ? buildMetadataHighlights(metadata, query) : [];
  const entry = rowToSearchEntry(
    row,
    relevanceScore,
    dedupeHighlights([...matchHighlights, ...metadataHighlights]),
    metadata,
    buildSessionLineage(store.getRelationships(row.id))
  );

  return teamMemberships
    ? enrichSearchResultEntryWithTeams(entry, teamMemberships)
    : entry;
}

function rowToSearchEntry(
  row: SessionRow,
  relevanceScore: number,
  matchHighlights: string[],
  metadata: SessionMetadataEntry[],
  lineage: SearchSessionLineage
): SearchResultEntry {
  return {
    id: row.id,
    project: row.project,
    cwd: row.cwd,
    summary: row.summary,
    customTitle: row.custom_title ?? undefined,
    firstPrompt: row.first_prompt,
    gitBranch: row.git_branch ?? undefined,
    tag: row.tag ?? undefined,
    status: row.status as IndexedSession["status"],
    createdAt: row.created_at,
    lastModified: row.last_modified,
    fileSize: row.file_size ?? undefined,
    messageCount: row.message_count ?? undefined,
    relevanceScore,
    matchHighlights,
    metadata,
    lineage,
  };
}

function finalizeFilteredSessions(
  sessions: SearchResultEntry[],
  options: SearchOptions,
  start: number
): SearchResult {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  const filtered = filterSearchEntries(sessions, options);

  return {
    sessions: filtered.slice(offset, offset + limit),
    total: filtered.length,
    queryTimeMs: Date.now() - start,
  };
}

function filterSearchEntries(
  sessions: SearchResultEntry[],
  options: SearchOptions
): SearchResultEntry[] {
  let filtered = sessions;

  switch (options.lineage ?? "all") {
    case "standalone":
      filtered = filtered.filter(
        (session) => !session.lineage.hasSubagents && !session.lineage.hasTeamMembers
      );
      break;
    case "subagent":
      filtered = filtered.filter((session) => session.lineage.hasSubagents);
      break;
    case "team":
      filtered = filtered.filter((session) => session.lineage.hasTeamMembers);
      break;
    case "all":
    default:
      break;
  }

  if (options.team) {
    const normalizedTeam = options.team.trim().toLowerCase();
    filtered = filtered.filter((session) =>
      session.lineage.teamNames.some((teamName) => teamName.toLowerCase() === normalizedTeam)
    );
  }

  if (options.project) {
    filtered = filtered.filter((session) => session.project === options.project);
  }

  if (options.dateFrom) {
    filtered = filtered.filter((session) => session.lastModified >= options.dateFrom!);
  }

  if (options.dateTo) {
    filtered = filtered.filter((session) => session.lastModified <= options.dateTo!);
  }

  if (options.tags && options.tags.length > 0) {
    const tagSet = new Set(options.tags);
    filtered = filtered.filter((session) => session.tag && tagSet.has(session.tag));
  }

  if (options.status) {
    filtered = filtered.filter((session) => session.status === options.status);
  }

  const normalizedKey = options.metadataKey?.trim().toLowerCase();
  const normalizedValue = options.metadataValue?.trim().toLowerCase();
  if (normalizedKey || normalizedValue) {
    filtered = filtered.filter((session) =>
      session.metadata.some((entry) => {
        if (!entry.filterable) {
          return false;
        }

        const matchesKey = normalizedKey
          ? entry.key.toLowerCase() === normalizedKey
          : true;
        const matchesValue = normalizedValue
          ? entry.value.toLowerCase().includes(normalizedValue)
          : true;
        return matchesKey && matchesValue;
      })
    );
  }

  return filtered;
}

function buildMetadataContext(entries: SessionMetadataEntry[]): MetadataContext {
  const bySessionId = new Map<string, SessionMetadataEntry[]>();

  for (const entry of entries) {
    const existing = bySessionId.get(entry.sessionId);
    if (existing) {
      existing.push(entry);
      continue;
    }
    bySessionId.set(entry.sessionId, [entry]);
  }

  return { bySessionId };
}

function mergeMetadataMatches(
  store: SessionStore,
  sessions: SearchResultEntry[],
  metadataContext: MetadataContext,
  query: string,
  teamMemberships?: ReadonlyMap<string, SearchTeamMembership>
): SearchResultEntry[] {
  const metadataMatches = findSearchableMetadataMatches(metadataContext, query);
  if (metadataMatches.size === 0) {
    return sessions;
  }

  const existingIds = new Set(sessions.map((session) => session.id));
  const extras: SearchResultEntry[] = [];

  for (const [sessionId, highlights] of metadataMatches.entries()) {
    if (existingIds.has(sessionId)) {
      continue;
    }

    const row = store.db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as
      | SessionRow
      | undefined;
    if (!row) {
      continue;
    }

    extras.push(
      buildSearchEntry(
        store,
        row,
        0,
        highlights,
        teamMemberships,
        metadataContext,
        query
      )
    );
  }

  extras.sort((left, right) => right.lastModified - left.lastModified);
  return [...sessions, ...extras];
}

function findSearchableMetadataMatches(
  metadataContext: MetadataContext,
  query: string
): Map<string, string[]> {
  const terms = extractHighlightTerms(query).map((term) => term.toLowerCase());
  if (terms.length === 0) {
    return new Map();
  }

  const matches = new Map<string, string[]>();

  for (const [sessionId, entries] of metadataContext.bySessionId.entries()) {
    const entryHighlights = entries
      .filter((entry) => entry.searchable)
      .flatMap((entry) => {
        const haystack = `${entry.key} ${entry.label} ${entry.value}`.toLowerCase();
        if (!terms.every((term) => haystack.includes(term))) {
          return [];
        }

        return [highlightTerms(`${entry.label}: ${entry.value}`, terms)];
      });

    if (entryHighlights.length > 0) {
      matches.set(sessionId, dedupeHighlights(entryHighlights));
    }
  }

  return matches;
}

function buildSessionLineage(
  relationships: IndexedSessionRelationship[]
): SearchSessionLineage {
  const teamNames = new Set<string>();
  const teammateNames = new Set<string>();

  for (const relationship of relationships) {
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
    hasSubagents: relationships.length > 0,
    subagentCount: relationships.length,
    hasTeamMembers: teamNames.size > 0 || teammateNames.size > 0,
    teamNames: [...teamNames].sort(),
    teammateNames: [...teammateNames].sort(),
    relationships,
  };
}

export function enrichSearchResultEntryWithTeams(
  entry: SearchResultEntry,
  memberships: ReadonlyMap<string, SearchTeamMembership>
): SearchResultEntry {
  const relationships = entry.lineage.relationships.map((relationship) => {
    if (!relationship.agentId) {
      return relationship;
    }

    const match = memberships.get(relationship.agentId);
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

  return {
    ...entry,
    lineage: buildSessionLineage(relationships),
  };
}

function buildSessionHighlights(row: SessionRow, query: string): string[] {
  const terms = extractHighlightTerms(query);
  if (terms.length === 0) {
    return [];
  }

  const fields = [
    row.custom_title,
    row.summary,
    row.first_prompt,
    row.id,
    row.project,
    row.cwd,
    row.git_branch,
    row.tag,
  ];

  return fields
    .flatMap((value) => value ? [highlightTerms(value, terms)] : [])
    .filter((value) => value.includes("<b>"));
}

function buildMetadataHighlights(
  metadata: SessionMetadataEntry[],
  query: string
): string[] {
  const terms = extractHighlightTerms(query);
  if (terms.length === 0) {
    return [];
  }

  return metadata
    .filter((entry) => entry.searchable)
    .flatMap((entry) => {
      const highlighted = highlightTerms(`${entry.label}: ${entry.value}`, terms);
      return highlighted.includes("<b>") ? [highlighted] : [];
    });
}

function extractHighlightTerms(query: string): string[] {
  return query
    .replace(/['"(){}[\]:^~!@#$%&]/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function highlightTerms(value: string, terms: string[]): string {
  let highlighted = value;

  for (const term of terms) {
    const pattern = new RegExp(`(${escapeRegExp(term)})`, "ig");
    highlighted = highlighted.replace(pattern, "<b>$1</b>");
  }

  return highlighted;
}

function dedupeHighlights(values: string[]): string[] {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
