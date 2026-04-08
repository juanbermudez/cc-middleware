# CC-Middleware

**A service layer for Claude Code.** CC-Middleware wraps the `@anthropic-ai/claude-agent-sdk` in a production-ready API so any application — web dashboard, CI pipeline, IDE extension, or custom agent orchestrator — can launch, observe, and control Claude Code sessions over HTTP and WebSocket without touching the SDK directly.

`v0.1.0` · early alpha · Node.js 20+ · TypeScript

---

## The Idea

Claude Code exposes a powerful hook system and programmatic SDK, but consuming them directly requires deep knowledge of the filesystem layout, hook lifecycle, and SDK internals. CC-Middleware absorbs that complexity and re-exposes it as a clean, documented, transport-agnostic API.

The result is a local service that any client — regardless of language or platform — can talk to:

```
Your App  ──REST/WS──▶  CC-Middleware  ──Agent SDK──▶  Claude Code
```

The middleware handles session lifecycle, event routing, permission approvals, agent/team metadata, full-text search over session history, and real-time filesystem sync. You write application logic; the middleware handles the Claude plumbing.

---

## What You Can Build

- **Session management UIs** — list, filter, search, replay, and resume Claude sessions from any frontend
- **Hook-driven automations** — react to `PreToolUse`, `PostToolUse`, `SessionStart`, and other lifecycle events without modifying Claude's config
- **Approval workflows** — intercept and resolve permission requests programmatically or present them to a human via a custom UI
- **Agent orchestration** — read agent and team definitions from the filesystem and launch coordinated multi-agent workflows via REST
- **Real-time dashboards** — subscribe to WebSocket sync events and render live session state, config changes, and team activity
- **Plugin-backed observability** — install the bundled Claude Code plugin and get hook introspection directly inside Claude sessions

---

## Features

| Area | What's included |
|---|---|
| **Sessions** | Discover, launch, resume, fork, abort, stream, search |
| **Hooks** | HTTP hook server, typed event bus, blocking hook stubs for `PreToolUse` / `PostToolUse` / `Stop` |
| **Permissions** | Policy engine, `canUseTool` handler, `AskUserQuestion` manager, pending request queue |
| **Agents & Teams** | Filesystem-based agent definition registry, team launcher and monitor |
| **Store** | SQLite-backed session index with full-text search across messages |
| **Sync** | File watchers for sessions, config, agents, skills, rules, plugins, memory and teams — push to WebSocket clients |
| **Config** | Read/write Claude settings, MCP servers, plugins, memory, components |
| **API** | Fastify REST + WebSocket on `:3000`, hook server on `:3001` |
| **CLI** | `ccm` command with sub-commands for every surface area |
| **Plugin** | Installable Claude Code plugin with MCP server and hook manifest |
| **Playground** | shadcn/Tailwind dashboard for local exploration and API demos |
| **Docs** | Mintlify docs site with OpenAPI + AsyncAPI specs |

---

## Quick Start

```bash
git clone git@github.com:juanbermudez/cc-middleware.git
cd cc-middleware
npm install
npm run build
npm start
```

Default ports:

| Service | Address |
|---|---|
| API + WebSocket | `http://127.0.0.1:3000` |
| Hook server | `http://127.0.0.1:3001` |
| Playground UI | `http://127.0.0.1:4173` (run `npm run playground:dev`) |

Verify the API is up:

```bash
curl http://127.0.0.1:3000/health
# { "status": "ok", "version": "0.1.0", "uptime": 3 }
```

---

## REST API

All endpoints are prefixed `/api/v1/`. Requests and responses are validated with Zod. Errors follow a consistent shape: `{ error: { code, message, details? } }`.

### Sessions

```
GET    /api/v1/sessions                    List / filter discovered sessions
GET    /api/v1/sessions/:id                Get session info
GET    /api/v1/sessions/:id/messages       Read session messages
POST   /api/v1/sessions                    Launch a new session
POST   /api/v1/sessions/:id/resume         Resume a past session
DELETE /api/v1/sessions/:id                Abort a running session
PATCH  /api/v1/sessions/:id                Update title / tag
```

Launch a headless session:

```bash
curl -X POST http://127.0.0.1:3000/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Summarise the last 5 git commits in this repo",
    "permissionMode": "acceptEdits",
    "maxTurns": 5
  }'
```

### Search

```
GET  /api/v1/search?q=:query              Full-text search across indexed sessions
POST /api/v1/search/index                 Trigger incremental or full reindex
GET  /api/v1/search/stats                 Index statistics
```

### Agents & Teams

