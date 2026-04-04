# Plugin System

## Overview

Claude Code's plugin system allows extending functionality with skills, agents, hooks, MCP servers, LSP servers, and executables. Plugins are distributed through marketplaces (Git repositories or other sources), installed to a local cache, and enabled/disabled per scope. Each plugin is namespaced to avoid conflicts.

## File Locations

| Path | Purpose | Version-Controlled |
|------|---------|-------------------|
| `~/.claude/plugins/installed_plugins.json` | Registry of all installed plugins | No |
| `~/.claude/plugins/known_marketplaces.json` | Registered marketplace sources | No |
| `~/.claude/plugins/blocklist.json` | Centrally-blocked plugins | No (fetched) |
| `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` | Cached plugin files | No |
| `~/.claude/plugins/marketplaces/<marketplace>/` | Cloned marketplace repos | No |
| `~/.claude/plugins/data/<plugin-id>/` | Persistent plugin data (`${CLAUDE_PLUGIN_DATA}`) | No |
| `~/.claude/plugins/install-counts-cache.json` | Plugin popularity data | No |
| `~/.claude/settings.json` → `enabledPlugins` | User-scope plugin enable/disable | No |
| `.claude/settings.json` → `enabledPlugins` | Project-scope plugin enable/disable | Yes |
| `.claude/settings.local.json` → `enabledPlugins` | Local-scope plugin enable/disable | No |

## Plugin Manifest Schema (`.claude-plugin/plugin.json`)

The manifest is **optional**. If omitted, Claude Code auto-discovers components from default directories and derives the name from the directory name.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier (kebab-case), used as namespace prefix |

### Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Semantic version (`MAJOR.MINOR.PATCH`) |
| `description` | string | Brief explanation of purpose |
| `author` | object | `{name, email, url}` |
| `homepage` | string | Documentation URL |
| `repository` | string | Source code URL |
| `license` | string | License identifier (e.g., `"MIT"`) |
| `keywords` | string[] | Discovery tags |

### Component Path Fields

| Field | Type | Default Location | Description |
|-------|------|-----------------|-------------|
| `commands` | string/array | `commands/` | Skill/command markdown files |
| `agents` | string/array | `agents/` | Agent markdown files |
| `skills` | string/array | `skills/` | Skill directories with `SKILL.md` |
| `hooks` | string/array/object | `hooks/hooks.json` | Hook configuration |
| `mcpServers` | string/array/object | `.mcp.json` | MCP server definitions |
| `outputStyles` | string/array | `output-styles/` | Output style definitions |
| `lspServers` | string/array/object | `.lsp.json` | LSP server configurations |
| `userConfig` | object | - | User-configurable values prompted at enable time |
| `channels` | array | - | Channel declarations for message injection |

### User Configuration Schema

```json
{
  "userConfig": {
    "key_name": {
      "description": "Human-readable description",
      "sensitive": false
    }
  }
}
```

- Non-sensitive values stored in `settings.json` under `pluginConfigs[<plugin-id>].options`
- Sensitive values stored in system keychain or `~/.claude/.credentials.json`
- Available as `${user_config.KEY}` in configs and `CLAUDE_PLUGIN_OPTION_<KEY>` env vars

### Channel Schema

```json
{
  "channels": [
    {
      "server": "server-name",
      "userConfig": { ... }
    }
  ]
}
```

## Plugin Directory Structure

```
my-plugin/
├── .claude-plugin/           # Metadata (optional)
│   └── plugin.json
├── commands/                 # Skill markdown files (legacy)
├── agents/                   # Agent markdown files
├── skills/                   # Skills with SKILL.md
│   └── my-skill/
│       └── SKILL.md
├── output-styles/            # Output style definitions
├── hooks/                    # Hook configurations
│   └── hooks.json
├── bin/                      # Executables added to Bash PATH
├── settings.json             # Default settings (only `agent` key supported)
├── .mcp.json                 # MCP server definitions
├── .lsp.json                 # LSP server configurations
├── scripts/                  # Utility scripts
├── LICENSE
└── CHANGELOG.md
```

**Important**: Components go at the plugin root, NOT inside `.claude-plugin/`. Only `plugin.json` goes in `.claude-plugin/`.

## Plugin Scopes (enabledPlugins)

| Scope | Settings File | Use Case |
|-------|--------------|----------|
| `user` | `~/.claude/settings.json` | Personal plugins across all projects (default) |
| `project` | `.claude/settings.json` | Team plugins shared via VCS |
| `local` | `.claude/settings.local.json` | Project-specific, gitignored |
| `managed` | managed-settings.json | Enforced by IT (read-only, update only) |

Format: `"enabledPlugins": { "plugin-name@marketplace-name": true/false }`

## Plugin Installation Mechanics

1. Plugin discovered in a marketplace
2. Plugin files copied to `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`
3. Entry added to `~/.claude/plugins/installed_plugins.json`
4. Plugin enabled in appropriate `enabledPlugins` in settings.json
5. On session start, enabled plugins are loaded from cache

### Installed Plugins Registry Format

```json
{
  "version": 2,
  "plugins": {
    "plugin-name@marketplace-name": [
      {
        "scope": "user|project|local",
        "projectPath": "/path/to/project",
        "installPath": "/Users/.../plugins/cache/.../version",
        "version": "1.0.0",
        "installedAt": "2026-01-27T18:25:08.580Z",
        "lastUpdated": "2026-02-01T03:52:51.332Z",
        "gitCommitSha": "e30768..."
      }
    ]
  }
}
```

