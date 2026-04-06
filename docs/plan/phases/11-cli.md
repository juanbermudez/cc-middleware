# Phase 11: CLI Control Surface

**Status**: Not Started
**Depends On**: Phase 7 (API Layer), Phase 9 (Search & Indexing), Phase 10 (Configuration Management)
**Blocks**: None (Phase 12: UI will depend on this for patterns/learnings)

## Goal

Build a CLI tool (`ccm`) that wraps the middleware REST/WebSocket API, providing a terminal-native interface for managing Claude Code sessions, hooks, agents, teams, permissions, and configuration. The CLI is the first "control surface" envisioned in the original project goal and should feel like a first-class tool, not a thin API wrapper.

## Design Principles

1. **API-first**: Every command talks to the middleware HTTP API -- never import middleware internals or call the Agent SDK directly. The middleware IS the abstraction layer.
2. **Auto-start**: If the middleware server is not running, commands that need it should offer to start it (or start it automatically with `--auto-start`).
3. **Human-friendly defaults, machine-friendly option**: Output is colored tables/text by default, `--json` flag switches to machine-parseable JSON.
4. **Minimal dependencies**: Use `commander` for CLI framework, `chalk` for colors, `cli-table3` for tables, `ora` for spinners. Keep the dependency surface small.
5. **Single binary feel**: The `ccm` command should be self-contained. `npx ccm` or `npm link` for development, later publishable as an npm package.

## Architecture

```
src/cli/
  index.ts              # Entry point, commander setup, global flags
  client.ts             # HTTP client wrapper (fetch-based, talks to middleware API)
  ws-client.ts          # WebSocket client for streaming/events
  output.ts             # Output formatters (table, JSON, streaming text)
  auto-start.ts         # Middleware server auto-start/health-check logic
  commands/
    server.ts           # server start/stop/status
    sessions.ts         # sessions list/show/launch/resume/stream/search
    hooks.ts            # hooks listen/list
    agents.ts           # agents list/show/create
    teams.ts            # teams list/show
    permissions.ts      # permissions list/add/pending/approve/deny
    config.ts           # config show/get/set/plugins/mcp/skills/agents/memory
```

### Client Architecture

```typescript
// src/cli/client.ts
export class MiddlewareClient {
  constructor(private baseUrl: string) {}

  // Generic request methods
  async get<T>(path: string, params?: Record<string, string>): Promise<T>
  async post<T>(path: string, body?: unknown): Promise<T>
  async put<T>(path: string, body?: unknown): Promise<T>
  async delete<T>(path: string): Promise<T>

  // Health check
  async isRunning(): Promise<boolean>
  async waitForReady(timeoutMs?: number): Promise<void>
}

// src/cli/ws-client.ts
export class MiddlewareWsClient {
  constructor(private wsUrl: string) {}

  async connect(): Promise<void>
  subscribe(events: string[]): void
  onMessage(handler: (msg: WsMessage) => void): void
  close(): void
}
```

### Output Architecture

```typescript
// src/cli/output.ts
export interface OutputOptions {
  json: boolean;
  verbose: boolean;
  noColor: boolean;
}

export function printTable(headers: string[], rows: string[][], options: OutputOptions): void
export function printJson(data: unknown, options: OutputOptions): void
export function printKeyValue(pairs: Record<string, unknown>, options: OutputOptions): void
export function printStream(label: string, text: string): void
export function printError(message: string, details?: string): void
export function printSuccess(message: string): void
export function printWarning(message: string): void
```

## Global Flags

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--json` | `-j` | Output as JSON instead of formatted text | `false` |
| `--server <url>` | `-s` | Middleware server URL | `http://127.0.0.1:3000` |
| `--verbose` | `-v` | Show detailed output (request/response details) | `false` |
| `--no-color` | | Disable colored output | `false` (colors enabled) |
| `--auto-start` | | Auto-start server if not running | `false` |

Server URL also reads from `CCM_SERVER_URL` environment variable.

---

## Task 11.1: CLI Scaffold and Client

### Implementation

**New files**:
- `src/cli/index.ts` - Commander program setup with global flags
- `src/cli/client.ts` - HTTP client for middleware API
- `src/cli/ws-client.ts` - WebSocket client for streaming
- `src/cli/output.ts` - Output formatting utilities
- `src/cli/auto-start.ts` - Server health check and auto-start

**New dependencies** (add to `package.json`):
- `commander` - CLI framework
- `chalk` - Terminal colors
- `cli-table3` - Table formatting
- `ora` - Spinners for async operations

**`package.json` additions**:
```json
{
  "bin": {
    "ccm": "./dist/cli/index.js"
  },
  "scripts": {
    "ccm": "node dist/cli/index.js"
  }
}
```

**Entry point** (`src/cli/index.ts`):
```typescript
#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { MiddlewareClient } from "./client.js";
import type { OutputOptions } from "./output.js";

const program = new Command();

program
  .name("ccm")
  .description("CC-Middleware CLI - Control surface for Claude Code sessions")
  .version("0.1.0")
  .option("-j, --json", "Output as JSON", false)
  .option("-s, --server <url>", "Middleware server URL", process.env.CCM_SERVER_URL || "http://127.0.0.1:3000")
  .option("-v, --verbose", "Verbose output", false)
  .option("--no-color", "Disable colors")
  .option("--auto-start", "Auto-start server if not running", false);

// Register command groups
// registerServerCommands(program);
// registerSessionCommands(program);
// ... etc

program.parse();
```

