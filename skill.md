---
name: cc-middleware
description: Node/TypeScript middleware for managing and observing Claude Code sessions
license: MIT
compatibility: Node.js 20+, Claude Code 2.1+
metadata:
  author: cc-middleware
  version: "0.1.0"
---

# CC-Middleware

CC-Middleware provides a central API layer over Claude Code for session management, hook events, permissions, agent orchestration, search, and configuration management.

## Capabilities

### Session Management
- List and search past Claude Code sessions across all projects
- Launch headless sessions programmatically (single-turn and streaming)
- Resume, continue, and fork existing sessions
- Read session messages with pagination
- Rename and tag sessions for organization
- Abort active sessions
- Full-text search across session content via SQLite FTS5

### Hook Event System
- Type-safe event bus covering all 27 Claude Code lifecycle events
- Blocking hook stubs with replaceable handlers (default: allow)
- SDK bridge for programmatic sessions (TypeScript callbacks)
- HTTP hook server for plugin-based sessions
- WebSocket streaming of events to connected clients
- Webhook subscriptions for external integrations

### Permission Control
- Policy engine with allow/deny/ask rules and glob patterns
- Bash command pattern matching (e.g., `Bash(git *)`)
- Programmatic canUseTool implementation for the Agent SDK
- AskUserQuestion handling with registered answer providers
- Pending permission queue for async external approval (UI/API)

### Agent & Team Management
- Read agent definitions from filesystem (YAML frontmatter markdown)
- Central registry merging filesystem and runtime agents
- Launch sessions with programmatic agent definitions
- Monitor agent team configs and task lists

### Configuration Management
- Read Claude Code settings from all scopes (managed, user, project, local)
- Merge settings with correct precedence
- Manage permission rules, plugins, MCP servers
- Discover skills, agents, rules, CLAUDE.md files
- Read auto-memory per project

### Real-Time Sync
- Session file watcher monitors `~/.claude/projects/` for new/modified/removed sessions (chokidar + polling fallback)
- Config watcher monitors settings, MCP configs, agents, skills, rules, plugins, memory, and teams for changes
- Auto-indexer keeps the SQLite search index up to date as sessions change on disk
- All changes are pushed to WebSocket clients in real-time (11 new event types)
- Configurable via env vars: `CC_MIDDLEWARE_WATCH_SESSIONS`, `CC_MIDDLEWARE_WATCH_CONFIG`, `CC_MIDDLEWARE_AUTO_INDEX`, `CC_MIDDLEWARE_POLL_INTERVAL`, `CC_MIDDLEWARE_DEBOUNCE_MS`

### API & CLI
- REST API with 60+ endpoints (Fastify)
- WebSocket for real-time session streaming and event subscription
- CLI (`ccm`) with 30+ commands covering all functionality
- Installable as a Claude Code plugin

## Skills

### launch-session
Launch a headless Claude Code session with a prompt.
```
POST /api/v1/sessions
{"prompt": "Your task", "allowedTools": ["Read", "Edit"], "maxTurns": 5}
```
CLI: `ccm sessions launch "Your task" --tools Read,Edit --max-turns 5`

### list-sessions
List recent Claude Code sessions.
```
GET /api/v1/sessions?limit=20&project=/path/to/project
```
CLI: `ccm sessions list --limit 20`

### search-sessions
Search sessions by content using full-text search.
```
GET /api/v1/search?q=authentication&limit=10
```
CLI: `ccm sessions search "authentication"`

### stream-events
Subscribe to real-time hook events via WebSocket.
```
ws://127.0.0.1:3000/api/v1/ws
{"type": "subscribe", "events": ["hook:PreToolUse", "session:*"]}
```
CLI: `ccm hooks listen`

### manage-permissions
Add permission policies to control tool access.
```
POST /api/v1/permissions/policies
{"toolName": "Bash", "behavior": "deny", "condition": "Bash(rm *)"}
```
CLI: `ccm permissions add --tool "Bash" --behavior deny --condition "Bash(rm *)"`

### read-config
Read merged Claude Code configuration.
```
GET /api/v1/config/settings
```
CLI: `ccm config show`

### sync-status
Check the status of real-time sync watchers.
```
GET /api/v1/sync/status
```
CLI: `ccm sync status`

### realtime-monitoring
Subscribe to file system changes in real-time via WebSocket.
```
ws://127.0.0.1:3000/api/v1/ws
{"type": "subscribe", "events": ["session:*", "config:*", "team:*"]}
```

## Workflows

### Monitor Active Sessions
1. Start middleware: `ccm server start` (watchers start automatically)
2. Open event stream: `ccm hooks listen`
3. Watch session activity in real-time
4. Check sync status: `ccm sync status`

### Automated Session Control
1. Launch session via API with custom permissions
2. Register hook handlers for tool approval
3. Monitor progress via WebSocket streaming
4. Abort if needed via API

### Configuration Audit
1. Read effective settings: `ccm config show`
2. List plugins: `ccm config plugins`
3. List MCP servers: `ccm config mcp`
4. Review permission policies: `ccm permissions list`

## Integration

### As a Library
```typescript
import { SessionManager, HookEventBus, createMiddlewareServer } from 'cc-middleware';
```

### As a Standalone Server
```bash
npm start  # Starts API on :3000, hook server on :3001
```

### As a Claude Code Plugin
```bash
claude --plugin-dir /path/to/cc-middleware/src/plugin
```

### Via CLI
```bash
npx cc-middleware  # or: ccm server start
```

## Context

CC-Middleware is built on the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) and provides a clean abstraction layer that future control surfaces (CLI, web UI, IDE extensions) can build on. It supports two integration modes: SDK mode (TypeScript callbacks, lowest latency) and Plugin mode (HTTP hooks, works with existing interactive Claude Code sessions).
