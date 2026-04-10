# Claude Code Configuration Research

Research conducted on 2026-04-04 for the CC-Middleware project. These documents comprehensively map Claude Code's configuration system to inform API design.

## Research Files

| File | System | Key Finding |
|------|--------|-------------|
| [settings-system.md](settings-system.md) | Settings | 5-tier precedence hierarchy (managed > CLI > local > project > user). ~60+ settings keys. Array settings merge across scopes. JSON schema available at schemastore.org. |
| [plugin-system.md](plugin-system.md) | Plugins | State split across 3+ files (installed_plugins.json, settings.json enabledPlugins, known_marketplaces.json). Plugins cached locally. CLI needed for install/uninstall; enable/disable is a settings.json edit. |
| [skills-agents-rules.md](skills-agents-rules.md) | Skills, Agents, Rules | All are markdown files with YAML frontmatter. Agents have 15+ frontmatter fields. Skills follow the Agent Skills open standard. Rules support path-scoped glob patterns. |
| [hooks-system.md](hooks-system.md) | Hooks | 27 event types. 4 handler types (command, http, prompt, agent). Exit code 2 blocks events. PreToolUse "defer" enables headless permission handling. Critical for middleware integration. |
| [mcp-configuration.md](mcp-configuration.md) | MCP Servers | Configs stored in ~/.claude.json (local/user scope) and .mcp.json (project scope). 3 transport types. Env var expansion in configs. OAuth support for remote servers. |
| [memory-system.md](memory-system.md) | Memory & CLAUDE.md | CLAUDE.md walks up directory tree. Auto-memory stored per-project under ~/.claude/projects/. MEMORY.md index limited to 200 lines/25KB at session start. |
| [global-config.md](global-config.md) | ~/.claude.json | Monolithic config file with preferences, per-project state, feature flags, and MCP configs. ~200+ feature flags (server-controlled, not user-editable). |
| [analytics-sources.md](analytics-sources.md) | Analytics sources | Confirms transcripts are the source of truth for analytics backfill; OTel is optional live enrichment only. Documents local findings on compaction, tool errors, token usage, and subagent lineage. |

## Architecture Summary

### Configuration is Spread Across Many Files

```
~/.claude.json                          # Global config, MCP servers, per-project state
~/.claude/settings.json                 # User settings
~/.claude/settings.local.json           # Local settings override
~/.claude/plugins/installed_plugins.json # Plugin registry
~/.claude/plugins/known_marketplaces.json # Marketplace sources
~/.claude/plugins/cache/...             # Plugin files
~/.claude/projects/<key>/memory/        # Auto memory per project
~/.claude/agents/*.md                   # User agents
~/.claude/skills/*/SKILL.md             # User skills
~/.claude/rules/*.md                    # User rules
~/.claude/CLAUDE.md                     # User instructions
<project>/.claude/settings.json         # Project settings
<project>/.claude/settings.local.json   # Local project settings
<project>/.claude/agents/*.md           # Project agents
<project>/.claude/skills/*/SKILL.md     # Project skills
<project>/.claude/rules/*.md            # Project rules
<project>/.mcp.json                     # Project MCP servers
<project>/CLAUDE.md                     # Project instructions
<project>/CLAUDE.local.md               # Local instructions
```

### Key Patterns the Middleware Must Handle

1. **Multi-file merging**: Settings, permissions, and arrays merge across scopes with clear precedence rules
2. **File watching**: Claude Code detects config changes via `ConfigChange` hooks
3. **Markdown + YAML frontmatter**: Skills, agents, rules all use markdown with YAML frontmatter
4. **JSON config files**: settings.json, ~/.claude.json, installed_plugins.json, .mcp.json
5. **Path encoding**: Project keys in ~/.claude/ use `-` separated paths (e.g., `-Users-zef-Desktop-cc-middleware`)
6. **Plugin cache indirection**: Plugins are installed to cache, not referenced in-place
7. **CLI as primary write mechanism**: For MCP servers and plugin install/uninstall, the `claude` CLI handles edge cases that direct file edits would miss

### Critical Integration Points for the Middleware

1. **Hooks (especially PreToolUse with "defer")**: The primary mechanism for the middleware to intercept and control Claude Code behavior. The HTTP hook type is ideal for middleware integration.
2. **Settings (permissions)**: The middleware can programmatically control what Claude can do by editing permission rules in settings.json.
3. **MCP servers**: The middleware can add itself as an MCP server to provide custom tools to Claude.
4. **Auto memory**: The middleware can read/write memory files to persist state across sessions.
5. **Plugin system**: The middleware can be packaged as a Claude Code plugin for easy distribution.

### What's Read-Only vs Writable

| System | Readable | Writable | How to Write |
|--------|----------|----------|-------------|
| Settings (user/project/local) | Direct file read | Direct file edit | JSON parse/edit/write |
| Settings (managed) | Direct file read | No | IT deployment only |
| Plugins (installed list) | Direct file read | No | CLI `claude plugin` commands |
| Plugins (enabled state) | Settings file read | Settings file edit | Edit enabledPlugins in settings.json |
| Skills/Agents/Rules | Direct file read | Direct file write | Create/edit markdown files |
| MCP Servers | Parse ~/.claude.json + .mcp.json | Partial | CLI `claude mcp` or careful JSON edit |
| Memory (CLAUDE.md) | Direct file read | Direct file write | Edit markdown files |
| Memory (auto) | Direct file read | Direct file write | Edit markdown files |
| Global config | Parse ~/.claude.json | Partial | Direct edit with care (concurrent writes) |
| Feature flags | Parse ~/.claude.json | No | Server-controlled |

## Surprising/Undocumented Findings

1. **MCP "local" scope is stored in ~/.claude.json**, not in the project directory. The naming is confusing because "local" settings normally mean `.claude/settings.local.json` in the project.

2. **~/.claude.json is enormous** (~40KB+) because it caches ~200+ feature flags from the server under `cachedGrowthBookFeatures`.

3. **Plugin "version: unknown"** appears for plugins installed from the official marketplace when no version is specified in plugin.json -- the marketplace entry's version is used instead.

4. **No managed settings exist on this machine** -- the `/Library/Application Support/ClaudeCode/` directory does not exist.

5. **Plugin blocklist is fetched from a server** and cached locally at `~/.claude/plugins/blocklist.json`, providing a centralized way to disable compromised plugins.

6. **Auto memory uses git root for grouping** -- all worktrees of the same repo share one memory directory.

7. **Settings have an official JSON schema** at `https://json.schemastore.org/claude-code-settings.json` that enables IDE autocomplete.

8. **The hooks system has 27 distinct event types** -- far more than the 6-7 commonly documented ones. Many are relatively new additions (WorktreeCreate, Elicitation, FileChanged, etc.).

9. **Plugin agents have security restrictions** -- `hooks`, `mcpServers`, and `permissionMode` frontmatter fields are silently ignored when loading agents from plugins.

10. **The `$CLAUDE_ENV_FILE` mechanism** in SessionStart/CwdChanged/FileChanged hooks allows hooks to inject environment variables by writing `export VAR=value` lines to a temporary file.