**HTTP client** (`src/cli/client.ts`):
```typescript
export class MiddlewareClient {
  constructor(private baseUrl: string) {}

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString());
    if (!res.ok) throw new ApiError(res.status, await res.json());
    return res.json() as Promise<T>;
  }

  async post<T>(path: string, body?: unknown): Promise<T> { /* ... */ }
  async put<T>(path: string, body?: unknown): Promise<T> { /* ... */ }
  async delete<T>(path: string): Promise<T> { /* ... */ }

  async isRunning(): Promise<boolean> {
    try {
      await this.get("/health");
      return true;
    } catch { return false; }
  }
}
```

**Auto-start** (`src/cli/auto-start.ts`):
```typescript
import { spawn } from "node:child_process";

export async function ensureServerRunning(
  client: MiddlewareClient,
  options: { autoStart: boolean; verbose: boolean }
): Promise<void> {
  if (await client.isRunning()) return;

  if (!options.autoStart) {
    throw new Error(
      "Middleware server is not running. Start it with: ccm server start\n" +
      "Or use --auto-start to start it automatically."
    );
  }

  // Fork the middleware server as a detached background process
  const child = spawn("node", ["dist/api/server.js"], {
    cwd: /* resolve middleware root */,
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  // Wait for server to be ready
  await client.waitForReady(10_000);
}
```

### Verification

```
tests/unit/cli-client.test.ts:
  - Test MiddlewareClient.get() makes correct request
  - Test MiddlewareClient.post() sends body as JSON
  - Test MiddlewareClient.isRunning() returns true on 200, false on connection error
  - Test ApiError includes status code and error body
  - Test URL params are correctly appended
  - Test custom server URL is used

tests/unit/cli-output.test.ts:
  - Test printTable() formats correct columns and rows
  - Test printJson() outputs valid JSON
  - Test printKeyValue() formats key-value pairs
  - Test --json flag switches output mode
  - Test --no-color strips ANSI codes

Verify: npm run build succeeds, ccm --help shows program info and global flags
Verify: ccm --version outputs "0.1.0"
```

---

## Task 11.2: Server Commands

### Commands

#### `ccm server start`

| Aspect | Detail |
|--------|--------|
| **API** | Starts the middleware server process directly (not an API call) |
| **Behavior** | Forks `dist/api/server.js` as a detached background process. Writes PID to `~/.cc-middleware/server.pid`. Waits for `/health` to return 200. |
| **Output (text)** | `Server started on http://127.0.0.1:3000 (PID: 12345)` |
| **Output (json)** | `{ "status": "started", "url": "http://127.0.0.1:3000", "pid": 12345 }` |
| **Options** | `--port <n>` (override port), `--foreground` (run in foreground, not daemonized) |
| **Error** | If already running: `Server is already running on http://127.0.0.1:3000 (PID: 12345)` |
| **Interactive** | None |

#### `ccm server stop`

| Aspect | Detail |
|--------|--------|
| **API** | Reads PID from `~/.cc-middleware/server.pid`, sends SIGTERM |
| **Behavior** | Graceful shutdown. Waits up to 5s for process to exit, then SIGKILL. Removes PID file. |
| **Output (text)** | `Server stopped (PID: 12345)` |
| **Output (json)** | `{ "status": "stopped", "pid": 12345 }` |
| **Error** | If not running: `Server is not running` |
| **Interactive** | None |

#### `ccm server status`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /health` + `GET /api/v1/status` |
| **Behavior** | Shows server health and status info. If server is not running, reports that. |
| **Output (text)** | Formatted key-value block: URL, PID, uptime, active sessions, registered agents, etc. |
| **Output (json)** | Combined health + status JSON |
| **Error** | If not running: `Server is not running` (exit code 1) |
| **Interactive** | None |

### Implementation: `src/cli/commands/server.ts`

```typescript
import { Command } from "commander";
import { spawn } from "node:child_process";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const PID_FILE = path.join(os.homedir(), ".cc-middleware", "server.pid");

export function registerServerCommands(parent: Command): void {
  const server = parent.command("server").description("Manage the middleware server");

  server.command("start")
    .description("Start the middleware server")
    .option("--port <port>", "Server port", "3000")
    .option("--foreground", "Run in foreground (not daemonized)", false)
    .action(async (opts) => { /* ... */ });

  server.command("stop")
    .description("Stop the middleware server")
    .action(async () => { /* ... */ });

  server.command("status")
    .description("Show server status")
    .action(async () => { /* ... */ });
}
```

### Verification

```
tests/unit/cli-server.test.ts:
  - Test start writes PID file and spawns process
  - Test stop reads PID file and sends SIGTERM
  - Test status calls /health and /api/v1/status
  - Test start with --foreground runs in foreground
  - Test start when already running shows error

tests/e2e/cli-server.test.ts:
  - Test full lifecycle: start -> status -> stop
  - Run `ccm server start`, verify health check passes
  - Run `ccm server status`, verify output includes "running"
  - Run `ccm server stop`, verify process exited
  - Run `ccm server status`, verify output includes "not running"
```

