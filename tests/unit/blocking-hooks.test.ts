/**
 * Unit tests for blocking hook stubs and registry.
 */

import { describe, it, expect } from "vitest";
import {
  BlockingHookRegistry,
  createBlockingRegistry,
} from "../../src/hooks/blocking.js";
import type {
  HookJSONOutput,
  PreToolUseInput,
  StopInput,
} from "../../src/types/hooks.js";

function makePreToolUseInput(toolName = "Read"): PreToolUseInput {
  return {
    session_id: "test-session",
    cwd: "/tmp/test",
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: { file_path: "/tmp/test.txt" },
  };
}

function makeStopInput(): StopInput {
  return {
    session_id: "test-session",
    cwd: "/tmp/test",
    hook_event_name: "Stop",
    stop_reason: "end_turn",
  };
}

describe("BlockingHookRegistry", () => {
  it("should create a registry instance", () => {
    const registry = createBlockingRegistry();
    expect(registry).toBeInstanceOf(BlockingHookRegistry);
  });

  it("default stubs should return empty object (proceed)", async () => {
    const registry = createBlockingRegistry();

    const result = await registry.execute(
      "PreToolUse",
      makePreToolUseInput(),
      "Read"
    );
    expect(result).toEqual({});

    const stopResult = await registry.execute("Stop", makeStopInput());
    expect(stopResult).toEqual({});
  });

  it("should register custom handler that overrides default", async () => {
    const registry = createBlockingRegistry();

    const denyOutput: HookJSONOutput = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Blocked by test",
      },
    };

    registry.register("PreToolUse", async () => denyOutput);

    const result = await registry.execute(
      "PreToolUse",
      makePreToolUseInput("Bash"),
      "Bash"
    );
    expect(result).toEqual(denyOutput);
    expect(result.hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  it("should support unregister to restore default", async () => {
    const registry = createBlockingRegistry();

    const denyOutput: HookJSONOutput = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
      },
    };

    const unregister = registry.register("PreToolUse", async () => denyOutput);

    // Custom handler active
    let result = await registry.execute(
      "PreToolUse",
      makePreToolUseInput(),
      "Read"
    );
    expect(result.hookSpecificOutput?.permissionDecision).toBe("deny");

    // Unregister
    unregister();

    // Default stub restored
    result = await registry.execute(
      "PreToolUse",
      makePreToolUseInput(),
      "Read"
    );
    expect(result).toEqual({});
  });

  it("should support matcher-based handler selection", async () => {
    const registry = createBlockingRegistry();

    // Register handler only for Bash tool
    registry.register(
      "PreToolUse",
      async () => ({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Bash is blocked",
        },
      }),
      { matcher: "^Bash$" }
    );

    // Bash should be denied
    const bashResult = await registry.execute(
      "PreToolUse",
      makePreToolUseInput("Bash"),
      "Bash"
    );
    expect(bashResult.hookSpecificOutput?.permissionDecision).toBe("deny");

    // Read should use default (proceed)
    const readResult = await registry.execute(
      "PreToolUse",
      makePreToolUseInput("Read"),
      "Read"
    );
    expect(readResult).toEqual({});
  });

  it("should support multiple handlers with different matchers", async () => {
    const registry = createBlockingRegistry();

    // Block Bash
    registry.register(
      "PreToolUse",
      async () => ({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Bash blocked",
        },
      }),
      { matcher: "^Bash$" }
    );

    // Add context for Write
    registry.register(
      "PreToolUse",
      async () => ({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          additionalContext: "Write is allowed with monitoring",
        },
      }),
      { matcher: "^Write$" }
    );

    const bashResult = await registry.execute(
      "PreToolUse",
      makePreToolUseInput("Bash"),
      "Bash"
    );
    expect(bashResult.hookSpecificOutput?.permissionDecision).toBe("deny");

    const writeResult = await registry.execute(
      "PreToolUse",
      makePreToolUseInput("Write"),
      "Write"
    );
    expect(writeResult.hookSpecificOutput?.permissionDecision).toBe("allow");
    expect(writeResult.hookSpecificOutput?.additionalContext).toContain(
      "monitoring"
    );

    // Read uses default
    const readResult = await registry.execute(
      "PreToolUse",
      makePreToolUseInput("Read"),
      "Read"
    );
    expect(readResult).toEqual({});
  });

  it("should report correct handler counts", () => {
    const registry = createBlockingRegistry();

    expect(registry.getHandlerCount("PreToolUse")).toBe(0);
    expect(registry.hasCustomHandlers("PreToolUse")).toBe(false);

    registry.register("PreToolUse", async () => ({}));
    expect(registry.getHandlerCount("PreToolUse")).toBe(1);
    expect(registry.hasCustomHandlers("PreToolUse")).toBe(true);
  });

  it("should handle Stop blocking with decision format", async () => {
    const registry = createBlockingRegistry();

    registry.register("Stop", async () => ({
      decision: "block",
      reason: "Do not stop yet",
    }));

    const result = await registry.execute("Stop", makeStopInput());
    expect(result.decision).toBe("block");
    expect(result.reason).toBe("Do not stop yet");
  });

  it("should list all blocking event types", () => {
    const registry = createBlockingRegistry();
    const events = registry.getBlockingEvents();

    expect(events).toContain("PreToolUse");
    expect(events).toContain("PermissionRequest");
    expect(events).toContain("Stop");
    expect(events).toContain("UserPromptSubmit");
    expect(events).toContain("TaskCreated");
    expect(events).toContain("TaskCompleted");
    expect(events).toContain("TeammateIdle");
    expect(events.length).toBe(12);
  });
});
