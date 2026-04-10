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

### 2026-04-10 - The fastest doc-drift check is local history plus route registration, not the docs tree itself
- **Context**: Documentation refresh after the repo accumulated local commits ahead of `origin/main` for config expansion, dispatch automation, session detail, and playground work.
- **Learning**: The reliable way to spot stale docs was to diff the recent local history first, then compare those commits against `src/api/server.ts` and the concrete route/module registrations. That immediately exposed whole missing route families like dispatch and resource metadata, plus quieter drift such as new runtime inventory endpoints and dispatch websocket events.
- **Impact**: For future doc updates, start with `git log origin/main..HEAD` and the current server registration surface before editing markdown. Route registration and top-level module wiring are the quickest source of truth for API and architecture docs.

### 2026-04-08 - Low-signal transcript filters need canonical event keys, not exact raw strings
- **Context**: Session detail chat cleanup after `Last Prompt` rows kept repeating even though the frontend was already supposed to suppress that class of metadata event.
- **Learning**: The suppression logic only matched underscore-style keys like `last_prompt` and `queue_operation`, but the raw Claude transcript history often records these as hyphenated types such as `last-prompt` and `queue-operation`. Because the parser intentionally forwards raw `type`/`subtype` values, any client-side filter needs to canonicalize them first.
- **Impact**: Whenever we classify or suppress transcript events by name, normalize `type`/`subtype` keys up front by lowercasing and collapsing spaces/dashes/underscores to one canonical form. Otherwise the same event will leak through under slightly different spellings.

### 2026-04-08 - Transcript success states should land in the conversation, not in the composer chrome
- **Context**: Session detail chat fix after a sent message showed up both in the transcript and again as a success notice below the input.
- **Learning**: The session composer was reusing the raw session launch result as inline UI feedback, which meant the assistant’s actual reply appeared twice: once in the transcript where it belonged, and again beneath the input where it felt like a broken duplicate. Likewise, assistant turn headers were previewing the same response text that the body rendered below.
- **Impact**: For chat-like surfaces, successful sends should usually have no separate success panel. The transcript itself is the confirmation. Composer chrome should reserve inline notices for errors or blocked actions, and turn headers should not preview content that is already fully visible in the turn body.

### 2026-04-08 - Transcript renderers should not surface backend category names as user-facing copy
- **Context**: Session detail chat cleanup after screenshots showed rows like `Assistant / Assistant`, `Tag / Tag`, and fenced code blocks labeled `Markdown block`.
- **Learning**: Several transcript surfaces were faithfully rendering backend categories and normalized labels that were only meant to help the UI organize content. That preserved structure, but it also leaked implementation language into the chat and created duplicate headings. The better rule is to treat labels like `assistant_message`, `system_event`, or generic markdown block wrappers as internal scaffolding unless they add real meaning beyond the content itself.
- **Impact**: Future transcript UI work should default to content-first rendering. Event titles, variant labels, and block headers should only appear when they disambiguate the content; otherwise they should collapse into icons, metadata, or disappear entirely.

### 2026-04-08 - Craft's chat structure gets lost quickly if the presentation layer reintroduces panel chrome
- **Context**: Follow-up pass on the session detail chat after the first Craft-inspired transcript adaptation still felt card-heavy.
- **Learning**: We had already copied the right turn grammar from Craft, but the visual layer drifted because assistant turns, system notices, and the chat shell were still rendered as bordered panels with generous padding and badge-heavy headers. The result looked like an inspector made of cards instead of a transcript. The better translation was to keep the grouped-turn structure while rendering it with dividers, compact disclosure headers, inline metadata, and a continuous response flow.
- **Impact**: Future transcript and console surfaces should treat grouped turns as layout structure, not as permission to add more containers. If a message row still works after removing its box, keep it boxless.

### 2026-04-08 - Craft-style session chat works best as a turn grammar, not a component transplant
- **Context**: Adapting the session detail chat after studying Craft Agents OSS.
- **Learning**: The valuable part of Craft’s chat UI was not any one React component. It was the message grammar behind it: user messages render as isolated bubbles, system/error notices stay standalone, and everything between a user prompt and the final assistant answer gets folded into an assistant turn card with ordered activities plus one response. That pattern transferred cleanly to our normalized transcript model even though our data source and component stack are different.
- **Impact**: Future chat/detail work should preserve this separation of concerns. Keep normalization/grouping in a dedicated utility layer, and treat the rendered turn card as a projection of that grouped model rather than tightly coupling UI behavior to raw transcript events.

### 2026-04-08 - Session detail can expose a display model that is not safe to relaunch with
- **Context**: Playground multi-turn composer bug on the session detail page.
- **Learning**: The session detail contract may carry a model string that is useful for inspection but not valid as an SDK launch override, such as `<synthetic>`. Feeding that value back into resume/restart requests causes avoidable launch failures even though the underlying session can continue fine with the default runtime model resolution.
- **Impact**: Treat session-detail model values as display data unless they pass a launch-safe check. The shared SDK option builder should sanitize placeholder model identifiers so all launch paths stay resilient, and UI surfaces should avoid echoing synthetic model labels back to the API.

### 2026-04-08 - Multi-session dispatch needs store-level serialization, not worker-level conventions
- **Context**: Dispatch subsystem follow-up for handling multiple session-targeted jobs correctly.
- **Learning**: The safe place to enforce “different sessions may run in parallel, the same session may not” is the dispatch store claim/update path. Once `resume_session` and `fork_session` jobs derive a stable default concurrency key from `sessionId`, the worker can process claimed jobs in parallel without guessing which jobs are safe to overlap.
- **Impact**: Future dispatch sources should always preserve or derive a meaningful concurrency key before enqueue. Parallelism policy should stay data-driven at the store layer rather than being hard-coded into the worker.

### 2026-04-08 - Dispatch execution has to reuse the middleware launch path, not invent a second one
- **Context**: Post-plan dispatch subsystem work for queue jobs, cue-triggered follow-ons, cron schedules, and heartbeat rules.
- **Learning**: The robust seam was not “make a special queue runner that talks to the SDK directly.” The durable dispatch worker needed to reuse the same session-manager launch path, `canUseTool` permission bridge, and SDK hook bridge that the REST and WebSocket APIs use, otherwise queued work would immediately drift from middleware-owned sessions and lose hook visibility.
- **Impact**: Future dispatch features should extend the shared launch plumbing first. New queue sources or rule types should materialize jobs, then hand those jobs to the existing middleware execution path.

### 2026-04-08 - Timezone-aware cron scheduling is viable without a new dependency if minute-level scanning is acceptable
- **Context**: First cron-backed dispatch schedule implementation.
- **Learning**: For the current middleware scale, we were able to compute the next run of a standard 5-field cron expression by scanning minute boundaries and evaluating them in the schedule’s timezone via `Intl.DateTimeFormat`. That gave us correct timezone-aware scheduling without adding a third-party cron parser.
- **Impact**: This is a good first cut for local middleware workloads, but it also marks the scaling seam. If schedule volume grows or we need broader cron syntax, the next optimization target is the scheduler, not the queue store or executor.

