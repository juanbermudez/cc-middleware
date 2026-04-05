/**
 * Full-text search over indexed sessions.
 * Uses SQLite FTS5 MATCH syntax for efficient search with
 * relevance scoring and snippet highlighting.
 */

import type { SessionStore, IndexedSession, SessionRow } from "./db.js";

/** Search options */
export interface SearchOptions {
  query: string;
  project?: string;
  dateFrom?: number;
  dateTo?: number;
  tags?: string[];
  status?: string;
  limit?: number;
  offset?: number;
}

/** A search result entry */
export interface SearchResultEntry extends IndexedSession {
  relevanceScore: number;
  matchHighlights: string[];
}

/** Search result */
export interface SearchResult {
  sessions: SearchResultEntry[];
  total: number;
  queryTimeMs: number;
}

/**
 * Search sessions using full-text search.
 */
export function searchSessions(
  store: SessionStore,
  options: SearchOptions
): SearchResult {
  const start = Date.now();
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  const query = options.query.trim();

  // If empty query, return filtered sessions without FTS
  if (!query) {
    return searchWithoutFts(store, options, start);
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
        sessions_fts.rank AS relevance_score,
        highlight(sessions_fts, 0, '<b>', '</b>') AS highlight_summary,
        highlight(sessions_fts, 1, '<b>', '</b>') AS highlight_prompt
      FROM sessions_fts
      JOIN sessions s ON s.rowid = sessions_fts.rowid
      WHERE sessions_fts MATCH ?
      ${filterClauses}
      ORDER BY sessions_fts.rank
      LIMIT ? OFFSET ?
    `;

    const params = [ftsQuery, ...filterParams, limit, offset];
    const rows = store.db.prepare(sql).all(...params) as SessionFtsRow[];

    // Also count total matches
    const countSql = `
      SELECT COUNT(*) as total
      FROM sessions_fts
      JOIN sessions s ON s.rowid = sessions_fts.rowid
      WHERE sessions_fts MATCH ?
      ${filterClauses}
    `;
    const countParams = [ftsQuery, ...filterParams];
    const countRow = store.db.prepare(countSql).get(...countParams) as { total: number };

    const sessions: SearchResultEntry[] = rows.map((row) =>
      rowToSearchEntry(
        row,
        Math.abs(row.relevance_score ?? 0),
        [row.highlight_summary, row.highlight_prompt].filter((h) => h && h.includes("<b>"))
      )
    );

    return {
      sessions,
      total: countRow.total,
      queryTimeMs: Date.now() - start,
    };
  } catch {
    // FTS query syntax error -- fall back to LIKE search
    return searchWithLike(store, options, query, start);
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
  start: number
): SearchResult {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  const { filterClauses, filterParams } = buildFilterClauses(options);

  const sql = `
    SELECT * FROM sessions s
    WHERE 1=1 ${filterClauses}
    ORDER BY s.last_modified DESC
    LIMIT ? OFFSET ?
  `;

  const rows = store.db.prepare(sql).all(...filterParams, limit, offset) as SessionRow[];

  const countSql = `
    SELECT COUNT(*) as total FROM sessions s WHERE 1=1 ${filterClauses}
  `;
  const countRow = store.db.prepare(countSql).get(...filterParams) as { total: number };

  return {
    sessions: rows.map((row) => rowToSearchEntry(row, 0, [])),
    total: countRow.total,
    queryTimeMs: Date.now() - start,
  };
}

/** Fallback search using LIKE (for invalid FTS queries) */
function searchWithLike(
  store: SessionStore,
  options: SearchOptions,
  query: string,
  start: number
): SearchResult {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;
  const likePattern = `%${query}%`;
  const { filterClauses, filterParams } = buildFilterClauses(options);

  const sql = `
    SELECT * FROM sessions s
    WHERE (s.summary LIKE ? OR s.first_prompt LIKE ? OR s.tag LIKE ?)
    ${filterClauses}
    ORDER BY s.last_modified DESC
    LIMIT ? OFFSET ?
  `;

  const rows = store.db.prepare(sql).all(likePattern, likePattern, likePattern, ...filterParams, limit, offset) as SessionRow[];

  const countSql = `
    SELECT COUNT(*) as total FROM sessions s
    WHERE (s.summary LIKE ? OR s.first_prompt LIKE ? OR s.tag LIKE ?)
    ${filterClauses}
  `;
  const countRow = store.db.prepare(countSql).get(likePattern, likePattern, likePattern, ...filterParams) as { total: number };

  return {
    sessions: rows.map((row) => rowToSearchEntry(row, 0, [])),
    total: countRow.total,
    queryTimeMs: Date.now() - start,
  };
}

interface SessionFtsRow extends SessionRow {
  relevance_score: number;
  highlight_summary: string;
  highlight_prompt: string;
}

/** Convert a SessionRow to a SearchResultEntry with score and highlights */
function rowToSearchEntry(
  row: SessionRow,
  relevanceScore: number,
  matchHighlights: string[]
): SearchResultEntry {
  return {
    id: row.id,
    project: row.project,
    cwd: row.cwd,
    summary: row.summary,
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
  };
}
