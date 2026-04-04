/**
 * SQLite session store.
 * Provides persistent storage for indexed sessions and messages
 * with FTS5 full-text search support.
 */

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";

/** Options for creating the session store */
export interface StoreOptions {
  dbPath?: string; // Default: ~/.cc-middleware/sessions.db
}

/** An indexed session record */
export interface IndexedSession {
  id: string;
  project: string;
  cwd: string;
  summary: string;
  firstPrompt: string;
  gitBranch?: string;
  tag?: string;
  status: "active" | "completed" | "unknown";
  createdAt: number;
  lastModified: number;
  fileSize?: number;
  messageCount?: number;
}

/** An indexed message record */
export interface IndexedMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  contentPreview: string;
  toolNames?: string;
  timestamp: number;
}

/** The session store interface */
export interface SessionStore {
  db: Database.Database;
  close(): void;

  // Migrations
  migrate(): void;

  // Session CRUD
  upsertSession(session: IndexedSession): void;
  getSession(id: string): IndexedSession | undefined;
  deleteSession(id: string): void;
  listSessions(options?: { limit?: number; offset?: number; project?: string }): IndexedSession[];

  // Message CRUD
  insertMessages(sessionId: string, messages: IndexedMessage[]): void;
  getMessages(sessionId: string, options?: { limit?: number; offset?: number }): IndexedMessage[];
  deleteMessages(sessionId: string): void;

  // Stats
  getSessionCount(): number;
  getMessageCount(): number;
  getLastIndexedAt(): number | undefined;
  setLastIndexedAt(timestamp: number): void;

  // Metadata
  getMetadata(key: string): string | undefined;
  setMetadata(key: string, value: string): void;
}

/** Default database path */
function defaultDbPath(): string {
  return resolve(homedir(), ".cc-middleware", "sessions.db");
}

/** SQL schema for the database */
const SCHEMA_SQL = `
-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  cwd TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  first_prompt TEXT NOT NULL DEFAULT '',
  git_branch TEXT,
  tag TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  created_at INTEGER NOT NULL,
  last_modified INTEGER NOT NULL,
  file_size INTEGER,
  message_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
CREATE INDEX IF NOT EXISTS idx_sessions_last_modified ON sessions(last_modified DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_tag ON sessions(tag);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content_preview TEXT NOT NULL DEFAULT '',
  tool_names TEXT,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

-- Full-text search for sessions
CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
  summary,
  first_prompt,
  tag,
  content=sessions,
  content_rowid=rowid
);

-- Full-text search for messages
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content_preview,
  tool_names,
  content=messages,
  content_rowid=rowid
);

-- Metadata table for key-value storage
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Trigger SQL to keep FTS in sync */
const TRIGGERS_SQL = `
-- Sessions FTS triggers
CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
  INSERT INTO sessions_fts(rowid, summary, first_prompt, tag)
  VALUES (new.rowid, new.summary, new.first_prompt, new.tag);
END;

CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
  INSERT INTO sessions_fts(sessions_fts, rowid, summary, first_prompt, tag)
  VALUES ('delete', old.rowid, old.summary, old.first_prompt, old.tag);
END;

CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
  INSERT INTO sessions_fts(sessions_fts, rowid, summary, first_prompt, tag)
  VALUES ('delete', old.rowid, old.summary, old.first_prompt, old.tag);
  INSERT INTO sessions_fts(rowid, summary, first_prompt, tag)
  VALUES (new.rowid, new.summary, new.first_prompt, new.tag);
END;

-- Messages FTS triggers
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content_preview, tool_names)
  VALUES (new.rowid, new.content_preview, new.tool_names);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content_preview, tool_names)
  VALUES ('delete', old.rowid, old.content_preview, old.tool_names);
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content_preview, tool_names)
  VALUES ('delete', old.rowid, old.content_preview, old.tool_names);
  INSERT INTO messages_fts(rowid, content_preview, tool_names)
  VALUES (new.rowid, new.content_preview, new.tool_names);
