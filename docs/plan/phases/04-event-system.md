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
Elicitation, ElicitationResult,
Setup
```

### Blocking Events (can prevent action via HookJSONOutput)

These events can control behavior. The blocking mechanism varies by event type:

**Via `hookSpecificOutput.permissionDecision: "deny"`:**
- PreToolUse - deny tool call
- PermissionRequest - deny permission

**Via top-level `decision: "block"`:**
- Stop - prevent stop (continue conversation)
- SubagentStop - prevent subagent stop
- TeammateIdle - prevent idle (keep working)
- TaskCreated - prevent task creation
- TaskCompleted - prevent task completion

**Via top-level `decision: "block"` or specific output:**
- UserPromptSubmit - block prompt processing
- ConfigChange - block config change
- Elicitation, ElicitationResult - control MCP elicitation
- WorktreeCreate - fail worktree creation

### Non-Blocking Events (observation only, return {} or { async: true })
- PostToolUse, PostToolUseFailure
- SessionStart, SessionEnd
- SubagentStart
- Notification, PermissionDenied
- CwdChanged, FileChanged
- PreCompact, PostCompact
- WorktreeRemove, StopFailure
- Setup

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

// IMPORTANT: Hook callbacks return HookJSONOutput, not PermissionResult.
// Returning {} (empty object) = "proceed with no changes" for ALL events.
// This is distinct from canUseTool (Phase 5) which returns PermissionResult.
//
// HookJSONOutput shape:
// {
//   systemMessage?: string;       // Inject message visible to model
//   continue?: boolean;           // Control if agent keeps running
//   suppressOutput?: boolean;
//   stopReason?: string;
//   decision?: "approve" | "block"; // For Stop/TaskCompleted/TeammateIdle
//   reason?: string;
//   hookSpecificOutput?: {
//     hookEventName: string;      // REQUIRED - must match the event type
//     permissionDecision?: "allow" | "deny" | "ask" | "defer"; // PreToolUse/PermissionRequest
//     permissionDecisionReason?: string;
//     updatedInput?: Record<string, unknown>; // PreToolUse only (requires permissionDecision: "allow")
//     additionalContext?: string;
//     decision?: { behavior: "allow" | "deny" }; // PermissionRequest only
//   }
// }

// Default stubs - all return {} which means "proceed normally":
const DEFAULT_STUBS = {
  PreToolUse: async () => ({}),          // {} = don't interfere (falls through to normal permission flow)
  PermissionRequest: async () => ({}),   // {} = don't interfere (shows permission dialog as normal)
  UserPromptSubmit: async () => ({}),    // {} = pass through
  Stop: async () => ({}),                // {} = allow stop. Use { decision: "block" } to prevent stop
  TaskCreated: async () => ({}),         // {} = allow. Use { decision: "block", reason: "..." } to prevent
  TaskCompleted: async () => ({}),       // {} = allow. Use { decision: "block", reason: "..." } to prevent
  TeammateIdle: async () => ({}),        // {} = allow idle. Use { decision: "block", reason: "..." } to keep working
  SubagentStop: async () => ({}),        // {} = allow stop
  ConfigChange: async () => ({}),        // {} = allow change
  Elicitation: async () => ({}),         // {} = allow
  ElicitationResult: async () => ({}),   // {} = allow
  WorktreeCreate: async () => ({}),      // {} = allow
};
```

**Behavior**:
- Every blocking event has a default stub that returns `{}` (proceed/allow)
- `register()` replaces the default stub for an event
- Support matcher patterns (regex on tool name for tool events)
- `execute()` runs the handler chain and returns the result as `HookJSONOutput`
- Unregister returns to default stub
- For **deny/block** responses, registered handlers must return the correct format per event type:
  - PreToolUse: `{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "..." } }`
  - PermissionRequest: `{ hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny" } } }`
  - Stop/TaskCompleted/TeammateIdle: `{ decision: "block", reason: "..." }`
- Support `{ async: true, asyncTimeout?: number }` for fire-and-forget observation hooks

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
//   - The HookCallback receives (input: HookInput, toolUseID: string | undefined, { signal: AbortSignal })
//   - Dispatches to the event bus for all listeners
//   - For blocking events, executes the blocking handler and returns its HookJSONOutput
//   - For non-blocking events, returns {} (proceed)
//   - For observation-only handlers, returns { async: true } (fire-and-forget)
//
// IMPORTANT: Hook callbacks and canUseTool are SEPARATE systems.
// - Hook callbacks return HookJSONOutput (this bridge)
// - canUseTool returns PermissionResult { behavior: "allow"|"deny" } (Phase 5)
// Both can coexist. Hooks fire first, then canUseTool if no hook decided.
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
- Parses Claude Code hook input JSON from request body (delivered via stdin in command hooks, via POST body in HTTP hooks)
- Dispatches to event bus
- For blocking events, executes blocking handler and returns result as JSON body
- For non-blocking events, returns 200 with empty body
- **IMPORTANT**: Always returns HTTP 200. The JSON body determines allow/deny, NOT the status code.
  Claude Code's HTTP hook protocol:
  - 2xx + empty body = proceed (equivalent to exit 0)
  - 2xx + JSON body = proceed with structured response (parsed as HookJSONOutput)
  - Non-2xx / timeout = non-blocking error (Claude continues anyway, logged in verbose mode)
  - You CANNOT block via HTTP status code. Blocking is done via JSON body content:
    - PreToolUse deny: `{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "..." } }`
    - Stop block: `{ decision: "block", reason: "..." }`
- Handles timeouts gracefully (returns empty 200 on timeout so Claude isn't blocked)

### Verification (E2E)

**`tests/e2e/hook-server.test.ts`**:
```typescript
// Test: Receive and dispatch hook event (allow by default)
// 1. Start hook server
// 2. POST to /hooks/PreToolUse with mock payload: { tool_name: "Read", tool_input: {}, session_id: "test", cwd: "/tmp", hook_event_name: "PreToolUse" }
// 3. Verify event bus received the event
// 4. Verify response is HTTP 200 with empty JSON body {} (= proceed)

// Test: Blocking hook returns deny via JSON body
// 1. Register a deny handler for PreToolUse matching "Bash"
//    Handler returns: { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "Blocked by policy" } }
// 2. POST to /hooks/PreToolUse with tool_name "Bash"
// 3. Verify response is HTTP 200 with JSON body containing permissionDecision: "deny"
// 4. NOTE: HTTP status is ALWAYS 200. The JSON body determines the decision.

// Test: Non-blocking event returns empty 200
// 1. POST to /hooks/SessionStart with mock payload
// 2. Verify response is HTTP 200 with empty body
// 3. Verify event bus received the SessionStart event
```