### 2026-04-08 - Playground page-load regressions can hide in runtime-only icon imports
- **Context**: Session detail/theme-switcher polish follow-up after the playground stopped loading.
- **Learning**: A React page can still build cleanly while failing at runtime if UI icons are imported from the wrong module. In this case, the new sidebar theme switcher pulled `MoonStar` and `SunMedium` from `react` instead of `lucide-react`, which was enough to break page rendering even though the rest of the layout work was sound. The local Vite shell also looked worse because its proxy depends on the middleware still being reachable on `127.0.0.1:3000`.
- **Impact**: When a playground page suddenly blanks after UI polish, check runtime-only imports first, then confirm the dev proxy backend is alive before chasing larger layout bugs.

### 2026-04-08 - Theme toggles feel broken if the first paint ignores the saved mode
- **Context**: Follow-up verification on the new animated sidebar theme switcher.
- **Learning**: Even after the page-load crash was fixed, the theme switcher still felt unstable because the saved theme only applied inside React's `useEffect`, which meant the initial HTML could flash the default light palette before the app mounted. A tiny pre-paint bootstrap in `playground/index.html` solved that without changing the React state model.
- **Impact**: Any persistent theme control in the playground should set `data-theme` and `colorScheme` before mount, then let React take over for interactive updates.

### 2026-04-08 - Transcript UIs get much better once tool structure survives normalization
- **Context**: Session detail transcript overhaul for richer tool/task rendering.
- **Learning**: The raw session detail API already had enough structure for a strong transcript view, but the playground mapper was flattening tool uses, tool results, file writes, and todo updates back into generic text blocks. The biggest improvement came from preserving tool-specific structure in the normalized UI model with explicit `variant`, `fields`, `codeBlocks`, and `todoItems`, then letting the transcript renderer branch on those shapes.
- **Impact**: Future session-detail work should treat normalization as the main rendering seam. When new tools or result types arrive, extend the normalizer first so the UI can stay specialized instead of falling back to a plain string dump.

### 2026-04-08 - Claude's tagged transcript blobs are best rendered as normalized markdown, not raw HTML
- **Context**: Follow-up polish on session detail after reviewing command/task/error transcripts that contained tags like `<command-name>`, `<local-command-stdout>`, `<task-notification>`, and `<tool_use_error>`.
- **Learning**: Those strings are not really “plain text,” but they are also not trustworthy product HTML. The cleanest approach was to normalize the known Claude tags into markdown first, then render that through a controlled markdown component with custom code-block handling. That preserves semantics like command metadata, task notifications, and tool errors without opening the door to ad hoc raw-HTML rendering.
- **Impact**: When future transcript content introduces more Claude-specific tags, extend the markdown normalizer instead of adding one-off string formatting in the transcript component.

### 2026-04-08 - Turn headers need their own summary layer, or they will leak raw payloads
- **Context**: Review of session detail turns where the body rendered correctly but the turn header still showed raw `<task-notification>` XML-like blobs.
- **Learning**: Normalizing the message body is not enough if the turn preview still trusts backend `turn.summary` verbatim. The header needs to summarize the already-normalized message items, preferring structured command/task/tool summaries over the raw grouped transcript text.
- **Impact**: Keep turn-preview logic separate from backend turn text. If transcript rendering gets smarter, the turn-header summary should derive from the same normalized message model so the page does not regress into raw payload snippets at the overview layer.

### 2026-04-08 - Transcript history is rich enough to be the analytics source of truth
- **Context**: Phase 13 analytics planning and local session research
- **Learning**: Local Claude Code transcript history already contains much more than simple chat text. On this machine, raw session JSONL files include `compact_boundary` messages, `turn_duration` system records, API-error assistant messages, error tool results, queue operations, permission-mode changes, and sidechain/subagent transcripts with join fields such as `sourceToolAssistantUUID`, `agentId`, and `slug`.
- **Impact**: The analytics warehouse should be built from transcript backfill first. The current SQLite search index is too lossy for this purpose, but the raw JSONL history is sufficient for high-value backfill.

### 2026-04-08 - Claude Code OTel is enrichment, not the backbone
- **Context**: Phase 13 analytics planning and docs review
- **Learning**: Claude Code OpenTelemetry is useful for live `prompt.id` correlation, spans, and tool details, but it is opt-in and forward-looking. It is not a retroactive data source for historical sessions.
- **Impact**: The implementation should treat OTel as optional enrichment only. Core analytics correctness must not depend on OTel being enabled.

### 2026-04-08 - Middleware launch paths currently create analytics blind spots
- **Context**: Phase 13 analytics planning review
- **Learning**: The middleware creates an event bus and permission system at startup, but the REST and WebSocket launch/resume paths do not consistently pass that plumbing through to launched sessions. `PermissionRequest` also currently emits blank `session_id` and `cwd`, and the bundled plugin hook manifest forwards only a subset of analytics-relevant events.
- **Impact**: Phase 13 must include live capture hardening before analytics can be considered complete for middleware-launched or plugin-driven sessions.

### 2026-04-08 - Transcript-first backfill wants append-only raw tables and refreshable facts
- **Context**: Phase 13 Tasks 13.1-13.3 implementation
- **Learning**: The cleanest split so far has been to keep transcript import strictly append-only and idempotent at the raw layer, then derive query-friendly fact tables in a separate refresh step. That keeps backfill simple, makes re-derivation safe when parsing logic improves, and avoids coupling ingestion to every downstream metric experiment.
- **Impact**: Future analytics work should preserve the raw warehouse as the stable source of truth and treat rollups, keyword hits, and synthetic traces as rebuildable products.

### 2026-04-08 - DuckDB sink writes are easiest when JSON payloads stay opaque
- **Context**: Phase 13 transcript importer integration
- **Learning**: The current DuckDB Node binding was happiest when analytics import code wrote escaped SQL literals and cast JSON payload strings at insert time, instead of trying to parameterize arbitrary object values directly into `JSON` columns.
- **Impact**: New analytics sinks should keep payloads opaque, escape literals carefully, and reserve field extraction for the derive/query layer rather than trying to over-structure inserts.

### 2026-04-08 - Live analytics capture is only real once startup installs the sink
- **Context**: Phase 13 live capture hardening verification
- **Learning**: Recording helpers in the launcher, streaming layer, and permission handler are not sufficient on their own. The middleware only persists live SDK, hook, and permission data once `main.ts` brings up the DuckDB warehouse, installs the live sink, and flushes it on shutdown. Until launch paths also inject real `canUseTool` session context consistently, permission analytics still has a join-quality gap.
- **Impact**: Treat live analytics capture as a two-part feature: event emission plus startup/runtime wiring. Future refactors should verify both pieces before calling the path complete.

### 2026-04-08 - The analytics API can start on raw transcripts before rollups exist
- **Context**: Phase 13 analytics API foundation
- **Learning**: We do not need to block all analytics API work on a finished derived-facts layer. A useful first API can answer status, overview, time series, trace search, and backfill from raw transcript events, keyword matching, and conservative token/context estimates, while returning `501` cleanly when the analytics DB is unavailable.
- **Impact**: The backend can ship incrementally: raw-backed endpoints first, then upgrade them to fact-table and rollup queries as Task 13.5 lands.

### 2026-04-08 - Pricing lookups must fail loudly once model coverage matters
- **Context**: Phase 13 derived facts verification
- **Learning**: The new pricing helper intentionally returns `0` when a transcript model alias is not found in the local pricing table. That keeps refresh deterministic, but it also means cost analytics can silently undercount for new or unmapped Claude model IDs.
- **Impact**: Before cost charts become a primary developer signal, we should add explicit “unknown pricing coverage” surfacing or metadata so unpriced models are visible instead of silently treated as free.

