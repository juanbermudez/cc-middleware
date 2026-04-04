/**
 * E2E test: Permission endpoints.
 * Tests policy CRUD, pending permission listing, and question listing.
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
import type { MiddlewareServer } from "../../src/api/server.js";

let server: MiddlewareServer;
let baseUrl: string;
let policyEngine: PolicyEngine;
let permissionManager: PermissionManager;
let askUserManager: AskUserQuestionManager;

beforeAll(async () => {
  const port = 14600 + Math.floor(Math.random() * 1000);

  policyEngine = new PolicyEngine({
    rules: [
      { id: "initial-deny-bash", toolName: "Bash", behavior: "deny", priority: 1 },
    ],
    defaultBehavior: "ask",
  });
  permissionManager = new PermissionManager();
  askUserManager = new AskUserQuestionManager();

  server = await createMiddlewareServer({
    port,
    host: "127.0.0.1",
    sessionManager: new SessionManager(),
    eventBus: new HookEventBus(),
    blockingRegistry: new BlockingHookRegistry(),
    policyEngine,
    agentRegistry: new AgentRegistry(),
    teamManager: new TeamManager(),
    permissionManager,
    askUserManager,
  });

  const addr = await server.start();
  baseUrl = `http://${addr.host}:${addr.port}`;
});

afterAll(async () => {
  if (server) await server.stop();
});

describe("Permission Endpoints (E2E)", () => {
  it("should list existing policy rules", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/permissions/policies`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.rules).toBeDefined();
    expect(body.total).toBe(1);
    expect(body.rules[0].id).toBe("initial-deny-bash");
    expect(body.rules[0].behavior).toBe("deny");
  });

  it("should add a policy rule", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/permissions/policies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "allow-read",
        toolName: "Read",
        behavior: "allow",
        priority: 5,
      }),
    });

    expect(resp.status).toBe(201);
    const body = await resp.json();
    expect(body.id).toBe("allow-read");
    expect(body.behavior).toBe("allow");

    // Verify it appears in list
    const listResp = await fetch(`${baseUrl}/api/v1/permissions/policies`);
    const listBody = await listResp.json();
    expect(listBody.total).toBe(2);
  });

  it("should return 409 for duplicate rule ID", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/permissions/policies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "allow-read", // Already exists
        toolName: "Read",
        behavior: "allow",
        priority: 10,
      }),
    });

    expect(resp.status).toBe(409);
    const body = await resp.json();
    expect(body.error.code).toBe("RULE_EXISTS");
  });

  it("should delete a policy rule", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/permissions/policies/allow-read`, {
      method: "DELETE",
    });

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.status).toBe("deleted");

    // Verify it's gone
    const listResp = await fetch(`${baseUrl}/api/v1/permissions/policies`);
    const listBody = await listResp.json();
    expect(listBody.total).toBe(1);
  });

  it("should return 404 for deleting non-existent rule", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/permissions/policies/nonexistent`, {
      method: "DELETE",
    });

    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error.code).toBe("RULE_NOT_FOUND");
  });

  it("should list pending permissions (empty by default)", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/permissions/pending`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.pending).toBeDefined();
    expect(Array.isArray(body.pending)).toBe(true);
    expect(body.total).toBe(0);
  });

  it("should list pending questions (empty by default)", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/permissions/questions`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.questions).toBeDefined();
    expect(Array.isArray(body.questions)).toBe(true);
    expect(body.total).toBe(0);
  });

  it("should return 404 for resolving non-existent permission", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/permissions/pending/nonexistent/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ behavior: "deny" }),
    });

    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error.code).toBe("PERMISSION_NOT_FOUND");
  });

  it("should return 404 for answering non-existent question", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/permissions/questions/nonexistent/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: { "q1": "answer1" } }),
    });

    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error.code).toBe("QUESTION_NOT_FOUND");
  });

  it("should return 400 for invalid policy rule body", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/permissions/policies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "test" }), // Missing required fields
    });

    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
