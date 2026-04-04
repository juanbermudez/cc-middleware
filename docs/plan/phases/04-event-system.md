# Phase 4: Event System

**Status**: Not Started
**Depends On**: Phase 1 (Foundation)
**Blocks**: Phase 6 (Agents & Teams), Phase 8 (Plugin)

## Goal

Build a typed event bus that dispatches Claude Code hook events, supports handler registration with matchers, provides blocking hook stubs with positive defaults, and bridges to the Agent SDK's hook callback system.

## Claude Code Hook Events Reference

All supported event types:
```
PreToolUse, PostToolUse, PostToolUseFailure,
SessionStart, SessionEnd,
UserPromptSubmit, Stop, StopFailure,
SubagentStart, SubagentStop,
TaskCreated, TaskCompleted,
TeammateIdle,
PermissionRequest, PermissionDenied,
Notification, ConfigChange, CwdChanged, FileChanged,
WorktreeCreate, WorktreeRemove,
PreCompact, PostCompact,
Elicitation, ElicitationResult
```

### Blocking Events (can prevent action)
- PreToolUse - deny tool call
- PermissionRequest - deny permission
- UserPromptSubmit - block prompt
- Stop - prevent stop (continue conversation)
- SubagentStop - prevent subagent stop
- TeammateIdle - prevent idle
- TaskCreated - prevent creation
- TaskCompleted - prevent completion
- ConfigChange - block config change
- Elicitation, ElicitationResult - control MCP elicitation

---

## Task 4.1: Event Bus Core

### Implementation: `src/hooks/event-bus.ts`

```typescript
import EventEmitter from 'eventemitter3';
import type { HookEventType, HookInput } from '../types/hooks.js';

export interface EventBusEvents {
  // One event per hook type, typed input
  PreToolUse: (input: PreToolUseInput) => void;
  PostToolUse: (input: PostToolUseInput) => void;
  SessionStart: (input: SessionStartInput) => void;
  // ... all event types
  '*': (eventType: HookEventType, input: HookInput) => void; // wildcard
}

export class HookEventBus extends EventEmitter<EventBusEvents> {
  dispatch(eventType: HookEventType, input: HookInput): void
  getHandlerCount(eventType?: HookEventType): number
  getRegisteredEvents(): HookEventType[]
}
```

**Behavior**:
- Type-safe event emission using `eventemitter3`
- Wildcard `*` listener receives all events
- `dispatch()` emits both the specific event and `*`
- Thread-safe for concurrent dispatches

### Verification (Unit)

**`tests/unit/event-bus.test.ts`**:
```typescript
// Test: Emit and receive typed events
// Test: Wildcard listener receives all events
// Test: Multiple handlers per event
// Test: Handler removal
// Test: getHandlerCount
// Test: getRegisteredEvents
```

---

## Task 4.2: Blocking Hook Stubs

### Implementation: `src/hooks/blocking.ts`

```typescript
export type BlockingHookHandler<TInput, TOutput> = (input: TInput) => Promise<TOutput>;

export interface BlockingHookRegistry {
  // Register a handler (replaces default stub)
  register<E extends BlockingEventType>(
    event: E,
    handler: BlockingHookHandler<InputFor<E>, OutputFor<E>>,
    options?: { matcher?: string }
  ): () => void; // Returns unregister function

  // Get the current handler for an event
  getHandler<E extends BlockingEventType>(
    event: E,
    toolName?: string  // For matcher-based lookup
  ): BlockingHookHandler<InputFor<E>, OutputFor<E>>;

  // Execute the handler chain for an event
  execute<E extends BlockingEventType>(
    event: E,
    input: InputFor<E>,
    toolName?: string
  ): Promise<OutputFor<E>>;
}

// Default stubs:
const DEFAULT_STUBS = {
  PreToolUse: async () => ({ permissionDecision: 'allow' as const }),
  PermissionRequest: async () => ({ decision: { behavior: 'allow' as const } }),
  UserPromptSubmit: async (input) => ({}), // pass through
  Stop: async () => ({}), // allow stop
  TaskCreated: async () => ({}), // allow creation
  TaskCompleted: async () => ({}), // allow completion
  TeammateIdle: async () => ({}), // allow idle
  // ... etc
};
```

