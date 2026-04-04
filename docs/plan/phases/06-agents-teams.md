# Phase 6: Agent & Team Management

**Status**: Not Started
**Depends On**: Phase 3 (Session Launching), Phase 4 (Event System)
**Blocks**: Phase 7 (API Layer)

## Goal

Read, manage, and launch sub-agents and agent teams programmatically. Expose agent definitions and team coordination through the middleware.

## Key Concepts

### Sub-Agent Definitions
Markdown files in `.claude/agents/` or `~/.claude/agents/`:
```markdown
---
name: security-reviewer
description: Reviews code for security vulnerabilities
model: sonnet
maxTurns: 20
disallowedTools: Write, Edit
---

System prompt for the agent...
```

### Agent Teams (Experimental)
- Enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- Team config: `~/.claude/teams/{team-name}/config.json`
- Task list: `~/.claude/tasks/{team-name}/`
- Requires Claude Code v2.1.32+

### Programmatic Agents (SDK)
```typescript
const agents: Record<string, AgentDefinition> = {
  "code-reviewer": {
    description: "Reviews code for quality",
    prompt: "Review code...",
    model: "sonnet",
    tools: ["Read", "Glob", "Grep"],
  }
};
query({ prompt: "...", options: { agents } });
```

---

## Task 6.1: Agent Definition Reader

### Implementation: `src/agents/definitions.ts`

```typescript
export interface AgentDefinitionSource {
  name: string;
  description: string;
  model?: string;
  maxTurns?: number;
  tools?: string[];
  disallowedTools?: string[];
  prompt: string;
  source: 'project' | 'user' | 'plugin' | 'runtime';
  filePath?: string;  // For filesystem-based definitions
}

export async function readAgentDefinitions(options?: {
  projectDir?: string;
  userDir?: string;  // Default: ~/.claude/agents/
  pluginDirs?: string[];
}): Promise<AgentDefinitionSource[]>

export function parseAgentMarkdown(content: string, filePath: string): AgentDefinitionSource
```

**Behavior**:
- Scan `.claude/agents/` in project directory
- Scan `~/.claude/agents/` for user-level agents
- Parse markdown frontmatter with `gray-matter`
- Validate required fields (name, description)
- Body after frontmatter becomes the prompt

### Verification (E2E)

**`tests/e2e/agent-definitions.test.ts`**:
```typescript
// Test: Read agent definitions
// 1. Create test agent files in a temp directory
// 2. Call readAgentDefinitions({ projectDir: tempDir })
// 3. Verify parsed definitions match expected structure
// 4. Verify frontmatter fields are correctly extracted
// 5. Verify prompt body is captured

// Test: Parse agent markdown
// 1. parseAgentMarkdown(testContent, '/test/agent.md')
// 2. Verify all fields parsed correctly
// 3. Verify missing optional fields default correctly
```

---

## Task 6.2: Agent Definition Registry

### Implementation: `src/agents/registry.ts`

```typescript
export class AgentRegistry {
  constructor()

  // Load from filesystem
  async loadFromFilesystem(options?: {
    projectDir?: string;
    userDir?: string;
  }): Promise<void>

  // Register runtime agents
  register(name: string, definition: AgentDefinitionSource): void
  unregister(name: string): void

  // Query
  get(name: string): AgentDefinitionSource | undefined
  list(): AgentDefinitionSource[]
  listBySource(source: AgentDefinitionSource['source']): AgentDefinitionSource[]

  // Convert to SDK format
  toSDKAgents(): Record<string, import('@anthropic-ai/claude-agent-sdk').AgentDefinition>
}
```

### Verification (Unit)

**`tests/unit/agent-registry.test.ts`**:
```typescript
// Test: Register and retrieve agents
// Test: Filesystem loading
// Test: Runtime registration
// Test: List by source
// Test: Deduplication (runtime overrides filesystem)
// Test: toSDKAgents conversion
```

---

## Task 6.3: Team Management

### Implementation: `src/agents/teams.ts`

```typescript
export interface TeamInfo {
  name: string;
  configPath: string;
  members: TeamMember[];
  taskListPath: string;
}

export interface TeamMember {
  name: string;
  agentId: string;
  agentType?: string;
  status: 'active' | 'idle' | 'stopped';
}

export interface TeamTaskInfo {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  assignee?: string;
  dependencies: string[];
}

export class TeamManager {
  // Read existing teams
  async discoverTeams(): Promise<TeamInfo[]>
  async getTeam(name: string): Promise<TeamInfo | undefined>

  // Read team tasks
  async getTeamTasks(teamName: string): Promise<TeamTaskInfo[]>

  // Launch a session with teams enabled
  async launchTeamSession(options: LaunchOptions & {
    teamConfig?: {
      teammateMode?: 'in-process' | 'tmux';
    };
  }): Promise<LaunchResult>
}
```

**Behavior**:
- Read team configs from `~/.claude/teams/`
- Parse config.json for member info
- Read task lists from `~/.claude/tasks/`
- When launching team sessions, set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in env
- Note: Full team orchestration happens within Claude Code; we expose the state

### Verification (E2E)

**`tests/e2e/team-management.test.ts`**:
```typescript
// Test: Discover teams (reads filesystem)
// 1. Call discoverTeams()
// 2. Verify result is an array (may be empty if no teams exist)
// 3. If teams exist, verify structure: name, configPath, members

// Test: Parse team config (unit-style with fixture)
// 1. Create mock team config JSON
// 2. Parse and verify structure

// Test: Parse team tasks (unit-style with fixture)
// 1. Create mock task list
// 2. Parse and verify structure
```

---

## Task 6.4: Programmatic Agent Launching

### Implementation: `src/agents/launcher.ts`

```typescript
export class AgentLauncher {
  constructor(
    private sessionManager: SessionManager,
    private agentRegistry: AgentRegistry,
  )

  // Launch a session using a registered agent
  async launchAgent(
    agentName: string,
    prompt: string,
    options?: Partial<LaunchOptions>
  ): Promise<LaunchResult>

  // Launch with inline agent definition
  async launchWithDefinition(
    definition: AgentDefinitionSource,
    prompt: string,
    options?: Partial<LaunchOptions>
  ): Promise<LaunchResult>
}
```

**Behavior**:
- Look up agent in registry
- Convert to SDK `AgentDefinition` format
- Pass as `agents` option to `query()`
- Set `agent` option to use this agent for the main thread
- Track in session manager

### Verification (E2E)

**`tests/e2e/agent-launcher.test.ts`**:
```typescript
// Test: Launch with programmatic agent
// 1. Define a simple agent: { description: "Answers questions", prompt: "Be concise", model: "sonnet" }
// 2. Register it in the registry
// 3. Launch with a simple prompt
// 4. Verify session completes with a result
```
