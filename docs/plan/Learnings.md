# CC-Middleware Learnings

Document non-obvious discoveries, patterns that worked or didn't, SDK quirks, and gotchas encountered during development.

## Format

Each entry should include:
- **Date**: When discovered
- **Context**: What task/phase
- **Learning**: What was learned
- **Impact**: How this affects future work

---

## Entries

### 2026-04-04 - Hook callbacks vs canUseTool are separate type systems
- **Context**: Phase 4 (Event System) and Phase 5 (Permissions) planning review
- **Learning**: The Agent SDK has TWO distinct permission mechanisms with different return types:
  1. **Hook callbacks** (`HookCallback`) return `HookJSONOutput`: `{ hookSpecificOutput: { hookEventName, permissionDecision } }` or `{ decision: "block" }` or `{}`
  2. **`canUseTool` callback** returns `PermissionResult`: `{ behavior: "allow" }` or `{ behavior: "deny", message: "..." }`
  These must NOT be conflated. Hook callbacks fire for observation and control. `canUseTool` fires specifically for permission decisions.
- **Impact**: Phase 4 blocking stubs must return `HookJSONOutput`, not `PermissionResult`. Phase 5 correctly uses `PermissionResult`.

### 2026-04-04 - Default hook stub is simply `{}`
- **Context**: Phase 4.2 blocking hook stubs
- **Learning**: Returning `{}` (empty object) from ANY hook callback means "proceed with no changes". There is no need for an explicit "allow" return. The blocking mechanism differs per event type:
  - PreToolUse/PermissionRequest: `hookSpecificOutput.permissionDecision: "deny"` to block
  - Stop/TaskCompleted/TeammateIdle: top-level `decision: "block"` to prevent
  - All events: `{}` = proceed normally
- **Impact**: Simplifies default stubs significantly. All stubs are just `async () => ({})`.

### 2026-04-04 - HTTP hooks always return 200
- **Context**: Phase 4.4 HTTP hook server and Phase 8 plugin integration
- **Learning**: Claude Code's HTTP hook protocol always expects HTTP 200. The JSON body determines the decision, NOT the HTTP status code. Non-2xx responses are treated as non-blocking errors (Claude continues). You cannot block a tool call via HTTP 422 - you must return 200 with a JSON body containing the deny decision.
- **Impact**: The HTTP hook server must always respond 200 and put allow/deny decisions in the JSON body.

### 2026-04-04 - hookEventName is REQUIRED in hookSpecificOutput
- **Context**: Phase 4 hook output format
- **Learning**: Every `hookSpecificOutput` object MUST include a `hookEventName` field matching the event type string. Without it, Claude Code may not process the hook response correctly.
- **Impact**: All hook handlers that return `hookSpecificOutput` must include this field.

### 2026-04-04 - Setup hook event exists (TypeScript only)
- **Context**: Phase 4 event type enumeration
- **Learning**: The SDK has a `Setup` event (fires on `trigger: "init" | "maintenance"`) that was missing from our event type list. It's TypeScript-only, non-blocking.
- **Impact**: Added to event type list. Low priority but should be supported for completeness.

### 2026-04-04 - SDKSessionInfo has many more fields than planned
- **Context**: Phase 2 session discovery audit against SDK docs
- **Learning**: `SDKSessionInfo` has 10 fields, not just 3. Beyond `sessionId`, `summary`, `lastModified`, it also includes: `fileSize?`, `customTitle?`, `firstPrompt?`, `gitBranch?`, `cwd?`, `tag?`, `createdAt?`. Our `SessionInfo` type must map all of these. The `includeWorktrees` option defaults to `true` in the SDK.
- **Impact**: Updated Phase 2 and Phase 1 types to include all fields. Our SessionInfo mapping and E2E tests must verify these additional fields.

### 2026-04-04 - SessionMessage has a raw `message: unknown` payload
- **Context**: Phase 2 message reading audit
- **Learning**: The SDK's `SessionMessage` type has fields: `type` ("user"|"assistant"), `uuid`, `session_id`, `message` (unknown - raw transcript payload), `parent_tool_use_id` (null, reserved). The `message` field is the raw Anthropic API message, not pre-parsed text. We must extract text content and tool use information from this opaque payload ourselves.
- **Impact**: Phase 2 message reading must handle the raw `message` field parsing.

