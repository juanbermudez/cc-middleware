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