### 2026-04-08 - Full rebuild derivation is a good first cut, but it is the scaling seam
- **Context**: Phase 13 derived facts verification
- **Learning**: The current derive refresh clears and repopulates every fact and rollup table on each run. That keeps the logic simple and correct for the current local phase, but it will become the main scaling pressure as transcript history grows.
- **Impact**: Future optimization work should focus on incremental derivation or partitioned refresh before tuning the API or UI queries.

### 2026-04-08 - Session-aware permission analytics still has an earliest-event edge case
- **Context**: Phase 13 live capture verification
- **Learning**: Middleware launch and streaming paths now attach `canUseTool` and update session context as soon as the SDK reveals the real session ID, but a permission request that fires before that first SDK session event can still record an empty `session_id`.
- **Impact**: The live analytics path is now good enough for normal middleware-launched sessions, but if we ever need perfect join coverage for the earliest permission checks, we should add a synthetic pre-session run key or upgrade the callback bridge to learn the session ID even earlier.

### 2026-04-08 - Detail analytics endpoints are much clearer on fact tables than raw unions
- **Context**: Phase 13 analytics API completion
- **Learning**: Overview-style endpoints can start from raw transcript unions, but trace detail, session detail, and facets become much simpler and more predictable once they query the derived fact and rollup tables instead. The warehouse refresh step paid off immediately in the API layer.
- **Impact**: Future analytics API and UI work should prefer fact-table queries by default and only fall back to raw events for niche drilldowns or debugging views.

### 2026-04-08 - Claude telemetry spill files hide the useful joins inside nested JSON strings
- **Context**: Phase 13 optional OTel enrichment
- **Learning**: The local `~/.claude/telemetry/*.json` spill files are not just flat event rows. Claude-specific fields such as `queryChainId`, `requestId`, `toolName`, and `costUSD` often live inside `event_data.additional_metadata` as a JSON-encoded string, so a useful importer has to parse that nested blob before it can recover trace-like joins or redact sensitive prompt/tool values correctly.
- **Impact**: Future telemetry work should treat embedded metadata parsing as a first-class normalization step rather than assuming top-level fields are sufficient.

### 2026-04-08 - Optional telemetry enrichment needs privacy-safe defaults at the importer boundary
- **Context**: Phase 13 optional OTel enrichment
- **Learning**: The safest place to enforce privacy is before telemetry payloads ever hit DuckDB. Redacting nested prompt/tool fields during import keeps the optional enrichment path useful for joins and counts while preventing accidental storage of raw prompt or tool-input content from local telemetry files.
- **Impact**: Any future telemetry/OTel ingestion path should stay opt-in and preserve the current default of redacting sensitive fields unless an explicit developer flag asks for raw payloads.

### 2026-04-08 - The first analytics UI slice should optimize for proof, not completeness
- **Context**: Phase 13 playground analytics view
- **Learning**: The new analytics page is strongest when it does a few things end-to-end: range selection, metric overlays, trace drilldown, and backfill refresh. That is enough to prove the backend contract and give developers something useful, even before the broader slice-and-dice control model exists.
- **Impact**: Ship the smallest coherent analytics surface first, then grow filters and comparison controls only after the core query and drilldown loop is reliable.

### 2026-04-08 - Analytics backfill UI should make default behavior explicit
- **Context**: Phase 13 playground analytics view
- **Learning**: The backfill action currently posts no body and intentionally relies on server defaults. That is fine for a first pass, but it can hide the fact that the backfill is not yet targeted by date range, session ID, or source scope.
- **Impact**: When we expand backfill controls, the UI should surface the default scope clearly and let operators choose a narrower import window without guessing what the server will do.

### 2026-04-08 - Large chart bundles are a warning sign, not a failure
- **Context**: Phase 13 playground analytics view verification
- **Learning**: `npm run playground:build` succeeds, but Vite warns about a large client chunk once the analytics charts and detail components are added. The bundle is still valid, but it is a useful signal that the next visual additions should be considered against code-splitting or lazy-loading.
- **Impact**: Keep an eye on analytics page bundle growth as more filters and chart layers land. If the page keeps expanding, split the heavy charting surface before the warning turns into a usability cost.

### 2026-04-08 - Session detail works best with a nested backend contract and a UI-side mapper
- **Context**: Dedicated session detail route and playground page
- **Learning**: The cleanest backend response for session detail is the truthful nested shape: `session`, `transcript`, `inspector`, and `lineage`, built directly from raw transcript files. The first frontend pass assumed a flatter payload and technically compiled, but it did not actually render the nested contract until a small normalization layer translated the raw transcript messages, tool uses/results, file changes, and inspector summaries into the page’s UI-friendly view model.
- **Impact**: Future rich detail pages should keep source-of-truth API responses explicit and stable, then normalize them at the playground boundary instead of flattening the backend prematurely for one surface.

### 2026-04-08 - Session detail feels stronger when the transcript is docked, not center stage
- **Context**: Session detail layout redesign after live UI review
- **Learning**: The first session-detail layout gave the transcript the full main canvas and pushed every other detail into an equally loud inspector stack. That made the page feel like two competing products at once. Docking the chat log into a tabbed right rail and calming the inspector into fewer utility tabs made the page read more like an actual developer workspace.
- **Impact**: For future detail views, default to one primary work surface plus one docked utility rail. Rich logs, traces, and transcripts should usually live in the rail unless the log itself is the main task.

### 2026-04-08 - Theme polish breaks down fastest where new UI skips the shared tokens
- **Context**: Session detail contrast cleanup and sidebar theme control refresh
- **Learning**: The dark/light theme system is only as good as the newest surface that actually uses it. The session-detail redesign still looked washed out in light mode because it mixed the shared theme variables with direct `slate` utility colors. The fix was not a new palette, it was reusing the existing token model consistently, including tabs, dividers, and secondary text.
- **Impact**: New playground surfaces should default to token-backed classes or CSS variables from the start. Hard-coded `slate` colors are fine for one-off prototypes, but they become the first contrast bug as soon as the page participates in both themes.

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

### 2026-04-08 - Metadata schema management needs its own interaction model, not an inline lab form
- **Context**: Cleaning up the sessions page after metadata support existed in the backend but was still exposed through a loose cluster of freeform inputs.
- **Learning**: Metadata fields behave like schema, not ad hoc notes. They are easier to understand and safer to manage when the schema itself lives in a compact table with usage counts and clear state badges, while create/edit/delete actions happen in a focused modal. Value assignment can stay inline because that is operational, but field management should feel distinct from per-session writes.
- **Impact**: Treat metadata definitions as first-class schema objects. Show them in a table, expose usage, searchable/filterable state, and lifecycle actions, and reserve modal editing for the definition contract. Keep session-level value application nearby but separate from field editing.

### 2026-04-08 - Explorer metadata should be shown as field/value tables, not collapsed into prose
- **Context**: Final pass on the sessions UI after the metadata schema section had moved to compact tables but the explorer still rendered metadata as a single summary string.
- **Learning**: Once the rest of the page speaks in compact tables, a sentence like `Workflow: delivery-review · Owner: platform` feels inconsistent and becomes harder to scan as more fields accumulate. A tiny inline table inside the explorer row keeps the field names legible and matches the rest of the interface without flattening the session hierarchy itself.
- **Impact**: When metadata is being listed, prefer a field/value table even in nested explorer layouts. Keep only summary badges in higher-level aggregates like directory groups; when actual field/value pairs are shown, render them as a table.

