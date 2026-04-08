# Global Config (~/.claude.json)

## Overview

`~/.claude.json` is a monolithic JSON file that stores Claude Code's global state. It is distinct from `~/.claude/settings.json` (user settings). Anthropic's settings docs explicitly separate a small set of "global config settings" stored here from the broader file, which also contains runtime state and caches. It contains:

- User preferences (theme, editor mode, notifications)
- OAuth/authentication session data
- Per-project state (allowed tools, trust status, MCP servers, session metrics)
- Feature flags (cached growth/experiment features from server)
- Internal caches (stats, tips history, migration flags)
- MCP server configurations (user and local scope)

This file should **not** be treated like a normal settings file. The proper settings file is `~/.claude/settings.json`. Only a small documented subset belongs here as user-managed preferences; most of the file is runtime state, auth/session material, and caches. User/local MCP server configs also live here for historical reasons.

## File Location

| File | Purpose |
|------|---------|
| `~/.claude.json` | Global config, preferences, per-project state, MCP configs |

## Schema (Key Fields)

### Top-Level Preferences

| Key | Type | Description |
|-----|------|-------------|
| `numStartups` | number | Total startup count |
| `installMethod` | string | `"native"`, `"npm"`, etc. |
| `autoUpdates` | boolean | Whether auto-updates are enabled |
| `hasCompletedOnboarding` | boolean | Onboarding completion flag |
| `lastOnboardingVersion` | string | Version of last onboarding |
| `lastReleaseNotesSeen` | string | Last release notes version |
| `hasSeenTasksHint` | boolean | UI hint state |
| `promptQueueUseCount` | number | Cumulative prompt queue usage |

### Global Config Settings (stored here, not in settings.json)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `autoConnectIde` | boolean | false | Auto-connect to running IDE |
| `autoInstallIdeExtension` | boolean | true | Auto-install IDE extension in VS Code |
| `editorMode` | string | `"normal"` | `"normal"` or `"vim"` |
| `showTurnDuration` | boolean | true | Show turn duration messages |
| `terminalProgressBarEnabled` | boolean | true | Terminal progress bar |
| `teammateMode` | string | `"auto"` | Agent team display: `auto`, `in-process`, `tmux` |

### Tips History

```json
{
  "tipsHistory": {
    "tip-name": <number of times shown>
  }
}
```

### Feature Flags (Experiment Cache)

```json
{
  "cachedGrowthBookFeatures": {
    "tengu_feature_name": true/false/object
  }
}
```

These are cached from Anthropic's servers and control various internal behaviors. They are NOT user-configurable. Examples:
- `tengu_streaming_text`: Enable streaming text
- `tengu_worktree_mode`: Enable worktree support
- `tengu_mcp_tool_search`: Enable MCP tool search
- `tengu_kairos_cron`: Enable cron/scheduled tasks
- `tengu_harbor_permissions`: Permission system features

### Per-Project State

```json
{
  "projects": {
    "/absolute/path/to/project": {
      "allowedTools": [],
      "mcpContextUris": [],
      "mcpServers": {},
      "enabledMcpjsonServers": [],
      "disabledMcpjsonServers": [],
      "hasTrustDialogAccepted": false,
      "projectOnboardingSeenCount": 10,
      "hasClaudeMdExternalIncludesApproved": false,
      "hasClaudeMdExternalIncludesWarningShown": false,
      "exampleFiles": [],
      "reactVulnerabilityCache": { ... },
      "lastCost": 0,
      "lastAPIDuration": 0,
      "lastAPIDurationWithoutRetries": 0,
      "lastToolDuration": 0,
      "lastDuration": 0,
      "lastLinesAdded": 0,
      "lastLinesRemoved": 0,
      "lastTotalInputTokens": 0,
      "lastTotalOutputTokens": 0,
      "lastTotalCacheCreationInputTokens": 0,
      "lastTotalCacheReadInputTokens": 0,
      "lastTotalWebSearchRequests": 0,
      "lastModelUsage": {},
      "lastSessionId": "uuid"
    }
  }
}
```

Key per-project fields:

| Field | Type | Description |
|-------|------|-------------|
| `allowedTools` | string[] | Tools explicitly allowed for this project |
| `mcpServers` | object | Local-scope MCP server configurations |
| `enabledMcpjsonServers` | string[] | Approved .mcp.json servers |
| `disabledMcpjsonServers` | string[] | Rejected .mcp.json servers |
| `hasTrustDialogAccepted` | boolean | Whether project trust dialog was accepted |
| `hasClaudeMdExternalIncludesApproved` | boolean | Whether external @imports approved |
| `lastCost` | number | Cost of last session |
| `lastSessionId` | string | UUID of last session |
| `lastTotalInputTokens` | number | Token usage metrics |
| `lastTotalOutputTokens` | number | Token usage metrics |
| `lastLinesAdded` | number | Code change metrics |
| `lastLinesRemoved` | number | Code change metrics |

### Authentication State

The file also contains OAuth/authentication data (not detailed here for security). Key fields include `userID` (hashed), `firstStartTime`, and various migration flags.

## Other ~/.claude/ Files

