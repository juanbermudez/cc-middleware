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
- **search** <query>: GET http://127.0.0.1:3000/api/v1/search?q=<query> - Search sessions
- **config**: GET http://127.0.0.1:3000/api/v1/config/settings - Show effective settings
- **plugins**: GET http://127.0.0.1:3000/api/v1/config/plugins - List plugins
- **mcp**: GET http://127.0.0.1:3000/api/v1/config/mcp - List MCP servers

Use the WebFetch tool to call these endpoints and present the results to the user in a clear, formatted way.

If no argument is given, default to showing the status.
