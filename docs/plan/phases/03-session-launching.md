# Phase 3: Session Launching

**Status**: Not Started
**Depends On**: Phase 2 (Session Discovery)
**Blocks**: Phase 5 (Permissions), Phase 6 (Agents & Teams)

## Goal

Launch headless Claude Code sessions programmatically via the Agent SDK. Support single-turn, streaming, resume, and session lifecycle management.

## Key SDK Functions Used

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// query() returns a Query object that extends AsyncGenerator<SDKMessage, void>
// with additional control methods (see Query Object section below)
```

## Query Object Control Methods

The `Query` object returned by `query()` extends `AsyncGenerator<SDKMessage, void>` with these methods:

| Method | Description |
|:-------|:------------|
| `interrupt()` | Interrupts the query (only in streaming input mode) |
| `rewindFiles(userMessageId, options?)` | Restores files to state at specified user message. Requires `enableFileCheckpointing: true`. Options: `{ dryRun?: boolean }`. Returns `RewindFilesResult` |
| `setPermissionMode(mode)` | Changes permission mode (only in streaming input mode) |
| `setModel(model?)` | Changes the model (only in streaming input mode) |
| `setMaxThinkingTokens(n)` | _Deprecated:_ Use `thinking` option instead |
| `initializationResult()` | Returns `SDKControlInitializeResponse` with commands, agents, models, account info, output styles |
| `supportedCommands()` | Returns `SlashCommand[]` |
| `supportedModels()` | Returns `ModelInfo[]` |
| `supportedAgents()` | Returns `AgentInfo[]` (name, description, model?) |
| `mcpServerStatus()` | Returns `McpServerStatus[]` |
| `accountInfo()` | Returns `AccountInfo` |
| `reconnectMcpServer(serverName)` | Reconnect an MCP server by name |
| `toggleMcpServer(serverName, enabled)` | Enable or disable an MCP server |
| `setMcpServers(servers)` | Replace MCP servers for this session. Returns `McpSetServersResult` |
| `streamInput(stream)` | Stream input messages for multi-turn conversations |
| `stopTask(taskId)` | Stop a running background task by ID |
| `close()` | Close the query and terminate the underlying process |

## SDK Message Types (SDKMessage union)

The `SDKMessage` union includes ALL of these types. Our streaming handler must account for all of them:

```typescript
type SDKMessage =
  | SDKAssistantMessage        // type: "assistant" - Complete assistant response
  | SDKUserMessage             // type: "user" - User input
  | SDKUserMessageReplay       // type: "user" with isReplay: true
  | SDKResultMessage           // type: "result" - Final result (success or error)
  | SDKSystemMessage           // type: "system", subtype: "init"
  | SDKPartialAssistantMessage // type: "stream_event" - Streaming tokens
  | SDKCompactBoundaryMessage  // type: "system", subtype: "compact_boundary"
  | SDKStatusMessage           // type: "system", subtype: "status"
  | SDKLocalCommandOutputMessage // type: "system", subtype: "local_command_output"
  | SDKHookStartedMessage      // type: "system", subtype: "hook_started"
  | SDKHookProgressMessage     // type: "system", subtype: "hook_progress"
  | SDKHookResponseMessage     // type: "system", subtype: "hook_response"
  | SDKToolProgressMessage     // type: "tool_progress"
  | SDKAuthStatusMessage       // type: "auth_status"
  | SDKTaskNotificationMessage // type: "system", subtype: "task_notification"
  | SDKTaskStartedMessage      // type: "system", subtype: "task_started"
  | SDKTaskProgressMessage     // type: "system", subtype: "task_progress"
  | SDKFilesPersistedEvent     // type: "system", subtype: "files_persisted"
  | SDKToolUseSummaryMessage   // type: "tool_use_summary"
  | SDKRateLimitEvent          // type: "rate_limit_event"
  | SDKPromptSuggestionMessage; // type: "prompt_suggestion"
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
    // Real-time token streaming via event.type === "content_block_delta"
    // event.delta.type === "text_delta" for text, "input_json_delta" for tool input
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

### Continue (most recent session in cwd):
```typescript
for await (const message of query({
  prompt: "Follow up",
  options: { continue: true }
})) { ... }
```

