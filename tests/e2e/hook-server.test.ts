/**
 * E2E test: HTTP hook server.
 * Tests that the server receives hook events, dispatches to event bus,
 * and returns correct responses.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHookServer } from "../../src/hooks/server.js";
import { createEventBus } from "../../src/hooks/event-bus.js";
import { createBlockingRegistry } from "../../src/hooks/blocking.js";
import type { HookServer } from "../../src/hooks/server.js";
import type { HookEventBus } from "../../src/hooks/event-bus.js";
import type { BlockingHookRegistry } from "../../src/hooks/blocking.js";

let server: HookServer;
let eventBus: HookEventBus;
let blockingRegistry: BlockingHookRegistry;
let baseUrl: string;

beforeAll(async () => {
  eventBus = createEventBus();
  blockingRegistry = createBlockingRegistry();

  server = await createHookServer({
    port: 0, // Use random available port
    host: "127.0.0.1",
    eventBus,
    blockingRegistry,
  });

  // Use port 0 to get a random port, but Fastify doesn't directly support this
  // Let's start on a specific test port
  await server.stop();

  server = await createHookServer({
    port: 13579,
    host: "127.0.0.1",
    eventBus,
    blockingRegistry,
  });

  const addr = await server.start();
  baseUrl = `http://${addr.host}:${addr.port}`;
});

afterAll(async () => {
  if (server) {
    await server.stop();
  }
});

describe("HTTP Hook Server (E2E)", () => {
  it("should respond to health check", async () => {
    const resp = await fetch(`${baseUrl}/health`);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.status).toBe("ok");
  });

  it("should receive and dispatch PreToolUse event (allow by default)", async () => {
    const handler = vi.fn();
    eventBus.on("PreToolUse", handler);

    const payload = {
      session_id: "test-session",
      cwd: "/tmp/test",
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_input: { file_path: "/tmp/test.txt" },
    };

    const resp = await fetch(`${baseUrl}/hooks/PreToolUse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(resp.status).toBe(200);
    const body = await resp.json();
    // Default stub returns {} (proceed)
    expect(body).toEqual({});

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        hook_event_name: "PreToolUse",
        tool_name: "Read",
      })
    );

    eventBus.off("PreToolUse", handler);
  });

  it("should return deny via JSON body for blocking hook", async () => {
    // Register a deny handler for PreToolUse matching "Bash"
    const unregister = blockingRegistry.register(
      "PreToolUse",
      async () => ({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny" as const,
          permissionDecisionReason: "Blocked by policy",
        },
      }),
      { matcher: "^Bash$" }
    );

    const payload = {
      session_id: "test-session",
      cwd: "/tmp/test",
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "rm -rf /" },
    };

    const resp = await fetch(`${baseUrl}/hooks/PreToolUse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(resp.status).toBe(200); // Always 200!
    const body = await resp.json();
    expect(body.hookSpecificOutput).toBeDefined();
    expect(body.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(body.hookSpecificOutput.permissionDecisionReason).toBe(
      "Blocked by policy"
    );

    unregister();
  });

  it("should handle non-blocking event with empty 200", async () => {
    const handler = vi.fn();
    eventBus.on("SessionStart", handler);

    const payload = {
      session_id: "test-session",
      cwd: "/tmp/test",
      hook_event_name: "SessionStart",
    };

    const resp = await fetch(`${baseUrl}/hooks/SessionStart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body).toEqual({});

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        hook_event_name: "SessionStart",
      })
    );

    eventBus.off("SessionStart", handler);
  });

  it("should accept InstructionsLoaded and dispatch it to listeners", async () => {
    const handler = vi.fn();
    eventBus.on("InstructionsLoaded", handler);

    const payload = {
      session_id: "test-session",
      cwd: "/tmp/test",
      hook_event_name: "InstructionsLoaded",
      transcript_path: "/tmp/test-transcript.jsonl",
      permission_mode: "default",
    };

    const resp = await fetch(`${baseUrl}/hooks/InstructionsLoaded`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body).toEqual({});
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        hook_event_name: "InstructionsLoaded",
        transcript_path: "/tmp/test-transcript.jsonl",
        permission_mode: "default",
      })
    );

    eventBus.off("InstructionsLoaded", handler);
  });

  it("should handle unknown event type gracefully", async () => {
    const resp = await fetch(`${baseUrl}/hooks/UnknownEvent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "test" }),
    });

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body).toEqual({});
  });

  it("should dispatch wildcard events", async () => {
    const wildcardHandler = vi.fn();
    eventBus.on("*", wildcardHandler);

    const payload = {
      session_id: "test-session",
      cwd: "/tmp/test",
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: {},
      tool_output: "file contents",
    };

    await fetch(`${baseUrl}/hooks/PostToolUse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(wildcardHandler).toHaveBeenCalledWith(
      "PostToolUse",
      expect.objectContaining({
        hook_event_name: "PostToolUse",
        tool_name: "Read",
      })
    );

    eventBus.off("*", wildcardHandler);
  });

  it("should handle Stop blocking with decision format", async () => {
    const unregister = blockingRegistry.register("Stop", async () => ({
      decision: "block",
      reason: "Keep working",
    }));

    const payload = {
      session_id: "test-session",
      cwd: "/tmp/test",
      hook_event_name: "Stop",
      stop_reason: "end_turn",
    };

    const resp = await fetch(`${baseUrl}/hooks/Stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.decision).toBe("block");
    expect(body.reason).toBe("Keep working");

    unregister();
  });
});
