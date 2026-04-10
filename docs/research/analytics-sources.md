# Analytics Source Research

Research conducted on 2026-04-08 for the analytics and developer-insights feature.

## Executive Summary

The best source of truth for local analytics is **Claude Code session transcript history** under `~/.claude/projects/**/*.jsonl`.

Claude Code OpenTelemetry is useful for optional live enrichment, but it is not suitable as the primary analytics backbone because it is:

- opt-in
- runtime-only
- not retroactive
- sensitive to deployment configuration

Therefore:

> Build the warehouse from transcripts and middleware-captured SDK messages first. Add OTel later as enrichment.

## Local Findings from This Machine

### Transcript type counts

Observed in `~/.claude/projects/**/*.jsonl`:

- `progress`: 98,066
- `assistant`: 71,818
- `user`: 50,440
- `queue-operation`: 3,237
- `last-prompt`: 1,472
- `attachment`: 597
- `system`: 511
- `file-history-snapshot`: 482
- `permission-mode`: 18
- `agent-name`: 5

### Observed system subtypes

- `turn_duration`: 436
- `compact_boundary`: 41
- `api_error`: 22
- `local_command`: 9
- `bridge_status`: 3

### Useful historical event coverage

- Assistant messages with `usage`: 71,818
- Assistant API-error messages: 971
- Error tool results: 2,638
- Queue operations: 3,237
- Permission mode changes: 18
- Named-agent records: 5

## Backfill Coverage Matrix

| Signal | Backfillable from transcripts? | Notes |
|--------|--------------------------------|-------|
| User prompt text | Yes | Primary source for keyword analytics |
| Assistant text | Yes | Available, but may need privacy controls |
| Tool uses | Yes | Tool blocks appear in assistant content |
| Tool results | Yes | User-side tool_result content present |
| Tool errors | Yes | `tool_result.is_error` observed |
| Request token usage | Yes | Assistant `message.usage` fields present |
| Cache token usage | Yes | `cache_read` and `cache_creation` present |
| Session / interaction timing | Yes | Timestamps and `turn_duration` records present |
| Subagent lineage | Yes | Sidechain files plus `sourceToolAssistantUUID`, `agentId`, `slug` |
| Compaction boundaries | Yes | `system.subtype = compact_boundary` observed |
| Permission mode changes | Yes | `permission-mode` entries present |
| Exact historical OTel trace IDs | No | Need live OTel to get them |
| Exact historical billed cost | No | Best treated as derived or reconciled separately |
| Exact internal context-window size | No | Use request-level estimate from token usage |

## Transcript Structure Notes

### Root sessions

Stored at:

```text
~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
```

Relevant current repo code:

- [../../src/sessions/transcripts.ts](../../src/sessions/transcripts.ts)
- [../../src/sessions/messages.ts](../../src/sessions/messages.ts)

### Subagents / sidechains

Stored at:

```text
~/.claude/projects/<encoded-cwd>/<session-id>/subagents/*.jsonl
```

Important join fields:

- `sourceToolAssistantUUID`
- `agentId`
- `slug`
- path under the parent session directory

### Useful payload fields seen in raw history

Assistant messages:

- `message.id`
- `message.model`
- `message.stop_reason`
- `message.usage.input_tokens`
- `message.usage.output_tokens`
- `message.usage.cache_creation_input_tokens`
- `message.usage.cache_read_input_tokens`
- `requestId`

Tool results:

- `type: "tool_result"`
- `tool_use_id`
- `is_error`
- `toolUseResult`

System messages:

- `subtype: "turn_duration"`
- `subtype: "compact_boundary"`

Other useful events:

- `queue-operation`
- `permission-mode`
- `agent-name`

## Implications for Metric Design

### Keyword analytics

We can backfill English keyword categories immediately from transcript prompt text:

- frustration
- cursing
- insult
- aggression
- urgency

This should start as deterministic regex / dictionary matching. It does not require OTel.

### Error analytics

Error incidence over time can be derived from:

- assistant API-error messages
- tool-result failures
- permission denials
- middleware runtime failures

### Cost and token analytics

Token analytics are already strong historically because request-level usage is stored in transcripts.

Historical cost should be modeled as:

- derived `estimated_cost_usd` from model pricing and token usage
- optionally reconciled later against admin APIs or live-request estimates

### Context analytics

Exact historical model-context occupancy is not directly stored in transcript history.

Recommended local proxy:

```text
request_context_tokens_est =
  input_tokens + cache_read_input_tokens + cache_creation_input_tokens
```

Use `compact_boundary` as the structural signal that earlier context was summarized.

## Middleware Gaps That Must Be Fixed

### 1. Middleware-launched sessions currently miss the full analytics bridge

Relevant files:

- [../../src/main.ts](../../src/main.ts)
- [../../src/api/routes/sessions.ts](../../src/api/routes/sessions.ts)
- [../../src/api/websocket.ts](../../src/api/websocket.ts)

The middleware creates the event bus and permission system, but launch and resume routes do not consistently pass that plumbing through to launched sessions.

### 2. Permission events lack join context

Relevant file:

- [../../src/permissions/handler.ts](../../src/permissions/handler.ts)

`PermissionRequest` currently emits blank `session_id` and `cwd`, which breaks analytics joins.

### 3. Plugin hook coverage is too narrow

Relevant file:

- [../../src/plugin/hooks/hooks.json](../../src/plugin/hooks/hooks.json)

Current coverage misses analytics-important events such as:

- `PermissionRequest`
- `PermissionDenied`
- `PostToolUseFailure`
- `UserPromptSubmit`
- `StopFailure`
- `PreCompact`
- `PostCompact`

## Why OTel Is Optional Enrichment

The Claude Code monitoring docs are still very valuable:

- events/logs expose `prompt.id`
- traces can link API requests and tool executions
- tool-detail logging can expose skill names, tool parameters, and MCP tool details

But OTel should remain optional because it is:

- not backfillable from historical sessions
- disabled by default
- a deployment concern rather than an intrinsic session artifact

Use cases for optional enrichment:

- native trace/span search
- request-level estimated cost from live `api_request` events
- richer tool-parameter auditing
- live prompt correlation via `prompt.id`

## Recommended Warehouse Decision

Use:

- SQLite for the existing operational session catalog and FTS
- DuckDB for the analytics warehouse

Rationale:

- DuckDB is better for local OLAP scans and rollups
- DuckDB can read SQLite directly when needed
- DuckDB keeps the analytics work separate from the operational store

## Related Docs

- [README.md](README.md)
- [../architecture/analytics-system.md](../architecture/analytics-system.md)
- [../plan/phases/13-analytics-observability.md](../plan/phases/13-analytics-observability.md)

## External References

- [Claude Code monitoring / OpenTelemetry](https://code.claude.com/docs/en/monitoring-usage)
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)
- [Agent SDK TypeScript reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [How the agent loop works](https://platform.claude.com/docs/en/agent-sdk/agent-loop)
- [Agent Skills in the SDK](https://platform.claude.com/docs/en/agent-sdk/skills)
- [Usage and Cost API](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api)
- [Claude Code Analytics API](https://platform.claude.com/docs/en/build-with-claude/claude-code-analytics-api)
- [DuckDB install / Node package](https://duckdb.org/install/)
- [DuckDB Node client](https://duckdb.org/docs/1.3/clients/node_neo/overview.html)
- [DuckDB SQLite extension](https://duckdb.org/docs/current/core_extensions/sqlite)
- [DuckDB full-text search](https://duckdb.org/docs/current/core_extensions/full_text_search)