### 2026-04-04 - SDKResultMessage has far more fields than planned
- **Context**: Phase 3 LaunchResult audit
- **Learning**: `SDKResultMessage` is a discriminated union on `subtype`. Success variant has: `result`, `structured_output?`. Error variants have: `errors[]`. ALL variants share: `session_id`, `duration_ms`, `duration_api_ms`, `is_error`, `num_turns`, `stop_reason`, `total_cost_usd`, `usage` (NonNullableUsage with input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens), `modelUsage` (per-model breakdown with costUSD, contextWindow, maxOutputTokens), `permission_denials[]`. Error subtypes are: `error_max_turns`, `error_during_execution`, `error_max_budget_usd`, `error_max_structured_output_retries`.
- **Impact**: LaunchResult in Phase 3 was dramatically undersized. Now corrected with all fields.

### 2026-04-04 - Query object has 17+ control methods beyond iteration
- **Context**: Phase 3 session lifecycle and Phase architecture audit
- **Learning**: The `Query` object returned by `query()` extends `AsyncGenerator<SDKMessage, void>` with these methods: `interrupt()`, `rewindFiles()`, `setPermissionMode()`, `setModel()`, `setMaxThinkingTokens()`, `initializationResult()`, `supportedCommands()`, `supportedModels()`, `supportedAgents()`, `mcpServerStatus()`, `accountInfo()`, `reconnectMcpServer()`, `toggleMcpServer()`, `setMcpServers()`, `streamInput()`, `stopTask()`, `close()`. Most of these are only available in streaming input mode. Our SessionManager should expose relevant ones.
- **Impact**: SessionManager updated to expose key control methods. StreamingSession now exposes the raw Query object.

### 2026-04-04 - SDKMessage has 20 subtypes, not the 5-6 we planned for
- **Context**: Phase 3 streaming event audit
- **Learning**: The `SDKMessage` union includes 20 types: SDKAssistantMessage, SDKUserMessage, SDKUserMessageReplay, SDKResultMessage, SDKSystemMessage, SDKPartialAssistantMessage, SDKCompactBoundaryMessage, SDKStatusMessage, SDKLocalCommandOutputMessage, SDKHookStartedMessage, SDKHookProgressMessage, SDKHookResponseMessage, SDKToolProgressMessage, SDKAuthStatusMessage, SDKTaskNotificationMessage, SDKTaskStartedMessage, SDKTaskProgressMessage, SDKFilesPersistedEvent, SDKToolUseSummaryMessage, SDKRateLimitEvent, SDKPromptSuggestionMessage. Our streaming handler must not crash on unexpected types.
- **Impact**: SessionStreamEvent type expanded to cover important message types. Must use a default/fallback case for unknown message types.

### 2026-04-04 - PermissionMode includes "auto" mode
- **Context**: Phase 5 permission handling audit
- **Learning**: `PermissionMode` has 6 values, not 5: "default", "acceptEdits", "bypassPermissions", "plan", "dontAsk", "auto". The "auto" mode uses a model classifier to approve or deny each tool call. This was missing from our LaunchOptions type.
- **Impact**: Updated LaunchOptions and permission handling to include "auto" mode.

### 2026-04-04 - PermissionResult has optional toolUseID on both variants
- **Context**: Phase 5 permission result type audit
- **Learning**: Both the "allow" and "deny" variants of `PermissionResult` have an optional `toolUseID?: string` field. The "allow" variant also has `updatedPermissions?: PermissionUpdate[]` for suggesting permission rule updates. These were missing from our Phase 5 types.
- **Impact**: Updated PermissionResult type in Phase 5.

### 2026-04-04 - AskUserQuestion fields are ALL required, not optional
- **Context**: Phase 5 AskUserQuestion type audit
- **Learning**: In the SDK's `AskUserQuestionInput`, ALL fields within each question are required (not optional): `question`, `header`, `options`, `multiSelect`. Each option has required `label` and `description`, plus optional `preview?` (only when `toolConfig.askUserQuestion.previewFormat` is set). Our plan had `header?`, `options?`, and `multiSelect?` as optional. Also: 1-4 questions per call, 2-4 options per question. AskUserQuestion is NOT available in subagents.
- **Impact**: Fixed AskUserQuestionInput type. Must include "AskUserQuestion" in tools array if using a custom tools list.

