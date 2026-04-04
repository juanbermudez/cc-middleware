# Phase 7: API Layer

**Status**: Not Started
**Depends On**: Phases 2-6
**Blocks**: Phase 8 (Plugin), Phase 9 (Search & Index)

## Goal

Expose all middleware functionality through a clean REST/WebSocket HTTP API that future CLI and UI control surfaces will consume.

## API Design Principles

- All endpoints prefixed with `/api/v1/`
- Request/response validation with Zod schemas
- Consistent error format: `{ error: { code: string, message: string, details?: unknown } }`
- Pagination via `?limit=N&offset=N` query params
- WebSocket for real-time streaming and events

---

## Task 7.1: Fastify Server Setup

### Implementation: `src/api/server.ts`

```typescript
export interface MiddlewareServerOptions {
  port?: number;       // Default: 3000
  host?: string;       // Default: 127.0.0.1
  sessionManager: SessionManager;
  eventBus: HookEventBus;
  blockingRegistry: BlockingHookRegistry;
  policyEngine: PolicyEngine;
  agentRegistry: AgentRegistry;
  teamManager: TeamManager;
  permissionManager: PermissionManager;
  askUserManager: AskUserQuestionManager;
}

export async function createMiddlewareServer(
  options: MiddlewareServerOptions
): Promise<{
  start: () => Promise<{ port: number; host: string }>;
  stop: () => Promise<void>;
  app: FastifyInstance;
}>
```

**Endpoints for this task**:
- `GET /health` - `{ status: "ok", version: "0.1.0", uptime: number }`
- `GET /api/v1/status` - `{ activeSessions: number, registeredAgents: number, ... }`

### Verification (E2E)

**`tests/e2e/api-server.test.ts`**:
```typescript
// Test: Health check
// 1. Start server
// 2. GET /health
// 3. Verify 200 with { status: "ok" }

// Test: Status endpoint
// 1. GET /api/v1/status
// 2. Verify response has activeSessions, registeredAgents
```

---

## Task 7.2: Session REST Endpoints

### Implementation: `src/api/routes/sessions.ts`

**Endpoints**:

```
GET    /api/v1/sessions              - List sessions
GET    /api/v1/sessions/:id          - Get session details
GET    /api/v1/sessions/:id/messages - Get messages (paginated)
POST   /api/v1/sessions              - Launch new session
POST   /api/v1/sessions/:id/resume   - Resume session
POST   /api/v1/sessions/:id/abort    - Abort active session
PUT    /api/v1/sessions/:id          - Update session (rename/tag)
```

**Request/Response schemas**:

```typescript
// POST /api/v1/sessions
{
  prompt: string;
  allowedTools?: string[];
  permissionMode?: string;
  maxTurns?: number;
  model?: string;
  streaming?: boolean;   // If true, returns session ID and streams via WebSocket
  agent?: string;        // Use a registered agent
}
// Response: LaunchResult or { sessionId: string } if streaming

// GET /api/v1/sessions?project=...&limit=20&offset=0
// Response: { sessions: SessionInfo[], total: number }

// GET /api/v1/sessions/:id/messages?limit=50&offset=0
// Response: { messages: SessionMessage[], total: number }
```

### Verification (E2E)

**`tests/e2e/api-sessions.test.ts`**:
```typescript
// Test: List sessions
// Test: Get session by ID
// Test: Get session messages
// Test: Launch new session via API
// Test: Resume session via API
// Test: Update session title
// Test: 404 for non-existent session
```

---

## Task 7.3: WebSocket Streaming

### Implementation: `src/api/websocket.ts`

```typescript
// WebSocket connection at: ws://host/api/v1/ws

// Client -> Server messages:
{ type: "subscribe", events: ["session:*", "hook:PreToolUse"] }
{ type: "unsubscribe", events: ["hook:PreToolUse"] }
{ type: "launch", options: LaunchOptions }
{ type: "resume", sessionId: string, prompt: string }

// Server -> Client messages:
{ type: "session:started", sessionId: string, timestamp: number }
{ type: "session:stream", sessionId: string, event: SessionStreamEvent }
{ type: "session:completed", sessionId: string, result: LaunchResult }
{ type: "session:errored", sessionId: string, error: string }
{ type: "hook:event", eventType: string, input: HookInput }
{ type: "permission:pending", permission: PendingPermission }
{ type: "question:pending", question: PendingQuestion }
```

### Verification (E2E)

**`tests/e2e/api-websocket.test.ts`**:
```typescript
// Test: Connect and subscribe
// 1. Connect WebSocket to /api/v1/ws
// 2. Send subscribe message
// 3. Launch a session via REST API
// 4. Verify session:started event received
// 5. Verify session:completed event received

// Test: Stream session events
// 1. Connect WebSocket
// 2. Subscribe to session:stream
// 3. Launch streaming session
// 4. Verify text_delta events received
```

---

## Task 7.4: Hook and Event Endpoints

### Implementation: `src/api/routes/events.ts`

```
GET    /api/v1/events/types           - List available event types
POST   /api/v1/events/subscribe       - Register webhook URL
GET    /api/v1/events/subscriptions   - List subscriptions
DELETE /api/v1/events/subscriptions/:id - Remove subscription
```

**Webhook subscription**:
```typescript
// POST /api/v1/events/subscribe
{
  url: string;            // Webhook URL to call
  events: string[];       // Event types to subscribe to
  headers?: Record<string, string>; // Custom headers
  secret?: string;        // HMAC signing secret
}
// Response: { id: string, events: string[], url: string }
```

### Verification (E2E)

**`tests/e2e/api-events.test.ts`**:
```typescript
// Test: List event types
// Test: Create webhook subscription
// Test: Webhook receives events
// Test: Delete subscription
```

---

## Task 7.5: Agent Endpoints

### Implementation: `src/api/routes/agents.ts`

```
GET    /api/v1/agents            - List agents
GET    /api/v1/agents/:name      - Get agent details
POST   /api/v1/agents            - Register runtime agent
DELETE /api/v1/agents/:name      - Remove runtime agent
GET    /api/v1/teams             - List teams
GET    /api/v1/teams/:name       - Get team details
GET    /api/v1/teams/:name/tasks - Get team tasks
```

### Verification (E2E)

**`tests/e2e/api-agents.test.ts`**:
```typescript
// Test: List agents (includes filesystem + runtime)
// Test: Register runtime agent
// Test: Get agent by name
// Test: List teams
```

---

## Task 7.6: Permission Endpoints

### Implementation: `src/api/routes/permissions.ts`

```
GET    /api/v1/permissions/policies           - List policies
POST   /api/v1/permissions/policies           - Add policy rule
DELETE /api/v1/permissions/policies/:id       - Remove rule
GET    /api/v1/permissions/pending            - List pending requests
POST   /api/v1/permissions/pending/:id/resolve - Resolve request
GET    /api/v1/permissions/questions           - List pending questions
POST   /api/v1/permissions/questions/:id/answer - Answer question
```

### Verification (E2E)

**`tests/e2e/api-permissions.test.ts`**:
```typescript
// Test: Add and list policies
// Test: Resolve pending permission
// Test: Answer pending question
```
