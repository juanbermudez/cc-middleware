# CC-Middleware API Reference

Base URL: `http://127.0.0.1:3000`

The current API surface is assembled in [../../src/api/server.ts](../../src/api/server.ts) and is the source of truth for route registration order and availability.

## Health & Status

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Basic process health check with version and uptime |
| GET | `/api/v1/status` | Middleware status summary: active sessions, registered agents, hook counts, pending permissions/questions, policy rules, and `dispatchSummary` when the dispatch store is configured |

## Sessions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/sessions` | List sessions from Claude discovery, merged with indexed lineage and metadata where available |
| GET | `/api/v1/sessions/directories` | Group sessions by exact working directory for explorer-style UIs |
| GET | `/api/v1/sessions/:id` | Get normalized session info for one session |
| GET | `/api/v1/sessions/:id/messages` | Get paginated raw session messages |
| GET | `/api/v1/sessions/:id/detail` | Get the source-of-truth session detail projection built from transcript files |
| POST | `/api/v1/sessions` | Launch a new middleware-owned session |
| POST | `/api/v1/sessions/:id/resume` | Resume an existing session with a follow-up prompt |
| POST | `/api/v1/sessions/:id/abort` | Abort an active middleware-owned session |
| PUT | `/api/v1/sessions/:id` | Rename or retag a session |

### Session Metadata

These routes depend on the SQLite session store.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/sessions/metadata/definitions` | List searchable/filterable session metadata definitions |
| POST | `/api/v1/sessions/metadata/definitions` | Create or update a session metadata definition |
| DELETE | `/api/v1/sessions/metadata/definitions/:key` | Remove a session metadata definition and its values |
| GET | `/api/v1/sessions/:id/metadata` | List metadata values attached to one session |
| PUT | `/api/v1/sessions/:id/metadata` | Set or replace a metadata value on one session |
| DELETE | `/api/v1/sessions/:id/metadata/:key` | Remove one metadata value from a session |

## Dispatch

These routes are backed by the durable dispatch queue documented in [../architecture/dispatch-system.md](../architecture/dispatch-system.md).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/dispatch/status` | Queue/store summary, including queued/running/completed/failed counts |
| GET | `/api/v1/dispatch/jobs` | List dispatch jobs with filters for status, source type, target type, and runtime profile |
| POST | `/api/v1/dispatch/jobs` | Enqueue a manual dispatch job |
| GET | `/api/v1/dispatch/jobs/:id` | Get one dispatch job and its runs |
| POST | `/api/v1/dispatch/jobs/:id/retry` | Requeue a failed or cancelled job |
| POST | `/api/v1/dispatch/jobs/:id/cancel` | Cancel a queued or running job |
| GET | `/api/v1/dispatch/cues` | List hook-triggered cue rules |
| POST | `/api/v1/dispatch/cues` | Create or update a cue rule |
| DELETE | `/api/v1/dispatch/cues/:id` | Remove a cue rule |
| GET | `/api/v1/dispatch/schedules` | List cron schedules |
| POST | `/api/v1/dispatch/schedules` | Create or update a cron schedule |
| DELETE | `/api/v1/dispatch/schedules/:id` | Remove a cron schedule |
| GET | `/api/v1/dispatch/heartbeat-rules` | List heartbeat-triggered rules |
| POST | `/api/v1/dispatch/heartbeat-rules` | Create or update a heartbeat rule |
| DELETE | `/api/v1/dispatch/heartbeat-rules/:id` | Remove a heartbeat rule |

### Dispatch Notes

- `targetType` supports `new_session`, `resume_session`, `continue_session`, `fork_session`, and `agent`.
- `resume_session` and `fork_session` require `sessionId`.
- `runtimeProfile` distinguishes Claude-runtime launches (`claude_runtime`) from more isolated SDK-only launches (`isolated_sdk`).
- Cue rules materialize jobs from hook events. Schedules and heartbeat rules materialize the same job type, so everything flows through one queue/executor path.