```
GET  /api/v1/agents                       List discovered agent definitions
GET  /api/v1/agents/:name                 Get a single agent definition
GET  /api/v1/teams                        List team configurations
GET  /api/v1/teams/:name                  Get team details and member status
```

### Permissions

```
GET    /api/v1/permissions                List pending permission requests
POST   /api/v1/permissions/:id/approve    Approve a pending tool-use request
POST   /api/v1/permissions/:id/deny       Deny a pending tool-use request
GET    /api/v1/permissions/policy         Get current permission policy
PUT    /api/v1/permissions/policy         Update permission policy rules
GET    /api/v1/questions                  List pending AskUserQuestion requests
POST   /api/v1/questions/:id/answer       Respond to a pending question
```

### Configuration

```
GET   /api/v1/config/settings             Read merged effective settings
PUT   /api/v1/config/settings             Update settings
GET   /api/v1/config/plugins              List installed plugins
POST  /api/v1/config/plugins/:id/enable   Enable a plugin
POST  /api/v1/config/plugins/:id/disable  Disable a plugin
GET   /api/v1/config/mcp                  List MCP servers
GET   /api/v1/config/memory               List project memory files
GET   /api/v1/config/runtime              Inspect live Claude runtime inventory
```

### Status

```
GET  /health                  Health check
GET  /api/v1/status           Active sessions, agents, hooks, pending permissions
GET  /api/v1/sync/status      Watcher and auto-indexer state
```

---

## WebSocket Events

Connect to `ws://127.0.0.1:3000/api/v1/events` to receive real-time push events.

### Session sync

| Event | Payload |
|---|---|
| `session:discovered` | `{ sessionId, timestamp }` |
| `session:updated` | `{ sessionId, timestamp }` |
| `session:removed` | `{ sessionId, timestamp }` |

### Config sync

| Event | Payload |
|---|---|
| `config:changed` | `{ scope, path, timestamp }` |
| `config:mcp-changed` | `{ path, timestamp }` |
| `config:agent-changed` | `{ name, action, timestamp }` |
| `config:skill-changed` | `{ name, action, timestamp }` |
| `config:plugin-changed` | `{ path, timestamp }` |
| `config:memory-changed` | `{ path, timestamp }` |

### Team sync

| Event | Payload |
|---|---|
| `team:created` | `{ teamName, timestamp }` |
| `team:updated` | `{ teamName, timestamp }` |
| `team:task-updated` | `{ path, timestamp }` |

---

## Hook System

The hook server listens on `:3001` and accepts POST requests from Claude Code's hook mechanism. Incoming events are validated, typed, and dispatched through a central `HookEventBus`:

```typescript
import { createEventBus } from "cc-middleware/hooks";

const bus = createEventBus();

// Subscribe to a specific event
bus.on("PreToolUse", (input) => {
  console.log("Tool about to be used:", input.toolName);
});

// Wildcard — receive all events
bus.on("*", (eventType, input) => {
  metrics.record(eventType);
});
```

Supported hook events: `PreToolUse` · `PostToolUse` · `PostToolUseFailure` · `SessionStart` · `SessionEnd` · `UserPromptSubmit` · `Stop` · `StopFailure` · `SubagentStart` · `SubagentStop` · `TaskCreated` · `TaskCompleted` · `TeammateIdle` · `PermissionRequest` · `PermissionDenied` · `Notification` · `ConfigChange` · `CwdChanged` · `FileChanged` · `WorktreeCreate` · `WorktreeRemove` · `PreCompact` · `PostCompact` · `Elicitation` · `ElicitationResult` · `Setup`

Blocking hooks (e.g. `PreToolUse`) return `{ behavior: "allow" }` by default. Register a handler on the `BlockingHookRegistry` to intercept and modify the decision.

---

## CLI

The `ccm` CLI mirrors the REST API surface:

```bash
# Sessions
npx ccm sessions list
npx ccm sessions launch "Write tests for src/utils.ts" --stream
npx ccm sessions resume <session-id> "Add edge cases"
npx ccm sessions abort <session-id>

# Search
npx ccm search "permissions handler"

# Agents & Teams
npx ccm agents list
npx ccm teams list

# Server
npx ccm server start
npx ccm server status

# Config
npx ccm config show
npx ccm config permissions list
```

---

## Claude Code Plugin

The `src/plugin/` directory contains a ready-to-install Claude Code plugin that:

- Registers a `/cc-middleware` slash command mapped to the bundled skill
- Configures Claude Code to forward hook events to the middleware hook server automatically
- Exposes an MCP server so Claude can query middleware state mid-session

