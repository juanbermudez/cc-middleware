# CC-Middleware

A Node/TypeScript middleware that wraps Claude Code, providing a clean API for managing sessions, dispatching hook events, launching headless sessions, handling permissions, and exposing sub-agents and agent teams.

## Project Overview

This middleware creates a central API layer over Claude Code that enables:
- **Session management**: List, search, launch, resume, and stream Claude Code sessions
- **Hook event system**: Dispatch and subscribe to lifecycle events with blocking hook stubs
- **Permission handling**: Programmatic control of tool approvals and AskUserQuestion
- **Agent/Team management**: Expose sub-agent definitions and agent teams
- **Plugin integration**: Installable as a Claude Code plugin
- **Session indexing**: SQLite-based session search and history
- **Real-time sync**: File watchers for sessions, configs, agents, skills, rules, plugins, memory, and teams with WebSocket push and auto-indexing

## Build & Test Commands

```bash
npm install          # Install dependencies
npm run build        # Build TypeScript
npm run dev          # Run in dev mode with watch
npm test             # Run all tests
npm run test:unit    # Run unit tests only
npm run test:e2e     # Run E2E tests only
npm run lint         # Lint code
```

## Architecture

See [docs/architecture/README.md](docs/architecture/README.md) for full architecture documentation.

**Core modules:**
- `src/sessions/` - Session discovery, launching, streaming, indexing
- `src/hooks/` - Event bus, HTTP hook server, handler registration
- `src/permissions/` - Permission policy manager, canUseTool implementation
- `src/agents/` - Agent definition reader, team launcher, team monitor
- `src/api/` - REST/WebSocket API server, route handlers
- `src/plugin/` - Claude Code plugin manifest, hook configs, skills
- `src/types/` - Shared TypeScript type definitions
- `src/store/` - SQLite session index store
- `src/sync/` - Real-time file watchers (session-watcher, config-watcher, auto-indexer)
- `src/config/` - Settings reader/writer, plugin/MCP/memory management

## Key Dependencies

- `@anthropic-ai/claude-agent-sdk` - Core SDK for programmatic Claude Code control
- `better-sqlite3` - Local SQLite database for session indexing
- `fastify` - HTTP API server
- `ws` - WebSocket for real-time session streaming
- `vitest` - Test framework
- `zod` - Schema validation

## Code Style

- Use TypeScript strict mode
- Prefer `async/await` over raw promises
- Use Zod for all external input validation
- Export types from `src/types/` - do not define types inline in implementation files
- Use named exports, not default exports
- Error handling: throw typed errors from `src/types/errors.ts`
- Keep modules small and focused - one responsibility per file
- No classes unless truly needed - prefer functions and plain objects

## Local Environment

The `claude` CLI is installed and authenticated at `/Users/zef/.local/bin/claude` (v2.1.92). Integration tests can use:
- **Agent SDK** (`query()`) - inherits auth from the environment
- **Claude CLI** (`claude -p`) - already authenticated, useful for testing plugin/hook integration paths
- Use `claude -p "prompt" --allowedTools "Read" --output-format json` for headless CLI tests
- Use `--settings '<json>'` to pass inline settings (hook configs, permissions) for CLI tests

## Test Structure

- `tests/unit/` - Unit tests with synthetic data (no API calls)
- `tests/e2e/` - E2E tests that may hit real API or filesystem
- `tests/integration/` - Integration tests that wire multiple systems together with real API calls
- Run all: `npm test`
- Run integration only: `npx vitest run tests/integration`

## Session Storage

Sessions are stored by Claude Code at:
```
~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
```
Where `<encoded-cwd>` replaces non-alphanumeric chars with `-`.

Use the Agent SDK's `listSessions()` and `getSessionMessages()` for reading.
Use the Agent SDK's `query()` with `resume` for continuing sessions.

## Hook Event System

The middleware dispatches events matching Claude Code's hook lifecycle:
- PreToolUse, PostToolUse, PostToolUseFailure
- SessionStart, SessionEnd
- SubagentStart, SubagentStop
- TaskCreated, TaskCompleted
- TeammateIdle
- Stop, UserPromptSubmit, PermissionRequest

Blocking hooks return `{ behavior: "allow" }` by default (stub). Consumers register handlers to add functionality.

## Agent SDK Usage

Use `@anthropic-ai/claude-agent-sdk` for all programmatic session control:
```typescript
import { query, listSessions, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";
```

Key patterns:
- `query({ prompt, options })` - Launch/resume sessions
- `options.canUseTool` - Handle permission requests programmatically
- `options.includePartialMessages` - Enable streaming
- `options.hooks` - Register TypeScript hook callbacks
- `listSessions({ dir })` - Discover past sessions
- `getSessionMessages(id)` - Read session history

---

# ORCHESTRATOR INSTRUCTIONS (Ralph Wiggum Loop)

**You are the orchestrator.** Each time you start a loop iteration:

## Step 1: Read State
1. Read `docs/plan/PLAN.md` to understand the full project plan
2. Read `docs/plan/Progress.md` to see what's been completed
3. Read `docs/plan/Learnings.md` to avoid repeating mistakes

## Step 2: Determine Next Task
- Find the first incomplete task in PLAN.md that has all dependencies met
- If a task failed verification in a prior loop, prioritize fixing it
- Skip tasks marked as blocked

## Step 3: Implement (via Sub-Agent)
- Launch a sub-agent (type: `general-purpose`) to implement the task
- Give the sub-agent the FULL context: which phase, which task, what files to create/modify
- Tell the sub-agent to read this CLAUDE.md and the relevant phase doc
- The sub-agent should write code, not just plan

## Step 4: Verify (via SEPARATE Sub-Agent)
- Launch a DIFFERENT sub-agent to verify the implementation
- The verifier must run the actual tests or verification steps listed in the task
- The verifier should NOT have implemented the code - fresh eyes
- If verification fails, document the failure in Progress.md and Learnings.md

## Step 5: Document
After EACH task (whether it passed or failed verification):
1. Update `docs/plan/Progress.md` with:
   - Task ID, status (passed/failed), timestamp
   - What was implemented
   - What the verifier found
2. Update `docs/plan/Learnings.md` with:
   - Any non-obvious discoveries
   - Patterns that worked or didn't
   - SDK quirks, API behaviors, gotchas

## Step 6: Document Middleware (via Sub-Agent)
- After completing each phase (all tasks in a phase pass), launch a documentation sub-agent
- The doc agent updates `docs/architecture/` and `docs/api/` with current state
- Keep docs in sync with implementation

## Critical Rules
- **Never skip verification** - every feature must be verified by a separate agent
- **Never skip documentation** - update Progress.md and Learnings.md after every task
- **Progressive development** - each phase builds on the previous, don't skip ahead
- **Small commits** - commit after each verified task
- **Read before writing** - always read existing files before modifying them
- **Test isolation** - E2E tests should be self-contained and not depend on external state
