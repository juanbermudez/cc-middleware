# CC-Middleware Master Plan

## Overview

Build a Node/TypeScript middleware that wraps Claude Code to provide a clean, unified API for session management, hook event dispatch, headless session control, permission handling, and agent/team orchestration. The middleware is installable as a Claude Code plugin and serves as the foundation for future CLI and UI control surfaces.

## Principles

1. **Progressive**: Each phase builds on verified work from the previous phase
2. **Verified**: Every task has deterministic E2E tests run by a separate agent
3. **Documented**: Progress and learnings are updated after every task
4. **Simple**: Start with the minimum viable implementation, extend later
5. **Reliable**: Prefer boring, well-understood patterns over clever abstractions

## Phase Overview

| Phase | Name | Depends On | Description |
|-------|------|------------|-------------|
| 1 | [Foundation](phases/01-foundation.md) | - | Project scaffold, types, build system, test harness |
| 2 | [Session Discovery](phases/02-session-discovery.md) | Phase 1 | Read and index existing Claude Code sessions |
| 3 | [Session Launching](phases/03-session-launching.md) | Phase 2 | Launch headless sessions via Agent SDK |
| 4 | [Event System](phases/04-event-system.md) | Phase 1 | Hook event bus, dispatch, and registration |
| 5 | [Permission Handling](phases/05-permissions.md) | Phase 3 | canUseTool, AskUserQuestion, policy engine |
| 6 | [Agent & Team Management](phases/06-agents-teams.md) | Phase 3, 4 | Sub-agent definitions, team orchestration |
| **6.5** | **[Integration Tests](phases/06.5-integration-tests.md)** | **Phase 3-6** | **Wire systems together, prove they work end-to-end** |
| 7 | [API Layer](phases/07-api-layer.md) | Phase 6.5 | REST/WebSocket HTTP API |
| 8 | [Plugin Integration](phases/08-plugin.md) | Phase 4, 7 | Claude Code plugin packaging |
| 9 | [Search & Indexing](phases/09-search-index.md) | Phase 2, 7 | SQLite full-text search for sessions |
| 10 | [Configuration Management](phases/10-configuration.md) | Phase 1, 7 | Read/manage CC settings, plugins, skills, agents, MCP, memory |

## Dependency Graph

```
Phase 1 (Foundation)
  ├── Phase 2 (Session Discovery)
  │     ├── Phase 3 (Session Launching)
  │     │     ├── Phase 5 (Permissions)
  │     │     └── Phase 6 (Agents & Teams) ←── also depends on Phase 4
  │     └── Phase 9 (Search & Index) ←── also depends on Phase 7
  ├── Phase 4 (Event System)
  │     ├── Phase 6 (Agents & Teams)
  │     └── Phase 8 (Plugin) ←── also depends on Phase 7
  └── Phase 10 (Configuration) ←── also depends on Phase 7

Phase 6.5 (Integration Tests) depends on Phases 3-6
Phase 7 (API Layer) depends on Phase 6.5
```

---

## Phase 1: Foundation
**File**: [phases/01-foundation.md](phases/01-foundation.md)

### Task 1.1: Initialize project scaffold
- Create `package.json` with dependencies
- Create `tsconfig.json` with strict mode
- Create `vitest.config.ts`
- Create `.gitignore`
- Install dependencies

**Verify**: `npm install` succeeds, `npx tsc --noEmit` passes

### Task 1.2: Define core types
- `src/types/sessions.ts` - Session, SessionInfo, SessionMessage types
- `src/types/hooks.ts` - HookEvent, HookHandler, HookInput/Output types
- `src/types/agents.ts` - AgentDefinition, TeamConfig types
- `src/types/errors.ts` - Typed error classes
- `src/types/index.ts` - Re-exports

**Verify**: Types compile, `npx tsc --noEmit` passes

### Task 1.3: Create test harness
- Configure vitest with TypeScript
- Create test utility helpers (mock session data, test fixtures)
- Create a sample unit test that passes
- Create E2E test runner script

**Verify**: `npm test` runs and passes with the sample test

---

## Phase 2: Session Discovery
**File**: [phases/02-session-discovery.md](phases/02-session-discovery.md)

### Task 2.1: Session discovery from filesystem
- `src/sessions/discovery.ts` - Wraps Agent SDK `listSessions()`
- List sessions by project directory
- List sessions across all projects
- Return normalized `SessionInfo` objects

**Verify**: E2E test that calls `listSessions()` against the real `~/.claude/projects/` directory and gets back valid session objects with expected fields

