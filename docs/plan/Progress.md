# CC-Middleware Progress

## Status Legend
- [ ] Not started
- [~] In progress
- [x] Completed (verified)
- [!] Failed verification (needs fix)

---

## Phase 1: Foundation
- [x] Task 1.1: Initialize project scaffold
- [x] Task 1.2: Define core types
- [x] Task 1.3: Create test harness

## Phase 2: Session Discovery
- [x] Task 2.1: Session discovery from filesystem
- [x] Task 2.2: Session message reading
- [x] Task 2.3: Session info and metadata

## Phase 3: Session Launching
- [x] Task 3.1: Launch headless session (single-turn)
- [x] Task 3.2: Launch streaming session
- [x] Task 3.3: Resume and continue sessions
- [x] Task 3.4: Session lifecycle management

## Phase 4: Event System
- [x] Task 4.1: Event bus core
- [x] Task 4.2: Blocking hook stubs
- [x] Task 4.3: SDK hook integration
- [x] Task 4.4: HTTP hook server

## Phase 5: Permission Handling
- [x] Task 5.1: Permission policy engine
- [x] Task 5.2: canUseTool implementation
- [x] Task 5.3: AskUserQuestion handling

## Phase 6: Agent & Team Management
- [x] Task 6.1: Agent definition reader
- [x] Task 6.2: Agent definition registry
- [x] Task 6.3: Team management
- [x] Task 6.4: Programmatic agent launching

## Phase 6.5: Integration Tests (PRIORITY)
- [x] Task 6.5.1: Hooks + Session integration
- [x] Task 6.5.2: Permissions + Session integration
- [x] Task 6.5.3: HTTP hook server + Claude CLI integration
- [x] Task 6.5.4: Session rename/tag roundtrip
- [x] Task 6.5.5: Streaming abort
- [x] Task 6.5.6: Full middleware smoke test

## Phase 7: API Layer
- [x] Task 7.1: Fastify server setup
- [x] Task 7.2: Session REST endpoints
- [x] Task 7.3: WebSocket streaming
- [x] Task 7.4: Hook and event endpoints
- [x] Task 7.5: Agent endpoints
- [x] Task 7.6: Permission endpoints

## Phase 8: Plugin Integration
- [x] Task 8.1: Plugin manifest
- [x] Task 8.2: Plugin hooks configuration
- [x] Task 8.3: Plugin skill
- [x] Task 8.4: Plugin MCP server (optional)

## Phase 9: Search & Indexing
- [x] Task 9.1: SQLite session store
- [x] Task 9.2: Session indexer
- [x] Task 9.3: Full-text search
- [x] Task 9.4: Search API endpoints

## Phase 10: Configuration Management
- [x] Task 10.1: Settings reader
- [x] Task 10.2: Settings writer
- [x] Task 10.3: Plugin reader and management
- [x] Task 10.4: Skills, agents, and rules reader
- [x] Task 10.5: MCP server reader
- [x] Task 10.6: Memory reader
- [x] Task 10.7: Configuration API endpoints

## Phase 11: CLI Control Surface
- [x] Task 11.1: CLI scaffold and client
- [x] Task 11.2: Server commands
- [x] Task 11.3: Session commands
- [x] Task 11.4: Hook commands
- [x] Task 11.5: Agent and team commands
- [x] Task 11.6: Permission commands
- [x] Task 11.7: Configuration commands
- [x] Task 11.8: Tab completion and polish
- [x] Task 11.9: Integration tests

## Phase 12: Real-Time Sync
- [x] Task 12.1: Session file watcher
- [x] Task 12.2: Config and component watcher
- [x] Task 12.3: Incremental auto-indexer
- [x] Task 12.4: WebSocket push for external changes
- [x] Task 12.5: Wire into server startup
- [x] Task 12.6: Watcher configuration

---

## Completion Log

