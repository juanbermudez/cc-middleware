/**
 * Integration test: Hooks + Session.
 * Verifies that createSDKHooks() bridges real session events to the event bus.
 * Makes REAL API calls to Claude.
 */

import { describe, it, expect } from "vitest";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { HookEventBus } from "../../src/hooks/event-bus.js";
import { BlockingHookRegistry } from "../../src/hooks/blocking.js";
import { createSDKHooks } from "../../src/hooks/sdk-bridge.js";
import type { HookInput } from "../../src/types/hooks.js";

describe("Hooks + Session Integration", () => {
  it("should fire PreToolUse and PostToolUse events during a real session", async () => {
    const eventBus = new HookEventBus();
    const registry = new BlockingHookRegistry();

    const preToolEvents: HookInput[] = [];
    const postToolEvents: HookInput[] = [];
    eventBus.on("PreToolUse", (input) => preToolEvents.push(input));
    eventBus.on("PostToolUse", (input) => postToolEvents.push(input));

    // Must register listeners BEFORE calling createSDKHooks so they're detected
    const hooks = createSDKHooks(eventBus, registry);

    try {
      for await (const message of query({
        prompt: "Read the file package.json and tell me the project name",
        options: {
          allowedTools: ["Read"],
          hooks,
          maxTurns: 3,
          cwd: "/Users/zef/Desktop/cc-middleware",
        },
      })) {
        // consume messages
      }
    } catch {
      // SDK may throw on error results (e.g., max_turns) - that's OK
    }

    expect(preToolEvents.length).toBeGreaterThan(0);
    expect(
      preToolEvents.some(
        (e) => (e as Record<string, unknown>).tool_name === "Read"
      )
    ).toBe(true);
    expect(postToolEvents.length).toBeGreaterThan(0);
    expect(
      postToolEvents.some(
        (e) => (e as Record<string, unknown>).tool_name === "Read"
      )
    ).toBe(true);
  }, 90000);

  it("should block a tool when blocking handler denies it", async () => {
    const eventBus = new HookEventBus();
    const registry = new BlockingHookRegistry();

    // Register a deny handler for Bash
    registry.register(
      "PreToolUse",
      async () => ({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny" as const,
          permissionDecisionReason: "Blocked by integration test",
        },
      }),
      { matcher: "^Bash$" }
    );

    // Register listeners so createSDKHooks detects active events
    const deniedTools: string[] = [];
    eventBus.on("PreToolUse", (input) => {
      const toolName = (input as Record<string, unknown>).tool_name;
      if (typeof toolName === "string") {
        deniedTools.push(toolName);
      }
    });

    const hooks = createSDKHooks(eventBus, registry);

    let resultText = "";
    try {
      for await (const message of query({
        prompt:
          'Run the command: echo "hello world". If you cannot run Bash, just say "BLOCKED".',
        options: {
          hooks,
          maxTurns: 3,
          cwd: "/Users/zef/Desktop/cc-middleware",
        },
      })) {
        const msg = message as Record<string, unknown>;
        if (msg.type === "result" && msg.subtype === "success") {
          resultText = (msg.result as string) ?? "";
        }
      }
    } catch {
      // SDK may throw - that's OK
    }

    // The hook should have fired for Bash
    expect(deniedTools).toContain("Bash");
    // The result should NOT contain the actual echo output since Bash was blocked
    // It should contain some indication that the tool was blocked
    expect(resultText.toLowerCase()).not.toContain("hello world");
  }, 90000);
});