---

## Task 11.3: Session Commands

### Commands

#### `ccm sessions list`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/sessions?limit=20&offset=0` |
| **Output (text)** | Table with columns: ID (truncated to 8 chars), Created, Duration, Status, First Prompt (truncated to 50 chars) |
| **Output (json)** | Raw API response: `{ sessions: [...], total: N }` |
| **Options** | `--limit <n>` (default 20), `--offset <n>`, `--project <dir>` (filter by project) |
| **Interactive** | None |
| **Error** | Server not running: suggest `ccm server start` |

**Example output**:
```
  ID        Created              Status     First Prompt
  a1b2c3d4  2026-04-03 14:30    completed  Fix the authentication bug in...
  e5f6g7h8  2026-04-03 12:15    completed  Write unit tests for the sear...
  i9j0k1l2  2026-04-03 10:00    active     Implement the new dashboard c...

  Showing 1-3 of 47 sessions
```

#### `ccm sessions show <id>`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/sessions/:id` + `GET /api/v1/sessions/:id/messages?limit=50` |
| **Output (text)** | Session header (ID, created, status, project, tags) followed by conversation messages formatted as a chat log. Human messages in one color, assistant messages in another. Tool use shown as indented blocks. |
| **Output (json)** | `{ session: {...}, messages: [...] }` |
| **Options** | `--messages <n>` (number of messages to show, default 50), `--no-messages` (show metadata only) |
| **Interactive** | None |
| **Error** | 404: `Session not found: <id>` |

**Example output**:
```
Session: a1b2c3d4-full-uuid-here
Created:  2026-04-03 14:30:22
Status:   completed
Project:  /Users/zef/Desktop/cc-middleware
Tags:     bugfix, auth

--- Conversation (12 messages) ---

[Human] Fix the authentication bug in src/auth/login.ts

[Assistant] I'll look at the authentication code to understand the bug.

  [Tool: Read] src/auth/login.ts
  [Result] (148 lines)

[Assistant] I found the issue. The token expiry check...
```

#### `ccm sessions launch <prompt>`

| Aspect | Detail |
|--------|--------|
| **API** | `POST /api/v1/sessions` (non-streaming) or WebSocket launch (streaming) |
| **Output (text)** | Spinner while waiting, then final result text. With `--stream`, shows real-time output. |
| **Output (json)** | LaunchResult JSON |
| **Options** | `--stream` (show real-time output via WebSocket), `--tools <tools>` (comma-separated allowed tools), `--model <model>`, `--max-turns <n>`, `--agent <name>` (use a registered agent) |
| **Interactive** | With `--stream`, output streams in real-time. Ctrl+C aborts the session. |
| **Error** | Launch failure: show error message from API |

#### `ccm sessions resume <id>`

| Aspect | Detail |
|--------|--------|
| **API** | `POST /api/v1/sessions/:id/resume` |
| **Output (text)** | Same as launch - spinner or streaming output |
| **Output (json)** | LaunchResult JSON |
| **Options** | `--prompt <text>` (follow-up prompt), `--stream` |
| **Interactive** | If `--prompt` not provided, open `$EDITOR` or read from stdin |
| **Error** | 404: `Session not found: <id>` |

#### `ccm sessions stream <id>`

| Aspect | Detail |
|--------|--------|
| **API** | WebSocket `ws://server/api/v1/ws`, subscribe to `session:stream` for the given session |
| **Output** | Real-time streaming text output. Tool uses shown inline. Color-coded by message type. |
| **Interactive** | Ctrl+C to stop watching (does not abort the session). |
| **Error** | If session is not active: `Session <id> is not currently active` |

#### `ccm sessions search <query>`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/search?q=<query>` |
| **Output (text)** | Table with columns: ID, Score, Created, Highlight (matching snippet) |
| **Output (json)** | Raw search response |
| **Options** | `--limit <n>`, `--project <dir>`, `--from <date>`, `--to <date>`, `--tag <tag>` |
| **Interactive** | None |
| **Error** | Empty results: `No sessions found matching "<query>"` |

### Implementation: `src/cli/commands/sessions.ts`

```typescript
export function registerSessionCommands(parent: Command): void {
  const sessions = parent.command("sessions").description("Manage Claude Code sessions");

  sessions.command("list")
    .description("List sessions")
    .option("--limit <n>", "Max results", "20")
    .option("--offset <n>", "Skip results", "0")
    .option("--project <dir>", "Filter by project directory")
    .action(async (opts) => {
      const client = getClient();
      const result = await client.get("/api/v1/sessions", {
        limit: opts.limit, offset: opts.offset, ...(opts.project && { project: opts.project })
      });
      if (getOutputOptions().json) printJson(result);
      else printSessionTable(result.sessions, result.total);
    });

  sessions.command("show <id>")
    .description("Show session details and messages")
    .option("--messages <n>", "Number of messages to show", "50")
    .option("--no-messages", "Show metadata only")
    .action(async (id, opts) => { /* ... */ });

  sessions.command("launch <prompt>")
    .description("Launch a new headless session")
    .option("--stream", "Stream output in real-time")
    .option("--tools <tools>", "Comma-separated allowed tools")
    .option("--model <model>", "Model to use")
    .option("--max-turns <n>", "Maximum turns")
    .option("--agent <name>", "Use a registered agent")
    .action(async (prompt, opts) => { /* ... */ });

  sessions.command("resume <id>")
    .description("Resume an existing session")
    .option("--prompt <text>", "Follow-up prompt")
    .option("--stream", "Stream output in real-time")
    .action(async (id, opts) => { /* ... */ });

  sessions.command("stream <id>")
    .description("Stream a session's output in real-time")
    .action(async (id) => { /* ... */ });

  sessions.command("search <query>")
    .description("Search sessions")
    .option("--limit <n>", "Max results", "20")
    .option("--project <dir>", "Filter by project")
    .option("--from <date>", "From date (YYYY-MM-DD)")
    .option("--to <date>", "To date (YYYY-MM-DD)")
    .option("--tag <tag>", "Filter by tag")
    .action(async (query, opts) => { /* ... */ });
}
```

