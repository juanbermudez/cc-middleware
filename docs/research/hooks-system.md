# Hooks System

## Overview

Hooks are lifecycle event handlers that run custom code at specific points during Claude Code's execution. They can validate, block, modify, or observe tool calls, session events, and configuration changes. Hooks are configured in `settings.json` under the `hooks` key, in plugin `hooks/hooks.json` files, or inline in skill/agent frontmatter.

## Hook Event Types

| Event | When It Fires | Can Block? | Matcher Input |
|-------|--------------|-----------|---------------|
| `SessionStart` | Session begins/resumes | No | `startup`, `resume`, `clear`, `compact` |
| `InstructionsLoaded` | CLAUDE.md/rules loaded | No | `session_start`, `nested_traversal`, `path_glob_match`, `include`, `compact` |
| `UserPromptSubmit` | User submits prompt | Yes | N/A |
| `PreToolUse` | Before tool execution | Yes | Tool name (Bash, Edit, Write, mcp__*) |
| `PermissionRequest` | Permission dialog shown | Yes | Tool name |
| `PermissionDenied` | Auto mode denies tool | No (retry only) | Tool name |
| `PostToolUse` | After tool succeeds | No | Tool name |
| `PostToolUseFailure` | Tool execution fails | No | Tool name |
| `Notification` | Notification sent | No | `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog` |
| `SubagentStart` | Subagent spawned | No | Agent type name |
| `SubagentStop` | Subagent finishes | Yes | Agent type name |
| `TaskCreated` | Task via TaskCreate | Yes | N/A |
| `TaskCompleted` | Task marked complete | Yes | N/A |
| `Stop` | Claude finishes responding | Yes | N/A |
| `StopFailure` | Turn ends with API error | No | `rate_limit`, `authentication_failed`, `billing_error`, `invalid_request`, `server_error`, `max_output_tokens`, `unknown` |
| `TeammateIdle` | Agent team teammate going idle | Yes | N/A |
| `ConfigChange` | Config file changes | Yes | `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills` |
| `CwdChanged` | Working directory changes | No | N/A |
| `FileChanged` | Watched file changes | No | Filename (basename) |
| `PreCompact` | Before context compaction | No | `manual`, `auto` |
| `PostCompact` | After compaction | No | `manual`, `auto` |
| `Elicitation` | MCP requests user input | Yes | MCP server name |
| `ElicitationResult` | User responds to MCP | Yes | MCP server name |
| `WorktreeCreate` | Worktree being created | Yes | N/A |
| `WorktreeRemove` | Worktree being removed | No | N/A |
| `SessionEnd` | Session terminates | No | `clear`, `resume`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other` |

## Configuration Format

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "regex pattern (optional)",
        "hooks": [
          {
            "type": "command|http|prompt|agent",
            "command": "shell command",
            "async": false,
            "shell": "bash",
            "timeout": 600,
            "statusMessage": "Spinner text...",
            "if": "permission rule syntax",
            "once": false
          }
        ]
      }
    ]
  }
}
```

## Hook Handler Types

### Command Hook
```json
{
  "type": "command",
  "command": "jq -r '.tool_input.file_path' | xargs npm run lint:fix",
  "async": false,
  "shell": "bash",
  "timeout": 600,
  "statusMessage": "Linting..."
}
```

### HTTP Hook
```json
{
  "type": "http",
  "url": "https://hooks.example.com/event",
  "headers": {
    "Authorization": "Bearer $MY_TOKEN"
  },
  "allowedEnvVars": ["MY_TOKEN"],
  "timeout": 30,
  "statusMessage": "Notifying..."
}
```

### Prompt Hook
```json
{
  "type": "prompt",
  "prompt": "Analyze this tool call: $ARGUMENTS",
  "model": "haiku",
  "timeout": 30,
  "statusMessage": "Evaluating..."
}
```

### Agent Hook
```json
{
  "type": "agent",
  "prompt": "Verify this change: $ARGUMENTS",
  "model": "sonnet",
  "timeout": 60,
  "statusMessage": "Verifying..."
}
```

## Common Input Fields (All Events via stdin)

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "hook_event_name": "string"
}
```

Additional fields when in subagent: `agent_id`, `agent_type`.

## Exit Code Behavior

| Exit Code | JSON Processed? | Effect |
|-----------|----------------|--------|
| 0 | Yes | Success; parses JSON stdout |
| 2 | No | Blocking error; event-specific blocking |
| Other | No | Non-blocking error; stderr in verbose mode |

### Blocking Events (Exit 2 prevents action)
`PreToolUse`, `PermissionRequest`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `ConfigChange`, `Elicitation`, `ElicitationResult`, `WorktreeCreate`

### Non-Blocking Events (Exit 2 shows feedback only)
`PostToolUse`, `PostToolUseFailure`, `PermissionDenied`, `Notification`, `SubagentStart`, `SessionStart`, `SessionEnd`, `CwdChanged`, `FileChanged`, `PreCompact`, `PostCompact`, `InstructionsLoaded`, `StopFailure`, `WorktreeRemove`

## JSON Output Schema

### Universal Fields
```json
{
  "continue": true,
  "stopReason": "string (shown when continue: false)",
  "suppressOutput": false,
  "systemMessage": "string (warning shown to user)"
}
```

### PreToolUse Output
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow|deny|ask|defer",
    "permissionDecisionReason": "string",
    "updatedInput": { "modified tool_input" },
    "additionalContext": "string"
  }
}
```

