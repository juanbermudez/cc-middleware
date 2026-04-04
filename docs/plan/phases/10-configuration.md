# Phase 10: Configuration Management

**Status**: Not Started
**Depends On**: Phase 1 (Foundation), Phase 7 (API Layer)
**Blocks**: None

## Goal

Expose Claude Code's entire configuration system through the middleware API - settings, plugins, skills, agents, rules, MCP servers, memory, and CLAUDE.md files. Support both reading and managing these configurations programmatically.

## Research Reference

See `/docs/research/` for complete schemas and file locations:
- [settings-system.md](../../research/settings-system.md) - Settings precedence, 60+ keys, permission rules
- [plugin-system.md](../../research/plugin-system.md) - Plugin state files, enable/disable
- [skills-agents-rules.md](../../research/skills-agents-rules.md) - Markdown frontmatter formats
- [mcp-configuration.md](../../research/mcp-configuration.md) - MCP transport types, scope handling
- [memory-system.md](../../research/memory-system.md) - Auto-memory, CLAUDE.md tree
- [global-config.md](../../research/global-config.md) - ~/.claude.json structure

## Architecture: Configuration Reader

```typescript
// Central configuration reader that merges all sources
export class ConfigurationReader {
  constructor(options: {
    projectDir?: string;    // Default: process.cwd()
    userDir?: string;       // Default: ~/.claude/
    globalConfigPath?: string; // Default: ~/.claude.json
  })

  // Merged view
  getEffectiveSettings(): MergedSettings;     // All scopes merged with correct precedence
  getEffectivePermissions(): PermissionRules; // Merged allow/deny/ask rules

  // Per-scope access
  getUserSettings(): SettingsFile;
  getProjectSettings(): SettingsFile;
  getLocalSettings(): SettingsFile;
  getManagedSettings(): SettingsFile | undefined;

  // Components
  getPlugins(): PluginInfo[];
  getSkills(): SkillInfo[];
  getAgents(): AgentInfo[];
  getRules(): RuleInfo[];
  getMcpServers(): McpServerInfo[];
  getMemory(): MemoryInfo;
  getClaudeMdFiles(): ClaudeMdInfo[];
}
```

## Write Strategy

| System | Write Method | Caveats |
|--------|-------------|---------|
| Settings (user/project/local) | Direct JSON edit | Use atomic writes, validate against schema |
| Plugin enable/disable | Edit `enabledPlugins` in settings.json | Only toggle state, not install/uninstall |
| Plugin install/uninstall | Shell out to `claude plugin` CLI | CLI handles git clone, caching, validation |
| Skills/Agents/Rules | Create/edit/delete markdown files | Must preserve YAML frontmatter format |
| MCP servers | Shell out to `claude mcp` CLI (preferred) or careful JSON edit | MCP config is in ~/.claude.json which has concurrent write risks |
| Memory files | Direct markdown file edit | Must maintain MEMORY.md index format |
| CLAUDE.md | Direct markdown file edit | Multiple locations, tree-walking order |

---

## Task 10.1: Settings Reader

### Implementation: `src/config/settings.ts`

```typescript
export interface SettingsFile {
  scope: 'managed' | 'user' | 'project' | 'local';
  path: string;
  exists: boolean;
  content: Record<string, unknown>;
  lastModified?: number;
}

export interface MergedSettings {
  // Full merged result with precedence applied
  settings: Record<string, unknown>;
  // Per-key provenance: which scope each key came from
  provenance: Record<string, 'managed' | 'user' | 'project' | 'local'>;
  // Merged arrays (permissions, sandbox paths, etc.)
  permissions: {
    allow: string[];
    deny: string[];
    ask: string[];
    defaultMode?: string;
    additionalDirectories?: string[];
    sources: Record<string, string>; // rule -> scope it came from
  };
}

export async function readSettingsFile(path: string): Promise<SettingsFile>
export async function readAllSettings(projectDir: string): Promise<{
  managed?: SettingsFile;
  user: SettingsFile;
  project: SettingsFile;
  local: SettingsFile;
}>

export function mergeSettings(
  managed: SettingsFile | undefined,
  user: SettingsFile,
  project: SettingsFile,
  local: SettingsFile
): MergedSettings
// Precedence: managed > local > project > user
// Arrays (permissions.allow, etc.) are concatenated and deduplicated
```