### Verification

```
tests/unit/cli-sessions.test.ts:
  - Test list calls GET /api/v1/sessions with correct params
  - Test show calls GET /sessions/:id and /sessions/:id/messages
  - Test launch calls POST /api/v1/sessions with correct body
  - Test resume calls POST /sessions/:id/resume
  - Test search calls GET /api/v1/search with query params
  - Test table output formats correctly
  - Test --json flag returns raw API response

tests/e2e/cli-sessions.test.ts:
  - Start middleware server
  - Run `ccm sessions list`, verify table output contains session rows
  - Run `ccm sessions list --json`, verify valid JSON output
  - Run `ccm sessions show <known-id>`, verify session details shown
  - Run `ccm sessions search "test"`, verify search results or empty message
```

---

## Task 11.4: Hook Commands

### Commands

#### `ccm hooks listen`

| Aspect | Detail |
|--------|--------|
| **API** | WebSocket `ws://server/api/v1/ws`, subscribe to `hook:*` events |
| **Output** | Live stream of hook events as they arrive. Each event on one line with timestamp, event type, and summary. Similar to `tail -f`. |
| **Options** | `--events <types>` (comma-separated event type filter, e.g. `PreToolUse,PostToolUse`), `--session <id>` (filter by session) |
| **Interactive** | Ctrl+C to stop listening |
| **Error** | Server not running: suggest `ccm server start` |

**Example output**:
```
Listening for hook events... (Ctrl+C to stop)

14:30:22  PreToolUse     Read         src/auth/login.ts
14:30:23  PostToolUse    Read         (148 lines, 0.4s)
14:30:25  PreToolUse     Edit         src/auth/login.ts
14:30:26  PostToolUse    Edit         (success, 0.8s)
14:31:00  Stop           session      a1b2c3d4
```

#### `ccm hooks list`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/events/types` + `GET /api/v1/events/subscriptions` |
| **Output (text)** | Two sections: (1) Available event types, (2) Active webhook subscriptions table |
| **Output (json)** | `{ eventTypes: [...], subscriptions: [...] }` |
| **Interactive** | None |

### Implementation: `src/cli/commands/hooks.ts`

```typescript
export function registerHookCommands(parent: Command): void {
  const hooks = parent.command("hooks").description("Hook events");

  hooks.command("listen")
    .description("Live-stream hook events")
    .option("--events <types>", "Event types to listen for (comma-separated)")
    .option("--session <id>", "Filter by session ID")
    .action(async (opts) => {
      const wsClient = getWsClient();
      await wsClient.connect();
      const events = opts.events ? opts.events.split(",").map((e: string) => `hook:${e}`) : ["hook:*"];
      wsClient.subscribe(events);
      console.log(chalk.dim("Listening for hook events... (Ctrl+C to stop)\n"));
      wsClient.onMessage((msg) => {
        if (msg.type === "hook:event") {
          printHookEvent(msg);
        }
      });
      // Keep alive until Ctrl+C
      await new Promise(() => {});
    });

  hooks.command("list")
    .description("List event types and subscriptions")
    .action(async () => { /* ... */ });
}
```

### Verification

```
tests/unit/cli-hooks.test.ts:
  - Test listen subscribes to correct WebSocket events
  - Test --events flag filters event subscription
  - Test hook event formatting

tests/e2e/cli-hooks.test.ts:
  - Start middleware server
  - Run `ccm hooks list`, verify event types shown
  - Run `ccm hooks list --json`, verify valid JSON
```

---

## Task 11.5: Agent and Team Commands

### Commands

#### `ccm agents list`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/agents` |
| **Output (text)** | Table: Name, Source (filesystem/runtime), Model, Description (truncated) |
| **Output (json)** | Raw API response |
| **Interactive** | None |

#### `ccm agents show <name>`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/agents/:name` |
| **Output (text)** | Detailed agent info: name, source, model, tools, prompt (full text) |
| **Output (json)** | Raw agent definition |
| **Error** | 404: `Agent not found: <name>` |

#### `ccm agents create`

| Aspect | Detail |
|--------|--------|
| **API** | `POST /api/v1/config/agents` (creates agent definition file) |
| **Output (text)** | `Agent created: <name> at <path>` |
| **Options** | `--name <name>`, `--description <desc>`, `--model <model>`, `--tools <tools>` (comma-separated), `--prompt <text>` |
| **Interactive** | If options not provided, prompt interactively for name, description, and open `$EDITOR` for the prompt body |
| **Error** | Agent already exists: `Agent "<name>" already exists` |

