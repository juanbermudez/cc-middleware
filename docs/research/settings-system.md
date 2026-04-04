# Settings System

## Overview

Claude Code uses a hierarchical JSON-based settings system with multiple scopes. Settings control permissions, environment variables, hooks, plugins, sandbox behavior, and many other aspects of Claude Code's behavior. Settings are stored in `settings.json` files at different locations, with a clear precedence hierarchy.

There is also a separate global config file (`~/.claude.json`) that stores preferences, OAuth state, MCP server configs, and per-project state -- this is distinct from the settings system and is covered in `global-config.md`.

## File Locations

| Scope | File Path | Version-Controlled | Purpose |
|-------|-----------|-------------------|---------|
| **Managed (server)** | Server-delivered via Claude.ai admin console | N/A | Remote policy enforcement |
| **Managed (MDM/macOS)** | `com.anthropic.claudecode` plist domain | N/A | MDM-deployed policy |
| **Managed (MDM/Windows)** | `HKLM\SOFTWARE\Policies\ClaudeCode` registry | N/A | Group Policy |
| **Managed (file)** | macOS: `/Library/Application Support/ClaudeCode/managed-settings.json` | No | IT-deployed settings |
| **Managed (file)** | Linux/WSL: `/etc/claude-code/managed-settings.json` | No | IT-deployed settings |
| **Managed (file)** | Windows: `C:\Program Files\ClaudeCode\managed-settings.json` | No | IT-deployed settings |
| **Managed (drop-in)** | `managed-settings.d/*.json` (same parent as above) | No | Team policy fragments |
| **User** | `~/.claude/settings.json` | No | Personal global prefs |
| **Project** | `.claude/settings.json` | Yes | Team-shared project settings |
| **Local** | `.claude/settings.local.json` | No (gitignored) | Personal project overrides |

### Managed MCP (separate file)

| Scope | File Path |
|-------|-----------|
| macOS | `/Library/Application Support/ClaudeCode/managed-mcp.json` |
| Linux/WSL | `/etc/claude-code/managed-mcp.json` |
| Windows | `C:\Program Files\ClaudeCode\managed-mcp.json` |

## Settings Precedence (Highest to Lowest)

1. **Managed settings** (server-managed > MDM/OS-level > file-based) -- cannot be overridden
2. **Command line arguments** -- temporary session overrides
3. **Local project settings** (`.claude/settings.local.json`)
4. **Shared project settings** (`.claude/settings.json`)
5. **User settings** (`~/.claude/settings.json`)

**Array merging**: Array-valued settings (like `permissions.allow`, `sandbox.filesystem.allowWrite`) are **concatenated and deduplicated** across scopes, not replaced. Lower-priority scopes can add entries.

## Complete Settings Schema

There is an official JSON schema at: `https://json.schemastore.org/claude-code-settings.json`