### Verification (E2E)

```typescript
// Test: Read user settings
// 1. Read ~/.claude/settings.json
// 2. Verify it parses correctly
// 3. Verify scope is "user"

// Test: Merge settings with correct precedence
// 1. Create temp settings files with overlapping keys
// 2. Merge them
// 3. Verify higher-precedence scope wins for scalar values
// 4. Verify arrays are concatenated for permission rules
// 5. Verify provenance tracks which scope each key came from

// Test: Read real machine settings
// 1. Call readAllSettings(process.cwd())
// 2. Verify user settings file exists and is parseable
```

---

## Task 10.2: Settings Writer

### Implementation: `src/config/settings-writer.ts`

```typescript
export interface SettingsUpdate {
  scope: 'user' | 'project' | 'local'; // Cannot write to managed
  path: string[];                       // JSON path, e.g., ["permissions", "allow"]
  operation: 'set' | 'append' | 'remove' | 'delete';
  value?: unknown;
}

export async function updateSettings(
  update: SettingsUpdate
): Promise<{ before: unknown; after: unknown }>

export async function addPermissionRule(
  scope: 'user' | 'project' | 'local',
  rule: string,
  behavior: 'allow' | 'deny' | 'ask'
): Promise<void>

export async function removePermissionRule(
  scope: 'user' | 'project' | 'local',
  rule: string,
  behavior: 'allow' | 'deny' | 'ask'
): Promise<void>

export async function setSettingValue(
  scope: 'user' | 'project' | 'local',
  key: string, // Dot-notation: "permissions.defaultMode"
  value: unknown
): Promise<void>
```

**Behavior**:
- Reads current file, applies change, writes back atomically (write to temp, rename)
- Validates against schema before writing (basic type checks)
- Never writes to managed scope
- Returns before/after for audit trail

### Verification (E2E)

```typescript
// Test: Add permission rule
// 1. Read current project settings
// 2. Add a rule: addPermissionRule('local', 'Bash(echo *)', 'allow')
// 3. Read settings again
// 4. Verify rule is present
// 5. Clean up: remove the rule

// Test: Cannot write managed scope
// 1. Attempt updateSettings({ scope: 'managed', ... })
// 2. Verify error thrown
```

---

## Task 10.3: Plugin Reader

### Implementation: `src/config/plugins.ts`

```typescript
export interface PluginInfo {
  name: string;
  scope: 'user' | 'project' | 'local';
  marketplace: string;
  version: string;
  enabled: boolean;
  description?: string;
  author?: { name?: string; email?: string; url?: string };
  cachePath?: string;        // Where plugin files are cached
  dataPath?: string;         // Persistent data directory
  hasHooks: boolean;
  hasSkills: boolean;
  hasAgents: boolean;
  hasMcpServers: boolean;
  manifest?: Record<string, unknown>; // Raw plugin.json
}

export async function listInstalledPlugins(): Promise<PluginInfo[]>
export async function getPluginDetails(name: string): Promise<PluginInfo | undefined>
export async function isPluginEnabled(name: string, scope?: string): Promise<boolean>
```

**Behavior**:
- Parse `~/.claude/plugins/installed_plugins.json` for installed plugins
- Read `enabledPlugins` from each settings scope
- For each plugin, read its `plugin.json` from cache path
- Check for hooks/, skills/, agents/, .mcp.json in plugin directory

### Plugin Management

```typescript
// Enable/disable: direct settings edit
export async function enablePlugin(name: string, scope: 'user' | 'project' | 'local'): Promise<void>
export async function disablePlugin(name: string, scope: 'user' | 'project' | 'local'): Promise<void>

// Install/uninstall: shell out to CLI
export async function installPlugin(name: string, options?: { scope?: string }): Promise<{ success: boolean; output: string }>
export async function uninstallPlugin(name: string, options?: { scope?: string; keepData?: boolean }): Promise<{ success: boolean; output: string }>
```

### Verification (E2E)