### 2026-04-08 - Generic resource metadata should sit under one store/API contract, with sessions as a compatibility wrapper
- **Context**: Extending metadata beyond sessions so runtime tools, skills, plugins, MCP servers, agents, models, and teams could all carry user-defined fields in the playground and future clients.
- **Learning**: Trying to keep adding special-case session-style metadata endpoints to each inventory would fragment the contract quickly. A cleaner model is a generic `(resourceType, resourceId, key)` metadata store and API, while the older session-specific endpoints stay alive as wrappers over `resourceType = session`. This preserves compatibility and avoids a second migration later.
- **Impact**: Prefer a generic resource metadata API for new inventories. Keep compatibility endpoints only where existing consumers already depend on them, and back those compatibility surfaces with the same generic data model.

### 2026-04-08 - Metadata UX scales better as one workspace per page than one mini-form per table
- **Context**: Bringing metadata management to the split runtime pages and the teams/agents page after the sessions page had already grown a more involved schema-management surface.
- **Learning**: Repeating a full schema editor and value form under every single table would make the docs-like pages tall and noisy. A better pattern is one compact metadata workspace per page that can switch between that page's inventories, keeping the schema table, modal editor, and selected-resource values together while still covering all resource sections on the page.
- **Impact**: For multi-inventory docs pages, group metadata management into a single inventory-aware workspace instead of duplicating the same controls under every table. This keeps coverage broad without overwhelming the page.

### 2026-04-08 - Claude team tasks need both an aggregated API and a per-team proof surface
- **Context**: The playground already exposed teams and their selected JSON payloads, but the underlying Claude task files were still effectively hidden unless someone inspected a single team's raw response.
- **Learning**: Team task files are much more useful when exposed in two layers: one aggregated `/api/v1/tasks` inventory for cross-team search/filtering and one per-team `/api/v1/teams/:name/tasks` proof surface for exact source validation. The aggregate route is what a frontend would actually consume for a task registry, while the per-team route proves how the underlying Claude team directory is read.
- **Impact**: When Claude stores resources in per-team or per-project buckets, expose both the normalized aggregate inventory and the source-scoped endpoint. The aggregate route should carry stable resource IDs and source-path metadata so clients can attach metadata and reconcile items cleanly.

### 2026-04-08 - Tasks should be visible inside the team workspace and not only on their own page
- **Context**: After promoting tasks into a dedicated page, there was still a UX gap on the Agents and teams page because tasks were only visible inside a selected team's raw JSON payload.
- **Learning**: A dedicated page is the right place for full search and metadata management, but the home surface for teams still needs a compact task table so people immediately see that tasks exist as structured data. Without that preview, the dedicated page feels disconnected from the team workspace that produces the data.
- **Impact**: For related surfaces like teams and tasks, use a layered approach: keep the full registry on its own page, but also add a compact preview table to the parent workspace so the relationship is obvious at a glance.

### 2026-04-08 - Sidebar hierarchy should follow the resource graph, not the implementation split
- **Context**: The playground had grown several dedicated pages, and the sidebar still reflected implementation buckets like "Agents and teams" instead of the way Claude data actually relates to sessions.
- **Learning**: Even if teams, tasks, and agents each deserve their own page, they read more naturally in navigation when they are grouped under Sessions, because that is the user’s mental model: sessions lead to teammate activity, task flow, and agent participation. Utility surfaces like imports and live feed feel cleaner when pushed into a separate block at the bottom rather than mixed into the primary data hierarchy.
- **Impact**: Organize docs-style sidebars around the object graph users are exploring, not around which page component owns the UI. Use a distinct lower utility block for operational tools so the main hierarchy stays focused on the data model.

### 2026-04-08 - Runtime and configuration need different page contracts
- **Context**: Splitting the playground’s Claude surfaces into a cleaner IA after runtime pages had started to mix active runtime state with discovered filesystem and registry state.
- **Learning**: “Runtime” and “configuration” sound similar, but they answer different operational questions. Runtime answers “what did Claude load for this cwd right now?” Configuration answers “what settings, files, registries, and guidance content exist or can be managed?” Mixing them on one page forces users to infer the contract from row labels instead of from the page model itself.
- **Impact**: Keep runtime pages runtime-only, create separate configuration pages for declarative/discovered surfaces, and use an overview page to explain which resource families have both views. When the playground offers search for config inventories, prefer backend `q=` filtering so the UI remains a direct proof surface for the middleware routes rather than a client-side demo layered on top of unfiltered endpoints.

### 2026-04-08 - Teams and agents need their own pages even when they relate closely to sessions
- **Context**: The sidebar had already been reorganized around session-related objects, but the actual page model still combined teams and agents into one surface while tasks and tools had dedicated pages.
- **Learning**: Relationship does not mean co-location. Teams, agents, tasks, and tools are all first-class browseable resources in the middleware, so they deserve dedicated pages with their own search, detail, metadata, and endpoint proofs. The sidebar can still group them together conceptually under a resource catalog without forcing them into one UI surface.
- **Impact**: Use the sidebar to express information architecture and the page model to express resource ownership. Group related resources together in nav, but still give each one its own page once it has its own endpoint family and metadata contract.

### 2026-04-08 - Metadata tables should behave like every other searchable inventory
- **Context**: After adding generic resource metadata, the playground still treated metadata as a special lab: the field/value tables lacked search, and the primary action to add a field lived in a separate toolbar instead of in the table header.
- **Learning**: Once metadata is part of the middleware contract, it should follow the same UX rules as the rest of the inventory surfaces. Search belongs on the left of the table header, counts and actions belong on the right, and server-backed `q=` filtering keeps the metadata workspace a true proof surface for the API rather than a local filter demo.
- **Impact**: Standardize metadata views on the shared compact table pattern. Add endpoint-level `q=` filtering for definitions and values, keep the `Add field` action in the metadata-fields header, and mirror this pattern anywhere a client would manage metadata for a first-class resource.

### 2026-04-08 - Session-linked resources need explicit session-scope filters, not just free-text search
- **Context**: The playground had split Teams, Agents, and Tasks into dedicated pages, but those pages still only offered free-text search even though users think about those resources in relation to particular Claude sessions.
- **Learning**: Teams and tasks map cleanly to sessions through indexed team lineage, while agents map through the session relationship identifiers actually present in Claude sidechain data (`agentId`, `slug`, teammate name). Exposing `sessionId` and `sessionIds` directly on the list endpoints gives clients a reliable way to pivot from sessions into related resources without reverse-engineering the join themselves.
- **Impact**: Treat session scoping as a first-class query capability on session-linked resource endpoints. Keep the filter explicit in both the API and the playground, and describe the agent matching contract in terms of real indexed relationship identifiers rather than implying a stronger join than the data supports.