### Task 2.2: Session message reading
- `src/sessions/messages.ts` - Wraps Agent SDK `getSessionMessages()`
- Read messages from a specific session
- Support pagination (limit/offset)
- Return normalized `SessionMessage` objects

**Verify**: E2E test that reads messages from an existing session and validates the message structure

### Task 2.3: Session info and metadata
- `src/sessions/info.ts` - Wraps `getSessionInfo()`, `renameSession()`, `tagSession()`
- Get detailed info for a single session
- Rename and tag sessions

**Verify**: E2E test that gets info for a session, renames it, and verifies the rename persisted

---

## Phase 3: Session Launching
**File**: [phases/03-session-launching.md](phases/03-session-launching.md)

### Task 3.1: Launch headless session (single-turn)
- `src/sessions/launcher.ts` - Wraps Agent SDK `query()`
- Launch a single-turn session with a prompt
- Return result with session ID, output, usage stats
- Support `allowedTools` and `permissionMode`

**Verify**: E2E test that launches a headless session with `query({ prompt: "What is 2+2?", options: { maxTurns: 1 } })` and gets a result back

### Task 3.2: Launch streaming session
- Extend launcher to support streaming via `includePartialMessages: true`
- Emit stream events through an EventEmitter or async iterator
- Track partial messages and tool use progress

**Verify**: E2E test that launches a streaming session and receives at least one `stream_event` message before the final result

### Task 3.3: Resume and continue sessions
- Support `resume` (by session ID) and `continue` (most recent)
- Support `forkSession` for branching

**Verify**: E2E test that launches a session, captures the session ID, then resumes it with a follow-up prompt and gets a response that references the previous context

### Task 3.4: Session lifecycle management
- `src/sessions/manager.ts` - Central session manager
- Track active sessions (launched by this middleware instance)
- Support aborting/interrupting active sessions via `AbortController`
- Emit session lifecycle events (started, completed, errored, aborted)

**Verify**: E2E test that launches a session, verifies it's tracked as active, then aborts it and verifies the abort is handled

---

## Phase 4: Event System
**File**: [phases/04-event-system.md](phases/04-event-system.md)

### Task 4.1: Event bus core
- `src/hooks/event-bus.ts` - Typed EventEmitter for hook events
- Support all Claude Code hook event types (PreToolUse, PostToolUse, SessionStart, Stop, etc.)
- Type-safe event emission and subscription
- Support wildcard listeners (listen to all events)

**Verify**: Unit test that registers handlers for multiple event types, emits events, and verifies all handlers are called with correct payloads

### Task 4.2: Blocking hook stubs
- `src/hooks/blocking.ts` - Default handlers for blocking events
- PreToolUse: returns `{ behavior: "allow" }` by default
- PermissionRequest: returns `{ behavior: "allow" }` by default
- UserPromptSubmit: passes through by default
- Stop: allows stop by default
- All stubs are replaceable via `registerHandler(event, handler)`

**Verify**: Unit test that verifies default stubs return positive responses, then registers custom handlers and verifies they override the defaults

### Task 4.3: SDK hook integration
- `src/hooks/sdk-bridge.ts` - Bridge between Agent SDK hooks and event bus
- Convert Agent SDK `HookCallback` format to middleware event format
- Generate SDK `hooks` option from registered handlers
- Wire hook callbacks to event bus dispatch

**Verify**: E2E test that launches a session with hook callbacks, performs a tool use (e.g., Read), and verifies the PreToolUse and PostToolUse events fire on the event bus

### Task 4.4: HTTP hook server
- `src/hooks/server.ts` - HTTP server that receives hook events from external Claude Code sessions
- Accept POST requests matching Claude Code's HTTP hook format
- Dispatch received events to the event bus
- Return appropriate responses (allow/deny/context)

**Verify**: E2E test that starts the hook HTTP server, sends a mock PreToolUse hook payload via HTTP POST, and verifies the event bus receives it and the response is correct

---

## Phase 5: Permission Handling
**File**: [phases/05-permissions.md](phases/05-permissions.md)

### Task 5.1: Permission policy engine
- `src/permissions/policy.ts` - Define permission policies as rules
- Support allow/deny rules with glob patterns for tool names
- Support `Bash(command pattern)` syntax
- Evaluate rules in priority order

**Verify**: Unit test with various tool names and policies that verifies correct allow/deny decisions