### Top-Level Settings (settings.json)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `$schema` | string | - | JSON schema URL for IDE validation |
| `agent` | string | - | Run main thread as named subagent |
| `allowedChannelPlugins` | array | - | (Managed only) Allowlist of channel plugins |
| `allowedHttpHookUrls` | string[] | - | URL patterns HTTP hooks may target (supports `*` wildcard) |
| `allowedMcpServers` | array | - | (Managed only) MCP server allowlist |
| `allowManagedHooksOnly` | boolean | false | (Managed only) Block non-managed hooks |
| `allowManagedMcpServersOnly` | boolean | false | (Managed only) Only managed MCP allowlist applies |
| `allowManagedPermissionRulesOnly` | boolean | false | (Managed only) Block user/project permission rules |
| `alwaysThinkingEnabled` | boolean | false | Enable extended thinking by default |
| `apiKeyHelper` | string | - | Script to generate auth value |
| `attribution` | object | see below | Customize git commit/PR attribution |
| `autoMemoryDirectory` | string | - | Custom auto-memory storage path (not from project settings) |
| `autoMemoryEnabled` | boolean | true | Enable/disable auto memory |
| `autoMode` | object | - | Auto mode classifier config (not from shared project settings) |
| `autoUpdatesChannel` | string | `"latest"` | `"stable"` or `"latest"` |
| `availableModels` | string[] | - | Restrict model selection |
| `awsAuthRefresh` | string | - | AWS SSO login script |
| `awsCredentialExport` | string | - | AWS credential export script |
| `blockedMarketplaces` | array | - | (Managed only) Blocked marketplace sources |
| `channelsEnabled` | boolean | false | (Managed only) Allow channels |
| `claudeMdExcludes` | string[] | - | Glob patterns for CLAUDE.md files to skip |
| `cleanupPeriodDays` | number | 30 | Session cleanup threshold (min 1) |
| `companyAnnouncements` | string[] | - | Startup announcement messages |
| `defaultShell` | string | `"bash"` | `"bash"` or `"powershell"` |
| `deniedMcpServers` | array | - | (Managed only) MCP server denylist |
| `disableAllHooks` | boolean | false | Disable all hooks and status line |
| `disableAutoMode` | string | - | `"disable"` to prevent auto mode |
| `disableDeepLinkRegistration` | string | - | `"disable"` to prevent protocol handler registration |
| `disabledMcpjsonServers` | string[] | - | Specific .mcp.json servers to reject |
| `disableSkillShellExecution` | boolean | false | Disable `!command` in skills |
| `effortLevel` | string | - | `"low"`, `"medium"`, or `"high"` |
| `enableAllProjectMcpServers` | boolean | false | Auto-approve all project MCP servers |
| `enabledMcpjsonServers` | string[] | - | Specific .mcp.json servers to approve |
| `enabledPlugins` | object | `{}` | Plugin enable/disable map `{"name@marketplace": boolean}` |
| `env` | object | `{}` | Environment variables for every session |
| `extraKnownMarketplaces` | object | `{}` | Additional marketplace sources |
| `fastModePerSessionOptIn` | boolean | false | Require per-session fast mode activation |
| `feedbackSurveyRate` | number | - | Survey probability (0-1) |
| `fileSuggestion` | object | - | Custom `@` file autocomplete |
| `forceLoginMethod` | string | - | `"claudeai"` or `"console"` |
| `forceLoginOrgUUID` | string/string[] | - | Require specific org login |
| `forceRemoteSettingsRefresh` | boolean | false | (Managed only) Block startup until remote settings fetched |
| `hooks` | object | `{}` | Lifecycle event hooks config |
| `httpHookAllowedEnvVars` | string[] | - | Env vars HTTP hooks may interpolate |
| `includeCoAuthoredBy` | boolean | true | (Deprecated) Use `attribution` instead |
| `includeGitInstructions` | boolean | true | Include git workflow in system prompt |
| `language` | string | - | Response language preference |
| `model` | string | - | Override default model |
| `modelOverrides` | object | - | Map model IDs to provider-specific IDs |
| `otelHeadersHelper` | string | - | Script for OTEL headers |
| `outputStyle` | string | - | Output style name |
| `permissions` | object | `{}` | Permission rules (see below) |
| `plansDirectory` | string | `"~/.claude/plans"` | Where plan files are stored |
| `pluginTrustMessage` | string | - | (Managed only) Custom plugin trust warning |
| `prefersReducedMotion` | boolean | false | Reduce UI animations |
| `respectGitignore` | boolean | true | Whether `@` picker respects .gitignore |
| `showClearContextOnPlanAccept` | boolean | false | Show clear context option |
| `showThinkingSummaries` | boolean | false | Show thinking summaries in interactive mode |
| `skipDangerousModePermissionPrompt` | boolean | false | Skip bypass-permissions confirmation |
| `spinnerTipsEnabled` | boolean | true | Show spinner tips |
| `spinnerTipsOverride` | object | - | Custom spinner tips `{excludeDefault, tips[]}` |
| `spinnerVerbs` | object | - | Custom spinner verbs `{mode, verbs[]}` |
| `statusLine` | object | - | Custom status line `{type: "command", command: "..."}` |
| `strictKnownMarketplaces` | array | - | (Managed only) Marketplace allowlist |
| `useAutoModeDuringPlan` | boolean | true | Plan mode uses auto mode semantics |
| `voiceEnabled` | boolean | false | Push-to-talk voice dictation |

