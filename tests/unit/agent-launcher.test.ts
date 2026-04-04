/**
 * Unit tests for agent launcher.
 * Tests the wiring between AgentLauncher, AgentRegistry, and SessionManager.
 */

import { describe, it, expect } from "vitest";
import { createAgentLauncher } from "../../src/agents/launcher.js";
import { createAgentRegistry } from "../../src/agents/registry.js";
import { createSessionManager } from "../../src/sessions/manager.js";
import { AgentNotFoundError } from "../../src/types/errors.js";

describe("AgentLauncher", () => {
  it("should throw AgentNotFoundError for unknown agent", async () => {
    const manager = createSessionManager();
    const registry = createAgentRegistry();
    const launcher = createAgentLauncher(manager, registry);

    try {
      await expect(
        launcher.launchAgent("nonexistent", "Hello")
      ).rejects.toThrow(AgentNotFoundError);
    } finally {
      await manager.destroy();
    }
  });

  it("should find registered agent and launch", async () => {
    const manager = createSessionManager();
    const registry = createAgentRegistry();

    registry.register("test-agent", {
      description: "A test agent for math",
      prompt: "You are a math helper. Be concise.",
      model: "sonnet",
    });

    const launcher = createAgentLauncher(manager, registry);

    try {
      // This actually calls the API
      const result = await launcher.launchAgent(
        "test-agent",
        "What is 7+7? Reply with just the number.",
        {
          maxTurns: 1,
          permissionMode: "plan",
          persistSession: false,
        }
      );

      expect(result.sessionId).toBeDefined();
      expect(result.subtype).toBe("success");
      expect(result.result).toContain("14");
    } finally {
      await manager.destroy();
    }
  }, 60000);
});
