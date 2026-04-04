# Phase 3: Session Launching

**Status**: Not Started
**Depends On**: Phase 2 (Session Discovery)
**Blocks**: Phase 5 (Permissions), Phase 6 (Agents & Teams)

## Goal

Launch headless Claude Code sessions programmatically via the Agent SDK. Support single-turn, streaming, resume, and session lifecycle management.

## Key SDK Functions Used

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// query() returns a Query object (async generator)
// that yields SDKMessage objects
```

## Critical SDK Patterns

### Single-turn launch:
```typescript
for await (const message of query({
  prompt: "Your task",
  options: {
    allowedTools: ["Read", "Glob", "Grep"],
    maxTurns: 5,
    permissionMode: "default",
  }
})) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
```

### Streaming:
```typescript
for await (const message of query({
  prompt: "Your task",
  options: {
    includePartialMessages: true,
    allowedTools: ["Read"],
  }
})) {
  if (message.type === "stream_event") {
    // Real-time token streaming
  }
}
```

### Resume:
```typescript
for await (const message of query({
  prompt: "Follow up",
  options: { resume: sessionId }
})) { ... }
```

---

## Task 3.1: Launch Headless Session (Single-Turn)

### Implementation: `src/sessions/launcher.ts`

```typescript
export interface LaunchOptions {
  prompt: string;
  allowedTools?: string[];
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'dontAsk' | 'bypassPermissions';
  maxTurns?: number;
  maxBudgetUsd?: number;
  cwd?: string;
  env?: Record<string, string>;
  model?: string;
  systemPrompt?: string;
  agents?: Record<string, AgentDefinition>;
  mcpServers?: Record<string, any>;
}

export interface LaunchResult {
  sessionId: string;
  result: string;
  durationMs: number;
  totalCostUsd: number;
  numTurns: number;
  usage: { inputTokens: number; outputTokens: number };
}

export async function launchSession(options: LaunchOptions): Promise<LaunchResult>
```

**Behavior**:
- Wraps `query()` with our options interface
- Captures session ID from init or result message
- Collects the final result text
- Returns structured `LaunchResult`

### Verification (E2E)

**`tests/e2e/session-launch.test.ts`**:
```typescript
// Test: Launch a simple session
// 1. Call launchSession({ prompt: "What is 2+2? Reply with just the number.", maxTurns: 1 })
// 2. Verify result.sessionId is a valid UUID
// 3. Verify result.result contains "4"
// 4. Verify result.durationMs > 0
// 5. Verify result.totalCostUsd >= 0
```

---

## Task 3.2: Launch Streaming Session

### Implementation: Extend `src/sessions/launcher.ts`

```typescript
export interface StreamingSession {
  sessionId: string;
  events: AsyncIterable<SessionStreamEvent>;
  abort: () => Promise<void>;
  result: Promise<LaunchResult>;
}

export type SessionStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; toolName: string; toolId: string }
  | { type: 'tool_use_end'; toolName: string; toolId: string }
  | { type: 'tool_result'; toolName: string; result: unknown }
  | { type: 'system'; subtype: string; data: unknown }
  | { type: 'result'; data: LaunchResult };

export async function launchStreamingSession(
  options: LaunchOptions
): Promise<StreamingSession>
```

**Behavior**:
- Calls `query()` with `includePartialMessages: true`
- Creates an async iterator that transforms raw SDK events into `SessionStreamEvent`
- Extracts text deltas from `stream_event` messages
- Tracks tool use start/end from content blocks
- Provides abort capability via `AbortController`
- Resolves `result` promise when session completes

### Verification (E2E)

**`tests/e2e/session-streaming.test.ts`**:
```typescript
// Test: Stream a session
// 1. Call launchStreamingSession({ prompt: "Count from 1 to 5", maxTurns: 1 })
// 2. Collect all events from the async iterator
// 3. Verify at least one text_delta event was received
// 4. Verify a result event was received
// 5. Verify the final result promise resolves
```

---

## Task 3.3: Resume and Continue Sessions

### Implementation: Extend `src/sessions/launcher.ts`

```typescript
export async function resumeSession(
  sessionId: string,
  prompt: string,
  options?: Partial<LaunchOptions>
): Promise<LaunchResult>

export async function continueSession(
  prompt: string,
  options?: Partial<LaunchOptions>
): Promise<LaunchResult>

export async function forkSession(
  sessionId: string,
  prompt: string,
  options?: Partial<LaunchOptions>
): Promise<LaunchResult>
```

### Verification (E2E)

**`tests/e2e/session-resume.test.ts`**:
```typescript
// Test: Launch then resume
// 1. Launch session: "Remember the number 42"
// 2. Capture sessionId
// 3. Resume with: "What number did I ask you to remember?"
// 4. Verify the response mentions 42

// Test: Fork session
// 1. Launch session with a task
// 2. Fork it with a different follow-up
// 3. Verify fork has a different session ID
// 4. Verify original session is unmodified
```

---

## Task 3.4: Session Lifecycle Management

### Implementation: `src/sessions/manager.ts`

```typescript
export class SessionManager {
  // Track active sessions launched by this middleware
  getActiveSessions(): ActiveSession[]
  getActiveSession(sessionId: string): ActiveSession | undefined

  // Launch and track
  launch(options: LaunchOptions): Promise<LaunchResult>
  launchStreaming(options: LaunchOptions): Promise<StreamingSession>

  // Control
  abort(sessionId: string): Promise<void>
  abortAll(): Promise<void>

  // Events
  on(event: 'session:started', handler: (session: ActiveSession) => void): void
  on(event: 'session:completed', handler: (result: LaunchResult) => void): void
  on(event: 'session:errored', handler: (error: Error, sessionId: string) => void): void
  on(event: 'session:aborted', handler: (sessionId: string) => void): void

  // Cleanup
  destroy(): Promise<void>
}
```

**Behavior**:
- Maintains a Map of active sessions
- Wraps launcher functions with tracking
- Emits lifecycle events
- Handles cleanup on destroy

### Verification (E2E)

**`tests/e2e/session-manager.test.ts`**:
```typescript
// Test: Track active sessions
// 1. Create SessionManager
// 2. Launch a session
// 3. Verify getActiveSessions() returns it
// 4. Wait for completion
// 5. Verify getActiveSessions() is empty

// Test: Abort session
// 1. Launch a long-running session (e.g., "Count to 1000 slowly")
// 2. Abort it
// 3. Verify abort event fires
// 4. Verify session is removed from active list

// Test: Lifecycle events
// 1. Register listeners for started/completed
// 2. Launch a session
// 3. Verify started event fires with session info
// 4. Wait for completion
// 5. Verify completed event fires with result
```