## Events

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/events/types` | List supported hook event types |
| POST | `/api/v1/events/subscribe` | Register a webhook subscription |
| GET | `/api/v1/events/subscriptions` | List webhook subscriptions |
| DELETE | `/api/v1/events/subscriptions/:id` | Remove a webhook subscription |

## Agents & Teams

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/agents` | List runtime and file-backed agents |
| GET | `/api/v1/agents/:name` | Get agent details |
| POST | `/api/v1/agents` | Register a runtime agent |
| DELETE | `/api/v1/agents/:name` | Remove a runtime agent |
| GET | `/api/v1/teams` | List discovered teams |
| GET | `/api/v1/teams/:name` | Get one team definition |
| GET | `/api/v1/teams/:name/tasks` | List task files for one team |

## Permissions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/permissions/policies` | List current permission policy rules |
| POST | `/api/v1/permissions/policies` | Add a policy rule |
| DELETE | `/api/v1/permissions/policies/:id` | Remove a policy rule |
| GET | `/api/v1/permissions/pending` | List pending permission requests |
| POST | `/api/v1/permissions/pending/:id/resolve` | Resolve one pending permission request |
| GET | `/api/v1/permissions/questions` | List pending AskUserQuestion prompts |
| POST | `/api/v1/permissions/questions/:id/answer` | Answer one pending AskUserQuestion prompt |

## Search

These routes depend on the SQLite session store and indexer.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/search` | Search indexed sessions with text, lineage, team, and metadata filters |
| POST | `/api/v1/search/reindex` | Trigger a full reindex / backfill of the search catalog |
| GET | `/api/v1/search/stats` | Get search/index statistics |

## Sync

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/sync/status` | Get watcher and auto-indexer status for real-time sync |

## Analytics

These routes are backed by the DuckDB analytics system documented in [../architecture/analytics-system.md](../architecture/analytics-system.md) and [../plan/phases/13-analytics-observability.md](../plan/phases/13-analytics-observability.md).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/analytics/status` | Get analytics warehouse and backfill status |
| GET | `/api/v1/analytics/overview` | High-level totals and summary metrics |
| GET | `/api/v1/analytics/timeseries` | Time-series metrics for tokens, cost, errors, and keywords |
| GET | `/api/v1/analytics/facets` | Get available models, tools, categories, and other facet values |
| GET | `/api/v1/analytics/tool-performance` | Tool performance slice with counts, latency, and failures |
| GET | `/api/v1/analytics/tool-performance/:name` | Drill into one tool’s detailed performance slice |
| GET | `/api/v1/analytics/traces` | Search and filter synthetic interaction traces |
| GET | `/api/v1/analytics/traces/:id` | Get one trace / interaction with drilldown data |
| GET | `/api/v1/analytics/sessions/:id` | Get analytics detail for one session |
| POST | `/api/v1/analytics/backfill` | Trigger transcript backfill and optional telemetry enrichment |

### Analytics Backfill Notes

`POST /api/v1/analytics/backfill` accepts a transcript-first request body:

```json
{
  "projectsRoot": "/custom/projects/root",
  "projectKey": "optional-project-key",
  "rootSessionId": "optional-session-id",
  "includeOtel": true,
  "otelRoot": "/custom/telemetry/root",
  "includeSensitiveOtelPayload": false
}
```

Semantics:

- Transcript import is the primary backfill path.
- `includeOtel` is optional and defaults to `false`.
- `otelRoot` defaults to `~/.claude/telemetry` when OTel enrichment is enabled.
- `includeSensitiveOtelPayload` defaults to `false`, so nested prompt/tool fields are redacted before telemetry payloads are stored.

## Resource Metadata

Resource metadata is a generalized metadata registry/value layer that sits alongside session metadata and is backed by the same SQLite store.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/metadata/definitions/:resourceType` | List metadata definitions for a resource type |
| POST | `/api/v1/metadata/definitions/:resourceType` | Create or update a metadata definition for a resource type |
| DELETE | `/api/v1/metadata/definitions/:resourceType/:key` | Remove one metadata definition |
| GET | `/api/v1/metadata/values/:resourceType` | List metadata values across a resource type, optionally filtered by `resourceId` |
| GET | `/api/v1/metadata/values/:resourceType/:resourceId` | List metadata values for one resource instance |
| PUT | `/api/v1/metadata/values/:resourceType/:resourceId` | Set or replace one metadata value |
| DELETE | `/api/v1/metadata/values/:resourceType/:resourceId/:key` | Remove one metadata value |