### Permission Settings (`permissions` key)

| Key | Type | Description |
|-----|------|-------------|
| `permissions.allow` | string[] | Permission rules to allow |
| `permissions.ask` | string[] | Permission rules requiring confirmation |
| `permissions.deny` | string[] | Permission rules to deny |
| `permissions.additionalDirectories` | string[] | Extra working directories |
| `permissions.defaultMode` | string | Default permission mode: `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions` |
| `permissions.disableBypassPermissionsMode` | string | `"disable"` to prevent bypass mode |
| `permissions.skipDangerousModePermissionPrompt` | boolean | Skip bypass confirmation |

### Permission Rule Syntax

Format: `Tool` or `Tool(specifier)`

Rules evaluated in order: **deny first, then ask, then allow**. First match wins.

| Rule Pattern | Effect |
|-------------|--------|
| `Bash` | Matches all Bash commands |
| `Bash(npm run *)` | Matches commands starting with `npm run` |
| `Bash(npm run test:*)` | Glob-style matching |
| `Read(./.env)` | Matches reading `.env` file |
| `Read(./.env.*)` | Glob pattern for env files |
| `Read(./secrets/**)` | Recursive glob |
| `Edit(*.ts)` | Edit TypeScript files |
| `WebFetch(domain:example.com)` | Fetch from specific domain |
| `Agent(Explore)` | Specific subagent type |
| `Agent(my-agent *)` | Prefix match with args |
| `Skill(deploy *)` | Specific skill with args |
| `mcp__server__tool` | Specific MCP tool |

### Sandbox Settings (`sandbox` key)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `sandbox.enabled` | boolean | false | Enable bash sandboxing |
| `sandbox.failIfUnavailable` | boolean | false | Exit if sandbox can't start |
| `sandbox.autoAllowBashIfSandboxed` | boolean | true | Auto-approve bash when sandboxed |
| `sandbox.excludedCommands` | string[] | - | Commands that run outside sandbox |
| `sandbox.allowUnsandboxedCommands` | boolean | true | Allow `dangerouslyDisableSandbox` escape |
| `sandbox.filesystem.allowWrite` | string[] | - | Additional writable paths |
| `sandbox.filesystem.denyWrite` | string[] | - | Non-writable paths |
| `sandbox.filesystem.denyRead` | string[] | - | Non-readable paths |
| `sandbox.filesystem.allowRead` | string[] | - | Re-allow reading within denyRead regions |
| `sandbox.filesystem.allowManagedReadPathsOnly` | boolean | false | (Managed only) Only managed allowRead |
| `sandbox.network.allowUnixSockets` | string[] | - | Allowed Unix socket paths |
| `sandbox.network.allowAllUnixSockets` | boolean | false | Allow all Unix sockets |
| `sandbox.network.allowLocalBinding` | boolean | false | Allow localhost binding (macOS) |
| `sandbox.network.allowedDomains` | string[] | - | Allowed outbound domains (supports `*`) |
| `sandbox.network.allowManagedDomainsOnly` | boolean | false | (Managed only) Only managed domains |
| `sandbox.network.httpProxyPort` | number | - | Custom HTTP proxy port |
| `sandbox.network.socksProxyPort` | number | - | Custom SOCKS5 proxy port |
| `sandbox.enableWeakerNestedSandbox` | boolean | false | Weaker sandbox for Docker |
| `sandbox.enableWeakerNetworkIsolation` | boolean | false | (macOS) Allow TLS trust service |

### Sandbox Path Prefixes

| Prefix | Meaning |
|--------|---------|
| `/` | Absolute path from filesystem root |
| `~/` | Relative to home directory |
| `./` or no prefix | Relative to project root (project settings) or `~/.claude` (user settings) |

### Attribution Settings (`attribution` key)

| Key | Type | Description |
|-----|------|-------------|
| `attribution.commit` | string | Git commit attribution text (empty string hides) |
| `attribution.pr` | string | PR description attribution text (empty string hides) |

