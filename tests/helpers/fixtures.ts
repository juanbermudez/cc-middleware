/**
 * Test fixtures and mock data generators for CC-Middleware tests.
 */

import type { SessionInfo, SessionMessage, SessionResult } from "../../src/types/index.js";

/** Create a mock SessionInfo with sensible defaults */
export function createMockSessionInfo(
  overrides?: Partial<SessionInfo>
): SessionInfo {
  return {
    sessionId: overrides?.sessionId ?? "test-session-" + Math.random().toString(36).slice(2, 10),
    summary: overrides?.summary ?? "Test session summary",
    lastModified: overrides?.lastModified ?? Date.now(),
    fileSize: overrides?.fileSize,
    customTitle: overrides?.customTitle,
    firstPrompt: overrides?.firstPrompt ?? "Hello, world!",
    gitBranch: overrides?.gitBranch ?? "main",
    cwd: overrides?.cwd ?? "/tmp/test-project",
    tag: overrides?.tag,
    createdAt: overrides?.createdAt ?? Date.now() - 60000,
  };
}

/** Create a mock SessionMessage */
export function createMockSessionMessage(
  overrides?: Partial<SessionMessage>
): SessionMessage {
  return {
    type: overrides?.type ?? "user",
    uuid: overrides?.uuid ?? "msg-" + Math.random().toString(36).slice(2, 10),
    session_id: overrides?.session_id ?? "test-session-id",
    message: overrides?.message ?? { role: "user", content: "Test message" },
    parent_tool_use_id: null,
  };
}

/** Create a mock SessionResult (success) */
export function createMockSessionResult(
  overrides?: Partial<SessionResult>
): SessionResult {
  return {
    subtype: overrides?.subtype ?? "success",
    sessionId: overrides?.sessionId ?? "test-session-id",
    result: overrides?.result ?? "The answer is 4.",
    errors: overrides?.errors,
    durationMs: overrides?.durationMs ?? 1500,
    durationApiMs: overrides?.durationApiMs ?? 1200,
    totalCostUsd: overrides?.totalCostUsd ?? 0.003,
    numTurns: overrides?.numTurns ?? 1,
    stopReason: overrides?.stopReason ?? "end_turn",
    usage: overrides?.usage ?? {
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    },
    modelUsage: overrides?.modelUsage ?? [],
    permissionDenials: overrides?.permissionDenials ?? [],
    structuredOutput: overrides?.structuredOutput,
    isError: overrides?.isError ?? false,
  };
}

/** Create a mock PreToolUse hook input */
export function createMockPreToolUseInput(toolName = "Read") {
  return {
    session_id: "test-session-id",
    cwd: "/tmp/test-project",
    hook_event_name: "PreToolUse" as const,
    tool_name: toolName,
    tool_input: { file_path: "/tmp/test.txt" },
  };
}

/** Test project directory path */
export const TEST_PROJECT_DIR = "/tmp/cc-middleware-test";

/** Test temp directory for test artifacts */
export const TEST_TEMP_DIR = "/tmp/cc-middleware-test-temp";
