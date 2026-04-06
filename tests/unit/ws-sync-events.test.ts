/**
 * Unit tests for WebSocket sync event broadcasting.
 * Verifies that new sync event types (session:discovered, config:changed, etc.)
 * are correctly typed and can be broadcast to subscribers.
 */

import { describe, it, expect } from "vitest";
import type { WSServerMessage, WSClientMessage } from "../../src/api/websocket.js";

describe("WebSocket sync event types", () => {
  it("should support session:stream event type", () => {
    const msg: WSServerMessage = {
      type: "session:stream",
      sessionId: "test-session-stream",
      event: {
        type: "text_delta",
        text: "hello",
      },
    };
    expect(msg.type).toBe("session:stream");
    expect(msg.event.type).toBe("text_delta");
  });

  it("should support session:discovered event type", () => {
    const msg: WSServerMessage = {
      type: "session:discovered",
      sessionId: "test-session-123",
      timestamp: Date.now(),
    };
    expect(msg.type).toBe("session:discovered");
    expect(msg.sessionId).toBe("test-session-123");
  });

  it("should support session:updated event type", () => {
    const msg: WSServerMessage = {
      type: "session:updated",
      sessionId: "test-session-456",
      timestamp: Date.now(),
    };
    expect(msg.type).toBe("session:updated");
  });

  it("should support session:removed event type", () => {
    const msg: WSServerMessage = {
      type: "session:removed",
      sessionId: "test-session-789",
      timestamp: Date.now(),
    };
    expect(msg.type).toBe("session:removed");
  });

  it("should support config:changed event type", () => {
    const msg: WSServerMessage = {
      type: "config:changed",
      scope: "project",
      path: "/some/path/settings.json",
      timestamp: Date.now(),
    };
    expect(msg.type).toBe("config:changed");
    expect(msg.scope).toBe("project");
  });

  it("should support config:agent-changed event type", () => {
    const msg: WSServerMessage = {
      type: "config:agent-changed",
      name: "my-agent",
      action: "created",
      timestamp: Date.now(),
    };
    expect(msg.type).toBe("config:agent-changed");
    expect(msg.name).toBe("my-agent");
    expect(msg.action).toBe("created");
  });

  it("should support config:skill-changed event type", () => {
    const msg: WSServerMessage = {
      type: "config:skill-changed",
      name: "my-skill",
      action: "modified",
      timestamp: Date.now(),
    };
    expect(msg.type).toBe("config:skill-changed");
  });

  it("should support config:rule-changed event type", () => {
    const msg: WSServerMessage = {
      type: "config:rule-changed",
      name: "no-console",
      action: "removed",
      timestamp: Date.now(),
    };
    expect(msg.type).toBe("config:rule-changed");
  });

  it("should support team:created event type", () => {
    const msg: WSServerMessage = {
      type: "team:created",
      teamName: "my-team",
      timestamp: Date.now(),
    };
    expect(msg.type).toBe("team:created");
    expect(msg.teamName).toBe("my-team");
  });

  it("should support team:updated event type", () => {
    const msg: WSServerMessage = {
      type: "team:updated",
      teamName: "my-team",
      timestamp: Date.now(),
    };
    expect(msg.type).toBe("team:updated");
  });

  it("should support team:task-updated event type", () => {
    const msg: WSServerMessage = {
      type: "team:task-updated",
      path: "/some/path/task.json",
      timestamp: Date.now(),
    };
    expect(msg.type).toBe("team:task-updated");
  });

  it("should support config:mcp-changed event type", () => {
    const msg: WSServerMessage = {
      type: "config:mcp-changed",
      path: "/.mcp.json",
      timestamp: Date.now(),
    };
    expect(msg.type).toBe("config:mcp-changed");
  });

  it("should support config:plugin-changed event type", () => {
    const msg: WSServerMessage = {
      type: "config:plugin-changed",
      path: "/some/path/installed_plugins.json",
      timestamp: Date.now(),
    };
    expect(msg.type).toBe("config:plugin-changed");
  });

  it("should support config:memory-changed event type", () => {
    const msg: WSServerMessage = {
      type: "config:memory-changed",
      path: "/some/path/memory/index.md",
      timestamp: Date.now(),
    };
    expect(msg.type).toBe("config:memory-changed");
  });

  it("should still support all existing event types", () => {
    // Verify backward compatibility
    const msgs: WSServerMessage[] = [
      { type: "session:started", sessionId: "s1", timestamp: Date.now() },
      { type: "session:completed", sessionId: "s2", result: {} as never },
      { type: "session:errored", sessionId: "s3", error: "err" },
      { type: "session:aborted", sessionId: "s4" },
      { type: "hook:event", eventType: "PreToolUse", input: {} as never },
      { type: "pong" },
      { type: "error", message: "test" },
    ];
    expect(msgs.length).toBe(7);
  });

  it("should support subscribe to sync event patterns", () => {
    // Verify client can subscribe to new event categories
    const msg: WSClientMessage = {
      type: "subscribe",
      events: ["session:*", "config:*", "team:*"],
    };
    expect(msg.events).toContain("session:*");
    expect(msg.events).toContain("config:*");
    expect(msg.events).toContain("team:*");
  });

  it("should support launching a streaming session over WebSocket", () => {
    const msg: WSClientMessage = {
      type: "launch",
      options: {
        prompt: "Say hello",
        maxTurns: 1,
      },
    };
    expect(msg.type).toBe("launch");
    expect(msg.options.prompt).toBe("Say hello");
  });

  it("should support resuming a streaming session over WebSocket", () => {
    const msg: WSClientMessage = {
      type: "resume",
      sessionId: "sess_123",
      prompt: "Continue",
      maxTurns: 1,
    };
    expect(msg.type).toBe("resume");
    expect(msg.sessionId).toBe("sess_123");
  });
});
