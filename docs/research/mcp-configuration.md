# MCP Server Configuration

## Overview

Claude Code connects to external tools via the Model Context Protocol (MCP). MCP servers provide Claude with access to databases, APIs, issue trackers, and other services. Servers can be stdio (local process), HTTP (remote), or SSE (deprecated remote). Configuration is stored in multiple locations depending on scope.

## File Locations

| Scope | File Path | Shared | Description |
|-------|-----------|--------|-------------|
| **Local** (default) | `~/.claude.json` (under project path in `projects.<path>.mcpServers`) | No | Personal, per-project MCP servers |
| **User** | `~/.claude.json` (top-level `mcpServers` field) | No | Personal, cross-project servers |
| **Project** | `.mcp.json` in project root | Yes (VCS) | Team-shared MCP servers |
| **Managed** | `managed-mcp.json` in system directory | Yes (IT) | Organization-enforced servers |
| **Plugin** | `<plugin>/.mcp.json` or inline in `plugin.json` | Via plugin | Plugin-bundled servers |
| **Agent inline** | Agent frontmatter `mcpServers` field | Via agent | Per-agent scoped servers |

### Managed MCP Locations

| Platform | Path |
|----------|------|
| macOS | `/Library/Application Support/ClaudeCode/managed-mcp.json` |
| Linux/WSL | `/etc/claude-code/managed-mcp.json` |
| Windows | `C:\Program Files\ClaudeCode\managed-mcp.json` |

## Scope Hierarchy and Precedence

When servers with the same name exist at multiple scopes:
1. **Local** (highest) -- per-project in `~/.claude.json`
2. **Project** -- `.mcp.json`
3. **User** -- cross-project in `~/.claude.json`

Local configs override project, which overrides user. If a server is configured both locally and through a claude.ai connector, the local configuration takes precedence.

## .mcp.json Format

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio|http|sse",
      "command": "npx",
      "args": ["-y", "@package/name"],
      "env": {
        "API_KEY": "${MY_API_KEY}"
      },
      "cwd": "/optional/working/dir"
    }
  }
}
```

### Server Types

#### stdio (Local Process)

```json
{
  "mcpServers": {
    "db-tools": {
      "command": "npx",
      "args": ["-y", "@bytebase/dbhub", "--dsn", "postgresql://..."],
      "env": {
        "DB_URL": "${DB_URL}"
      }
    }
  }
}
```

Fields: `command` (required), `args` (optional), `env` (optional), `cwd` (optional)

#### HTTP (Remote)

```json
{
  "mcpServers": {
    "notion": {
      "type": "http",
      "url": "https://mcp.notion.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }
}
```

Fields: `type: "http"` (required), `url` (required), `headers` (optional), `oauth` (optional), `headersHelper` (optional)

#### SSE (Deprecated Remote)

```json
{
  "mcpServers": {
    "asana": {
      "type": "sse",
      "url": "https://mcp.asana.com/sse",
      "headers": {
        "X-API-Key": "${API_KEY}"
      }
    }
  }
}
```

Fields: Same as HTTP but `type: "sse"`.

### OAuth Configuration

```json
{
  "mcpServers": {
    "server": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "oauth": {
        "clientId": "your-client-id",
        "callbackPort": 8080,
        "authServerMetadataUrl": "https://auth.example.com/.well-known/openid-configuration"
      }
    }
  }
}
```

### Dynamic Headers

```json
{
  "mcpServers": {
    "internal-api": {
      "type": "http",
      "url": "https://mcp.internal.example.com",
      "headersHelper": "/opt/bin/get-mcp-auth-headers.sh"
    }
  }
}
```

The `headersHelper` command output is merged into connection headers.

## Environment Variable Expansion

Supported in: `command`, `args`, `env`, `url`, `headers`

| Syntax | Description |
|--------|-------------|
| `${VAR}` | Expand to value of VAR |
| `${VAR:-default}` | Use VAR if set, otherwise use default |

If a required variable is unset and has no default, Claude Code fails to parse the config.

Plugin-specific variables:
- `${CLAUDE_PLUGIN_ROOT}` -- plugin installation directory
- `${CLAUDE_PLUGIN_DATA}` -- persistent data directory

## MCP Settings in settings.json

| Setting | Type | Description |
|---------|------|-------------|
| `enableAllProjectMcpServers` | boolean | Auto-approve all .mcp.json servers |
| `enabledMcpjsonServers` | string[] | Specific .mcp.json servers to approve |
| `disabledMcpjsonServers` | string[] | Specific .mcp.json servers to reject |
| `allowedMcpServers` | array | (Managed only) MCP server allowlist |
| `allowManagedMcpServersOnly` | boolean | (Managed only) Only managed allowlist applies |
| `deniedMcpServers` | array | (Managed only) MCP server denylist |

## MCP Storage in ~/.claude.json

MCP servers are stored within `~/.claude.json` in two places:

### Per-Project (Local Scope)

```json
{
  "projects": {
    "/Users/user/project-path": {
      "mcpServers": {
        "server-name": { ... }
      },
      "enabledMcpjsonServers": [],
      "disabledMcpjsonServers": [],
      "mcpContextUris": []
    }
  }
}
```

### User Scope

Top-level `mcpServers` in `~/.claude.json`.

## CLI Commands

```bash
# Add servers
claude mcp add --transport http <name> <url>
claude mcp add --transport sse <name> <url>
claude mcp add --transport stdio <name> -- <command> [args...]
claude mcp add-json <name> '<json-config>'

# Options for add
--scope local|project|user    # Default: local
--env KEY=value               # Set environment variable
--header "Name: Value"        # Set HTTP header
--client-id <id>              # OAuth client ID
--client-secret               # Prompt for OAuth secret
--callback-port <port>        # Fixed OAuth callback port

# Manage servers
claude mcp list               # List all configured servers
claude mcp get <name>         # Get server details
claude mcp remove <name>      # Remove a server
claude mcp reset-project-choices  # Reset project server approvals

# In REPL
/mcp                          # View status, authenticate
```

## Agent-Scoped MCP Servers

Agents can define MCP servers that only connect during that agent's execution:

```yaml
---
name: browser-tester
mcpServers:
  - playwright:
      type: stdio
      command: npx
      args: ["-y", "@playwright/mcp@latest"]
  - github
---
```

Inline definitions are connected at agent start, disconnected at finish. String references share the parent session's connection.

## Plugin MCP Servers

Plugins define MCP servers in `.mcp.json` at the plugin root or inline in `plugin.json`:

```json
{
  "mcpServers": {
    "db-tools": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
      "env": { "DB_URL": "${DB_URL}" }
    }
  }
}
```

- Start automatically when plugin is enabled
- Run `/reload-plugins` to reconnect after enable/disable
- Use `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` for paths

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MCP_TIMEOUT` | Startup timeout in ms (e.g., `MCP_TIMEOUT=10000 claude`) |
| `MAX_MCP_OUTPUT_TOKENS` | Override 10,000 token warning threshold |