### Task 5.2: canUseTool implementation
- `src/permissions/handler.ts` - Implements the `canUseTool` callback
- Evaluate against policy engine first
- If policy doesn't match, emit a PermissionRequest event on the event bus
- Support async external approval (e.g., from a UI)
- Return `PermissionResult` with allow/deny and optional updatedInput

**Verify**: E2E test that launches a session with a custom canUseTool, triggers a tool use, and verifies the permission flow works (policy allow, policy deny, and event-based approval)

### Task 5.3: AskUserQuestion handling
- `src/permissions/ask-user.ts` - Handle AskUserQuestion tool calls
- When canUseTool receives `AskUserQuestion`, emit an event
- Support registering answer providers (sync or async)
- Default: return a configurable default answer or deny

**Verify**: E2E test that launches a session where Claude asks a question, verifies the event fires, and that the registered answer provider's response is used

---

## Phase 6: Agent & Team Management
**File**: [phases/06-agents-teams.md](phases/06-agents-teams.md)

### Task 6.1: Agent definition reader
- `src/agents/definitions.ts` - Read agent definitions from `.claude/agents/` and `~/.claude/agents/`
- Parse markdown frontmatter (name, description, model, tools, etc.)
- Return typed `AgentDefinition` objects
- Support programmatic agent definitions via the SDK `agents` option

**Verify**: E2E test that reads agent definitions from the filesystem (create test agent files) and verifies the parsed definitions match

### Task 6.2: Agent definition registry
- `src/agents/registry.ts` - Central registry for agent definitions
- Register agents from filesystem and programmatic sources
- Look up agents by name
- List all available agents
- Expose via `supportedAgents()` from active sessions

**Verify**: Unit test that registers agents from multiple sources and verifies lookup, listing, and deduplication

