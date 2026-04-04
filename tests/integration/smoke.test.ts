/**
 * Integration test: Full middleware smoke test.
 * Wires all systems together (hooks, permissions, session manager, agents)
 * and runs a real session through the complete stack.
 * Makes REAL API calls to Claude.
 */

import { describe, it, expect } from "vitest";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { HookEventBus } from "../../src/hooks/event-bus.js";
import { BlockingHookRegistry } from "../../src/hooks/blocking.js";
import { createSDKHooks } from "../../src/hooks/sdk-bridge.js";
import { PolicyEngine } from "../../src/permissions/policy.js";
import { createCanUseTool } from "../../src/permissions/handler.js";
import { AgentRegistry } from "../../src/agents/registry.js";
import type { HookEventType } from "../../src/types/hooks.js";

describe("Full Middleware Smoke Test", () => {
  it("should run a session through the complete middleware stack", async () => {
    // === Build the stack ===

    // 1. Event bus + blocking registry
    const eventBus = new HookEventBus();
    const registry = new BlockingHookRegistry();

    // Track hook events
    const hookEvents: string[] = [];
    eventBus.on("*", (eventType: HookEventType) => {
      hookEvents.push(eventType);
    });

    // Create SDK hooks (must be after registering wildcard listener so
    // createSDKHooks detects active events)
    const hooks = createSDKHooks(eventBus, registry);

    // 2. Permission policy - allow all tools
    const policy = new PolicyEngine({
      rules: [
        { id: "allow-all", toolName: ".*", behavior: "allow", priority: 10 },
      ],
      defaultBehavior: "allow",
    });
    const { canUseTool } = createCanUseTool({
      policyEngine: policy,
      eventBus,
    });

    // 3. Agent registry (empty, but instantiated to prove it works)
    const agentRegistry = new AgentRegistry();
    agentRegistry.register("test-agent", {
      description: "A test agent",
      prompt: "You are a test agent",
    });

    // === Run a session ===

    let resultText = "";
    let sessionId = "";

    try {
      for await (const message of query({
        prompt: "What is 2+2? Reply with just the number.",
        options: {
          hooks,
          canUseTool,
          maxTurns: 1,
          cwd: "/Users/zef/Desktop/cc-middleware",
          permissionMode: "plan",
        },
      })) {
        const msg = message as Record<string, unknown>;

        // Capture session ID
        if (msg.session_id && typeof msg.session_id === "string") {
          sessionId = msg.session_id;
        }

        // Capture result text
        if (msg.type === "result" && msg.subtype === "success") {
          resultText = (msg.result as string) ?? "";
        }
      }
    } catch {
      // SDK may throw - that's OK as long as we got events
    }

    // === Verify full flow ===

    // Session launched
    expect(sessionId).toBeTruthy();

    // Result is correct
    expect(resultText).toContain("4");

    // Hook events fired through the event bus
    // At minimum, the wildcard listener should have received some events
    expect(hookEvents.length).toBeGreaterThan(0);

    // Agent registry is functional
    expect(agentRegistry.get("test-agent")).toBeDefined();
    expect(agentRegistry.size).toBe(1);

    // SDK agents format works
    const sdkAgents = agentRegistry.toSDKAgents();
    expect(sdkAgents["test-agent"]).toBeDefined();
    expect(sdkAgents["test-agent"].description).toBe("A test agent");
  }, 90000);
});
