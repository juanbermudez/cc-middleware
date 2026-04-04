# Phase 9: Search & Indexing

**Status**: Not Started
**Depends On**: Phase 2 (Session Discovery), Phase 7 (API Layer)
**Blocks**: None

## Goal

Index Claude Code sessions into a local SQLite database with full-text search capabilities, enabling fast session discovery and content search across all projects.

## Database: SQLite with better-sqlite3

Using `better-sqlite3` for synchronous, high-performance SQLite access. FTS5 extension provides full-text search.

Database location: `~/.cc-middleware/sessions.db` (or configurable)

---

## Task 9.1: SQLite Session Store

### Implementation: `src/store/db.ts`

```typescript
import Database from 'better-sqlite3';

export interface StoreOptions {
  dbPath?: string;  // Default: ~/.cc-middleware/sessions.db
}

export function createStore(options?: StoreOptions): SessionStore

export interface SessionStore {
  db: Database.Database;
  close(): void;

  // Migrations
  migrate(): void;

  // Session CRUD
  upsertSession(session: IndexedSession): void;
  getSession(id: string): IndexedSession | undefined;
  deleteSession(id: string): void;

  // Message CRUD
  insertMessages(sessionId: string, messages: IndexedMessage[]): void;
  getMessages(sessionId: string, options?: { limit?: number; offset?: number }): IndexedMessage[];

  // Stats
  getSessionCount(): number;
  getLastIndexedAt(): number | undefined;
}

export interface IndexedSession {
  id: string;
  project: string;
  cwd: string;
  summary: string;
  firstPrompt: string;
  gitBranch?: string;
  tag?: string;
  status: 'active' | 'completed' | 'unknown';
  createdAt: number;
  lastModified: number;
  fileSize?: number;
  messageCount?: number;
}

export interface IndexedMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  contentPreview: string;  // First 500 chars of text content
  toolNames?: string;       // Comma-separated tool names used
  timestamp: number;
}
```

**SQL Schema**:
```sql
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

CREATE INDEX idx_sessions_project ON sessions(project);
CREATE INDEX idx_sessions_last_modified ON sessions(last_modified DESC);
CREATE INDEX idx_sessions_tag ON sessions(tag);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content_preview TEXT NOT NULL DEFAULT '',
  tool_names TEXT,
  timestamp INTEGER NOT NULL
);

CREATE INDEX idx_messages_session ON messages(session_id);

-- Full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
  summary,
  first_prompt,
  tag,
  content=sessions,
  content_rowid=rowid
);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content_preview,
  tool_names,
  content=messages,
  content_rowid=rowid
);

-- Triggers to keep FTS in sync
CREATE TRIGGER sessions_ai AFTER INSERT ON sessions BEGIN
  INSERT INTO sessions_fts(rowid, summary, first_prompt, tag)
  VALUES (new.rowid, new.summary, new.first_prompt, new.tag);
END;

CREATE TRIGGER sessions_ad AFTER DELETE ON sessions BEGIN
  INSERT INTO sessions_fts(sessions_fts, rowid, summary, first_prompt, tag)
  VALUES ('delete', old.rowid, old.summary, old.first_prompt, old.tag);
END;

CREATE TRIGGER sessions_au AFTER UPDATE ON sessions BEGIN
  INSERT INTO sessions_fts(sessions_fts, rowid, summary, first_prompt, tag)
  VALUES ('delete', old.rowid, old.summary, old.first_prompt, old.tag);
  INSERT INTO sessions_fts(rowid, summary, first_prompt, tag)
  VALUES (new.rowid, new.summary, new.first_prompt, new.tag);
END;

-- Similar triggers for messages_fts

CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

### Verification (Unit)

**`tests/unit/store.test.ts`**:
```typescript
// Test: Create database with schema
// 1. Create store with temp path
// 2. Run migrate()
// 3. Verify tables exist

// Test: CRUD operations
// 1. Insert a session
// 2. Retrieve it
// 3. Update it
// 4. Delete it

