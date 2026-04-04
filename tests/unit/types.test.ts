/**
 * Unit tests for core type definitions.
 * Verifies that all types are importable and error classes work correctly.
 */

import { describe, it, expect } from "vitest";
import {
  MiddlewareError,
  SessionNotFoundError,
  SessionAlreadyActiveError,
  PermissionDeniedError,
  AgentNotFoundError,
  HookTimeoutError,
} from "../../src/types/index.js";
import type {
  SessionInfo,
  SessionMessage,
  SessionFilter,
  SessionLaunchOptions,
  SessionResult,
  ActiveSession,
  HookEventType,
  BlockingEventType,
  HookJSONOutput,
  HookHandler,
  HookSubscription,
  PreToolUseInput,
  PostToolUseInput,
  AgentDefinition,
  AgentInfo,
  TeamConfig,
  TeamMember,
  TeamTask,
} from "../../src/types/index.js";
import {
  createMockSessionInfo,
  createMockSessionMessage,
  createMockSessionResult,
  createMockPreToolUseInput,
} from "../helpers/fixtures.js";

describe("Core Types", () => {
  it("should create SessionInfo objects", () => {
    const session: SessionInfo = createMockSessionInfo();
    expect(session.sessionId).toBeDefined();
    expect(session.summary).toBeDefined();
    expect(session.lastModified).toBeGreaterThan(0);
  });

  it("should create SessionMessage objects", () => {
    const msg: SessionMessage = createMockSessionMessage();
    expect(msg.type).toBe("user");
    expect(msg.uuid).toBeDefined();
    expect(msg.session_id).toBeDefined();
    expect(msg.parent_tool_use_id).toBeNull();
  });

  it("should create SessionResult objects", () => {
    const result: SessionResult = createMockSessionResult();
    expect(result.subtype).toBe("success");
    expect(result.isError).toBe(false);
    expect(result.usage.inputTokens).toBeGreaterThanOrEqual(0);
  });

  it("should create PreToolUseInput objects", () => {
    const input: PreToolUseInput = createMockPreToolUseInput("Bash");
    expect(input.hook_event_name).toBe("PreToolUse");
    expect(input.tool_name).toBe("Bash");
  });

  it("should accept valid HookEventType values", () => {
    const events: HookEventType[] = [
      "PreToolUse",
      "PostToolUse",
      "SessionStart",
      "SessionEnd",
      "Stop",
      "Setup",
    ];
    expect(events).toHaveLength(6);
  });

  it("should accept valid BlockingEventType values", () => {
    const blocking: BlockingEventType[] = [
      "PreToolUse",
      "PermissionRequest",
      "Stop",
      "UserPromptSubmit",
    ];
    expect(blocking).toHaveLength(4);
  });

  it("should accept valid HookJSONOutput shapes", () => {
    const empty: HookJSONOutput = {};
    expect(empty).toEqual({});

    const withDecision: HookJSONOutput = {
      decision: "block",
      reason: "test",
    };
    expect(withDecision.decision).toBe("block");

    const withHookSpecific: HookJSONOutput = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "blocked by test",
      },
    };
    expect(
      withHookSpecific.hookSpecificOutput?.permissionDecision
    ).toBe("deny");
  });
});

describe("Error Classes", () => {
  it("MiddlewareError has code and details", () => {
    const err = new MiddlewareError("test error", "TEST_CODE", {
      key: "value",
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MiddlewareError);
    expect(err.message).toBe("test error");
    expect(err.code).toBe("TEST_CODE");
    expect(err.details).toEqual({ key: "value" });
    expect(err.name).toBe("MiddlewareError");
  });

  it("SessionNotFoundError extends MiddlewareError", () => {
    const err = new SessionNotFoundError("abc-123");
    expect(err).toBeInstanceOf(MiddlewareError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("SESSION_NOT_FOUND");
    expect(err.details).toEqual({ sessionId: "abc-123" });
    expect(err.name).toBe("SessionNotFoundError");
  });

  it("SessionAlreadyActiveError extends MiddlewareError", () => {
    const err = new SessionAlreadyActiveError("abc-123");
    expect(err).toBeInstanceOf(MiddlewareError);
    expect(err.code).toBe("SESSION_ALREADY_ACTIVE");
  });

  it("PermissionDeniedError extends MiddlewareError", () => {
    const err = new PermissionDeniedError("Bash", "dangerous");
    expect(err).toBeInstanceOf(MiddlewareError);
    expect(err.code).toBe("PERMISSION_DENIED");
    expect(err.message).toContain("Bash");
    expect(err.message).toContain("dangerous");
  });

  it("AgentNotFoundError extends MiddlewareError", () => {
    const err = new AgentNotFoundError("my-agent");
    expect(err).toBeInstanceOf(MiddlewareError);
    expect(err.code).toBe("AGENT_NOT_FOUND");
  });

  it("HookTimeoutError extends MiddlewareError", () => {
    const err = new HookTimeoutError("PreToolUse", 5000);
    expect(err).toBeInstanceOf(MiddlewareError);
    expect(err.code).toBe("HOOK_TIMEOUT");
    expect(err.details).toEqual({ event: "PreToolUse", timeoutMs: 5000 });
  });
});
