# CC-Middleware Architecture

## System Overview

CC-Middleware is a Node/TypeScript service that wraps Claude Code to provide a unified API for session management, hook events, permissions, and agent orchestration.

```mermaid
graph TD
    EC["External Consumers<br/>(Future CLI, UI, Integrations)"]
    EC -->|"REST/WS"| API
    EC -->|"WebSocket"| API

    subgraph API["API Layer (Fastify)"]
        direction LR
        Sessions
        Events
        Agents
        Permissions
        Search
        Sync
        Health
        WS["WebSocket"]
    end

    API --> SM["Session Manager"]
    API --> EB["Event Bus<br/>+ Blocking Hooks"]
    API --> PM["Permission Manager<br/>+ Policy"]
    API --> AR["Agent Registry<br/>+ Teams"]
    API --> RS["Real-Time Sync"]
    API --> AW["Analytics Warehouse<br/>DuckDB + rollups"]

    EB --> HookHTTP["Hook HTTP Server"]
    PM --> AskUser["Ask User Mgr"]

    subgraph RS["Real-Time Sync"]
        SW["Session Watcher"]
        CW["Config Watcher"]
        AI["Auto-Indexer"]
    end

    SW -->|"session:discovered<br/>session:updated<br/>session:removed"| WS
    CW -->|"config:changed<br/>config:mcp-changed<br/>team:updated<br/>..."| WS
    AI --> Store["SQLite Store"]
    AI --> AW

    SM --> SDK["Agent SDK (@anthropic-ai/claude-agent-sdk)<br/>query() | listSessions() | getSessionMessages() | hooks"]
    AR --> SDK

    SDK --> CC["Claude Code Runtime<br/>Sessions | Tools | Agents"]
    SDK --> AW
    HookHTTP --> AW
```

## Component Details

### Session Manager (`src/sessions/manager.ts`)
- [Session Management](session-management.md)
- Central coordinator for all session operations
- Tracks active sessions, handles launch/resume/abort
- Emits lifecycle events to the event bus

### Event System (`src/hooks/`)
- [Event System](event-system.md)
- Type-safe event bus for all Claude Code hook events
- Blocking hook stubs with replaceable handlers
- SDK hook bridge for programmatic sessions
- HTTP hook server for plugin-based sessions

### Permission System (`src/permissions/`)
- [Permission System](permission-system.md)
- Policy engine with allow/deny rules and glob patterns
- canUseTool implementation for Agent SDK
- AskUserQuestion handler with external resolution

### Agent System (`src/agents/`)
- [Agent System](agent-system.md)
- Reads agent definitions from filesystem
- Central registry with programmatic registration
- Team management and monitoring
- Programmatic agent launching

### API Layer (`src/api/`)
- [API Reference](../api/README.md)
- Fastify HTTP server with CORS
- REST endpoints for all middleware features
- WebSocket for real-time streaming and events

### Storage Layer (`src/store/`)
- SQLite session index with FTS5 search
- Session indexer (full and incremental)
- Search API with filters and highlights

### Analytics Layer (`src/analytics/`)
- [Analytics System](analytics-system.md)
- Local DuckDB warehouse for transcript backfill and derived metrics
- Raw event ingestion from transcripts and middleware-launched sessions
- Derived facts for tools, errors, keywords, compactions, costs, and subagents
- Optional Claude Code OTel enrichment without depending on it for correctness

### Real-Time Sync (`src/sync/`)
- **Session Watcher** (`session-watcher.ts`): Watches `~/.claude/projects/` for new/modified `.jsonl` session files using chokidar with polling fallback. Emits `session:discovered`, `session:updated`, `session:removed` events.
- **Config Watcher** (`config-watcher.ts`): Watches settings files, MCP configs, agent/skill/rule definitions, team configs, plugins, and memory files. Emits typed events: `config:settings-changed`, `config:mcp-changed`, `config:agent-changed`, `config:skill-changed`, `config:rule-changed`, `config:plugin-changed`, `config:memory-changed`, `team:created`, `team:updated`, `team:task-updated`.
- **Auto-Indexer** (`auto-indexer.ts`): Listens to session watcher events and automatically indexes new/updated sessions into the SQLite store. New sessions are indexed immediately; updates are batched every 5 seconds.
- All sync events are pushed to WebSocket clients via the broadcaster.
- Configurable via environment variables (see below).

### Plugin (`src/plugin/`)
- [Plugin Integration](plugin-integration.md)
- Claude Code plugin manifest
- HTTP hooks pointing to middleware server
- Skill for in-session middleware interaction

## Data Flow

### Launching a Headless Session

```mermaid
sequenceDiagram
    participant Client
    participant API as API Server
    participant SM as Session Manager
    participant SDK as Agent SDK

    Client->>API: POST /sessions
    API->>SM: launch()
    SM->>SDK: query({prompt})
    SDK->>SDK: Claude Code
    SDK-->>SM: SDKMessages
    Note over API,SDK: events dispatched to event bus
    SM-->>API: LaunchResult
    API-->>Client: 200 {result}
```

### Hook Event Flow (Plugin Mode)

```mermaid
sequenceDiagram
    participant CC as Claude Code
    participant Hook as Plugin HTTP Hook
    participant Server as Hook Server
    participant Bus as Event Bus

    CC->>Hook: PreToolUse
    Hook->>Server: POST /hooks/PreToolUse
    Server->>Bus: dispatch()
    Bus->>Bus: handlers()
    Bus-->>Server: blocking result
    Server-->>Hook: 200 {allow}
    Hook-->>CC: allow/deny
```

### Hook Event Flow (SDK Mode)

```mermaid
sequenceDiagram
    participant SDK as Agent SDK
    participant Bridge as SDK Bridge
    participant Bus as Event Bus
    participant Reg as Blocking Registry

    SDK->>Bridge: HookCallback()
    Bridge->>Bus: dispatch()
    Bridge->>Reg: execute()
    Reg->>Reg: handler()
    Reg-->>Bridge: HookJSONOutput
    Bridge-->>SDK: HookJSONOutput
```

## Configuration

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `CC_MIDDLEWARE_PORT` | `3000` | API server port |
| `CC_MIDDLEWARE_HOOK_PORT` | `3001` | Hook HTTP server port |
| `CC_MIDDLEWARE_HOST` | `127.0.0.1` | Bind address |
| `CC_MIDDLEWARE_DB_PATH` | `~/.cc-middleware/sessions.db` | SQLite database path |
| `CC_MIDDLEWARE_WATCH_SESSIONS` | `true` | Enable session file watching |
| `CC_MIDDLEWARE_WATCH_CONFIG` | `true` | Enable config file watching |
| `CC_MIDDLEWARE_AUTO_INDEX` | `true` | Enable auto-indexing of new/modified sessions |
| `CC_MIDDLEWARE_POLL_INTERVAL` | `10000` | Poll interval in ms for session watcher (config watcher uses 3x this value) |
| `CC_MIDDLEWARE_DEBOUNCE_MS` | `2000` | Debounce interval in ms for file change events |

### Integration Modes

**SDK Mode** (recommended): Launch sessions via the Agent SDK. Hooks are registered as TypeScript callbacks. Tightest integration, lowest latency.

**Plugin Mode**: Install as Claude Code plugin. Hooks are HTTP calls to the middleware server. Works with existing interactive Claude Code sessions.

**Hybrid**: Use both modes. SDK mode for programmatic sessions, plugin mode for interactive sessions. Both dispatch to the same event bus.