| File/Directory | Purpose |
|---------------|---------|
| `~/.claude/settings.json` | User settings (see settings-system.md) |
| `~/.claude/settings.local.json` | Local settings override |
| `~/.claude/history.jsonl` | Command history |
| `~/.claude/backups/` | Config file backups (5 most recent) |
| `~/.claude/cache/` | Internal caches |
| `~/.claude/chrome/` | Chrome extension data |
| `~/.claude/debug/` | Debug logs |
| `~/.claude/downloads/` | Downloaded files |
| `~/.claude/file-history/` | File edit history |
| `~/.claude/paste-cache/` | Paste/clipboard cache |
| `~/.claude/plans/` | Plan mode files |
| `~/.claude/plugins/` | Plugin system (see plugin-system.md) |
| `~/.claude/projects/` | Per-project data (sessions, memory) |
| `~/.claude/session-env/` | Session environment snapshots |
| `~/.claude/sessions/` | Active session data |
| `~/.claude/shell-snapshots/` | Shell state snapshots |
| `~/.claude/stats-cache.json` | Usage statistics cache |
| `~/.claude/statsig/` | Statsig analytics |
| `~/.claude/statusline-command.sh` | Custom status line script |
| `~/.claude/tasks/` | Scheduled/background tasks |
| `~/.claude/telemetry/` | Telemetry data |
| `~/.claude/todos/` | Todo list items |
| `~/.claude/mcp-needs-auth-cache.json` | MCP auth state cache |

### Session Storage

Sessions are stored at:
```
~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
```

Where `<encoded-cwd>` replaces `/` with `-` and prepends `-`.

## Keybindings

Keybindings are configured in `~/.claude/keybindings.json` (separate file).

## How to Read Programmatically

1. Parse `~/.claude.json` as JSON (it can be large -- 40KB+ with feature flags)
2. Extract `projects` for per-project state
3. Extract per-project `mcpServers` for local-scope MCP configs
4. Read top-level preferences for global settings
5. Ignore `cachedGrowthBookFeatures` (internal, not user-configurable)

## How to Manage Programmatically

### MCP Servers
Edit the `projects.<path>.mcpServers` object within `~/.claude.json`. Best done through `claude mcp add/remove` CLI.

### Per-Project State
Most per-project state is managed automatically by Claude Code. The middleware should treat it as read-only, except for:
- `allowedTools`: Can be modified to pre-approve tools
- `enabledMcpjsonServers` / `disabledMcpjsonServers`: Can be modified for MCP approval

### Preferences
Only the documented "global config settings" should be considered writable preferences:
- `autoConnectIde`
- `autoInstallIdeExtension`
- `editorMode`
- `showTurnDuration`
- `terminalProgressBarEnabled`
- `teammateMode`

These can be edited directly in `~/.claude.json`, but the middleware should expose them separately from the rest of the file and write only an allowlisted subset.

**Caveats:**
- Claude Code creates timestamped backups
- The file is frequently written to by Claude Code (session metrics update after each session)
- Concurrent edits can cause data loss -- read-modify-write with care
- Feature flags should NOT be modified
- OAuth/session state and internal caches should never be exposed raw through the middleware

### Recommended Middleware Contract

Treat `~/.claude.json` as three different surfaces:

1. **Global preferences (safe writable subset)**  
   Expose and optionally manage only the documented allowlisted keys above.

2. **Per-project state (read-only observational data)**  
   Expose sanitized summaries of:
   - `allowedTools`
   - trust flags
   - `enabledMcpjsonServers` / `disabledMcpjsonServers`
   - local-scope `mcpServers`
   - coarse usage/session metrics

   Do not provide generic write access to this object. Most of it is maintained automatically by Claude Code.

3. **Everything else (observe only or hide entirely)**  
   Hide or heavily summarize:
   - OAuth/session data
   - feature flag caches
   - internal migration flags
   - analytics/tip history
   - UI implementation caches

For effective source inspection, Anthropic recommends `/status` inside Claude Code to verify active settings sources and origins.

## Actual State on This Machine

### Key Metrics
- `numStartups`: 57
- `installMethod`: "native"
- `autoUpdates`: false
- `promptQueueUseCount`: 61,547
- `hasCompletedOnboarding`: true
- `lastOnboardingVersion`: "2.1.92"

### Projects Tracked
Multiple projects tracked including:
- `/Users/zef` (home directory)
- `/Users/zef/Desktop` 
- `/Users/zef/Desktop/cc-middleware` (this project)
- `/Users/zef/Desktop/neuromem`
- `/Users/zef/Desktop/Work/lot-iq/lot-iq-apps`
- `/Users/zef/Desktop/Work/trading-models/project-longshot`
- And several others

All projects have empty `mcpServers: {}` -- no MCP servers configured.

### Feature Flags
~200+ feature flags cached in `cachedGrowthBookFeatures`. Notable enabled flags:
- `tengu_streaming_text`: true (streaming output)
- `tengu_worktree_mode`: true (git worktree support)
- `tengu_kairos_cron`: true (scheduled tasks)
- `tengu_harbor_permissions`: true (permission system)
- `tengu_mcp_tool_search`: true (MCP tool search)
- `tengu_code_diff_cli`: true (code diffs)

## API Implications

### Read Endpoints
- `GET /api/config/global` -- global preferences
- `GET /api/config/projects` -- list all tracked projects with state
- `GET /api/config/projects/:path` -- per-project state
- `GET /api/config/projects/:path/metrics` -- session metrics for a project
- `GET /api/config/features` -- current feature flag state (read-only)

### Write Endpoints
- `PATCH /api/config/global` -- update global preferences
- `PATCH /api/config/projects/:path/tools` -- update allowed tools
- `PATCH /api/config/projects/:path/mcp` -- update MCP approval state

### Considerations
- `~/.claude.json` is a single large file; avoid excessive writes
- Feature flags are read-only (server-controlled)
- Per-project metrics are informational; useful for dashboards
- MCP server management should use the `claude mcp` CLI when possible
- The file is PID-locked during writes by Claude Code -- concurrent access requires care
- Authentication data should NEVER be exposed through the API
