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

### 2026-04-04 - CLI must match actual API schemas, not planned/assumed ones
- **Context**: Phase 11 Task 11.6 Permission commands
- **Learning**: The permissions API returns `{ rules: [...] }` not `{ policies: [...] }`, and the add policy endpoint requires `id`, `toolName`, `behavior`, and `priority` (all required fields per Zod schema), not the simpler `action`/`pattern` that the CLI spec assumed. The resolve endpoint uses `{ behavior: "allow"|"deny" }` not `{ allow: boolean }`. Always read the actual route handler code before implementing CLI commands.
- **Impact**: All CLI commands must be validated against the actual API Zod schemas. The CLI adapts user-friendly flags (--action, --pattern) into the API-required shape (behavior, toolName, auto-generated id).

### 2026-04-04 - commander --no-color creates an inverted boolean (color: true by default)
- **Context**: Phase 11 Task 11.1 CLI scaffold
- **Learning**: Commander.js handles `--no-X` flags by creating a boolean option `X` that defaults to `true` and is set to `false` when the flag is used. So `--no-color` results in `opts().color === false`. When checking for noColor in output, use `!opts.color` rather than `opts.noColor`.
- **Impact**: Output formatting must check `!globalOpts.color` for the noColor condition.

### 2026-04-04 - Chokidar v5 API changes from v3/v4
- **Context**: Phase 12 Real-Time Sync
- **Learning**: Chokidar v5 uses named exports (`import { watch, FSWatcher } from "chokidar"`) instead of default export (`import chokidar from "chokidar"`). The `disableGlobbing` option was removed. `FSWatcher` extends Node's `EventEmitter` with typed event maps. The error event handler receives `unknown` not `Error`.
- **Impact**: Must use named imports and check v5 API for available options.

### 2026-04-04 - Config watcher needs initial scan tracking for new-file detection
- **Context**: Phase 12 Task 12.2 Config watcher
- **Learning**: When scanning directories for changes via polling, we need to distinguish between the initial scan (populate known files without emitting events) and subsequent scans (emit "created" events for newly found files). Without this distinction, every file appears as "new" on the first poll after restart, causing spurious events.
- **Impact**: Track `initialScanDone` flag; only emit creation events after the first scan completes.

### 2026-04-04 - Glob expansion needed for polling fallback
- **Context**: Phase 12 Task 12.2 Config watcher
- **Learning**: Chokidar handles glob patterns natively for its fs.watch-based detection, but the polling fallback needs to manually expand glob patterns like `*.md` and `*/SKILL.md` by reading directories. Without this, the poll-based scanner only checks literal file paths and misses new files matching glob patterns.
- **Impact**: Implemented `expandGlobs()` method that handles `dir/*.ext` and `dir/*/file` patterns for the polling scanner.

### 2026-04-06 - OpenAPI 3.1 uses JSON Schema null unions, not `nullable`
- **Context**: Docs API spec compliance work
- **Learning**: Redocly lint rejects OpenAPI 3.1 schemas that still use the OpenAPI 3.0-style `nullable: true` keyword in component schemas. In 3.1, nullable fields should be expressed with JSON Schema unions such as `"type": ["string", "null"]` or `"type": ["number", "null"]`.
- **Impact**: Hand-authored OpenAPI specs in this repo should use JSON Schema null unions so `npm run validate:openapi` passes.

### 2026-04-06 - Async specs must document emitted events, not just typed possibilities
- **Context**: Docs API spec compliance work
- **Learning**: It is easy for documentation and hand-authored AsyncAPI files to drift toward "events the codebase has types for" instead of "events the runtime actually emits." In this case, `permission:pending` existed in docs/spec text but had no broadcaster wiring.
- **Impact**: When documenting WebSocket or hook protocols, verify against the actual broadcast/dispatch paths in `src/api/websocket.ts` and `src/main.ts`, not just shared TypeScript unions.

### 2026-04-06 - Current Mint config expects API specs under `api`, not top-level `openapi`
- **Context**: Docs API spec compliance work
- **Learning**: The current Mint CLI validates API specs from the `api.openapi` and `api.asyncapi` fields in `docs.json`. A legacy top-level `openapi` key can cause `mint validate` to misinterpret the config and fail even when the spec file itself is valid.
- **Impact**: Keep API spec wiring in `docs-site/docs.json` under the `api` object, and use `mint validate` as the working docs verification command.

### 2026-04-06 - CLI WebSocket handlers must be registered before sending launch/resume
- **Context**: CLI/WebSocket session streaming alignment
- **Learning**: The CLI's `sessions launch --stream` and `sessions resume --stream` paths were missing early stream output because they sent the WebSocket `launch`/`resume` message before registering the message handler. Fast servers or deterministic test doubles can emit `session:stream` immediately, so the handler must be attached first.
- **Impact**: For streaming CLI flows, register `onMessage` before calling `subscribe()` or `send()`.