### 2026-04-08 - The sidebar should stay session-first even after resources get dedicated pages
- **Context**: After introducing dedicated Teams and Agents pages, the sidebar had drifted toward a generic “resources” label even though sessions remain the primary navigation context in the middleware.
- **Learning**: A dedicated page and a top-level nav label solve different problems. The pages should stay resource-specific, but the primary hierarchy should still read from the user’s mental model outward: sessions first, then the resources attached to session work. Labeling the first child page as `Agent sessions` also clarifies that this is the Claude/Codex session surface rather than a generic database session list.
- **Impact**: Keep the main sidebar group labeled `Sessions`, put `Agent sessions` first, then list related resources like Teams, Agents, Tasks, and Tools beneath it. Use page titles and endpoint lists to express the exact API surface, but keep the top-level IA grounded in the session-centric workflow.

### 2026-04-08 - The sessions page should default to latest-session inventory, not a canned query
- **Context**: The sessions page still initialized with a hardcoded search string, which pushed the top section into indexed-search mode and often rendered an empty state instead of showing useful session data immediately.
- **Learning**: Resource pages should open on a believable default inventory. For sessions, that means the latest merged session list, with the search input embedded in the table header just like the other pages. The grouped directory tree is still useful, but it belongs as a secondary structural view, not the default first thing users see.
- **Impact**: Keep the default session query empty, show a compact latest-sessions table first, and treat search results as an overlay on the same table pattern. Reserve the directory-group/tree view for a separate section focused on structure rather than initial discovery.

### 2026-04-08 - Empty resource inventories should still render as tables
- **Context**: Even after standardizing most inventory pages on the compact table system, some resources like Teams, Tasks, and Agents still visually dropped back to the older placeholder block whenever the current query returned zero rows.
- **Learning**: The empty state is part of the table pattern, not an exception to it. Keeping the table shell visible preserves orientation: users still see the endpoint-backed search input, count badges, and column structure, which makes zero-result states feel like a filtered inventory instead of a broken or missing UI.
- **Impact**: Keep empty and error states inside the table body of the shared inventory component. Do not collapse searchable resource tables back into standalone placeholder panels when row count reaches zero.

### 2026-04-08 - Metadata management should live inside the metadata tables, not in a separate action panel
- **Context**: The shared resource metadata workspace still had a top-level `Metadata actions` block with forms for applying values, even after the rest of the playground had moved toward table-owned actions and modal workflows.
- **Learning**: Metadata behaves more like a small admin surface than a standalone form. The right pattern is: keep inventory/resource selection as slim context, let the metadata-fields table own field creation and field-level actions, let the selected-resource table own value-level actions, and route all mutations through row menus plus focused modals. That keeps the page calmer and makes the actions feel attached to the records they mutate.
- **Impact**: Remove standalone metadata action panels from the shared workspace. Put `Add field` in the field-table header, use 3-dot row menus for `Edit`, `Add value`, and `Remove`, and require confirmation input for destructive actions. Because the workspace is shared, one clean interaction model here propagates across all resource pages automatically.

### 2026-04-08 - Metadata pages should default to recent aggregate values, not a selected resource strip
- **Context**: After moving metadata mutations into table actions, the shared workspace still kept a page-level resource selector with badge/path context, which made the surface feel like a form instead of an inventory.
- **Learning**: A persistent selected-resource strip creates too much dead chrome and hides the more useful question: what metadata exists across this resource family right now? The calmer pattern is to list fields and recent values by default, keep inventory/resource narrowing in the table header, and only ask for an exact resource inside the modal that adds or edits a value.
- **Impact**: Shared metadata workspaces should use aggregate metadata-value listings with header filters and recent-first ordering. Resource selection should happen in the value modal, not as a permanent page-level control, so every metadata page reads like the rest of the middleware reference tables.

### 2026-04-08 - Sidebar hierarchy reads better when section labels and routes have different visual weights
- **Context**: The playground nav had started to treat top-level sections and child routes too similarly, which made the left rail feel heavier than the content and blurred the distinction between grouping labels and actual destination items.
- **Learning**: In a documentation-style shell, top-level groups should behave more like orientation labels: smaller, muted, and all-caps. The darker readable treatment belongs on the actual route items underneath. Active state should be expressed with a filled background on the selected item rather than with border accents or typography alone.
- **Impact**: Keep top-level sidebar items visually lightweight and child items visually actionable. Use background-only active states at both levels so the rail stays calm while still making the current location obvious.

### 2026-04-08 - Expandable group labels should not compete with selected route rows
- **Context**: After calming the sidebar, the remaining friction was that expanded top-level groups still looked a little too “selected,” and child hover states were falling back toward white instead of reinforcing the active-color system.
- **Learning**: In a nested docs nav, expandable group labels and leaf destinations should not share the same state language. Group labels should stay quiet and mostly structural, while only the child rows should use the stronger filled active state. Hovering a child row should feel like a softer version of that same state, not a different white-surface pattern.
- **Impact**: Keep top-level labels small and muted with no true active fill, use the filled selection state only for child routes, and derive child hover from the active tint at lower opacity. This preserves hierarchy and makes the rail easier to scan quickly.

### 2026-04-08 - Shorter nav labels are better than a wider rail
- **Context**: After narrowing the sidebar and reducing child indentation, a few route labels still wanted to wrap or feel cramped.
- **Learning**: In a dense documentation sidebar, a wrapped child label is usually an information-architecture problem before it is a layout problem. Shortening the displayed label keeps scanning fast and preserves a compact rail better than widening the sidebar or allowing two-line nav items.
- **Impact**: Prefer concise sidebar labels like `Commands`, `MCP`, `Payload`, `Settings`, and `Memory` over longer descriptive phrases in the left rail. Keep full wording for page titles and section intros, but keep the nav itself single-line and compact.

### 2026-04-08 - Expandable sidebar groups should disclose, not navigate
- **Context**: The sidebar had already been reframed so top-level items looked like structural labels, but their click behavior still navigated to the group page, which conflicted with the visual hierarchy.
- **Learning**: Once a top-level nav row is treated as a disclosure label, its interaction model should match that role. Clicking the group should only expand or collapse it, while route changes belong to the children inside the group.
- **Impact**: Keep top-level sidebar items as disclosure controls with clear expand/collapse semantics, and reserve navigation for child rows. This makes the hierarchy more predictable and aligns the visual model with the interaction model.

### 2026-04-08 - Hover previews should prefer the right rail, not flip across the table
- **Context**: On some runtime/config inventory pages, compact-table preview popovers were appearing on the left side of the hovered row, which felt visually jarring because the rest of the layout already reserves the right side for secondary context.
- **Learning**: In this docs shell, hover previews are part of the right-side support layer. When horizontal space gets tight, it is better to clamp the preview inward on the right than to flip it across the table to the left.
- **Impact**: Shared preview positioning should stay right-first and clamp within the viewport. Do not use a left-side fallback for these inventory previews unless the layout model itself changes.

### 2026-04-08 - Sidebar disclosure state should persist, but collapsed is the safer default
- **Context**: After the sidebar became more hierarchical, leaving every top-level group expanded by default made the left rail feel busy again and forced users to repeatedly collapse the same sections on refresh.
- **Learning**: A dense docs-style sidebar works better when groups start collapsed and then remember the user’s preferred shape locally. This keeps the first render calm without making people re-expand the same sections every time.
- **Impact**: Initialize sidebar disclosure state to collapsed, hydrate it from `localStorage` when present, and persist every toggle. That keeps the default lightweight while still respecting repeat usage patterns.

