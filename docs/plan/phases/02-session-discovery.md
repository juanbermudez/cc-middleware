# Phase 2: Session Discovery

**Status**: Not Started
**Depends On**: Phase 1 (Foundation)
**Blocks**: Phase 3 (Session Launching), Phase 9 (Search & Index)

## Goal

Wrap the Agent SDK's session listing and reading functions to provide normalized session data through the middleware.

## Key SDK Functions Used

```typescript
import {
  listSessions,        // List sessions with light metadata
  getSessionMessages,  // Read messages from a session
  getSessionInfo,      // Get single session info
  renameSession,       // Rename a session
  tagSession,          // Tag a session
} from "@anthropic-ai/claude-agent-sdk";
```

## SDK Type Reference (Authoritative)

### `listSessions(options?: ListSessionsOptions): Promise<SDKSessionInfo[]>`

Options:
- `dir?: string` - Directory to list sessions for. When omitted, returns sessions across all projects
- `limit?: number` - Maximum number of sessions to return
- `includeWorktrees?: boolean` - Default: `true`. When `dir` is inside a git repo, include sessions from all worktree paths

### `SDKSessionInfo` (all fields):
| Property | Type | Description |
|:---------|:-----|:------------|
| `sessionId` | `string` | Unique session identifier (UUID) |
| `summary` | `string` | Display title: custom title, auto-generated summary, or first prompt |
| `lastModified` | `number` | Last modified time in milliseconds since epoch |
| `fileSize` | `number \| undefined` | Session file size in bytes. Only populated for local JSONL storage |
| `customTitle` | `string \| undefined` | User-set session title (via `/rename`) |
| `firstPrompt` | `string \| undefined` | First meaningful user prompt in the session |
| `gitBranch` | `string \| undefined` | Git branch at the end of the session |
| `cwd` | `string \| undefined` | Working directory for the session |
| `tag` | `string \| undefined` | User-set session tag (see `tagSession()`) |
| `createdAt` | `number \| undefined` | Creation time in milliseconds since epoch |

### `getSessionMessages(sessionId, options?): Promise<SessionMessage[]>`

Options:
- `dir?: string` - Project directory to find the session in. When omitted, searches all projects
- `limit?: number` - Maximum number of messages to return
- `offset?: number` - Number of messages to skip from the start

### `SessionMessage` (all fields):
| Property | Type | Description |
|:---------|:-----|:------------|
| `type` | `"user" \| "assistant"` | Message role |
| `uuid` | `string` | Unique message identifier |
| `session_id` | `string` | Session this message belongs to |
| `message` | `unknown` | Raw message payload from the transcript |
| `parent_tool_use_id` | `null` | Reserved |

### `getSessionInfo(sessionId, options?): Promise<SDKSessionInfo | undefined>`

Options: `dir?: string`

### `renameSession(sessionId, title, options?): Promise<void>`

- `title: string` - Must be non-empty after trimming whitespace
- Options: `dir?: string`

### `tagSession(sessionId, tag, options?): Promise<void>`

- `tag: string | null` - Pass `null` to clear
- Options: `dir?: string`

## Session Storage Context

Claude Code stores sessions as JSONL files at:
```
~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
```

Where `<encoded-cwd>` is the absolute working directory with every non-alphanumeric character replaced by `-` (so `/Users/me/proj` becomes `-Users-me-proj`).

The `listSessions()` function handles the filesystem traversal. The middleware wraps this to normalize the data and add its own metadata layer.

---

## Task 2.1: Session Discovery from Filesystem

### Implementation: `src/sessions/discovery.ts`

```typescript
// Core function signatures to implement:

export async function discoverSessions(options?: {
  dir?: string;        // Project directory filter
  limit?: number;      // Max results
  includeWorktrees?: boolean;
}): Promise<SessionInfo[]>

export async function discoverAllProjects(): Promise<string[]>
// Returns list of project directories that have sessions
```

**Behavior**:
- Calls `listSessions()` from the Agent SDK
- Maps `SDKSessionInfo` to our `SessionInfo` type (must map ALL fields: sessionId, summary, lastModified, fileSize, customTitle, firstPrompt, gitBranch, cwd, tag, createdAt)
- Supports filtering by project directory
- Note: `includeWorktrees` defaults to `true` in the SDK - expose this option
- Handles missing directories gracefully (return empty array)
- Sorts by lastModified descending (most recent first)

### Verification (E2E)

**`tests/e2e/session-discovery.test.ts`**:
```typescript
// Test: List sessions from real filesystem
// 1. Call discoverSessions() with no filter
// 2. Verify result is an array
// 3. If sessions exist, verify each has: sessionId, summary, lastModified
//    Also verify optional fields present when available: cwd, gitBranch, tag, createdAt
// 4. Verify results are sorted by lastModified descending

// Test: List sessions for specific project
// 1. Call discoverSessions({ dir: process.cwd() })
// 2. Verify all returned sessions match the directory

// Test: Handle non-existent directory
// 1. Call discoverSessions({ dir: '/nonexistent/path' })
// 2. Verify empty array returned, no error thrown
```

---

## Task 2.2: Session Message Reading

### Implementation: `src/sessions/messages.ts`

```typescript
export async function readSessionMessages(
  sessionId: string,
  options?: {
    dir?: string;
    limit?: number;
    offset?: number;
  }
): Promise<SessionMessage[]>
```

**Behavior**:
- Calls `getSessionMessages()` from the Agent SDK
- Maps raw messages to our `SessionMessage` type
- Extracts text content from assistant messages
- Extracts tool use information
- Supports pagination

### Verification (E2E)

**`tests/e2e/session-messages.test.ts`**:
```typescript
// Test: Read messages from an existing session
// 1. List sessions to find one with messages
// 2. Call readSessionMessages(sessionId)
// 3. Verify result is array of messages
// 4. Verify each message has: type ("user"|"assistant"), uuid, session_id, message (raw payload), parent_tool_use_id

// Test: Pagination works
// 1. Read first 5 messages with limit: 5
// 2. Read next 5 with limit: 5, offset: 5
// 3. Verify no overlap between the two pages

// Test: Handle non-existent session
// 1. Call readSessionMessages('nonexistent-uuid')
// 2. Verify appropriate error or empty result
```

---

## Task 2.3: Session Info and Metadata

### Implementation: `src/sessions/info.ts`

```typescript
export async function getSession(
  sessionId: string,
  options?: { dir?: string }
): Promise<SessionInfo | undefined>

export async function updateSessionTitle(
  sessionId: string,
  title: string,
  options?: { dir?: string }
): Promise<void>

export async function updateSessionTag(
  sessionId: string,
  tag: string | null,
  options?: { dir?: string }
): Promise<void>
```

### Verification (E2E)

**`tests/e2e/session-info.test.ts`**:
```typescript
// Test: Get info for existing session
// 1. List sessions, pick the first one
// 2. Call getSession(id)
// 3. Verify returned info matches listing

// Test: Rename session (use a test session)
// NOTE: This modifies real session data. Create a test session first
// via query(), then rename it, then verify.

// Test: Handle non-existent session
// 1. Call getSession('nonexistent')
// 2. Verify undefined returned
```