### 2026-04-06 - Broadcaster wildcard patterns are one-way
- **Context**: CLI/WebSocket session streaming alignment
- **Learning**: The WebSocket broadcaster matches exact subscriptions and `prefix:*` wildcards against the emitted broadcast pattern. A client subscribed to `session:completed` will NOT automatically receive a message broadcast as `session:*`; only clients subscribed to `session:*` or `*` will.
- **Impact**: CLI listeners that need all session lifecycle events should subscribe to `session:*`, not a hand-picked set of exact session event names.

### 2026-04-06 - Redocly accepts a shared 4XX response per operation
- **Context**: Docs API spec cleanup
- **Learning**: Redocly's `operation-4xx-response` warning is satisfied by adding a `4XX` response entry to each operation, and that response can point at a shared reusable component. This keeps the spec compact while still clearing the lint warning.
- **Impact**: Future OpenAPI maintenance can use a single reusable 4XX response component instead of duplicating the same error schema on every route.

### 2026-04-06 - CardGroup cols=1 is the simplest stacked layout
- **Context**: Docs introduction layout cleanup
- **Learning**: The Mintlify `CardGroup` component keeps the same card styling while stacking vertically when `cols={1}` is used.
- **Impact**: For “same content, stacked instead of side-by-side” docs changes, `CardGroup cols={1}` is a low-risk option.

### 2026-04-06 - Mintlify Mermaid rendering is destructive to source blocks
- **Context**: Docs diagram cleanup
- **Learning**: The `render-diagrams.ts` step does not leave Mermaid fences in `docs-site/*.mdx`. It renders Mermaid to SVG under `docs-site/images/diagrams/` and replaces the original code block with an `<img>` tag in-place.
- **Impact**: For published docs, Mermaid-backed diagrams should be treated as generated assets in the committed MDX, and future edits need to account for the corresponding SVG outputs as part of the docs build workflow.

### 2026-04-06 - Claude resource exposure needs both filesystem and SDK views
- **Context**: Config inventory expansion for Claude Code skills/plugins/agents
- **Learning**: Raw filesystem discovery and effective Claude availability diverge in practice. On this machine, `agent-sdk-dev` is installed as a plugin that contributes legacy `commands/` and `agents/`, while the SDK `system/init` inventory reports the actually loaded `slash_commands`, `skills`, `plugins`, and `agents` for the current project. The SDK also surfaces plugin-qualified names such as `plugin-dev:agent-creator`, which do not fall out of plain `.claude/skills` scans.
- **Impact**: Middleware exposure should keep two layers: filesystem inventory for what's installed on disk, and SDK runtime inventory for what Claude currently loads in a project/session. Plugin component discovery should honor manifest-declared component paths, not just default `skills/`, `commands/`, and `agents/` directories.

### 2026-04-06 - Marketplace plugins can come from `plugins/` or `external_plugins/`
- **Context**: Config marketplace inventory expansion
- **Learning**: Claude marketplace install locations can contain first-party plugin sources under `plugins/` and third-party or externally sourced plugins under `external_plugins/`. Installed plugin metadata should not assume a single source directory when trying to map cache installs back to marketplace sources.
- **Impact**: Marketplace inventory and installed-plugin source resolution should scan both directory roots so middleware callers can see the real source path and distinguish marketplace-provided versus external marketplace entries.

### 2026-04-06 - Claude config E2E tests need a fake HOME for determinism
- **Context**: Config API and plugin reader verification
- **Learning**: Tests that read `~/.claude.json`, `~/.claude/settings.json`, or plugin registries become machine-dependent unless they seed an isolated home directory. Runtime inventory can still use the real SDK, but filesystem config tests should not inherit a developer's live plugin state.
- **Impact**: Config-focused E2E suites should set `HOME`/`USERPROFILE` to a temp fixture, create the minimum Claude config tree there, and assert against that seeded data rather than the host machine.

### 2026-04-06 - Installed, available, and active Claude plugins are different inventories
- **Context**: Researching exact middleware exposure and management semantics
- **Learning**: Claude's plugin system has at least three materially different views: installed plugins (`installed_plugins.json` / `claude plugin list --json`), currently available marketplace plugins (`claude plugin list --json --available`), and runtime-loaded plugin resources (Agent SDK init / `claude agents`). On this machine, `agent-sdk-dev`, `plugin-dev`, and `skill-creator` are installed and runtime-active, but not present in the current available marketplace catalog.
- **Impact**: The middleware should not collapse plugin state into a single endpoint. It should expose installed inventory, marketplace catalog, and runtime-loaded resources separately, and management actions should target the declarative/CLI surface appropriate to each one.