### 2026-04-04 - Options type has 40+ fields, many we hadn't considered
- **Context**: Phase 3 LaunchOptions audit against SDK Options type
- **Learning**: The SDK `Options` type has many fields we weren't exposing: `effort` (low/medium/high/max), `thinking` (ThinkingConfig), `enableFileCheckpointing`, `persistSession` (false = in-memory only), `settingSources` (user/project/local, defaults to [] = no filesystem settings), `fallbackModel`, `tools` (array or preset), `outputFormat` (structured JSON schema), `sandbox` (SandboxSettings), `plugins` (SdkPluginConfig[]), `toolConfig`, `sessionId` (custom UUID), `resumeSessionAt` (specific message), `betas`, `debug`/`debugFile`, `promptSuggestions`, `additionalDirectories`, `disallowedTools`, `allowDangerouslySkipPermissions`, `executable`/`executableArgs`, `spawnClaudeCodeProcess`, `strictMcpConfig`, and more.
- **Impact**: LaunchOptions significantly expanded. Key options to surface early: persistSession, settingSources, effort, thinking, enableFileCheckpointing, sandbox, outputFormat.

### 2026-04-04 - V2 TypeScript SDK preview exists (unstable)
- **Context**: Architecture-level awareness
- **Learning**: A V2 preview of the TypeScript SDK exists with `unstable_v2_createSession()`, `unstable_v2_resumeSession()`, `unstable_v2_prompt()`. Sessions have `send(message)` and `stream()` methods. Multi-turn is simpler (no async generator coordination). V2 is unstable and its APIs may change. Missing features vs V1: no session forking, some advanced streaming patterns. Supports `await using` for auto-cleanup.
- **Impact**: Added V2 awareness note to architecture doc. We should monitor V2 stability but build on V1 for now.

### 2026-04-04 - Streaming is incompatible with extended thinking and structured output
- **Context**: Phase 3 streaming session audit
- **Learning**: When `maxThinkingTokens` or `thinking: { type: 'enabled' }` is set, `StreamEvent` (SDKPartialAssistantMessage) messages are NOT emitted - only complete messages appear. Structured output JSON also doesn't stream via deltas; it only appears in the final `ResultMessage.structured_output`. This means our streaming UI won't show incremental text when thinking is enabled.
- **Impact**: Document this limitation. StreamingSession should handle gracefully when no stream_events arrive.

### 2026-04-04 - Session paths must match for resume to work
- **Context**: Phase 3 resume session handling
- **Learning**: Sessions are stored at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` where `<encoded-cwd>` replaces every non-alphanumeric character with `-`. If a resume call runs from a different `cwd`, the SDK looks in the wrong directory and returns a fresh session instead of the expected history. Session files are also local to the machine.
- **Impact**: Our resume/fork functions must ensure cwd matches or document this requirement clearly.

### 2026-04-04 - AbortController vs Query.interrupt() vs Query.close() are distinct
- **Context**: Phase 3 session lifecycle management
- **Learning**: There are three ways to stop a session: (1) `AbortController` passed via `options.abortController` - signals abort via AbortSignal; (2) `Query.interrupt()` - interrupts the query, only available in streaming input mode; (3) `Query.close()` - forcefully closes the query and terminates the underlying process, cleans up all resources. Our SessionManager should expose all three appropriately.
- **Impact**: Updated SessionManager to expose abort, interrupt, and close methods distinctly.

### 2026-04-04 - SessionMessage.type includes "system" not just "user"|"assistant"
- **Context**: Task 2.2 Session message reading implementation
- **Learning**: The SDK's `SessionMessage.type` field includes `"system"` as a third variant, not just `"user" | "assistant"` as documented in the phase plan. TypeScript caught this during compilation. Our SessionMessage type must include all three variants.
- **Impact**: Updated SessionMessage type to include `"system"`. Future message processing logic should handle system messages.
