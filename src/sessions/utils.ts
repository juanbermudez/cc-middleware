/**
 * Shared session utilities.
 * Extracted helpers used by both launcher.ts and streaming.ts.
 */

import type { LaunchOptions, LaunchResult } from "./launcher.js";
import type { SessionInfo } from "../types/sessions.js";

/**
 * Build a LaunchResult from a raw SDK result message.
 */
export function buildLaunchResult(
  msg: Record<string, unknown>,
  sessionId: string
): LaunchResult {
  return {
    sessionId: (msg.session_id as string) ?? sessionId,
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

/**
 * Build SDK options from LaunchOptions.
 * Maps our option names to the SDK's expected format.
 */
export function buildSDKOptions(options: LaunchOptions): Record<string, unknown> {
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
  if (options.agents) sdkOptions.agents = options.agents;

  return sdkOptions;
}

/**
 * Map an SDK session object to our SessionInfo type.
 */
export function toSessionInfo(sdk: {
  sessionId: string;
  summary: string;
  lastModified: number;
  fileSize?: number | null;
  customTitle?: string | null;
  firstPrompt?: string | null;
  gitBranch?: string | null;
  cwd?: string | null;
  tag?: string | null;
  createdAt?: number | null;
}): SessionInfo {
  return {
    sessionId: sdk.sessionId,
    summary: sdk.summary,
    lastModified: sdk.lastModified,
    fileSize: sdk.fileSize ?? undefined,
    customTitle: sdk.customTitle ?? undefined,
    firstPrompt: sdk.firstPrompt ?? undefined,
    gitBranch: sdk.gitBranch ?? undefined,
    cwd: sdk.cwd ?? undefined,
    tag: sdk.tag ?? undefined,
    createdAt: sdk.createdAt ?? undefined,
  };
}