### 2026-04-06 - Config API usage tests should use Fastify inject, not a real listener
- **Context**: Verifying Claude config and plugin management routes in the desktop sandbox
- **Learning**: `tests/e2e/api-config.test.ts` does not need a bound TCP port to prove API behavior. Using `server.app.inject()` preserves route/middleware/Zod behavior while avoiding sandbox `listen EPERM` failures, and it still allows realistic usage tests against the management endpoints.
- **Impact**: Config API E2E tests should stay in-process unless they specifically need network semantics. This keeps verification reliable in sandboxed environments.

### 2026-04-06 - Fake-Claude fixtures are the right level for management route verification
- **Context**: Testing plugin install/update/uninstall and marketplace add/update/remove routes
- **Learning**: For configuration management, the important verification is that the middleware validates input, calls the right Claude CLI command, and returns the result or surfaced CLI error. A temp fake `claude` binary plus invocation log gives deterministic coverage for those usage paths without mutating a developer's real `~/.claude` state.
- **Impact**: Keep filesystem inventory tests, runtime SDK tests, and CLI-backed management tests as three separate verification layers rather than trying to force one test style to cover everything.

### 2026-04-06 - `~/.claude.json` should only expose a tiny writable allowlist
- **Context**: Adding management support for documented global Claude preferences
- **Learning**: The global state file contains a mix of safe user preferences, ephemeral metrics, project trust state, caches, and internal runtime data. Treating it like a generic writable JSON document would make the middleware too risky. The practical contract is to allow writes only for the documented preference keys and keep everything else read-only/sanitized.
- **Impact**: Global config management should use an allowlist with per-key type validation instead of reusing the generic settings writer.

### 2026-04-06 - Plugin provenance needs settings precedence, not just any `true`
- **Context**: Explaining why a plugin is installed but inactive
- **Learning**: It is not enough to ask whether a plugin appears anywhere in `enabledPlugins`. User, project, and local settings can all declare the same plugin with later scopes overriding earlier ones. The provenance layer needs per-scope declarations plus the final effective scope to explain why the plugin ended up enabled or disabled.
- **Impact**: Middleware callers should consume both `enablementSources` and `enabledSourceScope` when explaining plugin state, especially for debugging project-local overrides.

### 2026-04-07 - A local middleware playground works best as a separate proxied app
- **Context**: Building a shadcn-based verification dashboard without disturbing the API server
- **Learning**: The repo's backend `tsconfig.json` only compiles `src/`, so a separate `playground/` Vite app can be added without complicating the middleware build. Using Vite proxying keeps the browser on the same origin path shape (`/api`, `/health`, `/api/v1/ws`) while avoiding CORS work and still exercising the real middleware.
- **Impact**: UI-only verification surfaces should live in their own app folder with explicit scripts like `playground:dev` and `playground:build`, rather than being forced into the API server or the backend TypeScript compilation path.

### 2026-04-07 - Session and hook proofs need different demo surfaces
- **Context**: Deciding what the playground should verify directly
- **Learning**: The middleware's WebSocket path is ideal for proving session lifecycle and streaming behavior because it can launch a small demo run itself. Hook-event proof is different: those events only appear when the middleware event bus receives external hook traffic, so the right UI is a live subscription/log with clear guidance, not a fake self-contained simulation.
- **Impact**: The playground should include an active session stream demo, but hook verification should be framed as a live monitor for real plugin or hook-server traffic rather than a mocked example.

### 2026-04-07 - Session discovery and session search are separate truths in the playground
- **Context**: Clarifying whether the playground "indexes my existing Claude sessions"
- **Learning**: `GET /api/v1/sessions` reflects Claude's filesystem discovery immediately, but `GET /api/v1/search` only reflects what the SQLite store has indexed. Because the startup flow wires `SessionWatcher.start()` before the `AutoIndexer` subscribes, older session files may be visible in the recent-sessions list without yet being searchable until a manual reindex or later file change occurs.
- **Impact**: The playground should show both numbers side by side, explain the distinction in-product, and offer a direct `Reindex existing sessions` action instead of implying that search coverage is automatic.

### 2026-04-07 - The right visual cleanup for this playground is "operator docs", not "dashboard cards"
- **Context**: Refining the local demo UI to feel closer to Mintlify and easier to navigate
- **Learning**: A card-heavy dashboard made the verification flow feel noisier than the underlying logic. A calmer layout built from a sticky sidebar, section dividers, linear lists, and restrained shadcn controls makes the relationships between discovery, search, realtime activity, teams, and runtime state much easier to scan.
- **Impact**: Keep the playground biased toward linear sections and list/detail patterns, and reserve boxed treatments for surfaces that are truly console-like, such as the event log.