Decision precedence: deny > defer > ask > allow

### PermissionRequest Output
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow|deny",
      "updatedInput": {},
      "updatedPermissions": []
    }
  }
}
```

### PostToolUse/PostToolUseFailure Output
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "string",
    "updatedMCPToolOutput": {}
  }
}
```

## Tool Event Input Schemas

### PreToolUse (Bash)
```json
{
  "tool_name": "Bash",
  "tool_input": {
    "command": "npm test",
    "description": "optional",
    "timeout": 120000,
    "run_in_background": false
  },
  "tool_use_id": "string"
}
```

### PreToolUse (Write)
```json
{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file",
    "content": "file contents"
  }
}
```

### PreToolUse (Edit)
```json
{
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/path/to/file",
    "old_string": "original",
    "new_string": "replacement",
    "replace_all": false
  }
}
```

### PreToolUse (Agent)
```json
{
  "tool_name": "Agent",
  "tool_input": {
    "prompt": "task description",
    "description": "string",
    "subagent_type": "agent-name",
    "model": "optional override"
  }
}
```

## Matcher Patterns

Matchers use regex. Omit for all events of that type.

### MCP Tool Matching
```
mcp__<server>__<tool>
mcp__memory__create_entities     # Specific tool
mcp__filesystem__read_file       # Specific tool
mcp__.*__write.*                 # Regex: any MCP write tool
mcp__memory__.*                  # All memory server tools
```

### Conditional Execution (`if` field)
Uses permission rule syntax:
```json
"if": "Bash(rm *)"           // Only for rm commands
"if": "Edit(*.ts)"           // Only for TypeScript edits
```

## Hook Configuration Locations

| Location | Scope | Shareable |
|----------|-------|-----------|
| `~/.claude/settings.json` | All projects | No |
| `.claude/settings.json` | Single project | Yes |
| `.claude/settings.local.json` | Single project | No |
| Managed settings | Organization-wide | Yes |
| Plugin `hooks/hooks.json` | When plugin enabled | Yes |
| Skill/agent frontmatter | While active | Yes |

## Settings for Hook Control

| Setting | Type | Description |
|---------|------|-------------|
| `disableAllHooks` | boolean | Disable all hooks and status line |
| `allowManagedHooksOnly` | boolean | (Managed only) Block non-managed hooks |
| `allowedHttpHookUrls` | string[] | URL patterns for HTTP hooks |
| `httpHookAllowedEnvVars` | string[] | Env vars HTTP hooks can use |

## Environment Variables Available to Hooks

| Variable | Description |
|----------|-------------|
| `$CLAUDE_PROJECT_DIR` | Project root directory |
| `${CLAUDE_PLUGIN_ROOT}` | Plugin installation directory |
| `${CLAUDE_PLUGIN_DATA}` | Plugin persistent data directory |
| `$CLAUDE_CODE_REMOTE` | `"true"` in web environment |
| `$CLAUDE_ENV_FILE` | SessionStart/CwdChanged/FileChanged only; write `export VAR=value` |

## Output Size Limit

Hook output injected into context is capped at **10,000 characters**. Exceeding this saves output to a file with a preview and path.

## Defer Mechanism (PreToolUse Only)

Return `permissionDecision: "defer"` to pause Claude at a tool call in headless mode (`-p` flag):
1. Hook returns `"defer"`
2. Process exits with `stop_reason: "tool_deferred"` and `deferred_tool_use` object
3. External process surfaces UI and resumes: `claude -p --resume <session-id>`
4. Hook runs again, returns `"allow"` with answer in `updatedInput`

## API Implications

### Read Endpoints
- `GET /api/hooks` -- all configured hooks by event with source annotations
- `GET /api/hooks/:event` -- hooks for a specific event type
- `GET /api/hooks/events` -- list of all supported event types

### Write Endpoints
- `PUT /api/hooks/:scope` -- replace hooks config for a scope
- `PATCH /api/hooks/:scope/:event` -- add/modify hooks for specific event
- `POST /api/hooks/test` -- test a hook configuration

### Real-Time
- `WS /api/hooks/stream` -- stream hook events as they fire (for monitoring)

### Considerations
- Hooks are the primary mechanism for the middleware to observe Claude Code behavior
- The `PreToolUse` hook with `"defer"` is critical for headless permission handling
- The middleware's HTTP hook server (port 3001) should receive hook events
- Hook output can inject context into the conversation
- The `PermissionRequest` hook can programmatically approve/deny permissions
- The `Stop` hook can prevent Claude from finishing (useful for loop behaviors)