## Configuration

### Settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/config/global` | Get sanitized `~/.claude.json` summary |
| PUT | `/api/v1/config/global/preferences/:key` | Update one documented `~/.claude.json` global preference |
| GET | `/api/v1/config/projects` | List tracked projects from `~/.claude.json` |
| GET | `/api/v1/config/projects/current` | Get the current project’s tracked Claude state |
| GET | `/api/v1/config/projects/lookup?path=...` | Look up one tracked project by absolute path |
| GET | `/api/v1/config/settings` | Get merged effective settings |
| GET | `/api/v1/config/settings/:scope` | Get settings for one scope (`user`, `project`, `local`, `managed`) |
| PUT | `/api/v1/config/settings/:scope` | Update one setting value |
| POST | `/api/v1/config/settings/:scope/permissions` | Add a permission rule to one settings scope |
| DELETE | `/api/v1/config/settings/:scope/permissions` | Remove a permission rule from one settings scope |

### Plugins & Marketplaces

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/config/plugins` | List all plugins |
| GET | `/api/v1/config/plugins/available` | List installable plugins from Claude’s resolved marketplace catalog |
| GET | `/api/v1/config/plugins/:name` | Get plugin details |
| GET | `/api/v1/config/plugins/:name/provenance` | Explain installed, enabled, marketplace/catalog, and runtime-loaded state for one plugin |
| POST | `/api/v1/config/plugins/install` | Install a plugin via the Claude CLI |
| POST | `/api/v1/config/plugins/:name/enable` | Enable a plugin |
| POST | `/api/v1/config/plugins/:name/disable` | Disable a plugin |
| POST | `/api/v1/config/plugins/:name/update` | Update a plugin via the Claude CLI |
| POST | `/api/v1/config/plugins/:name/uninstall` | Uninstall a plugin via the Claude CLI |
| GET | `/api/v1/config/marketplaces` | List configured plugin marketplaces |
| POST | `/api/v1/config/marketplaces` | Add a marketplace via the Claude CLI |
| POST | `/api/v1/config/marketplaces/update` | Update one or all marketplaces via the Claude CLI |
| GET | `/api/v1/config/marketplaces/:name/plugins` | List available plugins from one marketplace |
| DELETE | `/api/v1/config/marketplaces/:name` | Remove a marketplace via the Claude CLI |

### Skills, Agents, Rules

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/config/skills` | List installed skills |
| GET | `/api/v1/config/commands` | List legacy slash commands |
| GET | `/api/v1/config/agents` | List file-backed agent definitions |
| POST | `/api/v1/config/agents` | Create an agent definition file |
| PUT | `/api/v1/config/agents/:name` | Update an agent definition |
| DELETE | `/api/v1/config/agents/:name` | Delete an agent definition |
| GET | `/api/v1/config/rules` | List discovered rule files |

### MCP & Runtime Inventory

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/config/mcp` | List configured MCP servers |
| POST | `/api/v1/config/mcp` | Add an MCP server via the Claude CLI |
| DELETE | `/api/v1/config/mcp/:name` | Remove an MCP server via the Claude CLI |
| GET | `/api/v1/config/runtime` | Inspect effective Claude runtime inventory from the Agent SDK |
| GET | `/api/v1/config/runtime/tools` | Search runtime tools |
| GET | `/api/v1/config/runtime/commands` | Search structured runtime commands plus slash command inventory |
| GET | `/api/v1/config/runtime/skills` | Search runtime-loaded skills |
| GET | `/api/v1/config/runtime/plugins` | Search runtime-loaded plugins |
| GET | `/api/v1/config/runtime/mcp` | Search runtime MCP server status |
| GET | `/api/v1/config/runtime/agents` | Search runtime agent details and names |
| GET | `/api/v1/config/runtime/models` | Search the runtime model catalog and output-style support |

### Memory & `CLAUDE.md`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/config/memory` | Get the current project memory index |
| GET | `/api/v1/config/memory/files` | List current project memory files |
| GET | `/api/v1/config/memory/files/:name` | Read one memory file |
| GET | `/api/v1/config/memory/projects` | List discovered project memory directories |
| GET | `/api/v1/config/claude-md` | List all discovered `CLAUDE.md` files |
| PUT | `/api/v1/config/claude-md/:scope` | Update a `CLAUDE.md` file for one scope |