### 2026-04-07 - Stripe's API docs pattern translates well as "endpoint rail + sticky test pane"
- **Context**: Using Stripe's interactive API documentation style as a layout reference for the local playground
- **Learning**: The most reusable part of Stripe's current docs experience is not the visual polish alone, but the structure: explicit method/path context, a persistent "try it" control surface, and a separate response-reading area. That structure adapts cleanly to middleware proofs such as session search and WebSocket launch testing.
- **Impact**: Future playground sections should keep endpoint labels visible, keep runnable controls anchored in a side pane on desktop, and let logs/results occupy the main reading column so the page still feels like documentation instead of an admin dashboard.

### 2026-04-07 - Sidebar utility content competes with docs-style navigation
- **Context**: Tightening the playground information architecture after the initial redesign
- **Learning**: Once the main content is structured like an API reference, sidebar status widgets and utility controls start to work against the mental model. A cleaner result comes from treating the sidebar like a table of contents and moving live operational details into dedicated sections in the document flow.
- **Impact**: Keep the sidebar limited to section navigation, and surface proof state, sync counters, and import status in the body where they can be explained alongside the relevant endpoints.

### 2026-04-07 - The Stripe-like shell works better when the right rail is page-structural, not ad hoc
- **Context**: Evolving the playground from stacked section widgets into a full-screen documentation surface
- **Learning**: The content reads much closer to a Stripe-style docs page when the layout itself establishes three roles: left navigation, center explanation, and right example/result rail. Keeping that right rail visually consistent across sections makes the runnable UI feel intentional instead of like extra controls appended to the docs.
- **Impact**: Prefer a full-screen docs shell with a stable left nav and a clearly separated right rail for request controls and JSON results whenever we add new playground sections.

### 2026-04-07 - Claude sidechains are nested transcript files that reuse the parent session ID
- **Context**: Fixing historical session backfills for large Claude Code workspaces
- **Learning**: Claude stores subagent work under `~/.claude/projects/<encoded-cwd>/<session-id>/subagents/*.jsonl`, but those files still carry the root `sessionId` in their entries instead of introducing a new child session ID. The SDK's `listSessions()` view still reports the root sessions correctly, but `getSessionMessages()` does not expose the sidechain metadata we need for relationship-aware indexing.
- **Impact**: Historical imports should treat sidechains as extra transcript segments attached to the parent session, merge their user/assistant messages during indexing, and persist separate relationship metadata if we want to reason about subagent lineage later.

### 2026-04-07 - `listSessions()` already returns the full root-session set when `limit` is omitted
- **Context**: Investigating why only 1000 sessions had been indexed
- **Learning**: The missing sessions were caused by our own `limit: 1000` calls, not by an SDK ceiling. On this machine, `listSessions()` with no limit returned all `1422` root sessions, which matched a clean reindex exactly.
- **Impact**: Full historical imports and accurate `/api/v1/sessions` totals should avoid synthetic caps unless the caller explicitly asks for one.

### 2026-04-07 - Session watchers should recurse, but startup scans should stay silent
- **Context**: Making auto-indexing cover `subagents/*.jsonl` without replaying the whole disk as "new"
- **Learning**: Recursive watching is necessary because sidechains live below the root session file, but emitting `session:discovered` during the initial watcher scan causes noisy startup behavior and duplicates any explicit startup backfill. The right split is: silent initial inventory, then realtime discovered/updated/removed events afterward.
- **Impact**: Keep session watchers recursive, map subagent file paths back to the root session ID, and rely on an explicit startup full/incremental index pass for existing files rather than trying to infer backfills from watcher startup events.

### 2026-04-07 - Expanding session FTS requires explicit legacy-table rebuilds and app-side highlights are more stable
- **Context**: Adding renamed session titles and project-identifying metadata to session search
- **Learning**: SQLite FTS5 virtual tables do not pick up added columns from `CREATE TABLE IF NOT EXISTS`, so widening the indexed session surface requires checking the existing `sessions_fts` schema and rebuilding it in place for older databases. After that expansion, relying on SQLite's `highlight(...)` output became brittle across the wider field set, while generating highlights in application code kept the search response stable.
- **Impact**: Future search-schema changes should ship with an explicit FTS migration path, and response formatting like match highlights should stay decoupled from the underlying SQLite snippet behavior when we need predictable API output.

### 2026-04-07 - Session lineage needs a hybrid of transcript evidence and live team config
- **Context**: Exposing whether search hits involve ordinary root sessions, subagent sidechains, or experimental team teammates
- **Learning**: Claude's sidechain transcripts reliably expose subagent identity (`agentId`, `slug`, `sourceToolAssistantUUID`), but team labels are not guaranteed to be present in every transcript. The best search result shape comes from storing whatever lineage the transcript proves, then enriching missing team names from the current `~/.claude/teams` registry at response time.
- **Impact**: Keep search results lineage-aware by default, avoid inventing synthetic child session IDs for sidechains that reuse the parent `sessionId`, and treat current team configs as enrichment rather than the sole source of truth for historical lineage.

