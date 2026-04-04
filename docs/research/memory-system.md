# Memory and Auto-Memory System

## Overview

Claude Code has two complementary memory systems:

1. **CLAUDE.md files**: Human-written instructions loaded into every session
2. **Auto memory**: Machine-written notes Claude creates based on corrections and discoveries

Both are loaded at session start. Claude treats them as context, not enforced configuration. More specific and concise instructions produce more consistent behavior.

## CLAUDE.md Files

### File Locations and Loading

| Scope | Location | Purpose | Shared |
|-------|----------|---------|--------|
| **Managed policy** | macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md` | Org-wide instructions | All users |
| | Linux/WSL: `/etc/claude-code/CLAUDE.md` | | |
| | Windows: `C:\Program Files\ClaudeCode\CLAUDE.md` | | |
| **Project** | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Team-shared project instructions | Team (VCS) |
| **User** | `~/.claude/CLAUDE.md` | Personal preferences | No |
| **Local** | `./CLAUDE.local.md` | Personal project-specific | No (gitignored) |

### Loading Order

1. Claude walks **up** the directory tree from CWD, loading `CLAUDE.md` and `CLAUDE.local.md` at each level
2. Within each directory: `CLAUDE.md` loads first, `CLAUDE.local.md` appended after
3. All files are **concatenated** (not replaced)
4. CLAUDE.md files in **subdirectories** are loaded on-demand when Claude reads files there
5. `~/.claude/CLAUDE.md` loads for all projects
6. Managed CLAUDE.md always loads (cannot be excluded)

### Import Syntax

```markdown
@README.md
@docs/architecture.md
@~/.claude/my-instructions.md
@package.json
```

- Relative paths resolve relative to the importing file
- Maximum depth: 5 hops
- First external import triggers an approval dialog

### Excluding CLAUDE.md Files

In large monorepos, use `claudeMdExcludes` in settings:

```json
{
  "claudeMdExcludes": [
    "**/monorepo/CLAUDE.md",
    "/home/user/monorepo/other-team/.claude/rules/**"
  ]
}
```

Managed CLAUDE.md cannot be excluded.

### AGENTS.md Compatibility

If your repo uses `AGENTS.md` for other tools, create a CLAUDE.md that imports it:

```markdown
@AGENTS.md

## Claude Code
Additional Claude-specific instructions here.
```

### HTML Comments

Block-level HTML comments (`<!-- ... -->`) are stripped before injection. Use for maintainer notes without consuming context tokens. Comments inside code blocks are preserved.

### Additional Directories

CLAUDE.md from `--add-dir` directories NOT loaded by default. Enable with:
```bash
CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude --add-dir ../shared
```

## Path-Specific Rules (`.claude/rules/`)

Rules are markdown files with optional path-scoping:

```markdown
---
paths:
  - "src/api/**/*.ts"
  - "tests/**/*.test.ts"
---