### Fork:
```typescript
for await (const message of query({
  prompt: "Try different approach",
  options: { resume: sessionId, forkSession: true }
})) { ... }
```

---

## Task 3.1: Launch Headless Session (Single-Turn)

### Implementation: `src/sessions/launcher.ts`

```typescript
export interface LaunchOptions {
  prompt: string;
  // Tool configuration
  allowedTools?: string[];
  disallowedTools?: string[];
  tools?: string[] | { type: 'preset'; preset: 'claude_code' };
  toolConfig?: { askUserQuestion?: { previewFormat?: 'markdown' | 'html' } };
  // Permission & execution
  permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'dontAsk' | 'bypassPermissions' | 'auto';
  allowDangerouslySkipPermissions?: boolean;
  canUseTool?: CanUseTool;
  // Limits
  maxTurns?: number;
  maxBudgetUsd?: number;
  // Environment
  cwd?: string;
  env?: Record<string, string | undefined>;
  additionalDirectories?: string[];
  // Model & thinking
  model?: string;
  fallbackModel?: string;
  effort?: 'low' | 'medium' | 'high' | 'max';
  thinking?: { type: 'adaptive' } | { type: 'enabled'; budgetTokens?: number } | { type: 'disabled' };
  // Prompts
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string };
  // Agents & MCP
  agents?: Record<string, AgentDefinition>;
  mcpServers?: Record<string, McpServerConfig>;
  // Session behavior
  persistSession?: boolean;          // Default: true. Set false for in-memory only (cannot resume)
  resume?: string;                   // Session ID to resume
  continue?: boolean;                // Continue most recent session in cwd
  forkSession?: boolean;             // Fork when resuming
  sessionId?: string;                // Use specific UUID instead of auto-generating
  resumeSessionAt?: string;          // Resume at specific message UUID
  enableFileCheckpointing?: boolean; // Enable file change tracking for rewinding
  // Settings
  settingSources?: ('user' | 'project' | 'local')[]; // Default: [] (no filesystem settings loaded)
  // Hooks
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;
  // Plugins
  plugins?: SdkPluginConfig[];       // { type: 'local'; path: string }[]
  // Betas
  betas?: SdkBeta[];                 // e.g., 'context-1m-2025-08-07' (retired)
  // Structured output
  outputFormat?: { type: 'json_schema'; schema: JSONSchema };
  // Sandbox
  sandbox?: SandboxSettings;
  // Streaming
  includePartialMessages?: boolean;
  promptSuggestions?: boolean;
  // Debug
  debug?: boolean;
  debugFile?: string;
  stderr?: (data: string) => void;
}

export interface LaunchResult {
  sessionId: string;
  // Success fields
  result?: string;                  // Only on subtype: "success"
  structuredOutput?: unknown;       // Only on subtype: "success" with outputFormat
  // Error fields
  errors?: string[];                // Only on error subtypes
  // Common fields on ALL result subtypes
  subtype: 'success' | 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd' | 'error_max_structured_output_retries';
  isError: boolean;
  durationMs: number;
  durationApiMs: number;
  totalCostUsd: number;
  numTurns: number;
  stopReason: string | null;
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number };
  modelUsage: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number; webSearchRequests: number; costUSD: number; contextWindow: number; maxOutputTokens: number }>;
  permissionDenials: Array<{ tool_name: string; tool_use_id: string; tool_input: Record<string, unknown> }>;
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
  query: Query;                           // The raw Query object for advanced control
  events: AsyncIterable<SessionStreamEvent>;
  abort: () => Promise<void>;             // Uses AbortController
  interrupt: () => Promise<void>;         // Uses Query.interrupt() (streaming input mode only)
  result: Promise<LaunchResult>;
}

// Our normalized event layer over the raw SDKMessage types
export type SessionStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; toolName: string; toolId: string }
  | { type: 'tool_use_end'; toolName: string; toolId: string }
  | { type: 'tool_result'; toolName: string; result: unknown }
  | { type: 'assistant_message'; message: SDKAssistantMessage }
  | { type: 'system'; subtype: string; data: unknown }
  | { type: 'tool_progress'; toolName: string; toolUseId: string; elapsedSeconds: number }
  | { type: 'tool_use_summary'; summary: string; toolUseIds: string[] }
  | { type: 'task_notification'; taskId: string; status: 'completed' | 'failed' | 'stopped'; summary: string }
  | { type: 'task_started'; taskId: string; description: string }
  | { type: 'task_progress'; taskId: string; description: string }
  | { type: 'hook_started'; hookId: string; hookName: string; hookEvent: string }
  | { type: 'hook_response'; hookId: string; outcome: 'success' | 'error' | 'cancelled' }
  | { type: 'rate_limit'; status: 'allowed' | 'allowed_warning' | 'rejected'; resetsAt?: number }
  | { type: 'compact_boundary'; trigger: 'manual' | 'auto'; preTokens: number }
  | { type: 'prompt_suggestion'; suggestion: string }
  | { type: 'result'; data: LaunchResult };

export async function launchStreamingSession(
  options: LaunchOptions
): Promise<StreamingSession>
```

