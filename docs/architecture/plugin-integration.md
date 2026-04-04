# Plugin Integration Architecture

## Overview

CC-Middleware can be installed as a Claude Code plugin, enabling it to receive hook events from interactive Claude Code sessions and provide middleware functionality directly within Claude Code.

## Plugin Mode vs SDK Mode

| Aspect | Plugin Mode | SDK Mode |
|--------|-------------|----------|
| **Sessions** | Existing interactive sessions | Programmatically launched |
| **Hooks** | HTTP hooks (POST to middleware) | TypeScript callbacks (in-process) |
| **Latency** | Higher (HTTP round-trip) | Lower (function call) |
| **Setup** | Install plugin, start server | Import and call SDK |
| **Use case** | Observe/control interactive sessions | Build automation |

Both modes dispatch to the same event bus, so consumers don't need to know the source.

## Plugin Structure

```
src/plugin/
├── .claude-plugin/
│   └── plugin.json         # Manifest
├── hooks/
│   └── hooks.json          # HTTP hooks → middleware server
├── skills/
│   └── cc-middleware/
│       └── SKILL.md        # In-session middleware commands
├── bin/
│   └── start-server.sh     # Helper to start middleware
└── settings.json           # Default env vars
```

## HTTP Hook Flow

When the plugin is installed and the middleware server is running:

1. Claude Code fires a hook event (e.g., PreToolUse)
2. Plugin's `hooks.json` routes it as HTTP POST to `http://127.0.0.1:3001/hooks/PreToolUse`
3. Middleware's hook server receives the payload
4. Event is dispatched to the event bus
5. Blocking handler (if any) returns a decision
6. Response flows back to Claude Code

**Graceful degradation**: If the middleware server is not running, HTTP hooks timeout. Since the timeout produces a non-blocking error (exit code != 0, != 2), Claude Code continues normally. The plugin does not break Claude Code when the server is down.

## Plugin Installation

```bash
# Development: load from directory
claude --plugin-dir /path/to/cc-middleware/src/plugin

# Or in Claude Code session
/reload-plugins

# Production: install from marketplace (future)
claude plugin install cc-middleware
```

## Skill Usage

The `/cc-middleware` skill provides in-session access to middleware functionality:

```
/cc-middleware status     - Show middleware server status
/cc-middleware sessions   - List recent sessions
/cc-middleware agents     - List available agents
/cc-middleware teams      - List active teams
```

The skill instructs Claude to use `WebFetch` to call the middleware's REST API.