# API Rules
- Always include input validation
```

Rules without `paths` frontmatter load unconditionally at startup.

### Locations

| Location | Scope |
|----------|-------|
| `~/.claude/rules/*.md` | Personal, all projects |
| `.claude/rules/*.md` | Project-specific |

Files discovered recursively. Subdirectories supported. Symlinks supported for sharing.

## Auto Memory

### How It Works

- Claude saves notes to itself based on corrections, preferences, and discoveries
- Not every session triggers a save -- Claude decides based on future utility
- First 200 lines or 25KB of `MEMORY.md` loaded at session start (whichever comes first)
- Topic files (e.g., `debugging.md`, `patterns.md`) loaded on-demand

### Storage Location

```
~/.claude/projects/<project-key>/memory/
├── MEMORY.md          # Index file, loaded every session
├── debugging.md       # Topic file (loaded on demand)
├── api-conventions.md # Topic file (loaded on demand)
└── ...
```

The `<project-key>` is derived from the **git repository root**, so all worktrees and subdirectories within the same repo share one memory directory. Outside a git repo, the project root path is used.

Path encoding: replace `/` with `-` and prepend `-`. Example: `/Users/zef/Desktop/cc-middleware` becomes `-Users-zef-Desktop-cc-middleware`.

### MEMORY.md Format

The MEMORY.md file is a plain markdown index that links to topic files:

```markdown
- [Topic Name](topic-file.md) - Brief description of what's stored
```

### Configuration

| Setting | Location | Description |
|---------|----------|-------------|
| `autoMemoryEnabled` | Project settings | `true`/`false` (default: true) |
| `autoMemoryDirectory` | User or local settings | Custom directory path (NOT from project settings) |

Environment variable: `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` to disable.

### Enable/Disable

- Toggle via `/memory` command in REPL
- Set `autoMemoryEnabled: false` in project settings
- Set env var `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`

### Viewing and Editing

- `/memory` command: lists all loaded CLAUDE.md, CLAUDE.local.md, rules, and auto-memory files
- Files are plain markdown -- editable by any text editor or programmatically
- Can delete files at any time

## Agent Memory (Subagent Persistent Memory)

Subagents can maintain their own memory:

| Scope | Location |
|-------|----------|
| `user` | `~/.claude/agent-memory/<agent-name>/` |
| `project` | `.claude/agent-memory/<agent-name>/` |
| `local` | `.claude/agent-memory-local/<agent-name>/` |

Same behavior as auto memory: first 200 lines or 25KB of MEMORY.md loaded at agent startup.

## How to Read Programmatically

### CLAUDE.md Files
1. Walk up from project root to filesystem root, collecting `CLAUDE.md` and `CLAUDE.local.md`
2. Check `~/.claude/CLAUDE.md` for user instructions
3. Check managed locations for org-wide instructions
4. Walk `<project>/.claude/rules/*.md` recursively
5. Walk `~/.claude/rules/*.md` recursively
6. Parse optional YAML frontmatter from rules files

### Auto Memory
1. Determine the project key (git root-based path encoding)
2. Read `~/.claude/projects/<project-key>/memory/MEMORY.md`
3. List other `.md` files in the memory directory for topic files

### Agent Memory
1. Check `~/.claude/agent-memory/` for user-scope agent memories
2. Check `<project>/.claude/agent-memory/` for project-scope
3. Check `<project>/.claude/agent-memory-local/` for local-scope

## How to Manage Programmatically

### CLAUDE.md
- Create/edit files directly at the appropriate location
- For project CLAUDE.md: write to `./CLAUDE.md` or `./.claude/CLAUDE.md`
- For user CLAUDE.md: write to `~/.claude/CLAUDE.md`
- Claude Code detects changes via file watching

### Auto Memory
- Edit/delete files in `~/.claude/projects/<key>/memory/`
- Enable/disable via `autoMemoryEnabled` in settings
- Redirect via `autoMemoryDirectory` in user/local settings

### Rules
- Create `.md` files in `.claude/rules/` with optional `paths` frontmatter
- Delete files to remove rules

## Actual State on This Machine

### Project CLAUDE.md
File exists at `/Users/zef/Desktop/cc-middleware/CLAUDE.md` (150 lines) containing:
- Project overview and architecture description
- Build & test commands
- Code style guidelines
- Session storage details
- Hook event system documentation
- Agent SDK usage patterns
- Orchestrator loop instructions

### Auto Memory
Located at `~/.claude/projects/-Users-zef-Desktop-cc-middleware/memory/`:

**MEMORY.md** (index):
```
- [CC-Middleware Project](project_overview.md) - Node/TS middleware wrapping Claude Code with 9-phase plan, loop-driven development
```

**project_overview.md** (topic file with frontmatter):
```yaml
---
name: CC-Middleware Project Overview
description: Node/TypeScript middleware wrapping Claude Code for session management, hooks, permissions, agents, and teams
type: project
---
```
Contains brief project overview and development approach notes.

### User CLAUDE.md
No `~/.claude/CLAUDE.md` file exists.

### Managed CLAUDE.md
No managed CLAUDE.md exists (`/Library/Application Support/ClaudeCode/CLAUDE.md` does not exist).

### Rules
`.claude/rules/` exists in the project but is empty.

## API Implications

### Read Endpoints
- `GET /api/memory/claude-md` -- all loaded CLAUDE.md files with scope/location
- `GET /api/memory/claude-md/:scope` -- CLAUDE.md for specific scope
- `GET /api/memory/rules` -- all rules with path patterns
- `GET /api/memory/auto` -- auto memory index (MEMORY.md) and topic list
- `GET /api/memory/auto/:file` -- specific auto memory topic file
- `GET /api/memory/agents/:name` -- agent memory for a specific agent

### Write Endpoints
- `PUT /api/memory/claude-md/:scope` -- edit CLAUDE.md at a specific scope
- `POST /api/memory/rules` -- create a new rule file
- `PUT /api/memory/rules/:name` -- edit a rule file
- `DELETE /api/memory/rules/:name` -- delete a rule file
- `PUT /api/memory/auto/:file` -- edit an auto memory topic file
- `DELETE /api/memory/auto/:file` -- delete an auto memory topic file
- `POST /api/memory/auto/toggle` -- enable/disable auto memory

### Considerations
- CLAUDE.md files are plain markdown; no special parsing needed beyond `@` imports
- Rules have optional YAML frontmatter requiring parsing
- Auto memory is per-project-key, derived from git root (need to handle path encoding)
- Memory files should be presented as editable markdown in any UI
- The `/memory` REPL command provides a model for what the UI should show
- Auto memory topic files can be large; serve them individually on demand
- Managed CLAUDE.md is read-only
