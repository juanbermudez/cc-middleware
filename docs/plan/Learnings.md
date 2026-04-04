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

### 2026-04-04 - SDK throws on error result subtypes during iteration
- **Context**: Task 3.2 Streaming session implementation
- **Learning**: When the SDK's `query()` AsyncGenerator encounters an error result (e.g., `error_max_turns`), it throws an exception during `for await` iteration rather than yielding a result message. This means the consumer's `for await` loop crashes unless the error is caught. Our streaming wrapper must catch these errors and convert them to result events for consumers.
- **Impact**: Updated streaming.ts to catch iteration errors and convert them to error result events. Tests must use sufficient maxTurns to avoid non-deterministic failures.

### 2026-04-04 - StreamingSession.result Promise may never resolve on abort+break
- **Context**: Task 6.5.5 Streaming abort integration test
- **Learning**: When a streaming session is aborted and the consumer `break`s out of the `for await` loop, the async generator's `return()` method is called (normal cleanup). But the generator's try/catch block that would resolve the result promise never runs because the generator was already closed by the break. This means `await stream.result` can hang forever after abort+break. Use `stream.abort()` directly and don't depend on the result promise in abort scenarios.
- **Impact**: Integration tests should not await `stream.result` after abort. The SessionManager's internal tracking may also leave sessions in "running" state briefly after abort because the result promise doesn't resolve.

### 2026-04-04 - createSDKHooks detects active events at call time
- **Context**: Task 6.5.1 Hooks + Session integration
- **Learning**: `createSDKHooks()` inspects the event bus and blocking registry at the moment it's called to determine which events to bridge. If you register listeners AFTER calling createSDKHooks (without the wildcard `*` listener), those events won't have callbacks in the hooks object. Register listeners before calling createSDKHooks, or use the wildcard listener to force all events to be bridged.
- **Impact**: Integration tests must register event bus listeners before calling createSDKHooks. Alternatively, use `createFullSDKHooks()` to bridge all events regardless.

### 2026-04-04 - Plugin structure: components go at root, NOT inside .claude-plugin/
- **Context**: Phase 8 Plugin Integration
- **Learning**: Plugin components (hooks/, skills/, agents/, .mcp.json) must be at the plugin ROOT directory, not inside `.claude-plugin/`. Only `plugin.json` goes inside `.claude-plugin/`. The manifest's path references (hooks, skills) are relative to the plugin root.
- **Impact**: Plugin directory structure must follow the convention exactly for Claude Code to discover components.

### 2026-04-04 - FTS5 content tables need sync triggers for upsert operations
- **Context**: Phase 9 Task 9.1 SQLite store
- **Learning**: FTS5 content tables (`content=sessions`) don't automatically sync when the source table changes. You MUST create AFTER INSERT/UPDATE/DELETE triggers that maintain the FTS index. For UPDATE, the trigger must first DELETE the old FTS row then INSERT the new one. Without these triggers, FTS results become stale after any upsert.
- **Impact**: All FTS-backed tables need three triggers each (insert, update, delete). The update trigger is a two-step delete-then-insert.

### 2026-04-04 - FTS5 MATCH queries need careful sanitization
- **Context**: Phase 9 Task 9.3 Full-text search
- **Learning**: FTS5 MATCH syntax has special operators (AND, OR, NOT, NEAR, quotes, etc.) that can cause syntax errors if user input is passed directly. Our approach: strip special chars, wrap each word in quotes, append `*` for prefix matching. This ensures all user input produces valid FTS5 queries. A fallback to LIKE search handles any remaining edge cases.
- **Impact**: Always sanitize user search queries before passing to FTS5 MATCH.

### 2026-04-04 - Settings array merging: concatenate and deduplicate, not replace
- **Context**: Phase 10 Task 10.1 Settings reader
- **Learning**: Claude Code's settings system concatenates array values (like `permissions.allow`) across all scopes and deduplicates them. Lower-priority scopes can ADD entries but cannot REMOVE entries added by higher-priority scopes. Scalar values use simple override (higher precedence wins). This is critical for correct permission rule merging.
- **Impact**: The mergeSettings function must iterate scopes from lowest to highest precedence, collecting unique array entries.

### 2026-04-04 - installed_plugins.json uses "name@marketplace" keys with array values
- **Context**: Phase 10 Task 10.3 Plugin reader
- **Learning**: The plugin registry at `~/.claude/plugins/installed_plugins.json` uses keys like `"plugin-name@marketplace-name"` with array values (one entry per scope/project). Each entry has `scope`, `installPath`, `version`, `installedAt`, etc. A single plugin can have multiple installs (different scopes or projects). The `enabledPlugins` map in settings.json uses the same key format.
- **Impact**: Plugin listing must parse the compound key format and cross-reference with enabledPlugins from all settings scopes.

### 2026-04-04 - Memory project key derived from git root, not cwd
- **Context**: Phase 10 Task 10.6 Memory reader
- **Learning**: Claude Code's auto-memory directory uses the git repository root (not the working directory) to generate the project key. This means all worktrees and subdirectories of the same repo share one memory directory. The encoding replaces `/` with `-` and prepends `-`. Outside a git repo, the project root path is used directly.
- **Impact**: The memory reader must try `git rev-parse --show-toplevel` first, falling back to the provided directory if not in a git repo.