**Behavior**:
- Calls `query()` with `includePartialMessages: true`
- Creates an async iterator that transforms raw SDK events into `SessionStreamEvent`
- Extracts text deltas from `stream_event` messages (check `event.type === "content_block_delta"` and `event.delta.type === "text_delta"`)
- Tracks tool use start/end from `content_block_start`/`content_block_stop` events
- **Note**: Streaming is incompatible with extended thinking (`maxThinkingTokens`) and structured output JSON streaming
- Provides abort capability via `AbortController` (passed as `options.abortController`)
- Provides interrupt capability via `Query.interrupt()` for streaming input mode
- Exposes raw `Query` object for advanced control (setModel, setPermissionMode, rewindFiles, etc.)
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
// Resume: passes { resume: sessionId } to query()
export async function resumeSession(
  sessionId: string,
  prompt: string,
  options?: Partial<LaunchOptions>
): Promise<LaunchResult>

// Continue: passes { continue: true } to query(). Finds most recent session in cwd.
// No session ID needed. Useful for single-conversation-at-a-time apps.
export async function continueSession(
  prompt: string,
  options?: Partial<LaunchOptions>
): Promise<LaunchResult>

// Fork: passes { resume: sessionId, forkSession: true } to query().
// Creates new session branching from original. Original stays unchanged.
// The fork gets its own session ID; capture from SDKResultMessage.session_id
// or from SDKSystemMessage (subtype "init") session_id field.
export async function forkSession(
  sessionId: string,
  prompt: string,
  options?: Partial<LaunchOptions>
): Promise<LaunchResult>
```

**Important**: Session resume requires the `cwd` to match the original session's working directory. Sessions are stored at `~/.claude/projects/<encoded-cwd>/`, so resuming from a different directory silently creates a fresh session.

### Verification (E2E)

**`tests/e2e/session-resume.test.ts`**:
```typescript
// Test: Launch then resume
// 1. Launch session: "Remember the number 42"
// 2. Capture sessionId from result.sessionId
// 3. Resume with: "What number did I ask you to remember?"
// 4. Verify the response mentions 42
// 5. Verify sessionId matches (same session)

// Test: Continue most recent session
// 1. Launch session from a specific cwd
// 2. Use continueSession() from same cwd
// 3. Verify context is preserved

// Test: Fork session
// 1. Launch session with a task
// 2. Fork it with a different follow-up
// 3. Verify fork has a different session ID
// 4. Verify original session is unmodified (resume original, check context)
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

  // Control - abort uses AbortController, interrupt uses Query.interrupt()
  abort(sessionId: string): Promise<void>       // Cancels via AbortController
  interrupt(sessionId: string): Promise<void>   // Uses Query.interrupt() (streaming input mode only)
  abortAll(): Promise<void>

  // Query object passthrough for advanced control
  // These delegate to the Query object for a given session
  setModel(sessionId: string, model: string): Promise<void>
  setPermissionMode(sessionId: string, mode: PermissionMode): Promise<void>
  rewindFiles(sessionId: string, userMessageId: string, options?: { dryRun?: boolean }): Promise<RewindFilesResult>
  stopTask(sessionId: string, taskId: string): Promise<void>

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
