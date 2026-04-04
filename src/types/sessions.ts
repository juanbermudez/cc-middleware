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
  type: "user" | "assistant";
  uuid: string;
  session_id: string;
  /** Raw message payload from the transcript (opaque, must be parsed) */
  message: unknown;
  parent_tool_use_id: null;
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
