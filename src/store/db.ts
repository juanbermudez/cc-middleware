/**
 * SQLite session store.
 * Provides persistent storage for indexed sessions and messages
 * with FTS5 full-text search support.
 */

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
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
  customTitle?: string;
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

/** Indexed relationship metadata for a session */
export interface IndexedSessionRelationship {
  id: string;
  sessionId: string;
  relationshipType: "subagent";
  path: string;
  agentId?: string;
  slug?: string;
  sourceToolAssistantUUID?: string;
  teamName?: string;
  teammateName?: string;
  startedAt?: number;
  lastModified: number;
}

export interface SessionMetadataDefinition {
  key: string;
  label: string;
  description?: string;
  valueType: "string";
  searchable: boolean;
  filterable: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SessionMetadataValue {
  sessionId: string;
  key: string;
  value: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionMetadataEntry extends SessionMetadataValue {
  label: string;
  description?: string;
  valueType: "string";
  searchable: boolean;
  filterable: boolean;
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

  // Session relationships
  replaceRelationships(sessionId: string, relationships: IndexedSessionRelationship[]): void;
  getRelationships(sessionId: string): IndexedSessionRelationship[];

  // Session metadata
  listSessionMetadataDefinitions(): SessionMetadataDefinition[];
  getSessionMetadataDefinition(key: string): SessionMetadataDefinition | undefined;
  upsertSessionMetadataDefinition(definition: SessionMetadataDefinition): void;
  listSessionMetadataValues(sessionId?: string): SessionMetadataEntry[];
  setSessionMetadataValue(value: SessionMetadataValue): void;
  deleteSessionMetadataValue(sessionId: string, key: string): void;

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
  custom_title TEXT,
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

-- Session relationships table
CREATE TABLE IF NOT EXISTS session_relationships (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  path TEXT NOT NULL,
  agent_id TEXT,
  slug TEXT,
  source_tool_assistant_uuid TEXT,
  team_name TEXT,
  teammate_name TEXT,
  started_at INTEGER,
  last_modified INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_relationships_session
  ON session_relationships(session_id);

-- Session metadata definitions
CREATE TABLE IF NOT EXISTS session_metadata_definitions (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  value_type TEXT NOT NULL DEFAULT 'string',
  searchable INTEGER NOT NULL DEFAULT 1,
  filterable INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Session metadata values
CREATE TABLE IF NOT EXISTS session_metadata_values (
  session_id TEXT NOT NULL,
  metadata_key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, metadata_key)
);

CREATE INDEX IF NOT EXISTS idx_session_metadata_values_session
  ON session_metadata_values(session_id);

CREATE INDEX IF NOT EXISTS idx_session_metadata_values_key
  ON session_metadata_values(metadata_key);

-- Full-text search for sessions
CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
  session_id,
  project,
  cwd,
  summary,
  custom_title,
  first_prompt,
  git_branch,
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
  INSERT INTO sessions_fts(rowid, session_id, project, cwd, summary, custom_title, first_prompt, git_branch, tag)
  VALUES (new.rowid, new.id, new.project, new.cwd, new.summary, new.custom_title, new.first_prompt, new.git_branch, new.tag);
END;

CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
  INSERT INTO sessions_fts(sessions_fts, rowid, session_id, project, cwd, summary, custom_title, first_prompt, git_branch, tag)
  VALUES ('delete', old.rowid, old.id, old.project, old.cwd, old.summary, old.custom_title, old.first_prompt, old.git_branch, old.tag);
END;

CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
  INSERT INTO sessions_fts(sessions_fts, rowid, session_id, project, cwd, summary, custom_title, first_prompt, git_branch, tag)
  VALUES ('delete', old.rowid, old.id, old.project, old.cwd, old.summary, old.custom_title, old.first_prompt, old.git_branch, old.tag);
  INSERT INTO sessions_fts(rowid, session_id, project, cwd, summary, custom_title, first_prompt, git_branch, tag)
  VALUES (new.rowid, new.id, new.project, new.cwd, new.summary, new.custom_title, new.first_prompt, new.git_branch, new.tag);
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
export async function createStore(options?: StoreOptions): Promise<SessionStore> {
  const dbPath = options?.dbPath ?? defaultDbPath();

  // Ensure parent directory exists
  await mkdir(dirname(dbPath), { recursive: true });

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
      ensureSessionColumns(db);
      ensureRelationshipColumns(db);
      ensureSessionsFtsSchema(db);
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
        custom_title: session.customTitle ?? null,
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
      getStmts().deleteRelationships.run(id);
      getStmts().deleteSessionMetadataValues.run(id);
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

    replaceRelationships(sessionId: string, relationships: IndexedSessionRelationship[]) {
      const replaceMany = db.transaction((items: IndexedSessionRelationship[]) => {
        getStmts().deleteRelationships.run(sessionId);

        for (const relationship of items) {
          getStmts().insertRelationship.run({
            id: relationship.id,
            session_id: relationship.sessionId,
            relationship_type: relationship.relationshipType,
            path: relationship.path,
            agent_id: relationship.agentId ?? null,
            slug: relationship.slug ?? null,
            source_tool_assistant_uuid: relationship.sourceToolAssistantUUID ?? null,
            team_name: relationship.teamName ?? null,
            teammate_name: relationship.teammateName ?? null,
            started_at: relationship.startedAt ?? null,
            last_modified: relationship.lastModified,
          });
        }
      });

      replaceMany(relationships);
    },

    getRelationships(sessionId: string) {
      const rows = getStmts().getRelationships.all(sessionId) as SessionRelationshipRow[];
      return rows.map(rowToRelationship);
    },

    listSessionMetadataDefinitions() {
      const rows = getStmts().listSessionMetadataDefinitions.all() as SessionMetadataDefinitionRow[];
      return rows.map(rowToSessionMetadataDefinition);
    },

    getSessionMetadataDefinition(key: string) {
      const row = getStmts().getSessionMetadataDefinition.get(key) as SessionMetadataDefinitionRow | undefined;
      return row ? rowToSessionMetadataDefinition(row) : undefined;
    },

    upsertSessionMetadataDefinition(definition: SessionMetadataDefinition) {
      getStmts().upsertSessionMetadataDefinition.run({
        key: definition.key,
        label: definition.label,
        description: definition.description ?? null,
        value_type: definition.valueType,
        searchable: definition.searchable ? 1 : 0,
        filterable: definition.filterable ? 1 : 0,
        created_at: definition.createdAt,
        updated_at: definition.updatedAt,
      });
    },

    listSessionMetadataValues(sessionId?: string) {
      const rows = sessionId
        ? getStmts().listSessionMetadataValuesBySession.all(sessionId) as SessionMetadataValueRow[]
        : getStmts().listSessionMetadataValues.all() as SessionMetadataValueRow[];
      return rows.map(rowToSessionMetadataEntry);
    },

    setSessionMetadataValue(value: SessionMetadataValue) {
      getStmts().upsertSessionMetadataValue.run({
        session_id: value.sessionId,
        metadata_key: value.key,
        value: value.value,
        created_at: value.createdAt,
        updated_at: value.updatedAt,
      });
    },

    deleteSessionMetadataValue(sessionId: string, key: string) {
      getStmts().deleteSessionMetadataValue.run(sessionId, key);
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

/** Row types */
export interface SessionRow {
  id: string;
  project: string;
  cwd: string;
  summary: string;
  custom_title: string | null;
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

interface SessionRelationshipRow {
  id: string;
  session_id: string;
  relationship_type: string;
  path: string;
  agent_id: string | null;
  slug: string | null;
  source_tool_assistant_uuid: string | null;
  team_name: string | null;
  teammate_name: string | null;
  started_at: number | null;
  last_modified: number;
}

interface SessionMetadataDefinitionRow {
  key: string;
  label: string;
  description: string | null;
  value_type: string;
  searchable: number;
  filterable: number;
  created_at: number;
  updated_at: number;
}

interface SessionMetadataValueRow {
  session_id: string;
  metadata_key: string;
  value: string;
  created_at: number;
  updated_at: number;
  label: string;
  description: string | null;
  value_type: string;
  searchable: number;
  filterable: number;
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
    customTitle: row.custom_title ?? undefined,
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

function rowToRelationship(row: SessionRelationshipRow): IndexedSessionRelationship {
  return {
    id: row.id,
    sessionId: row.session_id,
    relationshipType: row.relationship_type as IndexedSessionRelationship["relationshipType"],
    path: row.path,
    agentId: row.agent_id ?? undefined,
    slug: row.slug ?? undefined,
    sourceToolAssistantUUID: row.source_tool_assistant_uuid ?? undefined,
    teamName: row.team_name ?? undefined,
    teammateName: row.teammate_name ?? undefined,
    startedAt: row.started_at ?? undefined,
    lastModified: row.last_modified,
  };
}

function rowToSessionMetadataDefinition(
  row: SessionMetadataDefinitionRow
): SessionMetadataDefinition {
  return {
    key: row.key,
    label: row.label,
    description: row.description ?? undefined,
    valueType: row.value_type as SessionMetadataDefinition["valueType"],
    searchable: Boolean(row.searchable),
    filterable: Boolean(row.filterable),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSessionMetadataEntry(row: SessionMetadataValueRow): SessionMetadataEntry {
  return {
    sessionId: row.session_id,
    key: row.metadata_key,
    value: row.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    label: row.label,
    description: row.description ?? undefined,
    valueType: row.value_type as SessionMetadataEntry["valueType"],
    searchable: Boolean(row.searchable),
    filterable: Boolean(row.filterable),
  };
}

/** Prepare all SQL statements */
function prepareStatements(db: Database.Database) {
  return {
    upsertSession: db.prepare(`
      INSERT INTO sessions (id, project, cwd, summary, custom_title, first_prompt, git_branch, tag, status, created_at, last_modified, file_size, message_count)
      VALUES (@id, @project, @cwd, @summary, @custom_title, @first_prompt, @git_branch, @tag, @status, @created_at, @last_modified, @file_size, @message_count)
      ON CONFLICT(id) DO UPDATE SET
        project = excluded.project,
        cwd = excluded.cwd,
        summary = excluded.summary,
        custom_title = excluded.custom_title,
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

    insertRelationship: db.prepare(`
      INSERT OR REPLACE INTO session_relationships (
        id,
        session_id,
        relationship_type,
        path,
        agent_id,
        slug,
        source_tool_assistant_uuid,
        team_name,
        teammate_name,
        started_at,
        last_modified
      )
      VALUES (
        @id,
        @session_id,
        @relationship_type,
        @path,
        @agent_id,
        @slug,
        @source_tool_assistant_uuid,
        @team_name,
        @teammate_name,
        @started_at,
        @last_modified
      )
    `),

    getRelationships: db.prepare(
      "SELECT * FROM session_relationships WHERE session_id = ? ORDER BY started_at ASC, last_modified ASC"
    ),

    deleteRelationships: db.prepare(
      "DELETE FROM session_relationships WHERE session_id = ?"
    ),

    listSessionMetadataDefinitions: db.prepare(`
      SELECT * FROM session_metadata_definitions
      ORDER BY label COLLATE NOCASE ASC, key COLLATE NOCASE ASC
    `),

    getSessionMetadataDefinition: db.prepare(
      "SELECT * FROM session_metadata_definitions WHERE key = ?"
    ),

    upsertSessionMetadataDefinition: db.prepare(`
      INSERT INTO session_metadata_definitions (
        key,
        label,
        description,
        value_type,
        searchable,
        filterable,
        created_at,
        updated_at
      )
      VALUES (
        @key,
        @label,
        @description,
        @value_type,
        @searchable,
        @filterable,
        @created_at,
        @updated_at
      )
      ON CONFLICT(key) DO UPDATE SET
        label = excluded.label,
        description = excluded.description,
        value_type = excluded.value_type,
        searchable = excluded.searchable,
        filterable = excluded.filterable,
        updated_at = excluded.updated_at
    `),

    listSessionMetadataValues: db.prepare(`
      SELECT
        v.session_id,
        v.metadata_key,
        v.value,
        v.created_at,
        v.updated_at,
        d.label,
        d.description,
        d.value_type,
        d.searchable,
        d.filterable
      FROM session_metadata_values v
      JOIN session_metadata_definitions d ON d.key = v.metadata_key
      ORDER BY d.label COLLATE NOCASE ASC, v.metadata_key COLLATE NOCASE ASC
    `),

    listSessionMetadataValuesBySession: db.prepare(`
      SELECT
        v.session_id,
        v.metadata_key,
        v.value,
        v.created_at,
        v.updated_at,
        d.label,
        d.description,
        d.value_type,
        d.searchable,
        d.filterable
      FROM session_metadata_values v
      JOIN session_metadata_definitions d ON d.key = v.metadata_key
      WHERE v.session_id = ?
      ORDER BY d.label COLLATE NOCASE ASC, v.metadata_key COLLATE NOCASE ASC
    `),

    upsertSessionMetadataValue: db.prepare(`
      INSERT INTO session_metadata_values (
        session_id,
        metadata_key,
        value,
        created_at,
        updated_at
      )
      VALUES (
        @session_id,
        @metadata_key,
        @value,
        @created_at,
        @updated_at
      )
      ON CONFLICT(session_id, metadata_key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `),

    deleteSessionMetadataValue: db.prepare(
      "DELETE FROM session_metadata_values WHERE session_id = ? AND metadata_key = ?"
    ),

    deleteSessionMetadataValues: db.prepare(
      "DELETE FROM session_metadata_values WHERE session_id = ?"
    ),

    sessionCount: db.prepare("SELECT COUNT(*) as count FROM sessions"),

    messageCount: db.prepare("SELECT COUNT(*) as count FROM messages"),

    getMetadata: db.prepare("SELECT * FROM metadata WHERE key = ?"),

    setMetadata: db.prepare(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)"
    ),
  };
}

function ensureSessionColumns(db: Database.Database): void {
  const sessionColumns = db
    .prepare("PRAGMA table_info(sessions)")
    .all() as Array<{ name: string }>;
  const sessionColumnNames = new Set(sessionColumns.map((column) => column.name));

  if (!sessionColumnNames.has("custom_title")) {
    db.exec("ALTER TABLE sessions ADD COLUMN custom_title TEXT");
  }
}

function ensureRelationshipColumns(db: Database.Database): void {
  const relationshipColumns = db
    .prepare("PRAGMA table_info(session_relationships)")
    .all() as Array<{ name: string }>;
  const relationshipColumnNames = new Set(
    relationshipColumns.map((column) => column.name)
  );

  if (!relationshipColumnNames.has("team_name")) {
    db.exec("ALTER TABLE session_relationships ADD COLUMN team_name TEXT");
  }

  if (!relationshipColumnNames.has("teammate_name")) {
    db.exec("ALTER TABLE session_relationships ADD COLUMN teammate_name TEXT");
  }
}

function ensureSessionsFtsSchema(db: Database.Database): void {
  const sessionsFtsExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions_fts'")
    .get() as { name: string } | undefined;

  if (!sessionsFtsExists) {
    return;
  }

  const columns = db
    .prepare("PRAGMA table_info(sessions_fts)")
    .all() as Array<{ name: string }>;
  const columnNames = columns
    .map((column) => column.name)
    .filter((name) => !name.startsWith("rank"));
  const expectedColumns = [
    "session_id",
    "project",
    "cwd",
    "summary",
    "custom_title",
    "first_prompt",
    "git_branch",
    "tag",
  ];
  const needsRebuild =
    columnNames.length !== expectedColumns.length
    || expectedColumns.some((name, index) => columnNames[index] !== name);

  if (!needsRebuild) {
    return;
  }

  db.exec(`
    DROP TRIGGER IF EXISTS sessions_ai;
    DROP TRIGGER IF EXISTS sessions_ad;
    DROP TRIGGER IF EXISTS sessions_au;
    DROP TABLE IF EXISTS sessions_fts;
  `);

  db.exec(`
    CREATE VIRTUAL TABLE sessions_fts USING fts5(
      session_id,
      project,
      cwd,
      summary,
      custom_title,
      first_prompt,
      git_branch,
      tag,
      content=sessions,
      content_rowid=rowid
    );

    INSERT INTO sessions_fts(
      rowid,
      session_id,
      project,
      cwd,
      summary,
      custom_title,
      first_prompt,
      git_branch,
      tag
    )
    SELECT
      rowid,
      id,
      project,
      cwd,
      summary,
      custom_title,
      first_prompt,
      git_branch,
      tag
    FROM sessions;
  `);
}