Install by pointing Claude Code at the plugin directory, or package and distribute via any Claude Code–compatible marketplace.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Your Application                   │
└──────────────────┬────────────────────┬─────────────────┘
                   │ REST / HTTP         │ WebSocket
┌──────────────────▼────────────────────▼─────────────────┐
│                    CC-Middleware (:3000)                 │
│                                                         │
│  Sessions ── Store (SQLite) ── Search                   │
│  Hooks ────── EventBus ──────── BlockingRegistry        │
│  Permissions ─ PolicyEngine ─── AskUserManager          │
│  Agents ────── Registry ──────── TeamManager            │
│  Config ─────── SettingsReader ── PluginManager          │
│  Sync ─────── SessionWatcher ── ConfigWatcher           │
└──────────────────────────────┬──────────────────────────┘
                               │ @anthropic-ai/claude-agent-sdk
┌──────────────────────────────▼──────────────────────────┐
│                        Claude Code                      │
└─────────────────────────────────────────────────────────┘
```

**Core subsystems:**

- **`src/sessions/`** — Discovery (reads `~/.claude/projects/`), launch/resume via Agent SDK, streaming, transcript reading, session catalog and lineage tracking
- **`src/hooks/`** — HTTP hook server that receives Claude Code lifecycle events, typed `HookEventBus` (EventEmitter3), blocking hook registry
- **`src/permissions/`** — Rule-based `PolicyEngine`, `PermissionManager` implementing `canUseTool`, `AskUserQuestionManager` for interactive prompts
- **`src/agents/`** — Reads agent definition markdown from `.claude/agents/`, `TeamManager` for multi-agent team configs
- **`src/api/`** — Fastify server wiring all subsystems into REST routes + WebSocket broadcaster
- **`src/store/`** — `better-sqlite3` session index, `SessionIndexer` for full and incremental indexing, full-text search
- **`src/sync/`** — `SessionWatcher` and `ConfigWatcher` (chokidar-based), `AutoIndexer` that batch-indexes new sessions as they appear
- **`src/config/`** — Read/write Claude settings files, plugin enumeration, MCP server management, memory and component discovery, runtime inventory
- **`src/plugin/`** — Installable Claude Code plugin: hook manifest, MCP server, `/cc-middleware` skill

---

## Using as a Library

CC-Middleware also exports everything as a typed library:

```typescript
import {
  createSessionManager,
  createEventBus,
  createPolicyEngine,
  createMiddlewareServer,
  createStore,
} from "cc-middleware";

const sessionManager = createSessionManager();
const eventBus = createEventBus();

// Build a minimal server with only what you need
const server = await createMiddlewareServer({
  sessionManager,
  eventBus,
  // ... other subsystems
});

await server.start();
```

Named sub-path exports: `cc-middleware/api` · `cc-middleware/hooks` · `cc-middleware/sessions` · `cc-middleware/store` · `cc-middleware/config` · `cc-middleware/permissions` · `cc-middleware/agents`

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | API server port |
| `HOOK_PORT` | `3001` | Hook server port |
| `HOST` | `127.0.0.1` | Bind address |
| `PROJECT_DIR` | `cwd` | Project root for config discovery |
| `CC_MIDDLEWARE_WATCH_SESSIONS` | `true` | Enable session file watcher |
| `CC_MIDDLEWARE_WATCH_CONFIG` | `true` | Enable config file watcher |
| `CC_MIDDLEWARE_AUTO_INDEX` | `true` | Enable auto session indexing |
| `CC_MIDDLEWARE_POLL_INTERVAL` | `10000` | Watcher poll interval (ms) |
| `CC_MIDDLEWARE_DEBOUNCE_MS` | `2000` | Watcher debounce interval (ms) |

---

## Requirements

- Node.js 20+
- Claude Code CLI installed and authenticated
- A valid auth context for `@anthropic-ai/claude-agent-sdk`

---

## Development

```bash
npm install
npm run build         # Compile TypeScript
npm run dev           # Watch mode
npm run playground:dev  # Vite dev server for the playground UI
npm test              # All tests (unit + e2e)
npm run test:unit
npm run test:e2e
npm run lint
```

### Documentation

```bash
npm run docs:dev       # Mintlify dev server (docs-site/)
npm run docs:validate  # Validate OpenAPI + AsyncAPI specs
```

---

## Status

Early alpha `v0.1.0`. The API surface, hook event list, and WebSocket protocol are stabilising but may change. The codebase includes unit, integration, and E2E test coverage alongside a Mintlify documentation site with generated OpenAPI and AsyncAPI reference assets.

Contributions, issues, and pull requests are welcome.

**Repository:** [github.com/juanbermudez/cc-middleware](https://github.com/juanbermudez/cc-middleware)