```typescript
// Test: List installed plugins
// 1. Call listInstalledPlugins()
// 2. Verify result is array
// 3. If plugins exist, verify fields: name, scope, enabled, marketplace

// Test: Enable/disable plugin
// 1. Find a disabled plugin (or use a test one)
// 2. Enable it via enablePlugin()
// 3. Verify it shows as enabled
// 4. Disable it back
```

---

## Task 10.4: Skills, Agents, and Rules Reader

### Implementation: `src/config/components.ts`

```typescript
export interface SkillInfo {
  name: string;
  description: string;
  scope: 'project' | 'user' | 'plugin';
  path: string;
  disableModelInvocation?: boolean;
  content: string; // Full SKILL.md content
}

export interface AgentFileInfo {
  name: string;
  description: string;
  scope: 'project' | 'user' | 'plugin';
  path: string;
  model?: string;
  maxTurns?: number;
  tools?: string[];
  disallowedTools?: string[];
  effort?: string;
  memory?: boolean;
  isolation?: string;
  permissionMode?: string;
  prompt: string; // Body after frontmatter
}

export interface RuleInfo {
  path: string;
  scope: 'project' | 'user';
  paths?: string[];         // Path-scoping globs from frontmatter
  content: string;
}

export interface ClaudeMdInfo {
  path: string;
  scope: 'user' | 'project' | 'project-local'; // CLAUDE.md vs CLAUDE.local.md
  content: string;
  imports: string[];        // @file references
}

export async function discoverSkills(options?: { projectDir?: string }): Promise<SkillInfo[]>
export async function discoverAgents(options?: { projectDir?: string }): Promise<AgentFileInfo[]>
export async function discoverRules(options?: { projectDir?: string }): Promise<RuleInfo[]>
export async function discoverClaudeMd(options?: { projectDir?: string }): Promise<ClaudeMdInfo[]>
```

**Behavior**:
- Scan standard locations: `.claude/skills/`, `.claude/agents/`, `.claude/rules/`, `~/.claude/skills/`, etc.
- Parse YAML frontmatter with `gray-matter`
- Body after frontmatter = prompt/content
- CLAUDE.md: scan current dir + walk up to git root + `~/.claude/CLAUDE.md`
- Parse `@import` references in CLAUDE.md files

### Component Management

```typescript
// Skills, agents, rules: direct file create/edit/delete
export async function createAgent(
  scope: 'project' | 'user',
  name: string,
  definition: { description: string; model?: string; prompt: string; [key: string]: unknown }
): Promise<string> // Returns file path

export async function deleteAgent(path: string): Promise<void>
export async function updateAgent(path: string, changes: Partial<AgentFileInfo>): Promise<void>
// Same pattern for skills and rules
```

### Verification (E2E)

```typescript
// Test: Discover agents from filesystem
// 1. Create a test agent markdown file in .claude/agents/
// 2. Call discoverAgents()
// 3. Verify the test agent is found with correct fields
// 4. Clean up

// Test: Discover CLAUDE.md files
// 1. Call discoverClaudeMd()
// 2. Verify project CLAUDE.md is found
// 3. Verify user ~/.claude/CLAUDE.md is found if exists

// Test: Create and read back agent
// 1. createAgent('project', 'test-agent', { description: 'Test', prompt: 'You are a test' })
// 2. discoverAgents() and verify it appears
// 3. deleteAgent() and verify it's gone
```

---

## Task 10.5: MCP Server Reader

### Implementation: `src/config/mcp.ts`

```typescript
export interface McpServerInfo {
  name: string;
  scope: 'managed' | 'user' | 'local' | 'project' | 'plugin';
  transport: 'stdio' | 'sse' | 'http';
  command?: string;          // For stdio
  args?: string[];
  url?: string;              // For sse/http
  env?: Record<string, string>;
  headers?: Record<string, string>;
  enabled: boolean;
  source: string;            // File path where defined
}

export async function discoverMcpServers(options?: {
  projectDir?: string;
}): Promise<McpServerInfo[]>

// Management: prefer CLI for reliability
export async function addMcpServer(
  name: string,
  config: { command: string; args?: string[]; env?: Record<string, string> },
  options?: { scope?: 'local' | 'project' | 'user' }
): Promise<{ success: boolean; output: string }>

export async function removeMcpServer(
  name: string,
  options?: { scope?: string }
): Promise<{ success: boolean; output: string }>
```

