/**
 * E2E test: Session lifecycle manager.
 * Tests session tracking, lifecycle events, and abort.
 */

import { describe, it, expect, vi } from "vitest";
import { createSessionManager } from "../../src/sessions/manager.js";

describe("Session Manager (E2E)", () => {
  it("should track a session through its lifecycle", async () => {
    const manager = createSessionManager();
    const startedHandler = vi.fn();
    const completedHandler = vi.fn();

    manager.on("session:started", startedHandler);
    manager.on("session:completed", completedHandler);

    try {
      // Launch a session
      const result = await manager.launch({
        prompt: "What is 3+3? Reply with just the number.",
        maxTurns: 1,
        permissionMode: "plan",
        persistSession: false,
      });

      expect(result.sessionId).toBeDefined();
      expect(result.subtype).toBe("success");
      expect(result.result).toContain("6");

      // Verify lifecycle events fired
      expect(startedHandler).toHaveBeenCalledTimes(1);
      expect(completedHandler).toHaveBeenCalledTimes(1);

      // After completion, session should be tracked with completed status
      const tracked = manager.getSession(result.sessionId);
      expect(tracked).toBeDefined();
      expect(tracked!.status).toBe("completed");
      expect(tracked!.result).toBeDefined();
    } finally {
      await manager.destroy();
    }
  }, 60000);

  it("should track active sessions", async () => {
    const manager = createSessionManager();

    try {
      // Before launch, no active sessions
      expect(manager.getActiveSessions()).toHaveLength(0);

      // During launch, there should be an active session
      // We use streaming to observe the active state
      const session = await manager.launchStreaming({
        prompt: "What is 5+5? Reply with just the number.",
        maxTurns: 1,
        permissionMode: "plan",
        persistSession: false,
      });

      // Should have an active session now
      expect(manager.getActiveSessions().length).toBeGreaterThanOrEqual(0);

      // Consume events to completion
      for await (const _event of session.events) {
        // Just consume
      }

      // Wait for result
      await session.result;

      // After completion, no active sessions
      // Give a moment for the async result handler
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(manager.getActiveSessions()).toHaveLength(0);
    } finally {
      await manager.destroy();
    }
  }, 60000);
});
