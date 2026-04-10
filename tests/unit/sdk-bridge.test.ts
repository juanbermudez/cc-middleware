/**
 * Unit tests for the SDK hook bridge.
 * Tests that the bridge correctly creates SDK-compatible hook callbacks
 * and dispatches events to the event bus and blocking registry.
 */

import { describe, it, expect, vi } from "vitest";
import {
  createSDKHooks,
  createFullSDKHooks,
  SDK_HOOK_EVENT_TYPES,
} from "../../src/hooks/sdk-bridge.js";
import { createEventBus } from "../../src/hooks/event-bus.js";
import { createBlockingRegistry } from "../../src/hooks/blocking.js";
import type { HookEventType } from "../../src/types/hooks.js";

function makeMockSDKInput(hookEventName: string, toolName?: string) {
  return {
    session_id: "test-session",
    transcript_path: "/tmp/test-transcript.jsonl",
    cwd: "/tmp/test",
    hook_event_name: hookEventName,
    ...(toolName ? { tool_name: toolName, tool_input: {} } : {}),
  };
}

describe("SDK Hook Bridge", () => {
  it("should create hooks for events with registered handlers", () => {
    const bus = createEventBus();
    const registry = createBlockingRegistry();

    // Register a handler on the event bus
    bus.on("PreToolUse", () => {});
    bus.on("SessionStart", () => {});

    const hooks = createSDKHooks(bus, registry);

    expect(hooks.PreToolUse).toBeDefined();
    expect(hooks.PreToolUse).toHaveLength(1);
    expect(hooks.PreToolUse![0].hooks).toHaveLength(1);

    expect(hooks.SessionStart).toBeDefined();
    expect(hooks.SessionStart).toHaveLength(1);
  });

  it("should create hooks for events with custom blocking handlers", () => {
    const bus = createEventBus();
    const registry = createBlockingRegistry();

    // Register a custom blocking handler
    registry.register("Stop", async () => ({
      decision: "block",
      reason: "test",
    }));

    const hooks = createSDKHooks(bus, registry);

    expect(hooks.Stop).toBeDefined();
    expect(hooks.Stop).toHaveLength(1);
  });

  it("should create hooks for specified event types", () => {
    const bus = createEventBus();
    const registry = createBlockingRegistry();

    const hooks = createSDKHooks(bus, registry, [
      "PreToolUse",
      "PostToolUse",
      "SessionStart",
    ]);

    expect(hooks.PreToolUse).toBeDefined();
    expect(hooks.PostToolUse).toBeDefined();
    expect(hooks.SessionStart).toBeDefined();
    expect(hooks.Stop).toBeUndefined();
  });

  it("should ignore non-SDK hook names when filtering the bridge surface", () => {
    const bus = createEventBus();
    const registry = createBlockingRegistry();

    const hooks = createSDKHooks(
      bus,
      registry,
      ["PreToolUse", "NotARealHook"] as unknown as HookEventType[]
    );

    expect(hooks.PreToolUse).toBeDefined();
    expect(Object.keys(hooks)).toEqual(["PreToolUse"]);
    expect(SDK_HOOK_EVENT_TYPES).toContain("InstructionsLoaded");
  });

  it("should dispatch events to the event bus when callback fires", async () => {
    const bus = createEventBus();
    const registry = createBlockingRegistry();
    const handler = vi.fn();

    bus.on("PreToolUse", handler);

    const hooks = createSDKHooks(bus, registry);
    const callback = hooks.PreToolUse![0].hooks[0];

    // Simulate SDK calling the callback
    const abortController = new AbortController();
    await callback(
      makeMockSDKInput("PreToolUse", "Read") as any,
      "tool-use-123",
      { signal: abortController.signal }
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        hook_event_name: "PreToolUse",
        tool_name: "Read",
      })
    );
  });

  it("should return empty output for non-blocking events", async () => {
    const bus = createEventBus();
    const registry = createBlockingRegistry();

    bus.on("SessionStart", () => {});

    const hooks = createSDKHooks(bus, registry);
    const callback = hooks.SessionStart![0].hooks[0];

    const abortController = new AbortController();
    const result = await callback(
      makeMockSDKInput("SessionStart") as any,
      undefined,
      { signal: abortController.signal }
    );

    expect(result).toEqual({});
  });

  it("should return blocking handler result for blocking events", async () => {
    const bus = createEventBus();
    const registry = createBlockingRegistry();

    // Register a deny handler for PreToolUse
    registry.register("PreToolUse", async () => ({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny" as const,
        permissionDecisionReason: "Blocked by test",
      },
    }));

    const hooks = createSDKHooks(bus, registry);
    const callback = hooks.PreToolUse![0].hooks[0];

    const abortController = new AbortController();
    const result = await callback(
      makeMockSDKInput("PreToolUse", "Bash") as any,
      "tool-use-456",
      { signal: abortController.signal }
    );

    expect(result).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Blocked by test",
      },
    });
  });

  it("should dispatch to wildcard listeners", async () => {
    const bus = createEventBus();
    const registry = createBlockingRegistry();
    const wildcardHandler = vi.fn();

    bus.on("*", wildcardHandler);

    // createFullSDKHooks bridges all events
    const hooks = createFullSDKHooks(bus, registry);
    const callback = hooks.PreToolUse![0].hooks[0];

    const abortController = new AbortController();
    await callback(
      makeMockSDKInput("PreToolUse", "Read") as any,
      undefined,
      { signal: abortController.signal }
    );

    expect(wildcardHandler).toHaveBeenCalledTimes(1);
    expect(wildcardHandler).toHaveBeenCalledWith(
      "PreToolUse",
      expect.objectContaining({ hook_event_name: "PreToolUse" })
    );
  });

  it("createFullSDKHooks should create hooks for all event types", () => {
    const bus = createEventBus();
    const registry = createBlockingRegistry();

    const hooks = createFullSDKHooks(bus, registry);

    // Should have an entry for every hook event type
    for (const eventType of SDK_HOOK_EVENT_TYPES) {
      expect(hooks[eventType as keyof typeof hooks]).toBeDefined();
    }
  });
});
