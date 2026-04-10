/**
 * Unit tests for the canUseTool handler and PermissionManager.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createCanUseTool, PermissionManager } from "../../src/permissions/handler.js";
import { createPolicyEngine } from "../../src/permissions/policy.js";
import { createEventBus } from "../../src/hooks/event-bus.js";
import {
  createMemoryLiveAnalyticsSink,
  setLiveAnalyticsSink,
} from "../../src/analytics/live/index.js";

function makeCallOptions(toolUseID = "tool-123") {
  return {
    signal: new AbortController().signal,
    toolUseID,
  };
}

afterEach(() => {
  setLiveAnalyticsSink();
});

describe("canUseTool Handler", () => {
  it("should allow when policy says allow", async () => {
    const engine = createPolicyEngine([
      { id: "r1", toolName: "Read", behavior: "allow", priority: 1 },
    ]);

    const { canUseTool } = createCanUseTool({ policyEngine: engine });

    const result = await canUseTool("Read", {}, makeCallOptions());
    expect(result.behavior).toBe("allow");
  });

  it("should deny when policy says deny", async () => {
    const engine = createPolicyEngine([
      { id: "r1", toolName: "Bash", behavior: "deny", priority: 1 },
    ]);

    const { canUseTool } = createCanUseTool({ policyEngine: engine });

    const result = await canUseTool("Bash", { command: "rm -rf /" }, makeCallOptions());
    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      expect(result.message).toContain("policy");
    }
  });

  it("should create pending permission when policy says ask", async () => {
    const engine = createPolicyEngine([], "ask");
    const onPending = vi.fn();

    const { canUseTool, permissionManager } = createCanUseTool({
      policyEngine: engine,
      onPendingPermission: onPending,
    });

    // Start the permission request (don't await yet)
    const resultPromise = canUseTool("Bash", { command: "ls" }, makeCallOptions());

    // Should have called onPendingPermission
    expect(onPending).toHaveBeenCalledTimes(1);
    const pending = onPending.mock.calls[0][0];
    expect(pending.toolName).toBe("Bash");

    // Verify pending is tracked
    expect(permissionManager.getPendingPermissions()).toHaveLength(1);

    // Resolve the pending permission
    permissionManager.resolvePermission(pending.id, {
      behavior: "allow",
    });

    const result = await resultPromise;
    expect(result.behavior).toBe("allow");

    // Pending should be cleared
    expect(permissionManager.getPendingPermissions()).toHaveLength(0);
  });

  it("should deny pending permission on timeout", async () => {
    const engine = createPolicyEngine([], "ask");

    const { canUseTool, permissionManager } = createCanUseTool({
      policyEngine: engine,
      approvalTimeout: 100, // Very short timeout for test
    });

    const result = await canUseTool("Bash", { command: "ls" }, makeCallOptions());

    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      expect(result.message).toContain("timed out");
    }
  });

  it("should emit PermissionRequest event on ask", async () => {
    const engine = createPolicyEngine([], "ask");
    const eventBus = createEventBus();
    const handler = vi.fn();
    eventBus.on("PermissionRequest", handler);
    const analytics = createMemoryLiveAnalyticsSink();
    setLiveAnalyticsSink(analytics.sink);

    const { canUseTool, permissionManager } = createCanUseTool({
      policyEngine: engine,
      eventBus,
      getContext: () => ({
        sessionId: "session-123",
        cwd: "/tmp/project",
      }),
      analytics: {
        source: "api",
      },
      onPendingPermission: (pending) => {
        // Auto-resolve for the test
        permissionManager.resolvePermission(pending.id, {
          behavior: "allow",
        });
      },
    });

    await canUseTool("Bash", { command: "ls" }, makeCallOptions());

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        hook_event_name: "PermissionRequest",
        tool_name: "Bash",
        session_id: "session-123",
        cwd: "/tmp/project",
      })
    );

    expect(analytics.records.hookEvents).toHaveLength(1);
    expect(analytics.records.hookEvents[0]).toMatchObject({
      eventType: "PermissionRequest",
      sessionId: "session-123",
      cwd: "/tmp/project",
    });
    expect(analytics.records.permissionEvents[0]).toMatchObject({
      decision: "request",
      toolName: "Bash",
      sessionId: "session-123",
      cwd: "/tmp/project",
      runId: "tool-123",
    });
  });

  it("should deny all pending permissions", async () => {
    const engine = createPolicyEngine([], "ask");

    const { canUseTool, permissionManager } = createCanUseTool({
      policyEngine: engine,
      approvalTimeout: 60000, // Long timeout - we'll resolve manually
    });

    // Start multiple permission requests
    const p1 = canUseTool("Read", {}, makeCallOptions("t1"));
    const p2 = canUseTool("Write", {}, makeCallOptions("t2"));

    // Give a tick for promises to set up
    await new Promise((r) => setTimeout(r, 10));

    expect(permissionManager.getPendingPermissions()).toHaveLength(2);

    // Deny all
    permissionManager.denyAllPending("Session ended");

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.behavior).toBe("deny");
    expect(r2.behavior).toBe("deny");
  });

  it("should reuse a provided shared permission manager", async () => {
    const engine = createPolicyEngine([], "ask");
    const sharedManager = new PermissionManager();

    const { canUseTool, permissionManager } = createCanUseTool({
      policyEngine: engine,
      permissionManager: sharedManager,
    });

    const resultPromise = canUseTool("Bash", { command: "pwd" }, makeCallOptions("shared-1"));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(permissionManager).toBe(sharedManager);
    expect(sharedManager.getPendingPermissions()).toHaveLength(1);

    sharedManager.resolvePermission(sharedManager.getPendingPermissions()[0].id, {
      behavior: "allow",
    });

    const result = await resultPromise;
    expect(result.behavior).toBe("allow");
  });
});
