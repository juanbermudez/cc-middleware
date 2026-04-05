/**
 * Session launcher for headless Claude Code sessions.
 * Wraps the Agent SDK's query() function.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildSDKOptions, buildLaunchResult } from "./utils.js";

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
  /** Agent definitions for sub-agents */
  agents?: Record<string, unknown>;
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
  const sdkOptions = buildSDKOptions(options);

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
      result = buildLaunchResult(msg, sessionId);
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