END;
`;

/**
 * Create a new session store backed by SQLite.
 */
export function createStore(options?: StoreOptions): SessionStore {
  const dbPath = options?.dbPath ?? defaultDbPath();

  // Ensure parent directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Prepared statements (lazily initialized after migration)
  let stmts: ReturnType<typeof prepareStatements> | null = null;

  function getStmts() {
    if (!stmts) {
      stmts = prepareStatements(db);
    }
    return stmts;
  }

  const store: SessionStore = {
    db,

    close() {
      db.close();
    },

    migrate() {
      db.exec(SCHEMA_SQL);
      db.exec(TRIGGERS_SQL);
      // Re-prepare statements after migration
      stmts = prepareStatements(db);
    },

    upsertSession(session: IndexedSession) {
      getStmts().upsertSession.run({
        id: session.id,
        project: session.project,
        cwd: session.cwd,
        summary: session.summary,
        first_prompt: session.firstPrompt,
        git_branch: session.gitBranch ?? null,
        tag: session.tag ?? null,
        status: session.status,
        created_at: session.createdAt,
        last_modified: session.lastModified,
        file_size: session.fileSize ?? null,
        message_count: session.messageCount ?? 0,
      });
    },

    getSession(id: string): IndexedSession | undefined {
      const row = getStmts().getSession.get(id) as SessionRow | undefined;
      return row ? rowToSession(row) : undefined;
    },

    deleteSession(id: string) {
      // Delete messages first (cascade doesn't work with FTS triggers)
      getStmts().deleteMessages.run(id);
      getStmts().deleteSession.run(id);
    },

    listSessions(options) {
      const limit = options?.limit ?? 50;
      const offset = options?.offset ?? 0;

      if (options?.project) {
        const rows = getStmts().listSessionsByProject.all(options.project, limit, offset) as SessionRow[];
        return rows.map(rowToSession);
      }

      const rows = getStmts().listSessions.all(limit, offset) as SessionRow[];
      return rows.map(rowToSession);
    },

    insertMessages(sessionId: string, messages: IndexedMessage[]) {
      const insertMany = db.transaction((msgs: IndexedMessage[]) => {
        for (const msg of msgs) {
          getStmts().insertMessage.run({
            id: msg.id,
            session_id: sessionId,
            role: msg.role,
            content_preview: msg.contentPreview,
            tool_names: msg.toolNames ?? null,
            timestamp: msg.timestamp,
          });
        }
      });
      insertMany(messages);
    },

    getMessages(sessionId: string, options) {
      const limit = options?.limit ?? 100;
      const offset = options?.offset ?? 0;
      const rows = getStmts().getMessages.all(sessionId, limit, offset) as MessageRow[];
      return rows.map(rowToMessage);
    },

    deleteMessages(sessionId: string) {
      getStmts().deleteMessages.run(sessionId);
    },

    getSessionCount(): number {
      const row = getStmts().sessionCount.get() as { count: number };
      return row.count;
    },

    getMessageCount(): number {
      const row = getStmts().messageCount.get() as { count: number };
      return row.count;
    },

    getLastIndexedAt(): number | undefined {
      const row = getStmts().getMetadata.get("last_indexed_at") as MetadataRow | undefined;
      return row ? Number(row.value) : undefined;
    },

    setLastIndexedAt(timestamp: number) {
      getStmts().setMetadata.run("last_indexed_at", String(timestamp));
    },

    getMetadata(key: string): string | undefined {
      const row = getStmts().getMetadata.get(key) as MetadataRow | undefined;
      return row?.value;
    },

    setMetadata(key: string, value: string) {
      getStmts().setMetadata.run(key, value);
    },
  };

  return store;
}

/** Internal row types */
interface SessionRow {
  id: string;
  project: string;
  cwd: string;
  summary: string;
  first_prompt: string;
  git_branch: string | null;
  tag: string | null;
  status: string;
  created_at: number;
  last_modified: number;
  file_size: number | null;
  message_count: number | null;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content_preview: string;
  tool_names: string | null;
  timestamp: number;
}

interface MetadataRow {
  key: string;
  value: string;
}

/** Convert a database row to an IndexedSession */
function rowToSession(row: SessionRow): IndexedSession {
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
  };
}

/** Convert a database row to an IndexedMessage */
function rowToMessage(row: MessageRow): IndexedMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as IndexedMessage["role"],
    contentPreview: row.content_preview,
    toolNames: row.tool_names ?? undefined,
    timestamp: row.timestamp,
  };
}

/** Prepare all SQL statements */
function prepareStatements(db: Database.Database) {
  return {
    upsertSession: db.prepare(`
      INSERT INTO sessions (id, project, cwd, summary, first_prompt, git_branch, tag, status, created_at, last_modified, file_size, message_count)
      VALUES (@id, @project, @cwd, @summary, @first_prompt, @git_branch, @tag, @status, @created_at, @last_modified, @file_size, @message_count)
      ON CONFLICT(id) DO UPDATE SET
        project = excluded.project,
        cwd = excluded.cwd,
        summary = excluded.summary,
        first_prompt = excluded.first_prompt,
        git_branch = excluded.git_branch,
        tag = excluded.tag,
        status = excluded.status,
        last_modified = excluded.last_modified,
        file_size = excluded.file_size,
        message_count = excluded.message_count
    `),

    getSession: db.prepare("SELECT * FROM sessions WHERE id = ?"),

    deleteSession: db.prepare("DELETE FROM sessions WHERE id = ?"),

    listSessions: db.prepare(
      "SELECT * FROM sessions ORDER BY last_modified DESC LIMIT ? OFFSET ?"
    ),

    listSessionsByProject: db.prepare(
      "SELECT * FROM sessions WHERE project = ? ORDER BY last_modified DESC LIMIT ? OFFSET ?"
    ),

    insertMessage: db.prepare(`
      INSERT OR REPLACE INTO messages (id, session_id, role, content_preview, tool_names, timestamp)
      VALUES (@id, @session_id, @role, @content_preview, @tool_names, @timestamp)
    `),

    getMessages: db.prepare(
      "SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?"
    ),

    deleteMessages: db.prepare("DELETE FROM messages WHERE session_id = ?"),

    sessionCount: db.prepare("SELECT COUNT(*) as count FROM sessions"),

    messageCount: db.prepare("SELECT COUNT(*) as count FROM messages"),

    getMetadata: db.prepare("SELECT * FROM metadata WHERE key = ?"),

    setMetadata: db.prepare(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)"
    ),
  };
}