// Test: Message operations
// 1. Insert session
// 2. Insert messages
// 3. Retrieve messages with pagination
```

---

## Task 9.2: Session Indexer

### Implementation: `src/store/indexer.ts`

```typescript
export interface IndexerOptions {
  store: SessionStore;
  projectDirs?: string[];  // Specific dirs to index, or all if omitted
  batchSize?: number;       // Sessions to process per batch (default: 50)
  messageLimit?: number;    // Max messages to index per session (default: 100)
}

export class SessionIndexer {
  constructor(options: IndexerOptions)

  // Full scan: index all sessions
  async fullIndex(): Promise<IndexResult>

  // Incremental: only new/modified sessions
  async incrementalIndex(): Promise<IndexResult>

  // Index a specific session
  async indexSession(sessionId: string, dir?: string): Promise<void>

  // Get index stats
  getStats(): IndexStats
}

export interface IndexResult {
  sessionsIndexed: number;
  messagesIndexed: number;
  errors: Array<{ sessionId: string; error: string }>;
  durationMs: number;
}

export interface IndexStats {
  totalSessions: number;
  totalMessages: number;
  lastFullIndex?: number;
  lastIncrementalIndex?: number;
}
```

**Behavior**:
- Full index: calls `listSessions()` across all projects, indexes each
- Incremental: checks `lastModified` against stored value, only indexes changed
- For each session: reads messages via `getSessionMessages()`, extracts text previews
- Handles errors gracefully (skip bad sessions, continue)
- Records last index time in metadata table

### Verification (E2E)

**`tests/e2e/indexer.test.ts`**:
```typescript
// Test: Full index against real sessions
// 1. Create indexer
// 2. Run fullIndex()
// 3. Verify sessionsIndexed > 0 (if sessions exist)
// 4. Verify store contains session records
// 5. Verify store contains message records

// Test: Incremental index
// 1. Run fullIndex()
// 2. Record counts
// 3. Run incrementalIndex()
// 4. Verify only new/modified sessions processed
```

---

## Task 9.3: Full-Text Search

### Implementation: `src/store/search.ts`

```typescript
export interface SearchOptions {
  query: string;
  project?: string;
  dateFrom?: number;   // Timestamp ms
  dateTo?: number;
  tags?: string[];
  status?: string;
  limit?: number;      // Default: 20
  offset?: number;     // Default: 0
}

export interface SearchResult {
  sessions: Array<IndexedSession & {
    relevanceScore: number;
    matchHighlights: string[];  // Snippet highlights from FTS
  }>;
  total: number;
  queryTimeMs: number;
}

export function searchSessions(
  store: SessionStore,
  options: SearchOptions
): SearchResult
```

**Behavior**:
- Uses FTS5 MATCH syntax for full-text search
- Joins with sessions table for filters
- Uses `highlight()` FTS5 function for snippets
- Supports filtering by project, date range, tags, status
- Returns ranked results with relevance scores

### Verification (E2E)

**`tests/e2e/search.test.ts`**:
```typescript
// Test: Search by keyword
// 1. Index sessions
// 2. Search for a term that appears in session prompts
// 3. Verify results contain matching sessions
// 4. Verify relevanceScore > 0

// Test: Filter by project
// 1. Search with project filter
// 2. Verify all results are from that project

// Test: Empty query returns all (with pagination)
// Test: No results returns empty array
```

---

## Task 9.4: Search API Endpoints

### Implementation: `src/api/routes/search.ts`

```
GET /api/v1/search?q=query&project=...&dateFrom=...&dateTo=...&tags=...&limit=20&offset=0
```

**Response**:
```json
{
  "sessions": [
    {
      "id": "...",
      "summary": "...",
      "firstPrompt": "...",
      "relevanceScore": 0.85,
      "matchHighlights": ["...matched <b>text</b>..."],
      "createdAt": 1234567890,
      "lastModified": 1234567890
    }
  ],
  "total": 42,
  "queryTimeMs": 15
}
```

Also add:
```
POST /api/v1/search/reindex   - Trigger full reindex
GET  /api/v1/search/stats     - Index statistics
```

### Verification (E2E)

**`tests/e2e/api-search.test.ts`**:
```typescript
// Test: Search via API
// 1. Start server
// 2. Trigger reindex
// 3. GET /api/v1/search?q=test
// 4. Verify response structure

// Test: Reindex endpoint
// 1. POST /api/v1/search/reindex
// 2. Verify 200 response with stats
```