### Worktree Settings (`worktree` key)

| Key | Type | Description |
|-----|------|-------------|
| `worktree.symlinkDirectories` | string[] | Directories to symlink into worktrees |
| `worktree.sparsePaths` | string[] | Directories for sparse-checkout |

## How to Read Programmatically

The middleware can discover settings by:

1. **Reading JSON files directly** at each known path
2. **Merging** them according to the precedence rules
3. **For arrays**: concatenate and deduplicate across scopes
4. **For scalars**: higher-priority scope wins

Key files to read:
- `~/.claude/settings.json` (user settings)
- `<project>/.claude/settings.json` (project settings)
- `<project>/.claude/settings.local.json` (local settings)
- Managed settings at OS-specific paths (if applicable)

To verify what's active, the `/status` command inside Claude Code shows all active sources.

## How to Manage Programmatically

Settings files are plain JSON that can be edited directly:

1. **Read** the target file (user, project, or local)
2. **Parse** the JSON
3. **Modify** the desired keys
4. **Write** back the JSON
5. Claude Code auto-detects changes via the `ConfigChange` hook event

**Caveats:**
- Managed settings cannot be changed through normal file edits (they're enforced by IT)
- Some settings are only valid at managed scope (e.g., `allowManagedHooksOnly`)
- Array settings merge across scopes, so removing an entry from one scope doesn't remove it if it exists in another
- Claude Code creates timestamped backups of config files (retains 5 most recent)
- The `ConfigChange` hook fires when config files change on disk

## Actual State on This Machine

### User Settings (`~/.claude/settings.json`)
```json
{
  "statusLine": {
    "type": "command",
    "command": "bash /Users/zef/.claude/statusline-command.sh"
  },
  "enabledPlugins": {
    "skill-creator@claude-plugins-official": true,
    "agent-sdk-dev@claude-plugins-official": true,
    "plugin-dev@claude-plugins-official": true
  },
  "effortLevel": "high",
  "voiceEnabled": true,
  "voice": { "enabled": true, "mode": "hold" },
  "skipDangerousModePermissionPrompt": true
}
```

### Local Settings (`~/.claude/settings.local.json`)
```json
{
  "permissions": {
    "allow": ["Bash(echo:*)"]
  }
}
```

### Project Settings (`.claude/settings.json`)
```json
{
  "permissions": {
    "allow": [
      "Bash(npm *)", "Bash(npx *)", "Bash(node *)", "Bash(git *)",
      "Bash(ls *)", "Bash(cat *)", "Bash(mkdir *)", "Bash(cp *)", "Bash(mv *)",
      "Read", "Write", "Edit", "Glob", "Grep"
    ]
  },
  "env": {
    "CC_MIDDLEWARE_PORT": "3000",
    "CC_MIDDLEWARE_HOOK_PORT": "3001"
  }
}
```

### Managed Settings
No managed settings directory exists on this machine (`/Library/Application Support/ClaudeCode/` does not exist).

## API Implications

The middleware should expose:

### Read Endpoints
- `GET /api/settings` -- merged view of all active settings with source annotations
- `GET /api/settings/:scope` -- raw settings for a specific scope (user, project, local)
- `GET /api/settings/schema` -- settings JSON schema
- `GET /api/settings/status` -- which settings files exist and their locations

### Write Endpoints
- `PUT /api/settings/:scope` -- replace entire settings for a scope
- `PATCH /api/settings/:scope` -- merge partial updates into a scope
- `PUT /api/settings/:scope/permissions` -- update permission rules
- `PUT /api/settings/:scope/env` -- update environment variables
- `PUT /api/settings/:scope/hooks` -- update hooks configuration
- `PUT /api/settings/:scope/plugins` -- update enabled plugins

### Considerations
- Middleware should validate against the JSON schema before writing
- Array merging semantics must be replicated for accurate "merged view"
- Managed settings should be read-only in the API
- The `ConfigChange` hook fires automatically when files are modified, providing built-in reactivity
