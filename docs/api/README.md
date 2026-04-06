# CC-Middleware API Reference

Base URL: `http://127.0.0.1:3000`

## Health & Status

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/status` | Middleware status |

## Sessions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/sessions` | List sessions |
| GET | `/api/v1/sessions/:id` | Get session details |
| GET | `/api/v1/sessions/:id/messages` | Get messages (paginated) |
| POST | `/api/v1/sessions` | Launch new session |
| POST | `/api/v1/sessions/:id/resume` | Resume session |
| POST | `/api/v1/sessions/:id/abort` | Abort active session |
| PUT | `/api/v1/sessions/:id` | Update session (rename/tag) |

## Events

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/events/types` | List event types |
| POST | `/api/v1/events/subscribe` | Register webhook |
| GET | `/api/v1/events/subscriptions` | List subscriptions |
| DELETE | `/api/v1/events/subscriptions/:id` | Remove subscription |

## Agents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/agents` | List agents |
| GET | `/api/v1/agents/:name` | Get agent details |
| POST | `/api/v1/agents` | Register runtime agent |
| DELETE | `/api/v1/agents/:name` | Remove runtime agent |

## Teams

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/teams` | List teams |
| GET | `/api/v1/teams/:name` | Get team details |
| GET | `/api/v1/teams/:name/tasks` | Get team tasks |

## Permissions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/permissions/policies` | List policies |
| POST | `/api/v1/permissions/policies` | Add policy rule |
| DELETE | `/api/v1/permissions/policies/:id` | Remove rule |
| GET | `/api/v1/permissions/pending` | Pending requests |
| POST | `/api/v1/permissions/pending/:id/resolve` | Resolve request |
| GET | `/api/v1/permissions/questions` | Pending questions |
| POST | `/api/v1/permissions/questions/:id/answer` | Answer question |

## Search

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/search` | Search sessions |
| POST | `/api/v1/search/reindex` | Trigger reindex |
| GET | `/api/v1/search/stats` | Index statistics |

## Sync

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/sync/status` | Get real-time sync watcher status (session watcher, config watcher, auto-indexer) |

## Configuration

### Settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/config/settings` | Get merged effective settings |
| GET | `/api/v1/config/settings/:scope` | Get settings for scope (user/project/local/managed) |
| PUT | `/api/v1/config/settings/:scope` | Update a setting value |
| POST | `/api/v1/config/settings/:scope/permissions` | Add a permission rule |
| DELETE | `/api/v1/config/settings/:scope/permissions` | Remove a permission rule |

### Plugins

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/config/plugins` | List all plugins |
| GET | `/api/v1/config/plugins/:name` | Get plugin details |
| POST | `/api/v1/config/plugins/:name/enable` | Enable a plugin |
| POST | `/api/v1/config/plugins/:name/disable` | Disable a plugin |
| POST | `/api/v1/config/plugins/install` | Install plugin (via CLI) |
| POST | `/api/v1/config/plugins/:name/uninstall` | Uninstall plugin (via CLI) |

### Skills, Agents, Rules

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/config/skills` | List all skills |
| GET | `/api/v1/config/agents` | List file-based agent definitions |
| POST | `/api/v1/config/agents` | Create agent definition file |
| PUT | `/api/v1/config/agents/:name` | Update agent definition |
| DELETE | `/api/v1/config/agents/:name` | Delete agent definition |
| GET | `/api/v1/config/rules` | List all rules |

### MCP Servers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/config/mcp` | List all MCP servers |
| POST | `/api/v1/config/mcp` | Add MCP server (via CLI) |
| DELETE | `/api/v1/config/mcp/:name` | Remove MCP server (via CLI) |

### Memory & CLAUDE.md

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/config/memory` | Get project memory index |
| GET | `/api/v1/config/memory/files` | List memory files |
| GET | `/api/v1/config/memory/files/:name` | Read a memory file |
| GET | `/api/v1/config/claude-md` | List all CLAUDE.md files |
| PUT | `/api/v1/config/claude-md/:scope` | Update CLAUDE.md for scope |

## Session Launch/Resume: `model` Field

Both `POST /api/v1/sessions` (launch) and `POST /api/v1/sessions/:id/resume` accept an optional `model` field in the request body to specify which Claude model to use:

```json
{
  "prompt": "Your task",
  "model": "claude-sonnet-4-20250514"
}
```

Additional launch options now supported: `model`, `fallbackModel`, `mcpServers`, `plugins`, `settingSources`, `thinking`, `outputFormat`, `sandbox`, `tools`, `toolConfig`, `additionalDirectories`, `debug`, `debugFile`, `promptSuggestions`, `allowDangerouslySkipPermissions`.

## WebSocket

Connect to: `ws://127.0.0.1:3000/api/v1/ws`

### Client Messages
```json
{ "type": "subscribe", "events": ["session:*", "hook:PreToolUse"] }
{ "type": "unsubscribe", "events": ["hook:PreToolUse"] }
{ "type": "launch", "options": { "prompt": "...", "allowedTools": [...] } }
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

#### Real-Time Sync Events (from file watchers)
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

#### Hook & Permission Events
```json
{ "type": "hook:event", "eventType": "PreToolUse", "input": { ... } }
{ "type": "permission:pending", "permission": { "id": "...", "toolName": "..." } }
{ "type": "question:pending", "question": { "id": "...", "questions": [...] } }
```

---

*This document is updated as the API is implemented. See phase docs for planned but not-yet-implemented endpoints.*