**Behavior**:
- Every blocking event has a default stub that returns a positive (allow) response
- `register()` replaces the default stub for an event
- Support matcher patterns (regex on tool name for tool events)
- `execute()` runs the handler chain and returns the result
- Unregister returns to default stub

### Verification (Unit)

**`tests/unit/blocking-hooks.test.ts`**:
```typescript
// Test: Default stubs return allow
// Test: Register custom handler overrides default
// Test: Unregister restores default
// Test: Matcher-based handler selection
// Test: Multiple handlers with different matchers
```

---

## Task 4.3: SDK Hook Integration

### Implementation: `src/hooks/sdk-bridge.ts`

```typescript
import type { HookCallbackMatcher, HookCallback } from '@anthropic-ai/claude-agent-sdk';

export function createSDKHooks(
  eventBus: HookEventBus,
  blockingRegistry: BlockingHookRegistry
): Partial<Record<HookEventType, HookCallbackMatcher[]>>

// This generates the `hooks` option for query():
// For each registered event:
//   - Creates a HookCallbackMatcher with the right matcher pattern
//   - The HookCallback dispatches to the event bus AND
//     for blocking events, executes the blocking handler
//   - Returns the blocking handler's result as HookJSONOutput
```

**Behavior**:
- Converts middleware event registrations into SDK `hooks` option format
- For non-blocking events: dispatches to event bus, returns empty output
- For blocking events: dispatches to event bus AND runs blocking handler, returns result
- Handles the `HookJSONOutput` format correctly for each event type

### Verification (E2E)

**`tests/e2e/sdk-hooks.test.ts`**:
```typescript
// Test: Hook callbacks fire during session
// 1. Create event bus and blocking registry
// 2. Register a listener on PostToolUse
// 3. Create SDK hooks via createSDKHooks()
// 4. Launch session with: query({ prompt: "Read the file package.json", options: { hooks, allowedTools: ["Read"] } })
// 5. Verify PostToolUse listener was called with tool_name "Read"
```

---

## Task 4.4: HTTP Hook Server

### Implementation: `src/hooks/server.ts`

```typescript
export interface HookServerOptions {
  port?: number;  // Default: 3001
  host?: string;  // Default: 127.0.0.1
  eventBus: HookEventBus;
  blockingRegistry: BlockingHookRegistry;
}

export async function createHookServer(options: HookServerOptions): Promise<{
  start: () => Promise<{ port: number; host: string }>;
  stop: () => Promise<void>;
  url: string;
}>
```

**Behavior**:
- Accepts POST requests at `POST /hooks/:eventType`
- Parses Claude Code hook input JSON from request body
- Dispatches to event bus
- For blocking events, executes blocking handler and returns result
- For non-blocking events, returns 200 with empty body
- Returns proper exit-code-equivalent HTTP responses:
  - 200 = success (exit 0)
  - 422 = block (exit 2) with error message in body
- Handles timeouts gracefully

### Verification (E2E)

**`tests/e2e/hook-server.test.ts`**:
```typescript
// Test: Receive and dispatch hook event
// 1. Start hook server
// 2. POST to /hooks/PreToolUse with mock payload
// 3. Verify event bus received the event
// 4. Verify response is 200 with allow decision

// Test: Blocking hook returns deny
// 1. Register a deny handler for PreToolUse matching "Bash"
// 2. POST to /hooks/PreToolUse with tool_name "Bash"
// 3. Verify response is 200 with deny decision

// Test: Non-blocking event returns 200
// 1. POST to /hooks/SessionStart
// 2. Verify response is 200 with empty body
```
