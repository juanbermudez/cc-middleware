/**
 * Session-related types for CC-Middleware.
 * Maps from Agent SDK types (SDKSessionInfo, SessionMessage, SDKResultMessage)
 * to our normalized middleware types.
 */

/** Normalized session info, mapped from SDKSessionInfo */
export interface SessionInfo {
  sessionId: string;
  summary: string;
  lastModified: number;
  fileSize?: number;
  customTitle?: string;
  firstPrompt?: string;
  gitBranch?: string;
  cwd?: string;
  tag?: string;
  createdAt?: number;
}

/** Session message, mapped from SDK SessionMessage */
export interface SessionMessage {
  type: "user" | "assistant" | "system";
  uuid: string;
  session_id: string;
  /** Raw message payload from the transcript (opaque, must be parsed) */
  message: unknown;
  parent_tool_use_id: string | null;
  /** Optional ISO timestamp when available in the source transcript */
  timestamp?: string;
}

/** Transcript source kind for a session file. */
export type SessionTranscriptKind = "root" | "subagent";

/** Normalized role used by transcript and timeline surfaces. */
export type SessionTranscriptRole = "user" | "assistant" | "system" | "runtime";

/** Normalized tool use extracted from a transcript message. */
export interface SessionTranscriptToolUse {
  id: string;
  name: string;
  input: unknown;
}

/** Normalized tool result extracted from a transcript message. */
export interface SessionTranscriptToolResult {
  toolUseId: string;
  isError: boolean;
  content: string;
}

/** File change inferred from tool usage or transcript payloads. */
export interface SessionDetailFileChange {
  path: string;
  action: "write" | "edit" | "multi_edit" | "notebook_edit";
  toolName: string;
  toolUseId?: string;
  timestamp: number;
}

/** Normalized error entry for a session transcript. */
export interface SessionDetailError {
  id: string;
  kind: "api_error" | "tool_error" | "system_error" | "unknown";
  message: string;
  timestamp: number;
  toolName?: string;
  toolUseId?: string;
  eventType: string;
  eventSubtype?: string;
  sourceDedupeKey: string;
}

/** Summary row for a tool family used in a session. */
export interface SessionDetailToolSummary {
  toolName: string;
  callCount: number;
  errorCount: number;
  lastSeenAt: number;
  sessionIds: string[];
}

/** Summary row for inferred file changes. */
export interface SessionDetailFileSummary {
  path: string;
  action: "write" | "edit" | "multi_edit" | "notebook_edit";
  toolName: string;
  toolUseId?: string;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  sessionIds: string[];
}

/** Summary row for inferred skill usage. */
export interface SessionDetailSkillSummary {
  name: string;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  sessionIds: string[];
}

/** Session/subagent lineage summary for the detail page. */
export interface SessionDetailSubagentSummary {
  sessionId: string;
  rootSessionId: string;
  transcriptKind: SessionTranscriptKind;
  agentId?: string;
  slug?: string;
  teamName?: string;
  teammateName?: string;
  sourceToolAssistantUUID?: string;
  transcriptPath?: string;
  messageCount: number;
  startedAt: number;
  lastModified: number;
}

/** Session configuration snapshot used by the detail page. */
export interface SessionDetailConfiguration {
  cwd?: string;
  projectKey?: string;
  customTitle?: string;
  tag?: string;
  firstPrompt?: string;
  model?: string;
  agentId?: string;
  slug?: string;
  teamName?: string;
  teammateName?: string;
  rootSessionId: string;
  transcriptKind: SessionTranscriptKind;
  transcriptPath: string;
  transcriptPaths: string[];
  firstSeenAt: number;
  lastSeenAt: number;
}

/** Detailed normalized message for a session transcript timeline. */
export interface SessionTranscriptMessage {
  id: string;
  sessionId: string;
  rootSessionId: string;
  transcriptKind: SessionTranscriptKind;
  interactionId: string;
  role: SessionTranscriptRole;
  eventType: string;
  eventSubtype?: string;
  timestamp: number;
  text: string;
  raw: Record<string, unknown>;
  toolUses: SessionTranscriptToolUse[];
  toolResults: SessionTranscriptToolResult[];
  fileChanges: SessionDetailFileChange[];
  errors: SessionDetailError[];
  skillNames: string[];
  agentId?: string;
  slug?: string;
  sourceToolAssistantUUID?: string;
  teamName?: string;
  teammateName?: string;
  isPromptLikeUserEvent: boolean;
}