### 2026-04-08 - Overview pages should lead with status, not explanatory chrome
- **Context**: The overview page had accumulated a top toolbar with environment badges and explanatory notes above the actual status content.
- **Learning**: On an operational page, the first thing in the content column should be the first real signal, not setup copy. Utility actions like refresh and endpoint reminders can live in the right rail without competing with the main status readout.
- **Impact**: Keep overview/status pages focused: intro, then status immediately. Move helper actions or environment reminders into the rail when they are useful but secondary.

### 2026-04-08 - Detail drawers should treat ids and paths as copy-first data
- **Context**: Session and runtime drawers were surfacing IDs and filesystem paths as plain text, and the session payload JSON block was narrow enough to overflow awkwardly inside the drawer.
- **Learning**: Detail drawers are where operators go to grab exact identifiers, paths, and payloads. Those values should be immediately copyable, and the drawer itself needs enough width plus safe wrapping behavior so long JSON and filesystem strings remain usable without horizontal clipping.
- **Impact**: In shared drawer meta lists, automatically add copy affordances for ID/path-style fields when the value is a plain string. Keep drawers wider than the table previews, and make JSON/code previews wrap safely inside a scrollable container so session detail views stay readable.

### 2026-04-08 - Inspectable code blocks should use native overflow, not the generic scroll wrapper
- **Context**: JSON/detail previews in the playground were using the shared scroll-area component, which looked consistent but made real code-block overflow harder to scroll inside when payloads were large.
- **Learning**: Code and JSON inspection surfaces have different needs than general scrolling regions. They need direct two-axis scrolling inside the block itself, with preformatted width preserved, so users can pan through long lines or deep payloads without fighting the surrounding drawer/page scroll.
- **Impact**: For inspectable code blocks, prefer a plain `overflow-auto` container with overscroll containment over the generic Radix scroll area wrapper. Use preformatted width for real payloads, and reserve wrapped formatting for empty-state text only.

### 2026-04-08 - Identifier and path rows should be copy-first in previews and drawers
- **Context**: Even after adding copy buttons to some detail views, IDs and paths in the shared meta lists still behaved like passive text, and long session titles in the sessions table were taking more horizontal space than they deserved.
- **Learning**: Exact identifiers are utility data, not reading copy. In preview and drawer meta lists, path/ID rows work better when the whole value row is the copy target, with a visible copy affordance. In dense inventory tables, title columns also need explicit width boundaries or they will grow opportunistically and destabilize the layout.
- **Impact**: Treat `id`, `uuid`, `path`, and `directory` meta rows as full-row copy targets in the shared renderer, and keep session titles width-bound with truncation in the main sessions table so scanning stays stable.

### 2026-04-08 - Theme switching works best when the shell tokens and shared primitives move together
- **Context**: The playground shell already had a few custom CSS hooks, but most controls and table surfaces still relied on light-only Tailwind slate utilities, which would have made a theme toggle feel incomplete or inconsistent.
- **Learning**: For a multi-page operational UI like this, the durable pattern is: keep the theme decision at the app shell, write the active mode onto the document root, define a small token layer for page/surface/border/accent colors, and then update the shared primitives to consume those tokens. A light dark-mode override layer for the most repeated utility classes is enough to bring the remaining page surfaces along without a fragile page-by-page rewrite.
- **Impact**: Persist the selected theme in local storage, place the selector in the sidebar footer where it is globally available, and use the Mintlify docs accent colors as the common thread across light and dark states. Future visual work should prefer the shared token variables and primitives first, then add targeted utility overrides only where a page still hardcodes legacy light colors.

### 2026-04-08 - Summary stat strips must be part of the shared theme system too
- **Context**: After the theme switcher landed, the status/bootstrap/import summary strips still looked wrong in dark mode because the shared stat component was holding onto hardcoded `border-slate-200`, `bg-slate-200/90`, and light-only cell gradients even though the rest of the shell had moved onto tokens.
- **Learning**: Summary strips are not “just content”; they are one of the loudest surfaces in the app. If they stay outside the token system, dark mode immediately looks broken even when tables, drawers, and controls are themed correctly. The shared stat component needs tokenized container, text, and tone backgrounds just like the shared form controls do.
- **Impact**: Keep `CompactStatGrid` and its tone cells driven by CSS variables, not by fixed light utility colors. That way overview, runtime, imports, analytics, and config summaries all stay visually aligned whenever the theme tokens change.

### 2026-04-08 - Dark-mode stat strips should tint over a dark base, not replace it
- **Context**: The first tokenized pass fixed the hardcoded light colors, but the status/bootstrap strips still felt too bright because the tone backgrounds were effectively acting like full card fills instead of subtle overlays.
- **Learning**: In this UI, summary strips feel more premium when every cell starts from the same dark base and the state color reads as a faint atmospheric wash on top of it. Borders also need to stay in the same low-contrast family; a bright white edge immediately makes the surface look detached from the rest of the shell.
- **Impact**: Keep stat strips on a darker shared base with a tinted border, and make success/warning/info differences come from restrained top-down overlays rather than high-contrast full-cell gradients. That keeps the summary rows aligned with the rest of the Mint-inspired dark theme.

### 2026-04-08 - Table previews should be opt-in, not row-hover side effects
- **Context**: The shared compact tables were opening preview cards whenever a whole row was hovered or focused, which made the inventories feel twitchy and easy to trigger accidentally while scanning.
- **Learning**: In a dense operational table, preview is secondary context, not the primary interaction. A small muted eye affordance in the trailing column makes that intent explicit, and a short hover delay keeps the preview available without making the table feel noisy. The main row can then stay dedicated to the stronger action: opening the full detail drawer.
- **Impact**: Keep row click/keyboard activation for the drawer, and move preview behavior onto a dedicated trailing control with a delayed hover/focus reveal. Also avoid positive-state badges like `indexed` when the table’s very presence already implies the record exists in the indexed dataset; only show exception states such as pending or missing coverage.

### 2026-04-08 - Sidebar grouping is driven by navigation order, not custom render branches
- **Context**: The analytics page needed to move below the separator and below Live feed in the playground sidebar.
- **Learning**: The left rail grouping is centralized in `navigationSections` inside `playground/src/lib/playground.ts`, while the visual separator is still anchored to the `live-feed` section in `playground/src/app.tsx`. That means utility-group ordering changes can usually be handled by reordering the shared navigation model alone.
- **Impact**: For future sidebar regrouping, change `navigationSections` first and only touch the app-shell separator logic when the divider itself needs to move.

### 2026-04-08 - DuckDB timestamp objects must be normalized explicitly on both read paths
- **Context**: The analytics page looked like its range state was not updating, and the trends chart collapsed into a single point near “now” even though the warehouse contained historical traffic.
- **Learning**: `@duckdb/node-api` returns timestamp wrapper objects such as `DuckDBTimestampValue`, not always plain JS `Date` or ISO strings. Our derive refresh and analytics API both treated unknown timestamp objects as invalid and silently fell back to `Date.now()`, which rewrote historical events into the current moment, broke range filtering, and collapsed rollups into one bucket.
- **Impact**: Any analytics code that reads DuckDB timestamps should go through a shared coercion helper that understands `micros`/`millis`/`seconds`/`nanos` wrappers and timezone-free DuckDB timestamp strings. Never use `Date.now()` as the implicit fallback for warehouse timestamps unless “current time” is truly the intended semantics.