#### `ccm teams list`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/teams` |
| **Output (text)** | Table: Name, Members, Active Tasks, Status |
| **Output (json)** | Raw API response |

#### `ccm teams show <name>`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/teams/:name` + `GET /api/v1/teams/:name/tasks` |
| **Output (text)** | Team header (name, members list) followed by task table (ID, Assignee, Status, Description) |
| **Output (json)** | Combined team + tasks JSON |
| **Error** | 404: `Team not found: <name>` |

### Implementation: `src/cli/commands/agents.ts`

```typescript
export function registerAgentCommands(parent: Command): void {
  const agents = parent.command("agents").description("Manage agent definitions");

  agents.command("list")
    .description("List all agents")
    .action(async () => {
      const client = getClient();
      const result = await client.get("/api/v1/agents");
      if (getOutputOptions().json) printJson(result);
      else printAgentTable(result.agents);
    });

  agents.command("show <name>")
    .description("Show agent details")
    .action(async (name) => { /* ... */ });

  agents.command("create")
    .description("Create a new agent definition")
    .option("--name <name>", "Agent name")
    .option("--description <desc>", "Agent description")
    .option("--model <model>", "Model to use")
    .option("--tools <tools>", "Comma-separated tool list")
    .option("--prompt <text>", "Agent prompt")
    .action(async (opts) => { /* ... */ });
}

export function registerTeamCommands(parent: Command): void {
  const teams = parent.command("teams").description("Manage agent teams");

  teams.command("list")
    .description("List active teams")
    .action(async () => { /* ... */ });

  teams.command("show <name>")
    .description("Show team details and tasks")
    .action(async (name) => { /* ... */ });
}
```

### Verification

```
tests/unit/cli-agents.test.ts:
  - Test list calls GET /api/v1/agents
  - Test show calls GET /api/v1/agents/:name
  - Test create calls POST /api/v1/config/agents with correct body
  - Test table output formats correctly

tests/e2e/cli-agents.test.ts:
  - Start middleware server
  - Run `ccm agents list`, verify table output
  - Run `ccm agents list --json`, verify valid JSON
  - Run `ccm teams list`, verify output
```

---

## Task 11.6: Permission Commands

### Commands

#### `ccm permissions list`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/permissions/policies` |
| **Output (text)** | Table: ID, Action (allow/deny), Pattern, Priority, Source |
| **Output (json)** | Raw API response |

#### `ccm permissions add`

| Aspect | Detail |
|--------|--------|
| **API** | `POST /api/v1/permissions/policies` |
| **Output (text)** | `Permission added: <action> <pattern> (ID: <id>)` |
| **Options** | `--action <allow\|deny>` (required), `--pattern <glob>` (required), `--priority <n>` |
| **Interactive** | If `--action` or `--pattern` not provided, prompt for them |
| **Error** | Invalid pattern: show validation error |

#### `ccm permissions pending`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/permissions/pending` |
| **Output (text)** | Table: ID, Tool Name, Session, Timestamp, Input summary |
| **Output (json)** | Raw API response |
| **Note** | If there are pending requests, print a hint: `Use "ccm permissions approve <id>" or "ccm permissions deny <id>"` |

#### `ccm permissions approve <id>`

| Aspect | Detail |
|--------|--------|
| **API** | `POST /api/v1/permissions/pending/:id/resolve` with `{ "allow": true }` |
| **Output (text)** | `Permission approved: <id> (<tool name>)` |
| **Output (json)** | Resolution result |
| **Error** | 404: `Pending request not found: <id>` |

#### `ccm permissions deny <id>`

| Aspect | Detail |
|--------|--------|
| **API** | `POST /api/v1/permissions/pending/:id/resolve` with `{ "allow": false }` |
| **Output (text)** | `Permission denied: <id> (<tool name>)` |
| **Output (json)** | Resolution result |
| **Error** | 404: `Pending request not found: <id>` |

### Implementation: `src/cli/commands/permissions.ts`

```typescript
export function registerPermissionCommands(parent: Command): void {
  const perms = parent.command("permissions").description("Manage permission policies");

  perms.command("list")
    .description("List permission policies")
    .action(async () => { /* ... */ });

  perms.command("add")
    .description("Add a permission rule")
    .option("--action <action>", "allow or deny")
    .option("--pattern <pattern>", "Tool name glob pattern")
    .option("--priority <n>", "Rule priority (higher = checked first)")
    .action(async (opts) => { /* ... */ });

  perms.command("pending")
    .description("Show pending permission requests")
    .action(async () => { /* ... */ });

  perms.command("approve <id>")
    .description("Approve a pending permission request")
    .action(async (id) => { /* ... */ });

  perms.command("deny <id>")
    .description("Deny a pending permission request")
    .action(async (id) => { /* ... */ });
}
```

### Verification