### Task 6.3: Team management
- `src/agents/teams.ts` - Manage agent teams
- Read team configs from `~/.claude/teams/`
- Launch sessions with agent teams enabled (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
- Monitor team task lists from `~/.claude/tasks/`
- Expose team member status and task progress

**Verify**: E2E test that reads team config files (if any exist) and validates the parsed structure. Note: full team launching test may require manual setup due to the experimental nature.

### Task 6.4: Programmatic agent launching
- `src/agents/launcher.ts` - Launch sub-agents programmatically
- Use SDK's `agents` option to define agents at runtime
- Launch sessions with specific agent types
- Track agent sessions in the session manager

**Verify**: E2E test that defines a simple agent programmatically and launches a session using it

---

## Phase 6.5: Integration Tests (PRIORITY)
**File**: [phases/06.5-integration-tests.md](phases/06.5-integration-tests.md)

These tests wire the separately-built systems together and prove the middleware works end-to-end. Uses the local `claude` CLI (already authenticated) for tests that need the Claude Code runtime.

### Task 6.5.1: Hooks + Session integration
- Launch a session with SDK hooks registered via `createSDKHooks()`
- Verify PreToolUse and PostToolUse events fire on the event bus during real tool usage
- Verify blocking hook can deny a tool and Claude respects the denial

**Verify**: E2E test that launches `query()` with hooks, prompts Claude to read a file, and asserts both PreToolUse("Read") and PostToolUse("Read") events arrived on the bus

### Task 6.5.2: Permissions + Session integration
- Launch a session with `canUseTool` from `createCanUseTool()` connected to a real PolicyEngine
- Verify policy allow lets tools through, policy deny blocks tools
- Verify pending permission flow works with async resolution

**Verify**: E2E test with policy denying Bash but allowing Read, launches a session asking to "run echo hello and read package.json", verifies Bash was denied and Read succeeded

### Task 6.5.3: HTTP hook server + Claude CLI integration
- Start the hook HTTP server
- Run `claude -p` with `--settings` pointing to a hook config that routes to our server
- Verify the hook server receives real events from a real Claude Code session

**Verify**: E2E test that starts hook server, runs `claude -p "Read package.json" --allowedTools "Read" --settings '{"hooks":{"PostToolUse":[{"matcher":"Read","hooks":[{"type":"http","url":"http://127.0.0.1:<port>/hooks/PostToolUse"}]}]}}'` and verifies the server received the PostToolUse event

### Task 6.5.4: Session rename/tag roundtrip
- Launch a test session, capture session ID
- Rename it, tag it, verify changes persist via getSessionInfo()
- Clean up by removing the tag

**Verify**: E2E test that launches a session, renames it to "integration-test-<timestamp>", tags it "test", reads back info and asserts both fields match, then clears the tag

### Task 6.5.5: Streaming abort
- Launch a long-running streaming session
- Abort it mid-stream via SessionManager.abort()
- Verify abort event fires and session is removed from active list

**Verify**: E2E test that launches streaming session with "count from 1 to 1000", aborts after receiving first events, verifies session:aborted fires

### Task 6.5.6: Full middleware smoke test
- Create SessionManager, HookEventBus, BlockingHookRegistry, PolicyEngine, AgentRegistry, PermissionManager
- Wire them all together as the middleware server would
- Launch a session through the manager with hooks, permissions, and agent definitions active
- Verify the full event flow: session started → hooks fire → permissions evaluated → result returned

**Verify**: E2E test that creates the full middleware stack, launches a session asking "What is 2+2?", and asserts: session:started event, at least one hook event, result contains "4", session:completed event

---

## Phase 7: API Layer
**File**: [phases/07-api-layer.md](phases/07-api-layer.md)

### Task 7.1: Fastify server setup
- `src/api/server.ts` - Fastify HTTP server with CORS, error handling
- Health check endpoint (`GET /health`)
- API versioning (`/api/v1/...`)
- Request validation with Zod
- Structured error responses

**Verify**: E2E test that starts the server, hits `/health`, and gets a 200 response

### Task 7.2: Session REST endpoints
- `GET /api/v1/sessions` - List sessions (with filters)
- `GET /api/v1/sessions/:id` - Get session details
- `GET /api/v1/sessions/:id/messages` - Get session messages (paginated)
- `POST /api/v1/sessions` - Launch new headless session
- `POST /api/v1/sessions/:id/resume` - Resume a session
- `POST /api/v1/sessions/:id/abort` - Abort an active session
- `PUT /api/v1/sessions/:id` - Rename/tag a session

**Verify**: E2E test for each endpoint that hits the running API server and validates response schemas

### Task 7.3: WebSocket streaming
- `src/api/websocket.ts` - WebSocket server for real-time session streaming
- `ws://host/api/v1/sessions/:id/stream` - Stream session events
- Support subscribing to specific event types
- Broadcast session lifecycle events to connected clients
- Handle client disconnect gracefully

**Verify**: E2E test that connects via WebSocket, launches a session through the API, and receives streaming events

### Task 7.4: Hook and event endpoints
- `GET /api/v1/events/types` - List available event types
- `POST /api/v1/events/subscribe` - Register a webhook URL for events
- `GET /api/v1/events/subscriptions` - List active subscriptions
- `DELETE /api/v1/events/subscriptions/:id` - Remove a subscription

**Verify**: E2E test that subscribes a webhook, triggers an event, and verifies the webhook receives it

### Task 7.5: Agent endpoints
- `GET /api/v1/agents` - List available agent definitions
- `GET /api/v1/agents/:name` - Get agent definition details
- `POST /api/v1/agents` - Register a runtime agent definition
- `GET /api/v1/teams` - List active teams
- `GET /api/v1/teams/:name` - Get team status and tasks

**Verify**: E2E test that lists agents, creates a runtime agent, and retrieves it

### Task 7.6: Permission endpoints
- `GET /api/v1/permissions/policies` - List active policies
- `POST /api/v1/permissions/policies` - Add a permission policy
- `DELETE /api/v1/permissions/policies/:id` - Remove a policy
- `GET /api/v1/permissions/pending` - List pending permission requests
- `POST /api/v1/permissions/pending/:id/resolve` - Approve/deny a pending request

**Verify**: E2E test that creates a policy, launches a session that triggers it, and resolves a pending permission

---

## Phase 8: Plugin Integration
**File**: [phases/08-plugin.md](phases/08-plugin.md)

### Task 8.1: Plugin manifest
- `src/plugin/.claude-plugin/plugin.json` - Plugin manifest
- Define name, version, description
- Reference hooks, skills, and MCP configuration

**Verify**: Validate plugin.json against expected schema, verify `claude --plugin-dir src/plugin` loads without error

### Task 8.2: Plugin hooks configuration
- `src/plugin/hooks/hooks.json` - Hook configurations
- Register HTTP hooks pointing to the middleware's hook server
- Cover key events: PreToolUse, PostToolUse, SessionStart, SessionEnd, Stop
- Use `${CLAUDE_PLUGIN_ROOT}` for script paths

**Verify**: E2E test that loads the plugin, triggers a hook event, and verifies the middleware receives it

### Task 8.3: Plugin skill
- `src/plugin/skills/cc-middleware/SKILL.md` - Skill for interacting with middleware
- Expose commands like `/cc-status`, `/cc-sessions`, `/cc-agents`
- Use `$ARGUMENTS` for input

**Verify**: Validate SKILL.md frontmatter, verify it's discoverable when plugin is loaded

### Task 8.4: Plugin MCP server (optional)
- Expose middleware API as an MCP server
- Define tools for session management, event subscription
- Use `createSdkMcpServer()` from the Agent SDK

**Verify**: E2E test that connects to the MCP server and calls a tool

---

## Phase 9: Search & Indexing
**File**: [phases/09-search-index.md](phases/09-search-index.md)

### Task 9.1: SQLite session store
- `src/store/db.ts` - SQLite database setup with better-sqlite3
- Schema: sessions table (id, project, cwd, summary, created_at, last_modified, first_prompt, git_branch, tags, status)
- Schema: messages table (id, session_id, role, content_preview, timestamp)
- Migrations support

**Verify**: Unit test that creates the database, runs migrations, inserts test data, and queries it

### Task 9.2: Session indexer
- `src/store/indexer.ts` - Index sessions from the Agent SDK into SQLite
- Full scan: index all existing sessions
- Incremental: only index new/modified sessions
- Extract searchable content from messages
- Run on startup and periodically

**Verify**: E2E test that runs the indexer against real sessions and verifies the database contains correct data

### Task 9.3: Full-text search
- `src/store/search.ts` - SQLite FTS5 full-text search
- Search sessions by prompt content, summary, tags
- Filter by project, date range, status
- Return ranked results

**Verify**: E2E test that indexes sessions, performs searches with various queries, and validates result relevance

### Task 9.4: Search API endpoints
- `GET /api/v1/search?q=...` - Search sessions
- Support filters: project, dateFrom, dateTo, tags, status
- Return paginated results with highlights

**Verify**: E2E test that hits the search endpoint and validates response

---

## Phase 10: Configuration Management
**File**: [phases/10-configuration.md](phases/10-configuration.md)
**Research**: [docs/research/](../../research/README.md)

### Task 10.1: Settings reader
- `src/config/settings.ts` - Read settings from all scopes (managed, user, project, local)
- Merge with correct precedence (managed > local > project > user)
- Array merging for permissions (concatenate and deduplicate)
- Track provenance (which scope each key came from)

**Verify**: E2E test that reads real machine settings and verifies correct merging

### Task 10.2: Settings writer
- `src/config/settings-writer.ts` - Atomic writes to settings files
- Support set/append/remove operations
- Permission rule add/remove helpers
- Never write to managed scope

**Verify**: E2E test that adds a permission rule, reads it back, then removes it

### Task 10.3: Plugin reader and management
- `src/config/plugins.ts` - Parse installed_plugins.json, read enabledPlugins from settings
- Enable/disable via settings.json edit
- Install/uninstall via `claude plugin` CLI shell-out

**Verify**: E2E test that lists installed plugins and verifies enable/disable

### Task 10.4: Skills, agents, and rules reader
- `src/config/components.ts` - Discover skills, agents, rules, CLAUDE.md from all locations
- Parse YAML frontmatter with gray-matter
- Create/update/delete agent and skill files

**Verify**: E2E test that creates a test agent file, discovers it, then deletes it

### Task 10.5: MCP server reader
- `src/config/mcp.ts` - Parse MCP configs from ~/.claude.json and .mcp.json
- Add/remove servers via `claude mcp` CLI
- Report transport types, enabled state, scope

**Verify**: E2E test that lists MCP servers and compares with `claude mcp list`

### Task 10.6: Memory reader
- `src/config/memory.ts` - Read auto-memory per project
- Parse MEMORY.md index and memory files (frontmatter)
- List all project memory directories

**Verify**: E2E test that reads current project memory

### Task 10.7: Configuration API endpoints
- All endpoints under `/api/v1/config/`
- Settings, plugins, skills, agents, rules, MCP, memory, CLAUDE.md
- Read endpoints for all; write endpoints for settings, plugins, agents, MCP

**Verify**: E2E test for each major endpoint group

---

## Completion Criteria

The middleware is considered complete when:
1. All 10 phases pass verification
2. All E2E tests pass in a clean run (`npm run test:e2e`)
3. API documentation in `docs/api/` is current
4. Architecture documentation in `docs/architecture/` is current
5. The plugin loads successfully in Claude Code
6. The middleware can be started as a standalone server
7. Configuration reading covers all Claude Code config systems
