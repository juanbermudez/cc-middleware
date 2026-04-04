/**
 * E2E test: Hook and event endpoints.
 * Tests event type listing, webhook subscription CRUD, and webhook delivery.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
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
let baseUrl: string;
let eventBus: HookEventBus;

// Webhook receiver server
let webhookServer: FastifyInstance;
let webhookPort: number;
let receivedWebhooks: Array<Record<string, unknown>>;

beforeAll(async () => {
  // Set up webhook receiver
  webhookPort = 14300 + Math.floor(Math.random() * 1000);
  webhookServer = Fastify({ logger: false });
  receivedWebhooks = [];

  webhookServer.post("/webhook", async (request) => {
    receivedWebhooks.push(request.body as Record<string, unknown>);
    return { received: true };
  });

  await webhookServer.listen({ port: webhookPort, host: "127.0.0.1" });

  // Set up middleware server
  const port = 14400 + Math.floor(Math.random() * 1000);
  eventBus = new HookEventBus();

  server = await createMiddlewareServer({
    port,
    host: "127.0.0.1",
    sessionManager: new SessionManager(),
    eventBus,
    blockingRegistry: new BlockingHookRegistry(),
    policyEngine: new PolicyEngine({ rules: [], defaultBehavior: "allow" }),
    agentRegistry: new AgentRegistry(),
    teamManager: new TeamManager(),
    permissionManager: new PermissionManager(),
    askUserManager: new AskUserQuestionManager(),
  });

  const addr = await server.start();
  baseUrl = `http://${addr.host}:${addr.port}`;
});

afterAll(async () => {
  if (server) await server.stop();
  if (webhookServer) await webhookServer.close();
});

describe("Hook and Event Endpoints (E2E)", () => {
  it("should list all event types", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/events/types`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.eventTypes).toBeDefined();
    expect(Array.isArray(body.eventTypes)).toBe(true);
    expect(body.eventTypes).toContain("PreToolUse");
    expect(body.eventTypes).toContain("PostToolUse");
    expect(body.eventTypes).toContain("SessionStart");
    expect(body.total).toBeGreaterThan(10);
  });

  let subscriptionId: string;

  it("should create a webhook subscription", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/events/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `http://127.0.0.1:${webhookPort}/webhook`,
        events: ["PreToolUse", "PostToolUse"],
      }),
    });

    expect(resp.status).toBe(201);
    const body = await resp.json();
    expect(body.id).toBeTruthy();
    expect(body.events).toEqual(["PreToolUse", "PostToolUse"]);
    expect(body.url).toContain("/webhook");

    subscriptionId = body.id;
  });

  it("should list subscriptions", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/events/subscriptions`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.subscriptions).toBeDefined();
    expect(body.subscriptions.length).toBeGreaterThan(0);
    expect(body.subscriptions.some((s: { id: string }) => s.id === subscriptionId)).toBe(true);
  });

  it("should deliver webhooks when events fire", async () => {
    receivedWebhooks = [];

    // Dispatch a PreToolUse event
    eventBus.dispatch("PreToolUse", {
      session_id: "webhook-test",
      cwd: "/tmp",
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_input: { file_path: "/tmp/test.txt" },
    } as unknown as HookInput);

    // Wait for webhook delivery
    await new Promise((r) => setTimeout(r, 1000));

    expect(receivedWebhooks.length).toBeGreaterThan(0);
    expect(receivedWebhooks[0].eventType).toBe("PreToolUse");
    expect(receivedWebhooks[0].subscriptionId).toBe(subscriptionId);
  });

  it("should not deliver webhooks for unsubscribed events", async () => {
    receivedWebhooks = [];

    // Dispatch a SessionStart event (not subscribed)
    eventBus.dispatch("SessionStart", {
      session_id: "webhook-test",
      cwd: "/tmp",
      hook_event_name: "SessionStart",
    } as unknown as HookInput);

    await new Promise((r) => setTimeout(r, 500));

    // Should not receive anything for SessionStart
    expect(
      receivedWebhooks.filter((w) => w.eventType === "SessionStart").length
    ).toBe(0);
  });

  it("should delete a subscription", async () => {
    const resp = await fetch(
      `${baseUrl}/api/v1/events/subscriptions/${subscriptionId}`,
      { method: "DELETE" }
    );

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.status).toBe("deleted");

    // Verify it's gone
    const listResp = await fetch(`${baseUrl}/api/v1/events/subscriptions`);
    const listBody = await listResp.json();
    expect(listBody.subscriptions.some((s: { id: string }) => s.id === subscriptionId)).toBe(false);
  });

  it("should return 404 for deleting non-existent subscription", async () => {
    const resp = await fetch(
      `${baseUrl}/api/v1/events/subscriptions/nonexistent-id`,
      { method: "DELETE" }
    );

    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error.code).toBe("SUBSCRIPTION_NOT_FOUND");
  });

  it("should return 400 for invalid subscription body", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/events/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: [] }), // Missing url, events empty
    });

    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
