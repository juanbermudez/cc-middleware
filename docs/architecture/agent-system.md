# Agent System Architecture

## Overview

The agent system manages sub-agent definitions and agent teams, providing read access to filesystem-based agents, a registry for runtime agents, and team monitoring.

## Components

### Definition Reader (`src/agents/definitions.ts`)
Reads agent markdown files from standard locations.

**Locations scanned**:
- `.claude/agents/` - Project-level agents
- `~/.claude/agents/` - User-level agents
- Plugin agent directories

**Markdown format**:
```markdown
---
name: agent-name
description: When to use this agent
model: sonnet
maxTurns: 20
tools: [Read, Glob, Grep]
disallowedTools: [Write, Edit]
---

System prompt body...
```

Parsed with `gray-matter` for frontmatter extraction.

### Agent Registry (`src/agents/registry.ts`)
Central registry merging filesystem and runtime agent definitions.

- Filesystem agents loaded on startup
- Runtime agents registered via API
- Runtime agents override filesystem agents with same name
- `toSDKAgents()` converts registry to Agent SDK format

### Team Manager (`src/agents/teams.ts`)
Reads and monitors Claude Code agent team state.

**Team storage**:
- Config: `~/.claude/teams/{team-name}/config.json`
- Tasks: `~/.claude/tasks/{team-name}/`

**Capabilities**:
- Discover existing teams
- Read team member status
- Read team task lists
- Launch sessions with teams enabled

**Limitations** (due to experimental status):
- Cannot create teams programmatically (must be done by Claude in-session)
- Cannot modify team membership
- Cannot directly message teammates
- Read-only monitoring of team state

### Agent Launcher (`src/agents/launcher.ts`)
Launches sessions using specific agent definitions.

Uses SDK's `agents` option to pass agent definitions, and `agent` option to specify which agent handles the main thread.

## Agent Definition Type

```typescript
interface AgentDefinitionSource {
  name: string;
  description: string;
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  maxTurns?: number;
  tools?: string[];
  disallowedTools?: string[];
  prompt: string;
  source: 'project' | 'user' | 'plugin' | 'runtime';
  filePath?: string;
}
```

Maps to SDK's `AgentDefinition`:
```typescript
interface AgentDefinition {
  description: string;
  tools?: string[];
  disallowedTools?: string[];
  prompt: string;
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  maxTurns?: number;
}
```
