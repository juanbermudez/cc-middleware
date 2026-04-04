/**
 * E2E test: WebSocket streaming.
 * Tests subscribe, ping/pong, and event broadcasting.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { createMiddlewareServer } from "../../src/api/server.js";
import { SessionManager } from "../../src/sessions/manager.js";
import { HookEventBus } from "../../src/hooks/event-bus.js";
import { BlockingHookRegistry } from "../../src/hooks/blocking.js";
import { PolicyEngine } from "../../src/permissions/policy.js";
import { AgentRegistry } from "../../src/agents/registry.js";
import { TeamManager } from "../../src/agents/teams.js";
import { PermissionManager } from "../../src/permissions/handler.js";
import { AskUserQuestionManager } from "../../src/permissions/ask-user.js";
import type { MiddlewareServer } from "../../src/api/server.js";
import type { HookInput } from "../../src/types/hooks.js";

let server: MiddlewareServer;
let wsUrl: string;
let eventBus: HookEventBus;
let sessionManager: SessionManager;

beforeAll(async () => {
  const port = 14200 + Math.floor(Math.random() * 1000);
  eventBus = new HookEventBus();
  sessionManager = new SessionManager();

  server = await createMiddlewareServer({
    port,
    host: "127.0.0.1",
    sessionManager,
    eventBus,
    blockingRegistry: new BlockingHookRegistry(),
    policyEngine: new PolicyEngine({ rules: [], defaultBehavior: "allow" }),
    agentRegistry: new AgentRegistry(),
    teamManager: new TeamManager(),
    permissionManager: new PermissionManager(),
    askUserManager: new AskUserQuestionManager(),
  });

  const addr = await server.start();
  wsUrl = `ws://${addr.host}:${addr.port}/api/v1/ws`;
});

afterAll(async () => {
  if (server) {
    await server.stop();
  }
});

/** Helper to create a WebSocket client and wait for connection */
function connectWS(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

/** Helper to wait for the next message from a WebSocket */
function waitForMessage(ws: WebSocket, timeoutMs = 5000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timeout waiting for WebSocket message")),
      timeoutMs
    );
    ws.once("message", (data: Buffer | string) => {
      clearTimeout(timer);
      const raw = typeof data === "string" ? data : data.toString("utf-8");
      resolve(JSON.parse(raw));
    });
  });
}

describe("WebSocket Streaming (E2E)", () => {
  it("should connect to WebSocket endpoint", async () => {
    const ws = await connectWS();
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it("should respond to ping with pong", async () => {
    const ws = await connectWS();

    ws.send(JSON.stringify({ type: "ping" }));
    const msg = await waitForMessage(ws);

    expect(msg.type).toBe("pong");
    ws.close();
  });

  it("should receive hook events after subscribing", async () => {
    const ws = await connectWS();

    // Subscribe to hook events
    ws.send(JSON.stringify({ type: "subscribe", events: ["hook:*"] }));

    // Give a moment for subscription to register
    await new Promise((r) => setTimeout(r, 100));

    // Dispatch a hook event through the event bus
    eventBus.dispatch("PreToolUse", {
      session_id: "ws-test-session",
      cwd: "/tmp",
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_input: { file_path: "/tmp/test.txt" },
    } as unknown as HookInput);

    const msg = await waitForMessage(ws);

    expect(msg.type).toBe("hook:event");
    expect(msg.eventType).toBe("PreToolUse");
    expect((msg.input as Record<string, unknown>).tool_name).toBe("Read");

    ws.close();
  });

  it("should not receive events when not subscribed", async () => {
    const ws = await connectWS();

    // Don't subscribe to anything

    // Dispatch event
    eventBus.dispatch("PostToolUse", {
      session_id: "test",
      cwd: "/tmp",
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: {},
      tool_output: "",
    } as unknown as HookInput);

    // Wait a short time - should NOT receive anything
    const messagePromise = waitForMessage(ws, 500);
    await expect(messagePromise).rejects.toThrow("Timeout");

    ws.close();
  });

  it("should handle invalid JSON gracefully", async () => {
    const ws = await connectWS();

    ws.send("not-valid-json");
    const msg = await waitForMessage(ws);

    expect(msg.type).toBe("error");
    expect(msg.message).toBe("Invalid JSON message");

    ws.close();
  });

  it("should support unsubscribe", async () => {
    const ws = await connectWS();

    // Subscribe then unsubscribe
    ws.send(JSON.stringify({ type: "subscribe", events: ["hook:*"] }));
    await new Promise((r) => setTimeout(r, 100));

    ws.send(JSON.stringify({ type: "unsubscribe", events: ["hook:*"] }));
    await new Promise((r) => setTimeout(r, 100));

    // Dispatch event
    eventBus.dispatch("SessionStart", {
      session_id: "test",
      cwd: "/tmp",
      hook_event_name: "SessionStart",
    } as unknown as HookInput);

    // Should NOT receive anything after unsubscribe
    const messagePromise = waitForMessage(ws, 500);
    await expect(messagePromise).rejects.toThrow("Timeout");

    ws.close();
  });
});
