/**
 * Unit tests for the hook event bus.
 */

import { describe, it, expect, vi } from "vitest";
import { HookEventBus, createEventBus, ALL_HOOK_EVENT_TYPES } from "../../src/hooks/event-bus.js";
import type { HookInput, PreToolUseInput, SessionStartInput } from "../../src/types/hooks.js";

function makePreToolUseInput(toolName = "Read"): PreToolUseInput {
  return {
    session_id: "test-session",
    cwd: "/tmp/test",
    hook_event_name: "PreToolUse",
    tool_name: toolName,
    tool_input: { file_path: "/tmp/test.txt" },
  };
}

function makeSessionStartInput(): SessionStartInput {
  return {
    session_id: "test-session",
    cwd: "/tmp/test",
    hook_event_name: "SessionStart",
  };
}

describe("HookEventBus", () => {
  it("should create an event bus instance", () => {
    const bus = createEventBus();
    expect(bus).toBeInstanceOf(HookEventBus);
  });

  it("should emit and receive typed events", () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.on("PreToolUse", handler);
    bus.dispatch("PreToolUse", makePreToolUseInput());

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        hook_event_name: "PreToolUse",
        tool_name: "Read",
      })
    );
  });

  it("should support wildcard listener receiving all events", () => {
    const bus = createEventBus();
    const wildcardHandler = vi.fn();

    bus.on("*", wildcardHandler);

    bus.dispatch("PreToolUse", makePreToolUseInput());
    bus.dispatch("SessionStart", makeSessionStartInput());

    expect(wildcardHandler).toHaveBeenCalledTimes(2);
    expect(wildcardHandler).toHaveBeenNthCalledWith(
      1,
      "PreToolUse",
      expect.objectContaining({ hook_event_name: "PreToolUse" })
    );
    expect(wildcardHandler).toHaveBeenNthCalledWith(
      2,
      "SessionStart",
      expect.objectContaining({ hook_event_name: "SessionStart" })
    );
  });

  it("should support multiple handlers per event", () => {
    const bus = createEventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.on("PreToolUse", handler1);
    bus.on("PreToolUse", handler2);

    bus.dispatch("PreToolUse", makePreToolUseInput());

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it("should support handler removal", () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.on("PreToolUse", handler);
    bus.dispatch("PreToolUse", makePreToolUseInput());
    expect(handler).toHaveBeenCalledTimes(1);

    bus.off("PreToolUse", handler);
    bus.dispatch("PreToolUse", makePreToolUseInput());
    expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
  });

  it("should report correct handler count for specific event", () => {
    const bus = createEventBus();

    expect(bus.getHandlerCount("PreToolUse")).toBe(0);

    bus.on("PreToolUse", () => {});
    expect(bus.getHandlerCount("PreToolUse")).toBe(1);

    bus.on("PreToolUse", () => {});
    expect(bus.getHandlerCount("PreToolUse")).toBe(2);
  });

  it("should report total handler count across all events", () => {
    const bus = createEventBus();

    expect(bus.getHandlerCount()).toBe(0);

    bus.on("PreToolUse", () => {});
    bus.on("SessionStart", () => {});
    bus.on("*", () => {});

    expect(bus.getHandlerCount()).toBe(3);
  });

  it("should return registered event types", () => {
    const bus = createEventBus();

    expect(bus.getRegisteredEvents()).toEqual([]);

    bus.on("PreToolUse", () => {});
    bus.on("SessionStart", () => {});

    const registered = bus.getRegisteredEvents();
    expect(registered).toContain("PreToolUse");
    expect(registered).toContain("SessionStart");
    expect(registered).not.toContain("PostToolUse");
  });

  it("should not call specific handler for different event", () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.on("PreToolUse", handler);
    bus.dispatch("SessionStart", makeSessionStartInput());

    expect(handler).not.toHaveBeenCalled();
  });

  it("should emit both specific and wildcard events on dispatch", () => {
    const bus = createEventBus();
    const specificHandler = vi.fn();
    const wildcardHandler = vi.fn();

    bus.on("PreToolUse", specificHandler);
    bus.on("*", wildcardHandler);

    bus.dispatch("PreToolUse", makePreToolUseInput());

    expect(specificHandler).toHaveBeenCalledTimes(1);
    expect(wildcardHandler).toHaveBeenCalledTimes(1);
  });

  it("should include all expected event types in ALL_HOOK_EVENT_TYPES", () => {
    expect(ALL_HOOK_EVENT_TYPES).toContain("PreToolUse");
    expect(ALL_HOOK_EVENT_TYPES).toContain("PostToolUse");
    expect(ALL_HOOK_EVENT_TYPES).toContain("SessionStart");
    expect(ALL_HOOK_EVENT_TYPES).toContain("SessionEnd");
    expect(ALL_HOOK_EVENT_TYPES).toContain("Stop");
    expect(ALL_HOOK_EVENT_TYPES).toContain("Setup");
    expect(ALL_HOOK_EVENT_TYPES.length).toBe(26);
  });
});