### Known Marketplaces Format

```json
{
  "marketplace-name": {
    "source": {
      "source": "github",
      "repo": "org/repo-name"
    },
    "installLocation": "/Users/.../.claude/plugins/marketplaces/marketplace-name",
    "lastUpdated": "2026-04-04T17:29:32.128Z"
  }
}
```

### Blocklist Format

```json
{
  "fetchedAt": "2026-03-19T01:45:16.632Z",
  "plugins": [
    {
      "plugin": "plugin-name@marketplace-name",
      "added_at": "2026-02-11T03:16:31.424Z",
      "reason": "security",
      "text": "Description of why blocked"
    }
  ]
}
```

## Marketplace Source Types

| Source | Key Fields | Description |
|--------|-----------|-------------|
| `github` | `repo` | GitHub repository |
| `git` | `url` | Any git URL |
| `url` | `url`, `headers` | URL-based marketplace JSON |
| `npm` | `package` | NPM package |
| `file` | `path` | Local file path |
| `directory` | `path` | Local directory |
| `hostPattern` | `hostPattern` | Regex for matching hosts |
| `settings` | `name`, `plugins` | Inline in settings.json |

## Marketplace Restrictions (Managed Only)

`strictKnownMarketplaces` in managed settings controls which marketplaces can be added:
- `undefined`: No restrictions
- `[]`: Complete lockdown
- `[sources...]`: Only matching marketplaces allowed

`blockedMarketplaces` blocks specific marketplace sources.

## CLI Commands

```bash
claude plugin install <plugin> [-s user|project|local]
claude plugin uninstall <plugin> [-s scope] [--keep-data]
claude plugin enable <plugin> [-s scope]
claude plugin disable <plugin> [-s scope]
claude plugin update <plugin> [-s scope]
claude plugin validate   # Validate plugin structure
```

Interactive: `/plugin` command in REPL provides browse, install, enable/disable, details UI.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `${CLAUDE_PLUGIN_ROOT}` | Absolute path to plugin installation directory |
| `${CLAUDE_PLUGIN_DATA}` | Persistent data directory surviving updates |
| `CLAUDE_PLUGIN_OPTION_<KEY>` | User config values as env vars |

## How to Read Programmatically

1. Parse `~/.claude/plugins/installed_plugins.json` for all installed plugins
2. Read `enabledPlugins` from each settings scope to determine what's enabled
3. For each installed plugin, read its `plugin.json` from the cache path
4. Parse `~/.claude/plugins/known_marketplaces.json` for marketplace sources
5. Read `~/.claude/plugins/blocklist.json` for blocked plugins

## How to Manage Programmatically

### Enable/Disable a Plugin
Edit `enabledPlugins` in the target scope's `settings.json`:
```json
{
  "enabledPlugins": {
    "plugin-name@marketplace": true
  }
}
```

### Install a Plugin
Use CLI: `claude plugin install <name> --scope <scope>`
(No simple file-edit equivalent -- involves git clone, caching, etc.)

### Uninstall a Plugin
Use CLI: `claude plugin uninstall <name> --scope <scope>`

### Add a Marketplace
Edit `extraKnownMarketplaces` in settings.json, OR use CLI `/plugin marketplace add`.

## Actual State on This Machine

### Installed Plugins
| Plugin | Marketplace | Scope | Version |
|--------|------------|-------|---------|
| `supabase` | claude-plugins-official | project (lot-iq-apps) | 27d2b86d72da |
| `claude-md-management` | claude-plugins-official | local (project-longshot) | 1.0.0 |
| `skill-creator` | claude-plugins-official | user | unknown |
| `agent-sdk-dev` | claude-plugins-official | user | unknown |
| `plugin-dev` | claude-plugins-official | user | unknown |

### Enabled Plugins (user-level settings.json)
```json
{
  "skill-creator@claude-plugins-official": true,
  "agent-sdk-dev@claude-plugins-official": true,
  "plugin-dev@claude-plugins-official": true
}
```

### Known Marketplaces
- `claude-plugins-official` from `anthropics/claude-plugins-official` on GitHub

### Plugin Cache Structure
```
~/.claude/plugins/cache/claude-plugins-official/
├── agent-sdk-dev/unknown/     (agents/, commands/, .claude-plugin/)
├── claude-md-management/1.0.0/
├── plugin-dev/unknown/        (agents/, skills/, hooks/, commands/, .claude-plugin/)
├── skill-creator/unknown/
└── supabase/27d2b86d72da/
```

## API Implications

### Read Endpoints
- `GET /api/plugins` -- list all installed plugins with enabled status
- `GET /api/plugins/:id` -- plugin details (manifest, components, scope)
- `GET /api/plugins/:id/manifest` -- raw plugin.json
- `GET /api/marketplaces` -- list known marketplaces
- `GET /api/marketplaces/:name/available` -- browse available plugins

### Write Endpoints
- `POST /api/plugins/:id/enable` -- enable a plugin for a given scope
- `POST /api/plugins/:id/disable` -- disable a plugin for a given scope
- `POST /api/plugins/install` -- install a plugin (wraps CLI)
- `DELETE /api/plugins/:id` -- uninstall a plugin
- `POST /api/plugins/:id/update` -- update a plugin
- `POST /api/marketplaces` -- add a marketplace

### Considerations
- Installation/uninstall should shell out to `claude plugin` commands
- Enable/disable can be done via direct settings.json edits
- Plugin cache is read-only for the middleware
- Plugin state is split across multiple files (installed_plugins.json + settings.json)