**Behavior**:
- Parse `~/.claude.json` for user/local MCP servers (under `mcpServers` key)
- Parse `<project>/.mcp.json` for project MCP servers
- Check managed MCP files (`/Library/Application Support/ClaudeCode/managed-mcp.json`)
- For management, shell out to `claude mcp add`/`claude mcp remove` (handles env vars, OAuth, caching)
- Fall back to direct JSON edit when CLI is not available

### Verification (E2E)

```typescript
// Test: Discover MCP servers
// 1. Call discoverMcpServers()
// 2. Verify result includes servers from ~/.claude.json and .mcp.json
// 3. Verify each has: name, transport, scope, enabled

// Test: Discover MCP servers matches 'claude mcp list'
// 1. Run 'claude mcp list' via shell
// 2. Call discoverMcpServers()
// 3. Verify same servers are found
```

---

## Task 10.6: Memory Reader

### Implementation: `src/config/memory.ts`

```typescript
export interface MemoryInfo {
  projectKey: string;        // Encoded cwd path
  memoryDir: string;         // Full path to memory directory
  indexPath: string;         // Path to MEMORY.md
  indexContent: string;      // MEMORY.md content
  files: MemoryFileInfo[];
}

export interface MemoryFileInfo {
  path: string;
  name: string;
  description: string;
  type: 'user' | 'feedback' | 'project' | 'reference';
  content: string;
  lastModified: number;
}

export async function readProjectMemory(projectDir?: string): Promise<MemoryInfo>
export async function listAllProjectMemories(): Promise<Array<{ projectKey: string; dir: string }>>
```

### Verification (E2E)

```typescript
// Test: Read project memory
// 1. Call readProjectMemory(process.cwd())
// 2. Verify memoryDir points to correct location
// 3. If MEMORY.md exists, verify it's readable
```

---

## Task 10.7: Configuration API Endpoints

### Implementation: `src/api/routes/config.ts`

```
# Settings
GET    /api/v1/config/settings                    - Get merged effective settings
GET    /api/v1/config/settings/:scope             - Get settings for specific scope (user/project/local/managed)
PUT    /api/v1/config/settings/:scope             - Update a setting value
POST   /api/v1/config/settings/:scope/permissions - Add a permission rule
DELETE /api/v1/config/settings/:scope/permissions  - Remove a permission rule

# Plugins
GET    /api/v1/config/plugins                     - List all plugins with status
GET    /api/v1/config/plugins/:name               - Get plugin details
POST   /api/v1/config/plugins/:name/enable        - Enable a plugin
POST   /api/v1/config/plugins/:name/disable       - Disable a plugin
POST   /api/v1/config/plugins/install             - Install plugin (via CLI)
POST   /api/v1/config/plugins/:name/uninstall     - Uninstall plugin (via CLI)

# Skills, Agents, Rules
GET    /api/v1/config/skills                      - List all skills
GET    /api/v1/config/agents                      - List all agent definitions (file-based)
POST   /api/v1/config/agents                      - Create a new agent definition file
PUT    /api/v1/config/agents/:name                - Update agent definition
DELETE /api/v1/config/agents/:name                - Delete agent definition
GET    /api/v1/config/rules                       - List all rules

# MCP Servers
GET    /api/v1/config/mcp                         - List all MCP servers
POST   /api/v1/config/mcp                         - Add MCP server (via CLI)
DELETE /api/v1/config/mcp/:name                   - Remove MCP server (via CLI)

# Memory
GET    /api/v1/config/memory                      - Get project memory index
GET    /api/v1/config/memory/files                - List memory files
GET    /api/v1/config/memory/files/:name          - Read a memory file

# CLAUDE.md
GET    /api/v1/config/claude-md                   - List all CLAUDE.md files with content
PUT    /api/v1/config/claude-md/:scope            - Update CLAUDE.md for a scope
```

### Verification (E2E)

```typescript
// Test: Get effective settings
// Test: Get settings by scope
// Test: List plugins
// Test: List skills and agents
// Test: List MCP servers
// Test: Get memory index
// Test: List CLAUDE.md files
```