### 2026-04-08 - Mixed-scale analytics charts need separate axes for signal and volume
- **Context**: After the timestamp fix, the analytics facets correctly showed errors, but the trends chart still made them look absent when token overlays were enabled.
- **Learning**: Errors and keyword incidents live on a completely different order of magnitude than token counts. If they share one axis, the signal series get flattened into the baseline and appear broken even when the data is correct. Sparse low-count series also benefit from visible point markers instead of line-only rendering.
- **Impact**: Keep low-volume incident metrics on a dedicated signal axis, put token overlays on a separate scale, and use dots or other emphasis for sparse series so charts remain legible when operators compare incidents against volume metrics.

### 2026-04-08 - Analytics needs its own dashboard frame, not the docs page rail
- **Context**: The analytics screen needed to stop feeling like another playground documentation page and instead behave like an operational dashboard with a full-width canvas and a persistent left filter sidebar.
- **Learning**: `PageBodyWithRail` is the wrong abstraction for this screen because it carries docs-style endpoint/examples/on-this-page assumptions. The cleaner seam is to let analytics own its own split layout while reusing smaller shared primitives like `SectionIntro`, `CompactStatGrid`, and the analytics-specific filter components. On the data side, the dashboard becomes much more coherent when the same facet filters drive overview, timeseries, traces, and facets together.
- **Impact**: Keep analytics as an explicit dashboard exception page with its own layout shell, and treat backend analytics filters as a shared contract across all dashboard queries so the left rail always controls one consistent slice of the warehouse.

### 2026-04-08 - Operational charts should feel like plotting surfaces, not generic cards
- **Context**: The first analytics trends view worked functionally, but it still looked like a standard bordered card with default Recharts legend chrome dropped into the middle of a darker dashboard.
- **Learning**: For a serious analytics surface, the chart itself should carry the atmosphere. That means lighter chrome, custom legend treatment, softened axes, restrained grid lines, and color layered into the plot area rather than another boxed container around it. When the surrounding page already has structure, adding another full card around the chart just makes the dashboard feel cramped.
- **Impact**: Prefer an open chart shell with subtle separators and atmospheric fills over a white panel. Keep legends custom and integrated into the section, use rounded strokes and sparse dots for legibility, and let chart-specific theme tokens handle the contrast in both light and dark modes.

### 2026-04-08 - Analytics slice controls need to be visible inside the main workspace, not only in the left rail
- **Context**: The analytics dashboard already supported session-type and facet filters in the sticky sidebar, but it still felt like the main workspace lacked obvious slice controls when operators were reading the chart and new per-tool reliability table.
- **Learning**: For operational dashboards, a filter existing somewhere in the shell is not the same as a filter feeling discoverable. Repeating the most important slice control, session type, inside the main pane near the data it changes makes the dashboard feel much more direct, especially once a secondary table appears below the chart.
- **Impact**: Keep the full filter taxonomy in the left rail, but surface the highest-frequency slice controls and labeled active-filter chips in the content area wherever operators are actively comparing chart and table views.

### 2026-04-08 - Tool reliability needs tool-call semantics, not interaction-level error semantics
- **Context**: The dashboard needed a per-tool error-rate table below Trends, and the existing analytics filters are primarily interaction-scoped.
- **Learning**: For a reliability table, the denominator has to be actual tool calls from `fact_tool_calls`, and failures should come from `fact_tool_calls.is_error`. Reusing interaction-level error totals would overstate or misattribute tool reliability, especially when an interaction contains both a tool failure and a separate API error. The filtered interaction CTE is still the right outer slice, but the table itself has to aggregate at the tool-call grain.
- **Impact**: Keep tool-performance queries as `filtered_interactions` joined to `fact_tool_calls`, with top-error context layered from `fact_errors` only as supplemental detail. In the UI, make session-type filters visible in the main content, not only in the left rail, so operators can immediately understand what slice the reliability table is describing.

### 2026-04-08 - Analytics tables need shared surface tokens, not one-off slate utility fixes
- **Context**: The analytics reliability and trace tables looked acceptable in light mode, but dark mode still felt brittle because both components were hardcoding `bg-white`, `bg-slate-50`, and `border-slate-200` combinations directly in the JSX.
- **Learning**: For tables that are meant to feel like part of one dashboard, the stable seam is a small shared CSS layer for table shell, header, row hover, drawer cards, and modal surfaces. Once those surfaces live on theme tokens, both tables and both drilldown drawers pick up dark-mode polish together instead of needing one component-specific override after another.
- **Impact**: Keep future analytics tables and drawers on shared classes like `analytics-table-shell`, `analytics-table-head`, and `analytics-drawer-*`, and reserve inline Tailwind color utilities for local accents rather than the base surface treatment.

### 2026-04-08 - Tool reliability rows should summarize, then open into detail
- **Context**: The first tool table version tried to explain error rate inline with a progress bar, a separate failures column, and extra occurrence copy, but it still did not provide a real way to inspect the failing runs behind the numbers.
- **Learning**: In this dashboard, the reliability table works better as a compact summary surface: badge-level error rate, scope, and top error at a glance, then a row click into a dedicated drilldown drawer for recent failures. Failure counts can stay on the badge tooltip, which removes redundant columns without hiding the underlying numbers.
- **Impact**: Prefer row-to-drawer drilldown for analytics tables when the next question is "show me the actual failing events." Keep the table terse, and move event-level inspection into a modal or drawer backed by a dedicated detail endpoint.

### 2026-04-08 - Analytics dashboards should keep only the highest-signal summary surfaces
- **Context**: The analytics page still had a mid-page `Keyword breakdown` and `Warehouse status` block beneath the summary strip, but those cards were repeating information that already existed elsewhere on the dashboard.
- **Learning**: When a dashboard already has summary stats, trends, and drilldown tables, extra summary cards quickly become visual noise. It is usually better to let the page flow straight from the stat strip into the live chart and table sections unless the extra block answers a distinct operator question.
- **Impact**: Favor a tighter dashboard sequence: summary, trends, drilldowns. Drop repeated informational cards unless they add a unique control or investigation path.

### 2026-04-08 - Facet rails should read like query tools, not annotated cards
- **Context**: The analytics sidebar still presented each filter group as a separate rounded card with descriptive copy, which made the left rail feel more like a stack of notes than a real data explorer.
- **Learning**: For dense operational filtering, one continuous rail with divider-separated sections, terse uppercase headings, lightweight meta counts, and search where the facet list is long feels much more useful than repeated card shells. The moment each filter group gets its own padded box and paragraph, the rail starts to read like documentation instead of instrumentation.
- **Impact**: Keep the analytics filter rail cardless by default. Use sections, dividers, counts, and searchable facets instead of descriptive panel copy, and reserve boxed surfaces for the main analytical outputs like charts, tables, and drilldowns rather than the filter controls themselves.

### 2026-04-08 - Chart tooltips should inherit the dashboard's visual language, not default widget chrome
- **Context**: The analytics timeseries tooltip was still relying on the default Recharts wrapper treatment, which made the text feel oversized and the hover state feel disconnected from the rest of the dashboard.
- **Learning**: Even a tiny hover card needs explicit typography, padding, border, shadow, and theme-aware background tokens if it is meant to feel like part of the product. Compact labels and tabular values also matter because analytics tooltips often stack multiple series in a very small space.
- **Impact**: Give future dashboard tooltips their own surface class and keep the scale intentionally small, especially when the surrounding chart is meant to stay open and airy rather than boxed in.