### 2026-04-07 - Session-type filters belong on the indexed catalog, not raw disk discovery
- **Context**: Adding playground controls to separate main sessions, subagent sessions, and team-backed sessions
- **Learning**: Raw `listSessions()` output is good for immediate filesystem discovery, but it does not carry enough lineage context to reliably distinguish standalone sessions from sessions with sidechain or team activity. Those filters need to run against the indexed catalog where transcript-derived relationships and team enrichment are available.
- **Impact**: Keep the playground's raw disk list focused on filesystem metadata, and put session-scope filters (`standalone`, `subagent`, `team`) on `/api/v1/search` where the middleware can apply lineage-aware filtering consistently.

### 2026-04-07 - Frontends need a merged session catalog, not ad hoc joins between raw and indexed APIs
- **Context**: Adding directory grouping and making the session surface easier for a realtime UI to consume
- **Learning**: Filesystem discovery and the SQLite index answer different questions. Discovery is the freshest source for existence, cwd, titles, and branches, while the index is the only place that currently knows lineage, team hints, and indexed message counts. Asking clients to join those separately makes the contract fragile and pushes middleware-specific logic into the UI.
- **Impact**: Prefer exposing a merged session catalog from the middleware, then derive grouped views like exact-cwd directories from that catalog. WebSocket session/team events should act as invalidation signals that tell the frontend when to refresh the catalog, rather than requiring the client to reconstruct lineage on its own.

### 2026-04-07 - Subagents should render as nested lineage rows, not fake sibling sessions
- **Context**: Refining the playground session explorer to make parent/subagent relationships easier to read
- **Learning**: The middleware's current lineage model attaches subagent transcript relationships to the parent session rather than representing them as standalone sessions with their own independent summaries and metadata. For UI purposes, pretending those relationships are ordinary sibling sessions is more confusing than helpful.
- **Impact**: Session explorers should show the parent session as the primary row and render `lineage.relationships` as collapsible child rows beneath it, reusing the same metadata layout for consistency while making it clear that the child records are sidechains of the parent session.

### 2026-04-07 - Linear-style session lists need one dominant line and one quiet metadata plane
- **Context**: Compacting the playground session explorer into a cleaner list surface
- **Learning**: The session list became noticeably easier to scan once each parent row had a single dominant line for the title, a muted inline session ID, and a small project badge on the next line. Repeating preview text under every row diluted the hierarchy and made the explorer feel heavier than the information required.
- **Impact**: Keep the main session rows compact: title first, identity second, metadata in a restrained grid, and only show deeper context when the user expands a subagent section or opens a response payload in the right rail.

### 2026-04-07 - Session metadata works best as a tiny schema registry plus per-session values
- **Context**: Adding a way to register extra searchable properties like workflow, owner, and environment without hard-coding every field into the session model
- **Learning**: A two-table model is enough for the current middleware contract: one table for metadata definitions (`key`, `label`, search/filter flags) and one table for per-session values. That keeps the API explicit for frontends, lets the store expose metadata uniformly on search/catalog responses, and avoids inventing a generalized dynamic-schema system too early.
- **Impact**: Keep session metadata string-only for now, expose definitions and values as first-class API objects, and use definition-level `searchable`/`filterable` flags to control how metadata participates in search and explorer filters.

### 2026-04-07 - Metadata-aware search can be layered onto the existing session index without a second FTS table
- **Context**: Making `/api/v1/search` understand registered metadata values in addition to the core session fields
- **Learning**: The most practical approach was to keep the existing session FTS for canonical fields, then merge in searchable metadata matches in application code and apply lineage/team/metadata filters in one post-filter pass. For the current dataset size, that keeps the response shape stable and avoids prematurely introducing more SQLite virtual tables or trigger complexity.
- **Impact**: Continue treating metadata search as an overlay on top of the core index until there is a proven scale or ranking problem. If metadata usage grows significantly, we can revisit a dedicated metadata FTS path later.

### 2026-04-07 - Stripe-like playgrounds need nested docs navigation plus runnable examples, not more dashboard panels
- **Context**: Reorganizing the local playground so it can teach and verify the middleware contract instead of just displaying API snapshots
- **Learning**: The UI became much easier to navigate once the sidebar behaved like documentation with expandable subsections and the right rail focused on examples and raw responses. The moment example actions were attached to real API routes, the playground stopped feeling like a status dashboard and started behaving like a local API workbench.
- **Impact**: Keep the playground organized as a docs shell: subsection anchors on the left, explanatory content in the center, and the right rail reserved for small test actions plus payload inspection. New middleware surfaces should ship with at least one concrete example flow in the UI.

