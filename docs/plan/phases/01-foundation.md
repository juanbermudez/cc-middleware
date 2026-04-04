# Phase 1: Foundation

**Status**: Not Started
**Depends On**: None
**Blocks**: All other phases

## Goal

Set up the TypeScript project scaffold with build system, test harness, and core type definitions that all other phases build on.

## Task 1.1: Initialize Project Scaffold

### What to Create

**`package.json`**:
```json
{
  "name": "cc-middleware",
  "version": "0.1.0",
  "description": "Middleware for managing and observing Claude Code sessions",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:e2e": "vitest run tests/e2e",
    "test:watch": "vitest",
    "lint": "eslint src/ tests/",
    "start": "node dist/api/server.js"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**Dependencies** (install exact versions):
- `@anthropic-ai/claude-agent-sdk` - Core SDK
- `better-sqlite3` - SQLite for session indexing
- `fastify` - HTTP server
- `@fastify/cors` - CORS support
- `@fastify/websocket` - WebSocket support
- `ws` - WebSocket client (for tests)
- `zod` - Schema validation
- `gray-matter` - Markdown frontmatter parsing (for agent definitions)
- `eventemitter3` - Typed event emitter

**Dev dependencies**:
- `typescript` (^5.5)
- `vitest` (^3.0)
- `@types/better-sqlite3`
- `@types/ws`
- `eslint`
- `@typescript-eslint/eslint-plugin`
- `@typescript-eslint/parser`

**`tsconfig.json`**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**`vitest.config.ts`**:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 60000, // E2E tests may take time
    hookTimeout: 30000,
  },
});
```

**`.gitignore`**:
```
node_modules/
dist/
*.db
*.db-journal
.env
```

### Verification
```bash
npm install && npx tsc --noEmit
# Exit code 0 = pass
```

---

## Task 1.2: Define Core Types

### What to Create

**`src/types/sessions.ts`**:
Types aligned with Agent SDK's `SDKSessionInfo` and `SessionMessage`:
- `SessionInfo` - Maps from `SDKSessionInfo`: sessionId, summary, lastModified, fileSize?, customTitle?, firstPrompt?, gitBranch?, cwd?, tag?, createdAt?
- `SessionMessage` - Maps from SDK `SessionMessage`: type ("user"|"assistant"), uuid, session_id, message (unknown raw payload), parent_tool_use_id (null)
- `SessionFilter` - Filters for listing (project, dateRange, tags, status)
- `ActiveSession` - Running session with query (Query object), abortController, stream reference
- `SessionLaunchOptions` - Options for launching headless sessions (see Phase 3 LaunchOptions for full field list)
- `SessionResult` - Result of a completed session. Maps from `SDKResultMessage`: subtype (success|error_max_turns|error_during_execution|error_max_budget_usd|error_max_structured_output_retries), sessionId, result?, errors?, durationMs, durationApiMs, totalCostUsd, numTurns, stopReason, usage (NonNullableUsage), modelUsage, permissionDenials, structuredOutput?

**`src/types/hooks.ts`**:
Types matching Claude Code's hook system. NOTE: There are two distinct type systems:
1. **HookJSONOutput** - What hook callbacks (Phase 4) return
2. **PermissionResult** - What canUseTool (Phase 5) returns

Types to define:
- `HookEventType` - Union of all event type strings (including `Setup`)
- `BlockingEventType` - Subset of events that can block/deny
- `HookInput` - Union of all hook input types (re-export from SDK's `HookInput`)
- `HookJSONOutput` - Re-export from SDK: `{ systemMessage?, continue?, decision?, hookSpecificOutput? }`
- `HookCallback` - Re-export from SDK: `(input, toolUseID, { signal }) => Promise<HookJSONOutput>`
- `HookCallbackMatcher` - Re-export from SDK: `{ matcher?, hooks, timeout? }`
- `HookHandler<T>` - Our handler type: `(input: T) => Promise<HookJSONOutput>`
- `HookSubscription` - Registration record (id, event, handler, matcher)
- `AsyncHookJSONOutput` - `{ async: true, asyncTimeout?: number }` for fire-and-forget hooks

**`src/types/agents.ts`**:
- `AgentDefinition` - Re-export from SDK. Fields: description (required), prompt (required), tools?, disallowedTools?, model? ("sonnet"|"opus"|"haiku"|"inherit"), mcpServers? (AgentMcpServerSpec[]), skills?, maxTurns?, criticalSystemReminder_EXPERIMENTAL?
- `AgentInfo` - Light metadata from SDK: name, description, model?
- `TeamConfig` - Team name, members, task list path
- `TeamMember` - Name, agent ID, agent type, status
- `TeamTask` - ID, description, status, assignee, dependencies

**`src/types/errors.ts`**:
- `MiddlewareError` - Base error class with code and details
- `SessionNotFoundError`
- `SessionAlreadyActiveError`
- `PermissionDeniedError`
- `AgentNotFoundError`
- `HookTimeoutError`

**`src/types/index.ts`**:
Re-export everything from the above files.

### Verification
```bash
npx tsc --noEmit
# Exit code 0 = pass
```

---

## Task 1.3: Create Test Harness

### What to Create

**`tests/helpers/fixtures.ts`**:
- Mock session data generators
- Mock hook event payloads
- Test project directory paths

**`tests/helpers/setup.ts`**:
- Global test setup (ensure test temp directory exists)
- Cleanup hooks

**`tests/unit/types.test.ts`**:
- Simple test that imports all types and verifies they're defined
- Test error class inheritance

**`tests/e2e/sdk-available.test.ts`**:
- Verify `@anthropic-ai/claude-agent-sdk` is importable
- Verify `listSessions` function exists
- Verify `query` function exists

### Verification
```bash
npm test
# All tests pass, exit code 0
```