### 2026-04-08 - Table search and sorting should live on the table, not in the global filter rail
- **Context**: The analytics dashboard had global trace search in the left rail while the trace table itself lacked the same search-above-table control pattern as the other explorer surfaces, and neither analytics table exposed sortable columns.
- **Learning**: Search and sort feel much more legible when they live in the table header area beside the result counts they affect. Putting trace search in the rail made it behave like a dashboard-wide slice filter, even though it was really a table-level exploration control.
- **Impact**: Keep broad cross-view filters in the left rail, but attach table-specific search and sortable headers directly to the table surface so the user can read, filter, and reorder data in one place.

### 2026-04-08 - Session explorer helper prose should not sit between the controls and the table
- **Context**: The sessions page rendered two informational `InlineState` blocks directly under the search toolbar, repeating search coverage and scope context before the actual explorer table.
- **Learning**: When a page is already clearly structured around controls and a primary data table, extra helper prose in the middle just creates drag. If the information does not change the next action, it is better removed than explained.
- **Impact**: Keep the sessions explorer tighter: controls first, table second. Reserve inline informational states for actual warnings, loading, or empty-result conditions rather than static explanatory copy.

### 2026-04-08 - Inspector-style rails need height ownership from both the parent layout and the embedded surface
- **Context**: Session detail follow-up to make the right sidebar span the page height and make the transcript read as a real chat panel.
- **Learning**: Making an inspector rail feel full-height is not just a sidebar CSS tweak. The page grid has to allow the rail to stretch, the sidebar shell has to own a sticky viewport-height frame, and the embedded transcript component has to support `flex`-based fill height instead of forcing its old fixed compact height. Once those three layers line up, a separate panel background around the chat becomes visually obvious instead of feeling like another block of page copy.
- **Impact**: Future detail views with embedded inspectors should expose a fill-height mode on reusable content components rather than relying on ad hoc height overrides at the call site.

### 2026-04-08 - Session logs read better when lightweight tool events degrade to rows instead of panels
- **Context**: Session detail cleanup after reviewing transcript items like `Read file`, `Search`, and short tool results that were still rendering as boxed mini-cards.
- **Learning**: Not every tool event deserves its own panel. Read/search/simple-result items are much easier to scan as one-line activity rows with a status dot and a short summary, while write/edit/bash events still benefit from a more open detailed layout because they carry code or multi-part payloads. The right split is semantic, not purely type-based: use a lightweight classifier that looks at the variant plus whether the message actually has code blocks or task items.
- **Impact**: Future transcript renderers should classify low-information operational events into compact rows first and reserve boxed or expanded treatment for entries that truly need code, structured fields, or drill-in content.

### 2026-04-08 - Codex MCP registration is easiest through `codex mcp add`, not the `add-mcp` wizard
- **Context**: Installing Agentation so playground annotations could flow into the local coding agent.
- **Learning**: The generic `npx add-mcp` helper expects an interactive TTY and failed in this environment, but `codex mcp add agentation -- npx -y agentation-mcp server` worked cleanly and wrote the MCP entry directly into `~/.codex/config.toml`. For the browser-side overlay, the most reliable React integration is a dev-only root mount with an endpoint fallback to `http://localhost:4747`, plus a local script that can run the combined HTTP/MCP server outside the agent lifecycle when immediate browser sync is needed.
- **Impact**: For future Codex-local MCP integrations, prefer the native `codex mcp` commands over agent-agnostic setup wizards, and make any browser-side endpoint overrideable through a Vite env var rather than hardcoding the port permanently.

### 2026-04-08 - Compact chat UIs need one surface grammar, not stacked component labels
- **Context**: The session detail chat kept drifting into inspector-style UI with extra headings, separate composer framing, and activity rows that still behaved like labeled widgets instead of a chat transcript.
- **Learning**: A dense operator chat feels much cleaner when the transcript and composer share one grammar: quiet uppercase metadata, content-first rows, minimal dividers, and one docked input shell that owns focus. Redundant labels like `Reply`, `Markdown block`, or standalone section titles cost more vertical space than the information they add. The same applies to dark mode: once the composer becomes a single shell, the textarea itself should stay transparent so the shell, not a nested field, defines the surface.
- **Impact**: Future transcript polish should start by collapsing chrome rather than adding new wrappers. Keep tabs as an underline rail, treat activity as inline rows first, and let the composer read like one instrument with subtle focus motion instead of a separate form stacked under the chat.

### 2026-04-08 - Tool transcripts should not fall back to raw input JSON when a structured presentation already exists
- **Context**: A real session detail trace for a simple `Read` tool call was still rendering as `Read file`, `Read`, raw `{ "file_path": ... }`, then a separate `File` row, plus a `Read result` row that repeated both `ok` and `Read`.
- **Learning**: The fallback `content: stringifyUnknown(toolUse.input)` path is too blunt for transcript UI. Once a tool call already has a structured presentation, fields, or code blocks, dumping the raw JSON input just recreates the same information with worse hierarchy. The same pattern applies to result summaries: if status already has a pill and the title already contains the tool name, repeating those strings in the summary/meta line creates obvious noise. Read-result outputs also become much more legible when the file path is carried through from the originating tool call so the code viewer can orient itself without another invented label.
- **Impact**: For transcript normalization, prefer explicit structured fields over raw fallback payloads, omit thinking-only assistant placeholders before grouping, and carry tool-derived file context into result viewers so simple read/search flows stay compact and readable.

### 2026-04-08 - `react-markdown` v10 code renderers cannot rely on `inline`
- **Context**: Assistant text like `The project name is **\`cc-middleware\`** (line 2 of \`package.json\`).` was rendering as broken block viewers inserted into the sentence instead of as inline code spans.
- **Learning**: In this setup, the `code` component from `react-markdown` is not receiving a usable `inline` prop, so checking `inline` or `node.type` is not enough to distinguish inline code from fenced blocks. The stable seam is the `pre` wrapper: block code arrives wrapped in `pre`, while inline code does not. Rendering inline code directly in `code` and upgrading only `pre` children into `SessionDetailCodeViewer` fixes the sentence flow without special-casing markdown content.
- **Impact**: Future markdown rendering work in the playground should treat `pre` as the block-code hook and keep `code` inline-first. Also, any extra file pills under tool rows should be filtered against `filePath` and code-block paths so the same path is not shown again as a decorative badge.

### 2026-04-08 - Tool/result collapsing works best as a render-layer transformation
- **Context**: The session detail chat still showed `Read` and `Read result` as separate rows even after the individual rows were cleaned up, and the narrow right rail made the duplicated structure feel even more cramped.
- **Learning**: This is a presentation problem more than a transcript-model problem. The cleaner seam is to keep normalized messages untouched, then pair tool-use activities with their matching `tool_result` activities while rendering the assistant turn. That preserves raw transcript fidelity for other consumers, but lets the UI expose one coherent block with one summary, one status pill, optional nested child work, and the result payload inline. Once those pairs are merged visually, the assistant-turn step count also needs to use the merged presentation items rather than the raw activity array, or the header drifts out of sync with what the user sees.
- **Impact**: Future transcript compaction should favor render-layer grouping for visual merges, especially when the raw message stream still needs to stay lossless. When the sidebar itself is the primary work surface, give it enough width that merged activity blocks can breathe instead of collapsing into stacked wraps.