### 2026-04-07 - A compact overview works better as stat tiles than narrative lists
- **Context**: Cleaning up the overview/status area after the playground accumulated too much vertically stacked explanatory content
- **Learning**: The health/status/bootstrap section did not need a full linear-document treatment. It became much more readable once the top-level state was compressed into small stats tiles and the descriptive context moved into the right rail where it competes less with the actual operational numbers.
- **Impact**: Treat overview pages as orientation surfaces: lead with compact stats, then keep explanations and operational actions secondary. Save longer linear lists for pages where the user is actually inspecting records or payloads.

### 2026-04-07 - Page-based docs shells are easier to maintain than a single giant playground document
- **Context**: Splitting the playground after `playground/src/app.tsx` grew to nearly 2800 lines and every new feature lengthened the same file
- **Learning**: Once the UI crossed a certain size, keeping everything on one page created two problems at the same time: the browser experience felt like a long dump of sections, and the code became one monolithic React file with too many responsibilities. Moving to hash-routed page views plus extracted page/components/types modules improved both the user flow and the code structure at once.
- **Impact**: Keep the playground as a small shell that owns data loading and routing, and push page rendering into page modules with shared presentation components. New features should usually add a page section or page module, not expand a single all-purpose app file indefinitely.

### 2026-04-07 - Compact stats read better as one divided strip than as four mini cards
- **Context**: Tightening the playground overview after the first compact-stats refactor still felt too boxy
- **Learning**: Even when the content is already condensed, separate stat tiles still read like a mini dashboard mosaic. A single spanning surface with subtle internal dividers feels closer to documentation UI, reduces visual noise, and makes the stats feel like one coherent status read instead of four competing widgets.
- **Impact**: For lightweight orientation metrics, prefer one merged stat strip with restrained spacing over individual card treatments. Reserve standalone cards for places where each block needs its own interaction or independent emphasis.

### 2026-04-07 - Once a compact stat pattern works, reuse it across every summary page
- **Context**: The overview had already moved to a cleaner stat strip, but imports and runtime were still using taller row summaries
- **Learning**: Mixing summary patterns page to page makes the playground feel less intentional. Once the stat strip was tightened further, the imports and runtime pages immediately felt more consistent when they adopted the same compact surface instead of bespoke row stacks.
- **Impact**: Keep page summaries standardized: use the compact stat strip for high-level telemetry on overview, imports, runtime, and similar future pages. Save linear row lists for records, catalogs, and entity detail views rather than page-level metrics.

### 2026-04-07 - Endpoint lists work better as a page outline than as a banner inside the content flow
- **Context**: Cleaning up the playground page anatomy after moving to a multi-page shell
- **Learning**: A top-of-page endpoint strip still consumed prime content space and duplicated the job of the right rail. The layout became easier to scan once the right column took over as a documentation-style outline with operations first and section anchors second, while the runnable API controls moved into the exact section they validate.
- **Impact**: For this playground, treat the right rail as navigation and orientation only. Keep operations and anchors there, and place "try the API" UI inside the main content next to the corresponding record, stats, or payload section.

### 2026-04-07 - Compact top control bars work better than either rails or stacked example panels
- **Context**: Tightening the playground again after the right-rail TOC pass still left too much horizontal structure and too many roomy example blocks
- **Learning**: Once the left navigation already handles page movement, the best next step is not another rail, but a compact command bar inside the page content itself. Native selects plus a single action button are enough for examples, and they keep the page feeling like one workspace instead of content surrounded by support panels.
- **Impact**: Keep the left nav narrow and dedicated to navigation. Put page actions at the top of the content in compact toolbars, prefer dropdown-based quick examples over stacked example cards, and avoid adding secondary right-side columns unless a page truly needs an inspector.

### 2026-04-07 - A narrow endpoint rail still helps when it stays purely navigational
- **Context**: After removing the right rails entirely, the compact toolbars felt better, but the API pages lost some of the docs-style orientation the user still wanted.
- **Learning**: The right column works when it is treated as a lightweight index, not a workspace. A slim sticky rail listing endpoints and in-page anchors complements compact inline controls, while a second interactive sidebar competes with the content.
- **Impact**: Keep examples, search, reindex, and payload switches in the main content. If a right rail exists, limit it to endpoint and section navigation so the page still reads like a Stripe-style docs surface rather than a three-panel app.

