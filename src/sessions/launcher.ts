/**
 * Session launcher for headless Claude Code sessions.
 * Wraps the Agent SDK's query() function.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SessionResult } from "../types/sessions.js";

/** Options for launching a session */
export interface LaunchOptions {
  prompt: string;
  /** Working directory */
  cwd?: string;
  /** Allowed tools */
  allowedTools?: string[];
  /** Disallowed tools */
  disallowedTools?: string[];
  /** Permission mode */
  permissionMode?:
    | "default"
    | "acceptEdits"
    | "plan"
    | "dontAsk"
    | "bypassPermissions"
    | "auto";
  /** Maximum turns */
  maxTurns?: number;
  /** Maximum budget in USD */
  maxBudgetUsd?: number;
  /** System prompt override */
  systemPrompt?: string;
  /** Whether to persist session to disk */
  persistSession?: boolean;
  /** Abort controller for cancellation */
  abortController?: AbortController;
  /** Enable streaming (includePartialMessages) */
  includePartialMessages?: boolean;
  /** Session ID to resume */
  resume?: string;
  /** Continue most recent session */
  continue?: boolean;
  /** Fork when resuming */
  forkSession?: boolean;
  /** Custom session ID */
  sessionId?: string;
  /** Hooks configuration */
  hooks?: Record<string, unknown>;
  /** Effort level */
  effort?: "low" | "medium" | "high" | "max";
  /** Enable file checkpointing */
  enableFileCheckpointing?: boolean;
  /** Additional environment variables */
  env?: Record<string, string | undefined>;
}

/** Result of a completed session */
export interface LaunchResult {
  sessionId: string;
  subtype: string;
  isError: boolean;
  result?: string;
  errors?: string[];
  durationMs: number;
  durationApiMs: number;
  totalCostUsd: number;
  numTurns: number;
  stopReason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  modelUsage: Record<string, unknown>;
  permissionDenials: Array<{
    tool_name: string;
    tool_use_id: string;
    tool_input: Record<string, unknown>;
  }>;
  structuredOutput?: unknown;
}

/**
 * Launch a headless session and collect the result.
 * Iterates through all SDK messages and returns the final result.
 */
export async function launchSession(
  options: LaunchOptions
): Promise<LaunchResult> {
  const sdkOptions: Record<string, unknown> = {};

  if (options.allowedTools) sdkOptions.allowedTools = options.allowedTools;
  if (options.disallowedTools) sdkOptions.disallowedTools = options.disallowedTools;
  if (options.permissionMode) sdkOptions.permissionMode = options.permissionMode;
  if (options.maxTurns !== undefined) sdkOptions.maxTurns = options.maxTurns;
  if (options.maxBudgetUsd !== undefined) sdkOptions.maxBudgetUsd = options.maxBudgetUsd;
  if (options.systemPrompt) sdkOptions.systemPrompt = options.systemPrompt;
  if (options.persistSession !== undefined) sdkOptions.persistSession = options.persistSession;
  if (options.abortController) sdkOptions.abortController = options.abortController;
  if (options.includePartialMessages) sdkOptions.includePartialMessages = options.includePartialMessages;
  if (options.resume) sdkOptions.resume = options.resume;
  if (options.continue) sdkOptions.continue = options.continue;
  if (options.forkSession) sdkOptions.forkSession = options.forkSession;
  if (options.sessionId) sdkOptions.sessionId = options.sessionId;
  if (options.hooks) sdkOptions.hooks = options.hooks;
  if (options.effort) sdkOptions.effort = options.effort;
  if (options.enableFileCheckpointing) sdkOptions.enableFileCheckpointing = options.enableFileCheckpointing;
  if (options.env) sdkOptions.env = options.env;
  if (options.cwd) sdkOptions.cwd = options.cwd;

  let sessionId = "";
  let result: LaunchResult | undefined;

  const q = query({
    prompt: options.prompt,
    options: sdkOptions as Parameters<typeof query>[0]["options"],
  });

  for await (const message of q) {
    const msg = message as Record<string, unknown>;

    // Capture session ID from init or system message
    if (msg.type === "system" && msg.session_id) {
      sessionId = msg.session_id as string;
    }

    // Capture result from final message
    if (msg.type === "result") {
      sessionId = (msg.session_id as string) ?? sessionId;
      result = {
        sessionId,
        subtype: (msg.subtype as string) ?? "success",
        isError: (msg.is_error as boolean) ?? false,
        result: msg.result as string | undefined,
        errors: msg.errors as string[] | undefined,
        durationMs: (msg.duration_ms as number) ?? 0,
        durationApiMs: (msg.duration_api_ms as number) ?? 0,
        totalCostUsd: (msg.total_cost_usd as number) ?? 0,
        numTurns: (msg.num_turns as number) ?? 0,
        stopReason: (msg.stop_reason as string | null) ?? null,
        usage: (msg.usage as LaunchResult["usage"]) ?? {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        modelUsage: (msg.modelUsage as Record<string, unknown>) ?? {},
        permissionDenials: (msg.permission_denials as LaunchResult["permissionDenials"]) ?? [],
        structuredOutput: msg.structured_output,
      };
    }
  }

  if (!result) {
    throw new Error("Session completed without a result message");
  }

  return result;
}

/**
 * Resume a session by ID.
 */
export async function resumeSession(
  sessionId: string,
  prompt: string,
  options?: Partial<LaunchOptions>
): Promise<LaunchResult> {
  return launchSession({
    prompt,
    ...options,
    resume: sessionId,
  });
}

/**
 * Continue the most recent session in the working directory.
 */
export async function continueSession(
  prompt: string,
  options?: Partial<LaunchOptions>
): Promise<LaunchResult> {
  return launchSession({
    prompt,
    ...options,
    continue: true,
  });
}

/**
 * Fork a session (create a branch from an existing session).
 */
export async function forkSession(
  sessionId: string,
  prompt: string,
  options?: Partial<LaunchOptions>
): Promise<LaunchResult> {
  return launchSession({
    prompt,
    ...options,
    resume: sessionId,
    forkSession: true,
  });
}