```
tests/unit/cli-permissions.test.ts:
  - Test list calls GET /api/v1/permissions/policies
  - Test add calls POST /api/v1/permissions/policies with correct body
  - Test approve calls POST /pending/:id/resolve with { allow: true }
  - Test deny calls POST /pending/:id/resolve with { allow: false }

tests/e2e/cli-permissions.test.ts:
  - Start middleware server
  - Run `ccm permissions list`, verify output
  - Run `ccm permissions add --action allow --pattern "Read"`, verify added
  - Run `ccm permissions list`, verify new rule appears
```

---

## Task 11.7: Configuration Commands

### Commands

#### `ccm config show`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/config/settings` |
| **Output (text)** | Key-value pairs grouped by provenance scope. Colored by scope (user=blue, project=green, local=yellow, managed=red). |
| **Output (json)** | Raw merged settings with provenance |
| **Options** | `--scope <scope>` (show only one scope: user/project/local/managed) |

**Example output**:
```
Effective Settings (merged)

  Key                          Value                    Source
  permissions.defaultMode      allowEdits               project
  permissions.allow            Read, Edit, Bash(echo*)  user+project
  preferences.theme            dark                     user
  env.CLAUDE_CODE_MAX_TURNS    50                       managed
```

#### `ccm config get <key>`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/config/settings` (then extract key from merged result) |
| **Output (text)** | Value and provenance: `permissions.defaultMode = "allowEdits" (from: project)` |
| **Output (json)** | `{ "key": "...", "value": ..., "source": "..." }` |
| **Error** | Key not found: `Setting not found: <key>` |

#### `ccm config set <key> <value>`

| Aspect | Detail |
|--------|--------|
| **API** | `PUT /api/v1/config/settings/:scope` |
| **Output (text)** | `Set <key> = <value> in <scope>` |
| **Options** | `--scope <scope>` (which scope to write to, default: `project`) |
| **Error** | Cannot write to managed scope: `Cannot modify managed settings` |

#### `ccm config plugins`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/config/plugins` |
| **Output (text)** | Table: Name, Version, Enabled, Scope, Has Hooks/Skills/Agents |
| **Output (json)** | Raw API response |

#### `ccm config mcp`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/config/mcp` |
| **Output (text)** | Table: Name, Transport, Scope, Enabled, Command/URL |
| **Output (json)** | Raw API response |

#### `ccm config skills`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/config/skills` |
| **Output (text)** | Table: Name, Scope, Description (truncated) |
| **Output (json)** | Raw API response |

#### `ccm config agents`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/config/agents` |
| **Output (text)** | Table: Name, Scope, Model, Description (truncated), Path |
| **Output (json)** | Raw API response |

#### `ccm config memory`

| Aspect | Detail |
|--------|--------|
| **API** | `GET /api/v1/config/memory` |
| **Output (text)** | Memory index content, followed by a table of memory files: Name, Type, Last Modified |
| **Output (json)** | Raw API response |

### Implementation: `src/cli/commands/config.ts`

```typescript
export function registerConfigCommands(parent: Command): void {
  const config = parent.command("config").description("Manage configuration");

  config.command("show")
    .description("Show effective merged settings")
    .option("--scope <scope>", "Show only one scope")
    .action(async (opts) => {
      const client = getClient();
      if (opts.scope) {
        const result = await client.get(`/api/v1/config/settings/${opts.scope}`);
        if (getOutputOptions().json) printJson(result);
        else printKeyValue(result.content, getOutputOptions());
      } else {
        const result = await client.get("/api/v1/config/settings");
        if (getOutputOptions().json) printJson(result);
        else printSettingsTable(result.settings, result.provenance);
      }
    });

  config.command("get <key>")
    .description("Get a specific setting value")
    .action(async (key) => { /* ... */ });

  config.command("set <key> <value>")
    .description("Set a setting value")
    .option("--scope <scope>", "Settings scope to write to", "project")
    .action(async (key, value, opts) => { /* ... */ });

  config.command("plugins")
    .description("List plugins")
    .action(async () => { /* ... */ });

  config.command("mcp")
    .description("List MCP servers")
    .action(async () => { /* ... */ });

  config.command("skills")
    .description("List skills")
    .action(async () => { /* ... */ });

  config.command("agents")
    .description("List agent definitions (file-based)")
    .action(async () => { /* ... */ });

  config.command("memory")
    .description("Show memory index")
    .action(async () => { /* ... */ });
}
```

### Verification

```
tests/unit/cli-config.test.ts:
  - Test show calls GET /api/v1/config/settings
  - Test show --scope calls GET /api/v1/config/settings/:scope
  - Test get extracts correct key from merged settings
  - Test set calls PUT /api/v1/config/settings/:scope
  - Test plugins calls GET /api/v1/config/plugins
  - Test mcp calls GET /api/v1/config/mcp
  - Test skills calls GET /api/v1/config/skills
  - Test agents calls GET /api/v1/config/agents
  - Test memory calls GET /api/v1/config/memory
  - Test --json flag for each subcommand

tests/e2e/cli-config.test.ts:
  - Start middleware server
  - Run `ccm config show`, verify formatted output
  - Run `ccm config show --json`, verify valid JSON
  - Run `ccm config plugins`, verify table output
  - Run `ccm config mcp`, verify table output
  - Run `ccm config memory`, verify output
```

---

## Task 11.8: Tab Completion and Polish

### Tab Completion

Generate shell completions using commander's built-in support:

