/**
 * Session launcher for headless Claude Code sessions.
 * Wraps the Agent SDK's query() function.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { buildSDKOptions, buildLaunchResult } from "./utils.js";
import type { CanUseTool } from "../permissions/handler.js";
import {
  normalizeLiveAnalyticsContext,
  recordLiveSdkMessage,
} from "../analytics/live/index.js";
import type { LiveAnalyticsCaptureOptions } from "../analytics/live/index.js";

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
  /** Agent to run the main thread */
  agent?: string;
  /** Model to use */
  model?: string;
  /** Fallback model */
  fallbackModel?: string;
  /** canUseTool callback for permission handling */
  canUseTool?: CanUseTool;
  /** MCP server configurations */
  mcpServers?: Record<string, unknown>;
  /** Plugin configurations */
  plugins?: Array<{ type: string; path: string }>;
  /** Settings sources to load */
  settingSources?: Array<"user" | "project" | "local">;
  /** Thinking configuration */
  thinking?: unknown;
  /** Output format for structured output */
  outputFormat?: unknown;
  /** Sandbox settings */
  sandbox?: unknown;
  /** Tools configuration */
  tools?: string[] | { type: string; preset: string };
  /** Tool config */
  toolConfig?: unknown;
  /** Additional directories */
  additionalDirectories?: string[];
  /** Allow bypassing permissions */
  allowDangerouslySkipPermissions?: boolean;
  /** Debug mode */
  debug?: boolean;
  /** Debug log file */
  debugFile?: string;
  /** Enable prompt suggestions */
  promptSuggestions?: boolean;
  /** Optional live analytics metadata */
  analytics?: LiveAnalyticsCaptureOptions;
  /** Internal callback invoked when the SDK reveals the real session ID */
  onSessionId?: (sessionId: string) => void;
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
  const analyticsContext = normalizeLiveAnalyticsContext({
    ...options.analytics,
    source: options.analytics?.source ?? "internal",
    sessionId: options.sessionId ?? options.resume,
    cwd: options.cwd,
  });

  let sessionId = "";
  let result: LaunchResult | undefined;

  const q = query({
    prompt: options.prompt,
    options: sdkOptions as Parameters<typeof query>[0]["options"],
  });

  for await (const message of q) {
    const msg = message as Record<string, unknown>;
    const rawSessionId = typeof msg.session_id === "string" ? msg.session_id : undefined;
    const messageType = typeof msg.type === "string" ? msg.type : "unknown";

    void recordLiveSdkMessage({
      kind: "sdk_message",
      ...analyticsContext,
      sessionId: rawSessionId ?? sessionId ?? analyticsContext.sessionId,
      phase: "launch",
      messageType,
      message: msg,
      prompt: options.prompt,
    });

    // Capture session ID from init or system message
    if (msg.type === "system" && rawSessionId) {
      sessionId = rawSessionId;
      options.onSessionId?.(sessionId);
    }

    // Capture result from final message
    if (msg.type === "result") {
      sessionId = (msg.session_id as string) ?? sessionId;
      if (sessionId) {
        options.onSessionId?.(sessionId);
      }
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
