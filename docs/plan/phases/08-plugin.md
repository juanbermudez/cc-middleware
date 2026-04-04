# Phase 8: Plugin Integration

**Status**: Not Started
**Depends On**: Phase 4 (Event System), Phase 7 (API Layer)
**Blocks**: None

## Goal

Package the middleware as an installable Claude Code plugin that integrates with Claude Code's hook system, provides skills for interacting with the middleware, and optionally exposes the API via MCP.

## Plugin Structure

```
src/plugin/
├── .claude-plugin/
│   └── plugin.json           # Plugin manifest
├── hooks/
│   └── hooks.json            # Hook configurations
├── skills/
│   └── cc-middleware/
│       └── SKILL.md          # Middleware interaction skill
├── bin/
│   └── start-server.sh       # Script to start middleware server
└── settings.json             # Default settings
```

---

## Task 8.1: Plugin Manifest

### Implementation: `src/plugin/.claude-plugin/plugin.json`

```json
{
  "name": "cc-middleware",
  "version": "0.1.0",
  "description": "Middleware for managing and observing Claude Code sessions",
  "author": {
    "name": "cc-middleware"
  },
  "hooks": "./hooks/hooks.json",
  "skills": "./skills/"
}
```

### Implementation: `src/plugin/settings.json`

```json
{
  "env": {
    "CC_MIDDLEWARE_PORT": "3000",
    "CC_MIDDLEWARE_HOOK_PORT": "3001"
  }
}
```

### Verification

```bash
# Test: Plugin loads without error
claude --plugin-dir src/plugin -p "Hello" --allowedTools "" --maxTurns 1
# Should not produce plugin loading errors
```

---

## Task 8.2: Plugin Hooks Configuration

### Implementation: `src/plugin/hooks/hooks.json`

```json
{
  "description": "CC-Middleware hook integration - dispatches events to middleware",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:3001/hooks/PreToolUse",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:3001/hooks/PostToolUse",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": null,
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:3001/hooks/SessionStart",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": null,
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:3001/hooks/SessionEnd",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": null,
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:3001/hooks/Stop",
            "timeout": 10
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": null,
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:3001/hooks/SubagentStart",
            "timeout": 10
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "matcher": null,
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:3001/hooks/SubagentStop",
            "timeout": 10
          }
        ]
      }
    ],
    "TaskCreated": [
      {
        "matcher": null,
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:3001/hooks/TaskCreated",
            "timeout": 10
          }
        ]
      }
    ],
    "TaskCompleted": [
      {
        "matcher": null,
        "hooks": [
          {
            "type": "http",
            "url": "http://127.0.0.1:3001/hooks/TaskCompleted",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

**Key design**: All hooks are HTTP hooks pointing at the middleware's hook server (port 3001). The middleware server must be running for hooks to function. If the server is not running, hooks timeout gracefully (non-blocking error, exit != 0 and != 2).

### Verification (E2E)

**`tests/e2e/plugin-hooks.test.ts`**:
```typescript
// Test: Plugin hooks dispatch to middleware
// 1. Start middleware server (including hook server)
// 2. Register event listener on event bus
// 3. Launch: claude --plugin-dir src/plugin -p "Read package.json" --allowedTools "Read"
// 4. Verify SessionStart and PostToolUse events received by middleware
```

---

## Task 8.3: Plugin Skill

### Implementation: `src/plugin/skills/cc-middleware/SKILL.md`

```markdown
---
name: cc-middleware
description: Interact with the CC-Middleware API to manage sessions, view agents, and check status. Use when the user asks about middleware status, session management, or agent configuration.
---

# CC-Middleware Control

You have access to the CC-Middleware API running at http://127.0.0.1:3000.

## Available Commands

When the user invokes /cc-middleware, use $ARGUMENTS to determine what they want:

- **status**: GET http://127.0.0.1:3000/api/v1/status - Show middleware status
- **sessions**: GET http://127.0.0.1:3000/api/v1/sessions - List recent sessions
- **agents**: GET http://127.0.0.1:3000/api/v1/agents - List available agents
- **teams**: GET http://127.0.0.1:3000/api/v1/teams - List active teams

Use the WebFetch tool to call these endpoints and present the results to the user.
```

### Verification

```bash
# Verify skill is discoverable
claude --plugin-dir src/plugin -p "What skills are available?" --maxTurns 1
# Should list cc-middleware skill
```

---

## Task 8.4: Plugin MCP Server (Optional)

### Implementation: `src/plugin/mcp-server.ts`

Use the Agent SDK's `createSdkMcpServer()` to expose middleware tools:

```typescript
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const listSessionsTool = tool(
  "cc_list_sessions",
  "List recent Claude Code sessions",
  { limit: z.number().optional(), project: z.string().optional() },
  async ({ limit, project }) => {
    // Call middleware API
    const response = await fetch(`http://127.0.0.1:3000/api/v1/sessions?limit=${limit || 10}`);
    const data = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  },
  { annotations: { readOnlyHint: true } }
);

const server = createSdkMcpServer({
  name: "cc-middleware",
  version: "0.1.0",
  tools: [listSessionsTool, /* more tools */],
});
```

### Verification (E2E)

**`tests/e2e/plugin-mcp.test.ts`**:
```typescript
// Test: MCP server tools are available
// 1. Start middleware server
// 2. Launch session with MCP server
// 3. Verify cc_list_sessions tool is available
```