```typescript
// src/cli/completion.ts
import { Command } from "commander";

export function registerCompletionCommand(parent: Command): void {
  parent.command("completion")
    .description("Generate shell completion script")
    .argument("<shell>", "Shell type: bash, zsh, fish")
    .action((shell) => {
      switch (shell) {
        case "bash":
          console.log(generateBashCompletion());
          break;
        case "zsh":
          console.log(generateZshCompletion());
          break;
        case "fish":
          console.log(generateFishCompletion());
          break;
        default:
          console.error(`Unsupported shell: ${shell}. Supported: bash, zsh, fish`);
          process.exit(1);
      }
    });
}
```

**Setup instructions** printed by the command:
```
# Bash: Add to ~/.bashrc
eval "$(ccm completion bash)"

# Zsh: Add to ~/.zshrc
eval "$(ccm completion zsh)"

# Fish: Add to ~/.config/fish/completions/
ccm completion fish > ~/.config/fish/completions/ccm.fish
```

### Dynamic completions

For subcommands that take IDs (session IDs, agent names), generate dynamic completions by querying the API:
- `ccm sessions show <TAB>` -> list recent session IDs
- `ccm agents show <TAB>` -> list agent names
- `ccm permissions approve <TAB>` -> list pending request IDs

### Polish Items

1. **Graceful error handling**: All commands wrapped in try/catch that prints friendly error messages (not stack traces) unless `--verbose` is set.
2. **Signal handling**: Ctrl+C cleanly exits streaming commands, closes WebSocket connections.
3. **Help text**: Every command has a description and examples in the help text.
4. **Version info**: `ccm --version` shows CLI version and server version (if running).
5. **Startup banner**: `ccm server start` prints a short banner with URL and available commands.

### Implementation: `src/cli/completion.ts`

### Verification

```
tests/unit/cli-completion.test.ts:
  - Test bash completion script generation
  - Test zsh completion script generation
  - Test fish completion script generation
  - Test invalid shell shows error

tests/e2e/cli-polish.test.ts:
  - Run `ccm --help`, verify all command groups listed
  - Run `ccm sessions --help`, verify all subcommands listed
  - Run `ccm nonexistent`, verify friendly error message
  - Run `ccm sessions show nonexistent-id`, verify "not found" error (not stack trace)
  - Run `ccm --version`, verify version output
```

---

## Task 11.9: Integration Tests

### Full CLI Integration Tests

Wire the CLI against a real running middleware server and verify end-to-end flows.

```typescript
// tests/e2e/cli-integration.test.ts

describe("CLI integration", () => {
  let serverProcess: ChildProcess;

  beforeAll(async () => {
    // Start the middleware server
    serverProcess = spawn("node", ["dist/api/server.js"], { ... });
    await waitForHealth("http://127.0.0.1:3000");
  });

  afterAll(() => {
    serverProcess.kill();
  });

  test("full session workflow", async () => {
    // 1. List sessions
    const listOutput = await exec("ccm sessions list --json");
    const sessions = JSON.parse(listOutput);
    expect(sessions.sessions).toBeInstanceOf(Array);

    // 2. Launch a session
    const launchOutput = await exec('ccm sessions launch "What is 2+2?" --json');
    const result = JSON.parse(launchOutput);
    expect(result.sessionId).toBeTruthy();

    // 3. Show the session
    const showOutput = await exec(`ccm sessions show ${result.sessionId} --json`);
    const session = JSON.parse(showOutput);
    expect(session.session.id).toBe(result.sessionId);

    // 4. Search for it
    const searchOutput = await exec('ccm sessions search "2+2" --json');
    const searchResults = JSON.parse(searchOutput);
    expect(searchResults.results.length).toBeGreaterThan(0);
  });

  test("server lifecycle", async () => {
    // Test via separate server on different port
    const statusOutput = await exec("ccm server status --json --server http://127.0.0.1:3000");
    const status = JSON.parse(statusOutput);
    expect(status.status).toBe("ok");
  });

  test("config commands", async () => {
    const settingsOutput = await exec("ccm config show --json");
    const settings = JSON.parse(settingsOutput);
    expect(settings.settings).toBeTruthy();

    const pluginsOutput = await exec("ccm config plugins --json");
    const plugins = JSON.parse(pluginsOutput);
    expect(plugins).toBeInstanceOf(Array);
  });

  test("permissions workflow", async () => {
    // Add a policy
    const addOutput = await exec('ccm permissions add --action allow --pattern "Read" --json');
    expect(addOutput).toContain("id");

    // List policies
    const listOutput = await exec("ccm permissions list --json");
    const policies = JSON.parse(listOutput);
    expect(policies.length).toBeGreaterThan(0);
  });

  test("agents and teams", async () => {
    const agentsOutput = await exec("ccm agents list --json");
    const agents = JSON.parse(agentsOutput);
    expect(agents.agents).toBeInstanceOf(Array);
  });
});
```

### Verification

```
All integration tests run against a live middleware server:
  - Session lifecycle: list -> launch -> show -> search
  - Server status check
  - Config reading: settings, plugins, MCP, memory
  - Permission workflow: add -> list -> verify
  - Agent listing
  - Hook event types listing
  - Error handling: invalid session ID, nonexistent agent

Verify: All E2E tests pass with `npx vitest run tests/e2e/cli-integration.test.ts`
Verify: `ccm --help` shows all commands
Verify: `ccm sessions list` produces formatted output against running server
```

