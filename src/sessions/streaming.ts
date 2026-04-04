/**
 * Streaming session support.
 * Extends the launcher with streaming event iteration and control methods.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { LaunchOptions, LaunchResult } from "./launcher.js";

/** Normalized stream events from the SDK's SDKMessage types */
export type SessionStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use_start"; toolName: string; toolId: string }
  | { type: "tool_use_end"; toolName: string; toolId: string }
  | { type: "tool_result"; toolName: string; result: unknown }
  | { type: "assistant_message"; content: string }
  | { type: "system"; subtype: string; data: unknown }
  | { type: "tool_progress"; toolName: string; toolUseId: string; elapsedSeconds: number }
  | { type: "result"; data: LaunchResult }
  | { type: "unknown"; rawType: string; data: unknown };

/** A streaming session with event iteration and control methods */
export interface StreamingSession {
  sessionId: string;
  events: AsyncIterable<SessionStreamEvent>;
  abort: () => void;
  result: Promise<LaunchResult>;
}

/**
 * Launch a streaming session.
 * Returns a StreamingSession with an async iterable of normalized events.
 */
export async function launchStreamingSession(
  options: LaunchOptions
): Promise<StreamingSession> {
  const abortController = options.abortController ?? new AbortController();

  const sdkOptions: Record<string, unknown> = {
    includePartialMessages: true,
  };

  if (options.allowedTools) sdkOptions.allowedTools = options.allowedTools;
  if (options.disallowedTools) sdkOptions.disallowedTools = options.disallowedTools;
  if (options.permissionMode) sdkOptions.permissionMode = options.permissionMode;
  if (options.maxTurns !== undefined) sdkOptions.maxTurns = options.maxTurns;
  if (options.maxBudgetUsd !== undefined) sdkOptions.maxBudgetUsd = options.maxBudgetUsd;
  if (options.systemPrompt) sdkOptions.systemPrompt = options.systemPrompt;
  if (options.persistSession !== undefined) sdkOptions.persistSession = options.persistSession;
  sdkOptions.abortController = abortController;
  if (options.resume) sdkOptions.resume = options.resume;
  if (options.continue) sdkOptions.continue = options.continue;
  if (options.forkSession) sdkOptions.forkSession = options.forkSession;
  if (options.sessionId) sdkOptions.sessionId = options.sessionId;
  if (options.hooks) sdkOptions.hooks = options.hooks;
  if (options.effort) sdkOptions.effort = options.effort;
  if (options.cwd) sdkOptions.cwd = options.cwd;

  const q = query({
    prompt: options.prompt,
    options: sdkOptions as Parameters<typeof query>[0]["options"],
  });

  let sessionId = "";
  let resolveResult: (result: LaunchResult) => void;
  let rejectResult: (error: Error) => void;

  const resultPromise = new Promise<LaunchResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  async function* generateEvents(): AsyncGenerator<SessionStreamEvent> {
    try {
      for await (const message of q) {
        const msg = message as Record<string, unknown>;

        // Capture session ID
        if (msg.session_id && typeof msg.session_id === "string") {
          sessionId = msg.session_id;
        }

        // Handle different message types
        if (msg.type === "stream_event") {
          // Streaming partial message - extract deltas
          const event = msg.event as Record<string, unknown> | undefined;
          if (event) {
            if (event.type === "content_block_delta") {
              const delta = event.delta as Record<string, unknown> | undefined;
              if (delta?.type === "text_delta" && typeof delta.text === "string") {
                yield { type: "text_delta", text: delta.text };
              }
            } else if (event.type === "content_block_start") {
              const contentBlock = event.content_block as Record<string, unknown> | undefined;
              if (contentBlock?.type === "tool_use") {
                yield {
                  type: "tool_use_start",
                  toolName: (contentBlock.name as string) ?? "",
                  toolId: (contentBlock.id as string) ?? "",
                };
              }
            } else if (event.type === "content_block_stop") {
              // We don't have tool info in stop events, yield generic
              yield {
                type: "tool_use_end",
                toolName: "",
                toolId: "",
              };
            }
          }
        } else if (msg.type === "assistant") {
          // Complete assistant message
          const content = extractTextFromMessage(msg);
          if (content) {
            yield { type: "assistant_message", content };
          }
        } else if (msg.type === "tool_progress") {
          yield {
            type: "tool_progress",
            toolName: (msg.tool_name as string) ?? "",
            toolUseId: (msg.tool_use_id as string) ?? "",
            elapsedSeconds: (msg.elapsed_seconds as number) ?? 0,
          };
        } else if (msg.type === "result") {
          const launchResult = buildLaunchResult(msg, sessionId);
          resolveResult!(launchResult);
          yield { type: "result", data: launchResult };
        } else if (msg.type === "system") {
          yield {
            type: "system",
            subtype: (msg.subtype as string) ?? "unknown",
            data: msg,
          };
        } else {
          yield {
            type: "unknown",
            rawType: (msg.type as string) ?? "unknown",
            data: msg,
          };
        }
      }
    } catch (error) {
      // SDK throws for error results (e.g., max_turns reached).
      // Convert to a result event rather than propagating the exception.
      const err = error instanceof Error ? error : new Error(String(error));
      const errorResult: LaunchResult = {
        sessionId,
        subtype: "error_during_execution",
        isError: true,
        errors: [err.message],
        durationMs: 0,
        durationApiMs: 0,
        totalCostUsd: 0,
        numTurns: 0,
        stopReason: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        modelUsage: {},
        permissionDenials: [],
      };
      resolveResult!(errorResult);
      yield { type: "result", data: errorResult };
    }
  }

  // Create events iterator eagerly so the query starts immediately
  const eventGenerator = generateEvents();

  return {
    get sessionId() {
      return sessionId;
    },
    events: eventGenerator,
    abort: () => abortController.abort(),
    result: resultPromise,
  };
}

/** Extract text content from a message object */
function extractTextFromMessage(msg: Record<string, unknown>): string {
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(
        (block: unknown) =>
          typeof block === "object" &&
          block !== null &&
          (block as Record<string, unknown>).type === "text"
      )
      .map((block: unknown) => (block as Record<string, unknown>).text)
      .filter((text): text is string => typeof text === "string")
      .join("");
  }
  if (typeof msg.content === "string") {
    return msg.content;
  }
  return "";
}

/** Build a LaunchResult from a result message */
function buildLaunchResult(
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