### 2026-04-07 - Quick examples can live in the right rail if they stay compact and secondary
- **Context**: Final pass on the playground rail after the user asked for both endpoints and examples on the right.
- **Learning**: Examples do not have to stay inline as long as the rail keeps a strict order and hierarchy. Putting endpoints first, quick example runners second, and section anchors last preserves the docs feel while keeping the content column focused on the actual working controls and responses.
- **Impact**: Treat the right rail as a compact utility stack: endpoint list at the top, example selectors beneath it, and page anchors after that. Avoid moving the real primary controls out of the main content, but let quick example presets live in the sidebar.

### 2026-04-07 - Sidebar width and rail breakpoint need to move together
- **Context**: Fine-tuning the docs shell after adding both a left nav and a right utility rail.
- **Learning**: Narrowing the left nav alone is not enough; the breakpoint for the right rail should shift with it. Once the left column dropped by about 30px, the right rail could appear on somewhat narrower screens without crowding the content.
- **Impact**: Treat shell widths and rail visibility as a pair. When tightening one sidebar, revisit the breakpoint for the opposite rail instead of leaving the old threshold in place.

### 2026-04-07 - The center column can usually collapse further than expected in docs-style layouts
- **Context**: Another shell pass after the user asked to reduce the minimum width before hiding the right rail.
- **Learning**: With a narrow left nav and a compact utility rail, the center column can stay readable at a smaller width than the first conservative breakpoint suggests. Lowering the rail threshold and slightly reducing the inter-column gap preserved the layout without making the content feel cramped.
- **Impact**: Bias toward smaller center-column minimums before hiding the right rail. Use the page content itself as the readability check, not an overly cautious shell breakpoint.

### 2026-04-07 - Once examples move into the right rail, that rail needs more width than a plain TOC
- **Context**: Final shell adjustment after moving both endpoints and example runners into the right sidebar.
- **Learning**: A narrow right rail works for anchors alone, but it starts to feel cramped once it also carries example selectors and button controls. Giving the rail a bit more width improves scanability without having to expand the left navigation or redesign the page content.
- **Impact**: Size the right rail for its actual job. If it contains interactive examples as well as endpoint links, give it more room than a minimal documentation TOC would need.

### 2026-04-07 - Runtime validation gets much more useful when “loaded” and “discovered” are shown together
- **Context**: Expanding the playground so it can validate the middleware’s tool and config exposure, not just show summary counts.
- **Learning**: A raw runtime JSON dump is not enough to validate the middleware. The useful comparison is between what Claude says is loaded right now and what the middleware independently discovered from config files and plugin registries. Once tools, commands, skills, plugins, MCP servers, and agents are rendered side by side, mismatches become obvious immediately.
- **Impact**: Treat the runtime page as a comparison surface, not just a debug payload. Pair `/api/v1/config/runtime` with the middleware discovery endpoints so the playground can validate both runtime truth and filesystem/config truth in one place.

### 2026-04-07 - The right rail needs comfortable width once it carries real examples
- **Context**: Another shell polish pass after expanding the playground’s runtime/config validation content.
- **Learning**: Once the right rail carries endpoint links, example selectors, and page anchors, a barely-wide-enough column still feels cramped even if it technically fits. A more generous width improves scanability and makes the examples feel intentional instead of squeezed.
- **Impact**: Favor a wider utility rail when it holds interactive validation controls. It is better to give that column enough space than to force dense wrapping that makes the docs shell feel busy.

### 2026-04-07 - Dense runtime inventories read better as compact tables than list rows
- **Context**: Polishing the runtime validation page after adding real tool and command inventory from the middleware.
- **Learning**: Tools and supported commands are reference data, not narrative content. When they were shown as side-by-side linear lists, the page felt heavier and harder to scan. Splitting them into separate sections and rendering them as compact tables made the runtime page feel much closer to an API reference.
- **Impact**: Use compact tables for dense, structured inventories like tools, commands, and similar middleware validation surfaces. Reserve linear lists for entity catalogs where each row needs more descriptive space.

### 2026-04-07 - Some runtime validation surfaces are strong enough to warrant their own pages
- **Context**: After turning tools and supported commands into cleaner sections, the next question was whether they still belonged inside the runtime overview at all.
- **Learning**: Once a surface becomes reference-heavy and operationally important, keeping it as one section of a broader page still makes the overview feel crowded. Giving tools and commands their own routed pages made the remaining runtime overview clearer and made those inventories easier to scan in isolation.
- **Impact**: When a section behaves like a standalone reference document, promote it into its own page instead of continuing to subdivide one large overview. Keep the overview for summary and cross-surface comparisons, and move dense inventories into dedicated routes.