## How to Read Programmatically

1. Parse `~/.claude.json` for user-scope and per-project local-scope MCP servers
2. Parse `<project>/.mcp.json` for project-scope servers
3. Parse managed-mcp.json if it exists
4. For each enabled plugin, parse `<cache-path>/.mcp.json`
5. Apply precedence: local > project > user
6. Check `enabledMcpjsonServers` / `disabledMcpjsonServers` for approval status

## How to Manage Programmatically

### Add a Server
- **Best**: Use `claude mcp add` CLI command
- **Alternative**: Edit `~/.claude.json` directly (for local/user scope) or `.mcp.json` (for project scope)

### Remove a Server
- **Best**: Use `claude mcp remove` CLI command
- **Alternative**: Remove from the appropriate JSON file

### Enable/Disable Project Servers
Edit `enabledMcpjsonServers` or `disabledMcpjsonServers` in `~/.claude.json` under the project path, or set `enableAllProjectMcpServers: true` in settings.json.

## Actual State on This Machine

### Project-Level (.mcp.json)
No `.mcp.json` file exists in the cc-middleware project.

### User/Local MCP Servers
All project entries in `~/.claude.json` have empty `mcpServers: {}`, meaning no MCP servers are configured for any project.

### Managed MCP
No managed MCP configuration exists (`/Library/Application Support/ClaudeCode/` does not exist).

## API Implications

### Read Endpoints
- `GET /api/mcp/servers` -- all MCP servers with scope/source annotations
- `GET /api/mcp/servers/:name` -- details for a specific server
- `GET /api/mcp/status` -- connection status of active servers

### Write Endpoints
- `POST /api/mcp/servers` -- add a new MCP server (scope, type, config)
- `DELETE /api/mcp/servers/:name` -- remove a server
- `PUT /api/mcp/servers/:name` -- update server config
- `POST /api/mcp/servers/:name/approve` -- approve a project .mcp.json server
- `POST /api/mcp/servers/:name/reject` -- reject a project .mcp.json server

### Considerations
- Adding stdio servers requires specifying command + args
- HTTP servers may need OAuth flow (complex, involves browser redirect)
- Environment variable expansion in configs means stored vs. effective config differ
- MCP servers in `~/.claude.json` are mixed with other data (per-project state)
- The `claude mcp` CLI is the safest way to manage servers (handles all edge cases)
- Plugin MCP servers are managed through the plugin system, not directly