## Session Launch/Resume: `model` Field

Both `POST /api/v1/sessions` and `POST /api/v1/sessions/:id/resume` accept an optional `model` field to request a specific Claude model:

```json
{
  "prompt": "Your task",
  "model": "claude-sonnet-4-20250514"
}
```

Additional launch options supported by the middleware include `model`, `fallbackModel`, `mcpServers`, `plugins`, `settingSources`, `thinking`, `outputFormat`, `sandbox`, `tools`, `toolConfig`, `additionalDirectories`, `debug`, `debugFile`, `promptSuggestions`, and `allowDangerouslySkipPermissions`.

## WebSocket

Connect to: `ws://127.0.0.1:3000/api/v1/ws`

### Client Messages

```json
{ "type": "subscribe", "events": ["session:*", "hook:PreToolUse", "dispatch:*"] }
{ "type": "unsubscribe", "events": ["hook:PreToolUse"] }
{ "type": "launch", "options": { "prompt": "...", "allowedTools": ["Read"] } }
{ "type": "resume", "sessionId": "...", "prompt": "..." }
```

### Server Messages

#### Session Lifecycle Events

```json
{ "type": "session:started", "sessionId": "...", "timestamp": 0 }
{ "type": "session:stream", "sessionId": "...", "event": { "type": "text_delta", "text": "..." } }
{ "type": "session:completed", "sessionId": "...", "result": { ... } }
{ "type": "session:errored", "sessionId": "...", "error": "..." }
{ "type": "session:aborted", "sessionId": "..." }
```

#### Real-Time Sync Events

```json
{ "type": "session:discovered", "sessionId": "...", "timestamp": 0 }
{ "type": "session:updated", "sessionId": "...", "timestamp": 0 }
{ "type": "session:removed", "sessionId": "...", "timestamp": 0 }
{ "type": "config:changed", "scope": "user", "path": "...", "timestamp": 0 }
{ "type": "config:mcp-changed", "path": "...", "timestamp": 0 }
{ "type": "config:agent-changed", "name": "...", "action": "created", "timestamp": 0 }
{ "type": "config:skill-changed", "name": "...", "action": "modified", "timestamp": 0 }
{ "type": "config:rule-changed", "name": "...", "action": "removed", "timestamp": 0 }
{ "type": "config:plugin-changed", "path": "...", "timestamp": 0 }
{ "type": "config:memory-changed", "path": "...", "timestamp": 0 }
{ "type": "team:created", "teamName": "...", "timestamp": 0 }
{ "type": "team:updated", "teamName": "...", "timestamp": 0 }
{ "type": "team:task-updated", "path": "...", "timestamp": 0 }
```

#### Dispatch Events

```json
{ "type": "dispatch:job-created", "job": { ... } }
{ "type": "dispatch:job-started", "job": { ... } }
{ "type": "dispatch:job-completed", "job": { ... } }
{ "type": "dispatch:job-failed", "job": { ... }, "error": "..." }
{ "type": "dispatch:cue-triggered", "cueId": "...", "jobId": "...", "eventType": "PreToolUse" }
{ "type": "dispatch:heartbeat", "ruleId": "...", "jobId": "..." }
```

#### Hook & Permission Events

```json
{ "type": "hook:event", "eventType": "PreToolUse", "input": { ... } }
{ "type": "permission:pending", "permission": { "id": "...", "toolName": "..." } }
{ "type": "question:pending", "question": { "id": "...", "questions": [...] } }
```

---

This reference was refreshed against the local commits ahead of `origin/main` (`df628ab`, `21fb8bd`) and the currently registered Fastify route surface.