---

## Summary: Command -> API Endpoint Mapping

| Command | Method | API Endpoint | Output Format |
|---------|--------|-------------|---------------|
| `ccm server start` | (local) | N/A - spawns process | Text |
| `ccm server stop` | (local) | N/A - kills process | Text |
| `ccm server status` | GET | `/health` + `/api/v1/status` | Key-value |
| `ccm sessions list` | GET | `/api/v1/sessions` | Table |
| `ccm sessions show <id>` | GET | `/api/v1/sessions/:id` + `/:id/messages` | Chat log |
| `ccm sessions launch <prompt>` | POST | `/api/v1/sessions` | Text/Stream |
| `ccm sessions resume <id>` | POST | `/api/v1/sessions/:id/resume` | Text/Stream |
| `ccm sessions stream <id>` | WS | `ws://server/api/v1/ws` (subscribe session:stream) | Stream |
| `ccm sessions search <query>` | GET | `/api/v1/search?q=<query>` | Table |
| `ccm hooks listen` | WS | `ws://server/api/v1/ws` (subscribe hook:*) | Stream |
| `ccm hooks list` | GET | `/api/v1/events/types` + `/events/subscriptions` | Table |
| `ccm agents list` | GET | `/api/v1/agents` | Table |
| `ccm agents show <name>` | GET | `/api/v1/agents/:name` | Key-value |
| `ccm agents create` | POST | `/api/v1/config/agents` | Text |
| `ccm teams list` | GET | `/api/v1/teams` | Table |
| `ccm teams show <name>` | GET | `/api/v1/teams/:name` + `/:name/tasks` | Key-value + Table |
| `ccm permissions list` | GET | `/api/v1/permissions/policies` | Table |
| `ccm permissions add` | POST | `/api/v1/permissions/policies` | Text |
| `ccm permissions pending` | GET | `/api/v1/permissions/pending` | Table |
| `ccm permissions approve <id>` | POST | `/api/v1/permissions/pending/:id/resolve` | Text |
| `ccm permissions deny <id>` | POST | `/api/v1/permissions/pending/:id/resolve` | Text |
| `ccm config show` | GET | `/api/v1/config/settings` | Table |
| `ccm config get <key>` | GET | `/api/v1/config/settings` | Key-value |
| `ccm config set <key> <value>` | PUT | `/api/v1/config/settings/:scope` | Text |
| `ccm config plugins` | GET | `/api/v1/config/plugins` | Table |
| `ccm config mcp` | GET | `/api/v1/config/mcp` | Table |
| `ccm config skills` | GET | `/api/v1/config/skills` | Table |
| `ccm config agents` | GET | `/api/v1/config/agents` | Table |
| `ccm config memory` | GET | `/api/v1/config/memory` | Key-value + Table |
| `ccm completion <shell>` | (local) | N/A - generates script | Script |

## New Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `commander` | CLI framework with subcommands, options, help generation | ~60KB |
| `chalk` | Terminal color output | ~25KB |
| `cli-table3` | ASCII table formatting | ~30KB |
| `ora` | Terminal spinners for async operations | ~15KB |

## File Summary

| File | Purpose |
|------|---------|
| `src/cli/index.ts` | Entry point, commander setup, global flags |
| `src/cli/client.ts` | HTTP client wrapper for middleware API |
| `src/cli/ws-client.ts` | WebSocket client for streaming/events |
| `src/cli/output.ts` | Output formatters (table, JSON, streaming) |
| `src/cli/auto-start.ts` | Server health check and auto-start logic |
| `src/cli/completion.ts` | Shell completion script generation |
| `src/cli/commands/server.ts` | server start/stop/status |
| `src/cli/commands/sessions.ts` | sessions list/show/launch/resume/stream/search |
| `src/cli/commands/hooks.ts` | hooks listen/list |
| `src/cli/commands/agents.ts` | agents list/show/create + teams list/show |
| `src/cli/commands/permissions.ts` | permissions list/add/pending/approve/deny |
| `src/cli/commands/config.ts` | config show/get/set/plugins/mcp/skills/agents/memory |
| `tests/unit/cli-client.test.ts` | Client unit tests |
| `tests/unit/cli-output.test.ts` | Output formatter unit tests |
| `tests/unit/cli-server.test.ts` | Server command unit tests |
| `tests/unit/cli-sessions.test.ts` | Session command unit tests |
| `tests/unit/cli-hooks.test.ts` | Hook command unit tests |
| `tests/unit/cli-agents.test.ts` | Agent command unit tests |
| `tests/unit/cli-permissions.test.ts` | Permission command unit tests |
| `tests/unit/cli-config.test.ts` | Config command unit tests |
| `tests/unit/cli-completion.test.ts` | Completion script unit tests |
| `tests/e2e/cli-server.test.ts` | Server lifecycle E2E tests |
| `tests/e2e/cli-sessions.test.ts` | Session commands E2E tests |
| `tests/e2e/cli-integration.test.ts` | Full CLI integration tests |
| `tests/e2e/cli-polish.test.ts` | Help text, error handling E2E tests |
