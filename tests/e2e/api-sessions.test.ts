/**
 * E2E test: Session REST endpoints.
 * Tests list, get, messages, update, and 404 handling.
 * Some tests make real API calls (launch), others use existing sessions.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createMiddlewareServer } from "../../src/api/server.js";
import { SessionManager } from "../../src/sessions/manager.js";
import { HookEventBus } from "../../src/hooks/event-bus.js";
import { BlockingHookRegistry } from "../../src/hooks/blocking.js";
import { PolicyEngine } from "../../src/permissions/policy.js";
import { AgentRegistry } from "../../src/agents/registry.js";
import { TeamManager } from "../../src/agents/teams.js";
import { PermissionManager } from "../../src/permissions/handler.js";
import { AskUserQuestionManager } from "../../src/permissions/ask-user.js";
import { launchSession } from "../../src/sessions/launcher.js";
import type { MiddlewareServer } from "../../src/api/server.js";

let server: MiddlewareServer;
let baseUrl: string;
let testSessionId: string;

beforeAll(async () => {
  // Launch a session first so we have one to query
  const result = await launchSession({
    prompt: 'Say "test session for API"',
    maxTurns: 1,
    permissionMode: "plan",
  });
  testSessionId = result.sessionId;

  const port = 14100 + Math.floor(Math.random() * 1000);
  server = await createMiddlewareServer({
    port,
    host: "127.0.0.1",
    sessionManager: new SessionManager(),
    eventBus: new HookEventBus(),
    blockingRegistry: new BlockingHookRegistry(),
    policyEngine: new PolicyEngine({ rules: [], defaultBehavior: "allow" }),
    agentRegistry: new AgentRegistry(),
    teamManager: new TeamManager(),
    permissionManager: new PermissionManager(),
    askUserManager: new AskUserQuestionManager(),
  });

  const addr = await server.start();
  baseUrl = `http://${addr.host}:${addr.port}`;
}, 60000);

afterAll(async () => {
  if (server) {
    await server.stop();
  }
});

describe("Session REST Endpoints (E2E)", () => {
  it("should list sessions", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/sessions`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.sessions).toBeDefined();
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(body.total).toBeGreaterThan(0);
  });

  it("should list sessions with pagination", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/sessions?limit=5&offset=0`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.sessions.length).toBeLessThanOrEqual(5);
  });

  it("should get session by ID", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/sessions/${testSessionId}`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.sessionId).toBe(testSessionId);
    expect(body.summary).toBeDefined();
  });

  it("should return 404 for non-existent session", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/sessions/nonexistent-id-00000`);
    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error.code).toBe("SESSION_NOT_FOUND");
  });

  it("should get session messages", async () => {
    const resp = await fetch(
      `${baseUrl}/api/v1/sessions/${testSessionId}/messages`
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.messages).toBeDefined();
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages.length).toBeGreaterThan(0);
  });

  it("should update session title", async () => {
    const newTitle = `api-test-${Date.now()}`;
    const resp = await fetch(`${baseUrl}/api/v1/sessions/${testSessionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.customTitle).toBe(newTitle);
  });

  it("should update session tag", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/sessions/${testSessionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: "api-test" }),
    });

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.tag).toBe("api-test");

    // Clean up tag
    await fetch(`${baseUrl}/api/v1/sessions/${testSessionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: null }),
    });
  });

  it("should return 400 for invalid launch request", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}), // Missing required 'prompt'
    });

    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 404 for update on non-existent session", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/sessions/nonexistent-id-00000`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "test" }),
    });

    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error.code).toBe("SESSION_NOT_FOUND");
  });
});