### 2026-04-07 - Runtime reference tables should keep detail off the row itself
- **Context**: Final polish on the runtime pages after splitting tools and commands into dedicated views.
- **Learning**: Even compact tables get noisy fast if rows still carry full descriptions and paths. The cleaner pattern is terse columns with badges for state/scope, plus a side preview card that updates on hover or focus with the deeper detail. That keeps the table scannable without losing information.
- **Impact**: For runtime validation surfaces, keep rows short and badge-driven. Put descriptions, paths, feature lists, and other secondary metadata into a hover/focus preview card instead of the visible table cells.

### 2026-04-07 - Runtime inventory search works best as middleware routes, not client-side filtering
- **Context**: Expanding the playground from a runtime overview into dedicated pages for tools, commands, skills, plugins, MCP servers, agents, and models.
- **Learning**: Once each runtime inventory has its own page, local filtering inside React stops being a meaningful validation surface. The better contract is to expose dedicated searchable middleware routes for each runtime slice and let every page query those routes directly. That keeps the playground honest: it is proving the API shape and search behavior, not just rearranging one cached payload in the browser.
- **Impact**: Prefer endpoint-backed search for playground/resource tables that are supposed to validate middleware behavior. For dense reference tables, pair those routes with floating hover previews so detail stays available without consuming layout space or reintroducing verbose rows.

### 2026-04-08 - Compact reference tables read better when control rows follow the same scan direction
- **Context**: Final polish on the runtime resource pages after introducing searchable middleware-backed tables.
- **Learning**: Putting the search field on the right and the count badges on the left made the header feel backward relative to the table itself. The more natural API-reference pattern is search on the left, summary/count badges on the right, with both sitting directly above the table.
- **Impact**: Keep compact table control rows consistent with reading flow: query input on the left, summary metadata on the right. This makes dense validation surfaces feel calmer and easier to scan.

### 2026-04-08 - Searchable reference tables should not collapse during fetches
- **Context**: Polishing the runtime/resource pages after adding endpoint-backed search to each table.
- **Learning**: Replacing the whole table with a loading state makes the page jump and removes useful context exactly when someone is refining a query. A better pattern is to keep the search field, counts, and table shell visible, then place a lightweight spinner overlay over the table body while the middleware request is in flight.
- **Impact**: For searchable playground/reference tables, preserve layout during fetches. Use a loading overlay instead of swapping the whole surface for a generic loading block.

### 2026-04-08 - Sidebar density depends more on spacing rhythm than width alone
- **Context**: Tightening the playground's left navigation after several width and rail adjustments.
- **Learning**: A sidebar can still feel oversized even after narrowing the column if the top-level items keep roomy padding, larger text, and wide vertical gaps. The active left-border treatment also pulls more visual weight than a simple filled background. Smaller type, tighter spacing, and a background-only active state make the nav feel much cleaner without shrinking the column again.
- **Impact**: When compacting docs-style sidebars, reduce font size, padding, and stack gaps together, and prefer a filled active item over a decorative side border unless the brand system specifically needs that accent.

### 2026-04-08 - Runtime preview cards need to stay interactive if they carry actions
- **Context**: Adding a copy-to-clipboard action to the skill hover preview while keeping the runtime tables compact.
- **Learning**: A hover card that is rendered with `pointer-events: none` works for passive preview only, but it breaks immediately once the card needs a real action like copy. The better pattern is a hover-persistent floating popover that clears its hide timeout on enter, paired with a click-open drawer for full detail.
- **Impact**: If a preview card includes any action, make it a true interactive popover and keep the heavier detail in a separate drawer. This preserves table density without trapping useful controls inside non-interactive overlays.

### 2026-04-08 - Skills need a different detail balance than the rest of the runtime inventories
- **Context**: Polishing the runtime skills page after introducing shared hover previews and drawers across the runtime resource tables.
- **Learning**: For skills, badges add less value than the description and path. A cleaner preview is the skill name, a truncated description, and a truncated copyable path, while scope/source details can move into the drawer. That keeps the hover card useful without making it feel like a mini inspector.
- **Impact**: Treat skills as editorial metadata rather than state-heavy runtime objects. In compact tables, prioritize description and path in the preview, then move scope, source, marketplace, and the full description into the drawer.

### 2026-04-08 - Passive inventories should converge on one table system, but hierarchical explorers should not be flattened
- **Context**: Auditing the playground after the runtime pages had moved to the new compact table pattern while sessions, teams, and the runtime overview still had a few older list surfaces.
- **Learning**: Passive inventories like directory groups, agent registries, and resource indexes feel much more coherent once they all share the same compact table, hover preview, and drawer system. The exception is the session explorer tree: flattening parent sessions and nested subagents into a plain table would lose the structural relationship the page is supposed to demonstrate.
- **Impact**: Normalize read-only inventory sections onto the shared compact table pattern, but keep purpose-built hierarchical views when the tree itself is part of the product proof. Consistency is valuable, but not at the cost of hiding the core data model.
