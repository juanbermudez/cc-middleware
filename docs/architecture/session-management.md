# Session Management Architecture

## Overview

The session management layer provides a unified interface over Claude Code sessions, covering discovery of past sessions, launching new headless sessions, streaming, resume/fork, and lifecycle tracking.

## Components

### Discovery (`src/sessions/discovery.ts`)
Wraps `listSessions()` from the Agent SDK to enumerate sessions across all projects or within a specific directory.

- Normalizes `SDKSessionInfo` to our `SessionInfo` type
- Handles missing directories gracefully
- Sorts by last modified descending

### Messages (`src/sessions/messages.ts`)
Wraps `getSessionMessages()` for reading session history.

- Maps raw transcript entries to `SessionMessage` type
- Supports pagination (limit/offset)
- Extracts text content and tool use information

### Info (`src/sessions/info.ts`)
Single-session metadata operations via `getSessionInfo()`, `renameSession()`, `tagSession()`.

### Launcher (`src/sessions/launcher.ts`)
Wraps `query()` for launching headless sessions.

**Single-turn**: Runs to completion, returns `LaunchResult` with output, cost, and session ID.

**Streaming**: Returns `StreamingSession` with async iterable of events and a result promise. Events include text deltas, tool use start/end, and system messages.

**Resume**: Takes a session ID and follow-up prompt. The agent has full context from the original session.

**Fork**: Creates a new session branching from an existing one, leaving the original unchanged.

### Manager (`src/sessions/manager.ts`)
Central coordinator that tracks active sessions and emits lifecycle events.

- Maintains a `Map<string, ActiveSession>` for sessions launched by this middleware instance
- Wraps launcher functions with tracking
- Emits events: `session:started`, `session:completed`, `session:errored`, `session:aborted`
- Provides `abort(sessionId)` via `AbortController`
- Cleanup on `destroy()`

## Session Lifecycle States

```
                    ┌──────────┐
                    │ Launching │
                    └─────┬────┘
                          │
                    ┌─────▼────┐
               ┌───>│  Active   │<────┐
               │    └─────┬────┘     │
               │          │          │
          ┌────┴───┐ ┌───▼────┐ ┌──┴──────┐
          │Streaming│ │Waiting │ │ Resumed │
          │ Events  │ │ Input  │ │         │
          └────┬───┘ └───┬────┘ └──┬──────┘
               │         │         │
               └────┬────┘─────────┘
                    │
          ┌─────────┼──────────┐
          │         │          │
    ┌─────▼───┐ ┌──▼─────┐ ┌─▼──────┐
    │Completed│ │ Errored│ │Aborted │
    └─────────┘ └────────┘ └────────┘
```

## Session Storage

Claude Code stores sessions at:
```
~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
```

Each JSONL line is a transcript entry (user message, assistant message, tool use, tool result, system event). The Agent SDK handles reading and writing these files.

The middleware's SQLite index (`src/store/`) provides searchable metadata on top of this storage.