/** Turn/interaction grouping for the transcript timeline. */
export interface SessionTranscriptTurn {
  id: string;
  interactionId: string;
  sessionId: string;
  rootSessionId: string;
  transcriptKind: SessionTranscriptKind;
  startedAt: number;
  endedAt: number;
  messageIds: string[];
  messageCount: number;
  role: SessionTranscriptRole;
  title: string;
  summary: string;
  text: string;
  messages: SessionTranscriptMessage[];
  toolNames: string[];
  filePaths: string[];
  errorCount: number;
  skillNames: string[];
}

/** Transcript payload for the detail page. */
export interface SessionDetailTranscript {
  messages: SessionTranscriptMessage[];
  turns: SessionTranscriptTurn[];
}

/** Inspector payload for the detail page. */
export interface SessionDetailInspector {
  files: SessionDetailFileSummary[];
  tools: SessionDetailToolSummary[];
  errors: SessionDetailError[];
  skills: SessionDetailSkillSummary[];
  configuration: SessionDetailConfiguration;
  subagents: SessionDetailSubagentSummary[];
  metadata: import("../store/db.js").SessionMetadataEntry[];
}

/** Lineage payload for the detail page. */
export interface SessionDetailLineage {
  kind: SessionTranscriptKind;
  sessionId: string;
  rootSessionId: string;
  parentSessionId?: string;
  subagentCount: number;
  subagents: SessionDetailSubagentSummary[];
}

/** Response payload for GET /api/v1/sessions/:id/detail. */
export interface SessionDetailResponse {
  sessionId: string;
  rootSessionId: string;
  session: SessionInfo;
  transcript: SessionDetailTranscript;
  inspector: SessionDetailInspector;
  lineage: SessionDetailLineage;
}

/** Filters for listing sessions */
export interface SessionFilter {
  /** Project directory to filter by */
  dir?: string;
  /** Include sessions from git worktrees */
  includeWorktrees?: boolean;
  /** Maximum number of sessions to return */
  limit?: number;
  /** Filter by date range (ms since epoch) */
  dateRange?: {
    from?: number;
    to?: number;
  };
  /** Filter by tags */
  tags?: string[];
}

/** Permission mode for session launching */
export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan"
  | "dontAsk"
  | "auto";

/** Options for launching headless sessions */
export interface SessionLaunchOptions {
  prompt: string;
  /** Working directory for the session */
  cwd?: string;
  /** Maximum number of turns */
  maxTurns?: number;
  /** Allowed tools list or preset */
  allowedTools?: string[];
  /** Disallowed tools */
  disallowedTools?: string[];
  /** Permission mode */
  permissionMode?: PermissionMode;
  /** Session ID to resume */
  resume?: string;
  /** Continue most recent session */
  continue?: boolean;
  /** Enable streaming via includePartialMessages */
  streaming?: boolean;
  /** Persist session to disk (false = in-memory only) */
  persistSession?: boolean;
  /** Effort level */
  effort?: "low" | "medium" | "high" | "max";
  /** Enable file checkpointing */
  enableFileCheckpointing?: boolean;
  /** Abort controller for cancellation */
  abortController?: AbortController;
  /** Maximum budget in USD */
  maxBudgetUsd?: number;
  /** Custom session ID */
  sessionId?: string;
  /** Structured output JSON schema */
  outputFormat?: Record<string, unknown>;
}

/** Usage stats from a completed session */
export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

/** Per-model usage breakdown */
export interface ModelUsageEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  contextWindow?: number;
  maxOutputTokens?: number;
}

/** Result subtypes matching SDKResultMessage */
export type SessionResultSubtype =
  | "success"
  | "error_max_turns"
  | "error_during_execution"
  | "error_max_budget_usd"
  | "error_max_structured_output_retries";

/** Result of a completed session, mapped from SDKResultMessage */
export interface SessionResult {
  subtype: SessionResultSubtype;
  sessionId: string;
  result?: string;
  errors?: string[];
  durationMs: number;
  durationApiMs: number;
  totalCostUsd: number;
  numTurns: number;
  stopReason: string;
  usage: SessionUsage;
  modelUsage: ModelUsageEntry[];
  permissionDenials: string[];
  structuredOutput?: unknown;
  isError: boolean;
}

/** A running session tracked by the middleware */
export interface ActiveSession {
  sessionId: string;
  startedAt: number;
  cwd?: string;
  prompt: string;
  abortController: AbortController;
  /** Reference to the SDK Query async generator */
  query: AsyncGenerator<unknown, void>;
}