| Date | Task | Status | Implemented By | Verified By | Notes |
|------|------|--------|----------------|-------------|-------|
| 2026-04-04 | Task 1.1 | Passed | Orchestrator | Orchestrator | package.json, tsconfig.json, vitest.config.ts, .gitignore created; all deps installed; tsc --noEmit passes |
| 2026-04-04 | Task 1.2 | Passed | Orchestrator | Orchestrator | sessions.ts, hooks.ts, agents.ts, errors.ts, index.ts created; all types compile cleanly |
| 2026-04-04 | Task 1.3 | Passed | Orchestrator | Orchestrator | Test harness with fixtures, setup helpers, unit tests (13), E2E tests (4); all 17 tests pass |
| 2026-04-04 | Task 2.1 | Passed | Orchestrator | Orchestrator | discovery.ts wraps listSessions(); 7 E2E tests pass against real filesystem |
| 2026-04-04 | Task 2.2 | Passed | Orchestrator | Orchestrator | messages.ts wraps getSessionMessages(); text/tool extraction helpers; 4 E2E tests pass |
| 2026-04-04 | Task 2.3 | Passed | Orchestrator | Orchestrator | info.ts wraps getSessionInfo/renameSession/tagSession; 3 E2E tests pass |
| 2026-04-04 | Task 4.1 | Passed | Orchestrator | Orchestrator | event-bus.ts with typed EventEmitter, wildcard support, dispatch; 11 unit tests pass |
| 2026-04-04 | Task 4.2 | Passed | Orchestrator | Orchestrator | blocking.ts with default stubs, matcher support, register/unregister; 9 unit tests pass |
| 2026-04-04 | Task 4.3 | Passed | Orchestrator | Orchestrator | sdk-bridge.ts bridges event bus + blocking registry to SDK hooks format; 8 unit tests pass |
| 2026-04-04 | Task 4.4 | Passed | Orchestrator | Orchestrator | server.ts HTTP hook server with Fastify; always 200, JSON body for decisions; 7 E2E tests pass |
| 2026-04-04 | Task 3.1 | Passed | Orchestrator | Orchestrator | launcher.ts wraps query(); launchSession/resumeSession/continueSession/forkSession; 1 E2E test passes (real API call) |
| 2026-04-04 | Task 3.2 | Passed | Orchestrator | Orchestrator | streaming.ts with SessionStreamEvent types, event normalization, abort control; 1 E2E test passes |
| 2026-04-04 | Task 3.3 | Passed | Orchestrator | Orchestrator | Resume via resumeSession(); E2E test verifies context preservation across sessions |
| 2026-04-04 | Task 3.4 | Passed | Orchestrator | Orchestrator | manager.ts with SessionManager tracking, lifecycle events, abort; 2 E2E tests pass |
| 2026-04-04 | Task 5.1 | Passed | Orchestrator | Orchestrator | policy.ts with PolicyEngine, glob/alternation patterns, Bash(pattern) conditions, priority ordering; 11 unit tests pass |
| 2026-04-04 | Task 5.2 | Passed | Orchestrator | Orchestrator | handler.ts with createCanUseTool, PermissionManager, pending resolution, timeout; 6 unit tests pass |
| 2026-04-04 | Task 5.3 | Passed | Orchestrator | Orchestrator | ask-user.ts with AskUserQuestionManager, handler registration, default answers, pending questions; 6 unit tests pass |
| 2026-04-04 | Task 6.1 | Passed | Orchestrator | Orchestrator | definitions.ts reads agent markdown with gray-matter, parses frontmatter; 7 unit tests pass |
| 2026-04-04 | Task 6.2 | Passed | Orchestrator | Orchestrator | registry.ts with AgentRegistry, filesystem loading, runtime override, SDK conversion; 8 unit tests pass |
| 2026-04-04 | Task 6.3 | Passed | Orchestrator | Orchestrator | teams.ts with TeamManager, team discovery, task reading from filesystem; 6 unit tests pass |
| 2026-04-04 | Task 6.4 | Passed | Orchestrator | Orchestrator | launcher.ts with AgentLauncher using registry + session manager; 2 tests pass (1 real API call) |
| 2026-04-04 | Task 6.5.1 | Passed | Orchestrator | Orchestrator | hooks-session.test.ts: PreToolUse/PostToolUse events fire during real session; blocking deny prevents Bash execution; 2 tests pass |
| 2026-04-04 | Task 6.5.2 | Passed | Orchestrator | Orchestrator | permissions-session.test.ts: PolicyEngine deny-bash/allow-read verified with real API; Read succeeds, result contains project name; 1 test passes |
| 2026-04-04 | Task 6.5.3 | Passed | Orchestrator | Orchestrator | hookserver-cli.test.ts: HTTP hook server receives PostToolUse from real claude -p session via --settings; 1 test passes |
| 2026-04-04 | Task 6.5.4 | Passed | Orchestrator | Orchestrator | session-metadata.test.ts: launch, rename, tag, read-back, clear-tag roundtrip works; 1 test passes |
| 2026-04-04 | Task 6.5.5 | Passed | Orchestrator | Orchestrator | streaming-abort.test.ts: streaming session receives events then aborts mid-stream; AbortController verified; 1 test passes |
| 2026-04-04 | Task 6.5.6 | Passed | Orchestrator | Orchestrator | smoke.test.ts: full stack (hooks+permissions+agents+session) wired together; result correct ("4"); hook events fire; agent registry works; 1 test passes |
| 2026-04-04 | Task 7.1 | Passed | Orchestrator | Orchestrator | server.ts: Fastify API server with health check, status endpoint, error handling, 404 handler, context decoration; 3 E2E tests pass |
| 2026-04-04 | Task 7.2 | Passed | Orchestrator | Orchestrator | routes/sessions.ts: List, get, messages, launch, resume, abort, update endpoints with Zod validation; 9 E2E tests pass |
| 2026-04-04 | Task 7.3 | Passed | Orchestrator | Orchestrator | websocket.ts: WS endpoint with subscribe/unsubscribe, ping/pong, hook event broadcast, session lifecycle broadcast; 6 E2E tests pass |
| 2026-04-04 | Task 7.4 | Passed | Orchestrator | Orchestrator | routes/events.ts: event type listing, webhook subscription CRUD, webhook delivery with event filtering; 8 E2E tests pass |
| 2026-04-04 | Task 7.5 | Passed | Orchestrator | Orchestrator | routes/agents.ts: agent CRUD (list, get, register, delete) + team endpoints (list, get, tasks); 8 E2E tests pass |
| 2026-04-04 | Task 7.6 | Passed | Orchestrator | Orchestrator | routes/permissions.ts: policy CRUD, pending permission resolution, question answering, Zod validation; 10 E2E tests pass |
| 2026-04-04 | Task 8.1 | Passed | Orchestrator | Orchestrator | plugin.json manifest, settings.json with env vars; loads cleanly with claude --plugin-dir |
| 2026-04-04 | Task 8.2 | Passed | Orchestrator | Orchestrator | hooks.json with HTTP hooks for 9 lifecycle events; wildcard matchers for tool events; 3 E2E tests pass |
| 2026-04-04 | Task 8.3 | Passed | Orchestrator | Orchestrator | SKILL.md with frontmatter, 8 API endpoint references, $ARGUMENTS support; 2 E2E tests pass |
| 2026-04-04 | Task 8.4 | Passed | Orchestrator | Orchestrator | MCP server with createSdkMcpServer, 4 tools (sessions, status, search, agents); 1 unit test passes |
| 2026-04-04 | Task 9.1 | Passed | Orchestrator | Orchestrator | SQLite store with FTS5, triggers, WAL mode, prepared statements; 19 unit tests pass |
| 2026-04-04 | Task 9.2 | Passed | Orchestrator | Orchestrator | SessionIndexer with full/incremental modes, message extraction, stats; 4 E2E tests pass |
| 2026-04-04 | Task 9.3 | Passed | Orchestrator | Orchestrator | FTS5 search with relevance scoring, highlights, filters, pagination; 14 unit tests pass |
| 2026-04-04 | Task 9.4 | Passed | Orchestrator | Orchestrator | Search API (GET /search, POST /reindex, GET /stats); server updated with store/indexer; 7 E2E tests pass |
| 2026-04-04 | Task 10.1 | Passed | Orchestrator | Orchestrator | Settings reader for all scopes, merge with precedence, provenance tracking; 11 unit tests pass |
| 2026-04-04 | Task 10.2 | Passed | Orchestrator | Orchestrator | Atomic settings writer, permission rule helpers, dot-notation keys; 13 unit tests pass |
| 2026-04-04 | Task 10.3 | Passed | Orchestrator | Orchestrator | Plugin reader from installed_plugins.json, manifest parsing, enable/disable; 4 E2E tests pass |
| 2026-04-04 | Task 10.4 | Passed | Orchestrator | Orchestrator | Skills/agents/rules/CLAUDE.md discovery with gray-matter, agent CRUD; 8 E2E tests pass |
| 2026-04-04 | Task 10.5 | Passed | Orchestrator | Orchestrator | MCP server discovery from ~/.claude.json, .mcp.json, managed paths; 3 E2E tests pass |
| 2026-04-04 | Task 10.6 | Passed | Orchestrator | Orchestrator | Memory reader with project key encoding, index/topic files; 5 E2E tests pass |
| 2026-04-04 | Task 10.7 | Passed | Orchestrator | Orchestrator | 30+ config API routes for settings, plugins, agents, skills, rules, MCP, memory, CLAUDE.md; 21 E2E tests pass |
| 2026-04-04 | Task 11.1 | Passed | Orchestrator | Orchestrator | CLI scaffold with commander, client.ts (HTTP), ws-client.ts (WebSocket), output.ts (tables/JSON), auto-start.ts; ccm --help works |
| 2026-04-04 | Task 11.2 | Passed | Orchestrator | Orchestrator | server start/stop/status commands with PID file management, background/foreground modes; tested with live server |
| 2026-04-04 | Task 11.3 | Passed | Orchestrator | Orchestrator | sessions list/show/launch/resume/stream/search with table output, --json flag, WebSocket streaming, spinner |
| 2026-04-04 | Task 11.4 | Passed | Orchestrator | Orchestrator | hooks listen (WebSocket live stream with Ctrl+C) and hooks list (event types + subscriptions) |
| 2026-04-04 | Task 11.5 | Passed | Orchestrator | Orchestrator | agents list/show/create + teams list/show; table output with source, model, description |
| 2026-04-04 | Task 11.6 | Passed | Orchestrator | Orchestrator | permissions list/add/pending/approve/deny; matched to actual API schema (rules, behavior, toolName) |
| 2026-04-04 | Task 11.7 | Passed | Orchestrator | Orchestrator | config show/get/set/plugins/mcp/skills/agents/memory; scope-colored output, flattenObject for dot-notation |
| 2026-04-04 | Task 11.8 | Passed | Orchestrator | Orchestrator | Shell completion for bash/zsh/fish; graceful error handling (no stack traces); 13 polish E2E tests pass |
| 2026-04-04 | Task 11.9 | Passed | Orchestrator | Orchestrator | 15 integration tests against live server; full session/config/permissions/agents/hooks workflows; 311 total tests pass |
| 2026-04-04 | Task 12.1 | Passed | Orchestrator | Orchestrator | SessionWatcher with chokidar + polling hybrid, debounce, discover/update/remove events; 10 unit tests pass |
| 2026-04-04 | Task 12.2 | Passed | Orchestrator | Orchestrator | ConfigWatcher for settings, MCP, agents, skills, rules, teams, plugins, memory; 8 unit tests pass |
| 2026-04-04 | Task 12.3 | Passed | Orchestrator | Orchestrator | AutoIndexer with immediate index for discovered, batched index for updated; 7 unit tests pass |
| 2026-04-04 | Task 12.4 | Passed | Orchestrator | Orchestrator | WebSocket sync event types, WebSocketBroadcaster interface; 15 unit tests + 6 E2E tests pass |
| 2026-04-04 | Task 12.5 | Passed | Orchestrator | Orchestrator | Watchers wired into main.ts startup, /api/v1/sync/status endpoint, clean shutdown; 4 E2E tests pass |
| 2026-04-04 | Task 12.6 | Passed | Orchestrator | Orchestrator | Env var config, ccm sync status/reindex CLI commands, sync route module, public exports; 9 unit tests pass; 364 total tests pass |
| 2026-04-06 | Docs: OpenAPI/AsyncAPI spec compliance | Passed | Orchestrator | Orchestrator | Fixed OpenAPI 3.1 schema issues (`nullable` -> union types, root public security, SPDX license identifier), aligned AsyncAPI and docs with the actual WebSocket protocol, updated Mint config/script wiring, and verified with `npm run build`, `npm run validate:openapi`, `npm run validate:asyncapi`, and `npm run docs:build` |
| 2026-04-06 | CLI/WebSocket session streaming alignment | Passed | Orchestrator | Orchestrator | Implemented WebSocket `launch`/`resume` handling plus `session:stream` server events, fixed CLI streaming race/subscription issues, aligned AsyncAPI and session docs, and verified with `npm run build`, `npx vitest run tests/unit/ws-sync-events.test.ts tests/e2e/api-websocket.test.ts tests/e2e/cli-integration.test.ts tests/e2e/cli-streaming.test.ts`, `npm run validate:openapi`, `npm run validate:asyncapi`, and `npm run docs:build` |
| 2026-04-06 | Docs: early-alpha release cleanup | Passed | Orchestrator | Orchestrator | Added shared 4XX responses to every OpenAPI operation that was missing one, updated README and docs to clearly label `v0.1.0` as early alpha, stacked the SDK/Plugin/Hybrid mode section vertically, and added alpha-status notes in the API docs; verified with `npm run build`, `npm run validate:openapi`, `npm run validate:asyncapi`, and `npm run docs:build` |
| 2026-04-06 | Docs: convert diagram-like code snippets to Mermaid | Passed | Orchestrator | Orchestrator | Replaced diagram-like ASCII/code snippets in published docs and repo docs with Mermaid-backed diagrams, generated Mintlify SVG assets for the docs-site pages, and verified with `npm run docs:build` |
| 2026-04-06 | Config: Claude resource inventory exposure | Passed | Orchestrator | Orchestrator | Added plugin-aware discovery for skills, legacy commands, and agents; enriched installed plugin metadata with marketplace/blocklist/component counts; exposed `GET /api/v1/config/commands` and `GET /api/v1/config/runtime`; added `ccm config commands`; and verified with `npm run build` plus `npx vitest run tests/e2e/config-components.test.ts tests/e2e/api-config.test.ts tests/e2e/config-plugins.test.ts` |
| 2026-04-06 | Config: Claude global state + marketplace exposure | Passed | Orchestrator | Orchestrator | Added sanitized `~/.claude.json` readers, tracked-project lookup, known marketplace and marketplace-plugin inventory, new config API routes (`/global`, `/projects`, `/marketplaces`), CLI commands (`global`, `projects`, `marketplaces`, `marketplace-plugins`, `runtime`), deterministic fake-home E2E fixtures, and verified with `npm run build` plus `npx vitest run tests/e2e/api-config.test.ts tests/e2e/config-plugins.test.ts tests/e2e/config-components.test.ts` |
| 2026-04-06 | Research: Claude settings and plugin management contract | Passed | Orchestrator | Orchestrator | Cross-checked Anthropic's settings/plugin/SDK docs with local `~/.claude` state and Claude CLI behavior, documented which surfaces are declarative settings vs operational registries vs live runtime state, and updated research docs for `~/.claude.json` and the plugin system with explicit middleware exposure/management guidance |
| 2026-04-06 | Config: Claude CLI-backed management verification | Passed | Orchestrator | Orchestrator | Finished converting config API E2E tests to Fastify `app.inject()` so they run in-process under sandbox, added fake-`claude` usage coverage for plugin install/update/uninstall and marketplace add/update/remove, and re-verified with `npm run build` plus `npx vitest run tests/e2e/api-config.test.ts tests/e2e/config-plugins.test.ts tests/e2e/config-components.test.ts` |
| 2026-04-06 | Config: global preference management + plugin provenance | Passed | Orchestrator | Orchestrator | Added guarded writes for documented `~/.claude.json` preferences, exposed plugin provenance that joins enablement-by-scope, marketplace/catalog presence, and runtime-loaded state, extended CLI/completions, and verified with `npm run build` plus `npx vitest run tests/e2e/api-config.test.ts tests/e2e/config-plugins.test.ts tests/e2e/config-components.test.ts` |
| 2026-04-07 | Playground: shadcn local demo dashboard | Passed | Orchestrator | Orchestrator | Added a Vite + React playground under `playground/` using shadcn-style UI primitives and a Mintlify-inspired layout, with live proofs for search, session stream events, hook/team feed visibility, agents, teams, and runtime inventory; verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: linear UI cleanup + search-index coverage clarity | Passed | Orchestrator | Orchestrator | Reworked the playground into a flatter, linear operator layout with a shadcn-style sidebar, removed the boxy card treatment from the content area, added explicit session-on-disk vs indexed-search coverage messaging plus a `Reindex existing sessions` proof action, documented the behavior in README, and verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: Stripe-style API docs interaction pattern | Passed | Orchestrator | Orchestrator | Added endpoint rails and sticky "Try It" panes to the sessions and live-feed sections so the playground behaves more like an API reference with an integrated explorer, while keeping the main response surfaces linear and readable; verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: nav-only sidebar + import stats section | Passed | Orchestrator | Orchestrator | Simplified the sidebar to navigation only, moved operational status into the main content flow, added a dedicated backfill/import stats section backed by `/api/v1/search/stats` and polling `/api/v1/sync/status`, and verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: full-screen docs shell + right rail simplification | Passed | Orchestrator | Orchestrator | Converted the playground to a true full-screen docs layout with a left navigation sidebar, wider main documentation column, explicit right rails for runnable examples and JSON results, and simpler Stripe-style section content; verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Search: index custom titles and project-identifying metadata | Passed | Orchestrator | Orchestrator | Expanded session indexing and search to cover `customTitle`, session ID, project, cwd, and git branch in addition to summary/first prompt/tag, added a store migration that upgrades legacy SQLite schemas and rebuilds the session FTS table in place, and verified with `npm run build`, `npx vitest run tests/unit/store.test.ts tests/unit/search.test.ts`, and `npx vitest run tests/e2e/api-search.test.ts` |
| 2026-04-07 | Search/Sync: full historical backfill + sidechain-aware indexing | Passed | Orchestrator | Orchestrator | Removed the 1000-session full-index cap, changed reindex ordering to oldest→newest, merged raw `subagents/*.jsonl` transcript messages into their parent session index, persisted subagent relationship metadata, fixed the watcher to recurse into nested transcript folders without emitting startup "discover" noise, corrected `/api/v1/sessions` totals by listing the full discovery set before slicing, and added startup full/incremental index sync; verified with `npm run build`, `npx vitest run tests/unit/transcripts.test.ts tests/unit/session-watcher.test.ts tests/unit/store.test.ts tests/e2e/indexer.test.ts`, plus manual in-process verification that a fresh full index imported all 1422 discovered sessions and that `/api/v1/sessions?limit=5&offset=5&project=/Users/zef/Desktop/cc-middleware` returned the correct total (172). `tests/e2e/api-sessions.test.ts` was blocked by the local Claude usage limit before it could launch a fresh session. |
| 2026-04-07 | Search: expose subagent and team lineage in results | Passed | Orchestrator | Orchestrator | Extended stored session relationships with optional team metadata, parsed team hints from sidechain transcripts, enriched `/api/v1/search` responses with lineage summaries (`subagentCount`, team names, teammate names, relationship details), used current team configs to fill missing team labels at response time, surfaced the lineage badges in the playground search UI, and verified with `npm run build`, `npm run playground:build`, and `npx vitest run tests/unit/store.test.ts tests/unit/search.test.ts tests/unit/transcripts.test.ts tests/e2e/api-search.test.ts` |
| 2026-04-07 | Playground/Search: session metadata and indexed scope filters | Passed | Orchestrator | Orchestrator | Added indexed search filters for `all`, `standalone`, `subagent`, and `team` scopes plus optional team-name filtering, expanded the playground session listings with IDs, titles, branches, cwd, and prompt metadata, added a bootstrap inventory summary for team configs/tasks and runtime MCP/skills/plugins, and verified with `npm run build`, `npm run playground:build`, and `npx vitest run tests/unit/search.test.ts tests/e2e/api-search.test.ts tests/unit/store.test.ts tests/unit/transcripts.test.ts` |
| 2026-04-07 | Sessions: merged catalog + directory grouping | Passed | Orchestrator | Orchestrator | Added a merged session catalog that overlays raw filesystem discovery with indexed lineage/message metadata, exposed lineage/team filters on `GET /api/v1/sessions`, added `GET /api/v1/sessions/directories` for exact-cwd grouping, refreshed the playground with grouped directory views plus websocket-driven catalog refreshes, and verified with `npm run build`, `npm run playground:build`, and `npx vitest run tests/unit/session-catalog.test.ts tests/e2e/api-session-catalog.test.ts tests/unit/search.test.ts tests/e2e/api-search.test.ts` |
| 2026-04-07 | Playground: tree-shaped session explorer with collapsible subagents | Passed | Orchestrator | Orchestrator | Reworked the sessions area into a directory-anchored explorer where parent sessions use a shared metadata grid and subagent lineage is rendered as collapsible child rows under each parent, preserving the linear/docs-like visual style; verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: compact Linear-style session row cleanup | Passed | Orchestrator | Orchestrator | Tightened the session explorer rows so titles carry muted session IDs inline, projects sit in a small badge beneath the title, preview copy is removed, and parent/subagent metadata uses a denser uniform grid with lower visual noise; verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Search/Sessions: registered metadata schema + metadata-aware search | Passed | Orchestrator | Orchestrator | Added first-class session metadata definitions and values in the SQLite store, exposed metadata CRUD routes under `/api/v1/sessions/metadata*`, attached metadata to `/api/v1/search`, `/api/v1/sessions`, and `/api/v1/sessions/directories`, added searchable/filterable metadata support to session search, and verified with `npm run build` plus `npx vitest run tests/unit/store.test.ts tests/unit/search.test.ts tests/e2e/api-search.test.ts tests/e2e/api-session-catalog.test.ts` |
| 2026-04-07 | Playground: expandable docs nav + metadata/examples lab | Passed | Orchestrator | Orchestrator | Reworked the playground sidebar into expandable documentation-style sections with subsection anchors, added example action lists across sessions/imports/live feed/teams/runtime, introduced a session metadata schema table plus a live metadata lab backed by the new API routes, and verified with `npm run build`, `npm run playground:build`, and `npx vitest run tests/unit/store.test.ts tests/unit/search.test.ts tests/e2e/api-search.test.ts tests/e2e/api-session-catalog.test.ts` |
| 2026-04-07 | Playground: multi-page shell + compact overview stats refactor | Passed | Orchestrator | Orchestrator | Split the playground from one long document into page-based views with hash-routed sidebar navigation, extracted shared types/components/page modules out of the monolithic `playground/src/app.tsx`, condensed the overview into compact stats tiles, and verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: merged overview stat strip spacing cleanup | Passed | Orchestrator | Orchestrator | Replaced the overview's separate stat tiles with a single spanning stat surface that uses internal dividers, reduced bottom padding in each stat cell so the strip sits tighter vertically, and verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: global compact stat strip standardization | Passed | Orchestrator | Orchestrator | Tightened the shared stat strip typography and spacing, converted the imports and runtime pages from row-based summaries to the same compact spanning stat surface used on overview, and verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: right-rail operations TOC + inline API examples | Passed | Orchestrator | Orchestrator | Replaced the page-level endpoint strips with a documentation-style right rail that lists operations and section anchors, moved the interactive "try the API" panes into the main content next to their relevant sections, aligned the left sidebar anchors to the new section map, and verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: compact nav + inline top control bars | Passed | Orchestrator | Orchestrator | Slimmed the left navigation width, removed the page-level right rails entirely, replaced large example lists with compact dropdown-driven control bars at the top of each page, and reflowed sessions/imports/live feed/runtime/agents into single-workspace content layouts; verified with `npm run build`, `npx tsc --noEmit`, and `npm run playground:build` |
| 2026-04-07 | Playground: endpoint rail return with inline controls preserved | Passed | Orchestrator | Orchestrator | Restored a lightweight sticky right rail for endpoints and in-page anchors, kept the compact inline toolbars in the main content, and refactored the page shell around a shared `PageBodyWithRail` component so the docs-style layout stays consistent across overview, sessions, imports, live feed, agents, and runtime; verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: move example runners into the right rail | Passed | Orchestrator | Orchestrator | Promoted the page quick examples into the shared right sidebar beneath the endpoint list, kept endpoint links at the top of the rail, removed duplicated inline example dropdowns from page content, and left the actual interactive controls in the main column; verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: tighter left nav and earlier right-rail breakpoint | Passed | Orchestrator | Orchestrator | Reduced the left sidebar shell by about 30px at desktop sizes and lowered the right utility rail visibility threshold from the old `xl` cutoff to a custom `1200px` minimum width so the endpoint/examples rail stays available on slightly narrower layouts; verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: narrower center-column threshold for right rail | Passed | Orchestrator | Orchestrator | Lowered the shared `PageBodyWithRail` breakpoint from `1200px` to `1120px` and tightened the intermediate column gap so the center content can shrink further before the right endpoint/examples rail hides; verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: wider right utility rail | Passed | Orchestrator | Orchestrator | Increased the shared right rail width from `220px` to `252px` in `PageBodyWithRail` so the endpoint and example stacks have more room without reworking individual pages; verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: runtime validation surface for tools and config inventory | Passed | Orchestrator | Orchestrator | Expanded the runtime page to present actual runtime tools, commands, skills, plugins, MCP servers, agents, and models from `/api/v1/config/runtime`, compare them against discovered skills/commands/agents/plugins/MCP from the middleware config endpoints, and expose richer raw payload previews for validation; verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: second right-rail width increase | Passed | Orchestrator | Orchestrator | Increased the shared right utility rail again from `252px` to `288px` so the endpoint list and example controls have more breathing room across all pages; verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: split runtime tools and commands into compact table sections | Passed | Orchestrator | Orchestrator | Reworked the runtime page so runtime tools and supported commands are separate sections instead of a side-by-side list block, added a reusable compact table component for denser API-style presentation, and updated the runtime page nav anchors accordingly; verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: dedicated runtime tool and command pages | Passed | Orchestrator | Orchestrator | Split runtime tools and supported commands into their own routed pages, extended sidebar child navigation so grouped runtime links can target dedicated pages, and simplified the runtime overview page to focus on the remaining comparison surfaces; verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground: compact runtime tables with hover preview cards | Passed | Orchestrator | Orchestrator | Converted the runtime overview plus runtime tools/commands pages from verbose list rows into compact badge-driven tables, moved detailed descriptions and paths into animated hover preview cards, and standardized the runtime validation surfaces around terse reference tables; verified with `npm run build` and `npm run playground:build` |
| 2026-04-07 | Playground/Config: searchable runtime resource pages + floating hover previews | Passed | Orchestrator | Orchestrator | Removed the leftover explanatory top bars from the teams/runtime validation pages, added backend `q=` filtering for config inventories plus dedicated runtime subresource routes (`/api/v1/config/runtime/{tools,commands,skills,plugins,mcp,agents,models}`), split the runtime area into dedicated searchable skills/plugins/MCP/agents/models pages, moved table detail into true floating hover previews that do not consume table space, and verified with `npm run build`, `npm run playground:build`, and `npx vitest run tests/e2e/api-config.test.ts` |
| 2026-04-08 | Playground: table control row alignment cleanup | Passed | Orchestrator | Orchestrator | Updated the shared compact data table header so search inputs sit on the left above the table and count/meta badges align on the right, applying the tighter reference-table layout consistently across the runtime inventory pages; verified with `npm run build` and `npm run playground:build` |
| 2026-04-08 | Playground: loading overlay for searchable tables | Passed | Orchestrator | Orchestrator | Changed the shared compact data table so runtime/resource queries keep the search row, count badges, and table frame visible while loading, with a centered spinner overlay instead of collapsing into a separate loading state block; verified with `npm run build` and `npm run playground:build` |
| 2026-04-08 | Playground: denser sidebar navigation styling | Passed | Orchestrator | Orchestrator | Tightened the left sidebar by reducing top-level item font size, padding, gaps, and header spacing, and replaced the active item's left-border treatment with a cleaner filled background state so the nav reads more like a compact Linear-style list; verified with `npm run playground:build` |
| 2026-04-08 | Playground: interactive runtime previews + resource detail drawers | Passed | Orchestrator | Orchestrator | Upgraded the shared runtime/resource tables so hover previews render as true floating popovers instead of non-interactive overlays, added click-through detail drawers for every runtime inventory row, and refined the skills page preview to show truncated descriptions, copyable truncated paths, and no badge clutter while keeping the full description in the drawer; verified with `npm run build` and `npm run playground:build` |
| 2026-04-08 | Playground: normalize passive inventories to compact table pattern | Passed | Orchestrator | Orchestrator | Converted the sessions `Directory groups` surface, the runtime overview's resource-page index, and the teams/agents inventory sections to the shared compact table pattern with hover previews and drawers, leaving only the session explorer as a purpose-built hierarchical tree; verified with `npm run build` and `npm run playground:build` |
