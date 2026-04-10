/**
 * E2E test: Agent and team endpoints.
 * Tests agent CRUD and team listing.
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

beforeAll(async () => {
  const port = 14500 + Math.floor(Math.random() * 1000);

  const agentRegistry = new AgentRegistry();
  // Pre-register a test agent
  agentRegistry.register("pre-existing", {
    description: "A pre-registered agent",
    prompt: "You are a helpful assistant",
    model: "claude-sonnet-4-20250514",
  });

  server = await createMiddlewareServer({
    port,
    host: "127.0.0.1",
    sessionManager: new SessionManager(),
    eventBus: new HookEventBus(),
    blockingRegistry: new BlockingHookRegistry(),
    policyEngine: new PolicyEngine({ rules: [], defaultBehavior: "allow" }),
    agentRegistry,
    teamManager: new TeamManager(),
    permissionManager: new PermissionManager(),
    askUserManager: new AskUserQuestionManager(),
  });

  const addr = await server.start();
  baseUrl = `http://${addr.host}:${addr.port}`;
});

afterAll(async () => {
  if (server) await server.stop();
});

describe("Agent Endpoints (E2E)", () => {
  it("should list agents including pre-registered ones", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/agents`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.agents).toBeDefined();
    expect(body.total).toBeGreaterThan(0);
    expect(body.agents.some((a: { name: string }) => a.name === "pre-existing")).toBe(true);
  });

  it("should filter agents by query", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/agents?q=pre-registered`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.total).toBe(1);
    expect(body.agents[0]).toMatchObject({
      name: "pre-existing",
      source: "runtime",
    });
  });

  it("should get agent by name", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/agents/pre-existing`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.name).toBe("pre-existing");
    expect(body.description).toBe("A pre-registered agent");
    expect(body.prompt).toBe("You are a helpful assistant");
    expect(body.source).toBe("runtime");
  });

  it("should return 404 for non-existent agent", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/agents/nonexistent`);
    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error.code).toBe("AGENT_NOT_FOUND");
  });

  it("should register a new runtime agent", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "api-test-agent",
        description: "Created via API",
        prompt: "You are a test agent created via the API",
        tools: ["Read", "Bash"],
        maxTurns: 5,
      }),
    });

    expect(resp.status).toBe(201);
    const body = await resp.json();
    expect(body.name).toBe("api-test-agent");
    expect(body.source).toBe("runtime");

    // Verify it appears in list
    const listResp = await fetch(`${baseUrl}/api/v1/agents`);
    const listBody = await listResp.json();
    expect(listBody.agents.some((a: { name: string }) => a.name === "api-test-agent")).toBe(true);
  });

  it("should return 400 for invalid agent body", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "missing-fields" }), // Missing description and prompt
    });

    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should delete an agent", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/agents/api-test-agent`, {
      method: "DELETE",
    });

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.status).toBe("deleted");

    // Verify it's gone
    const getResp = await fetch(`${baseUrl}/api/v1/agents/api-test-agent`);
    expect(getResp.status).toBe(404);
  });

  it("should list teams (empty by default)", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/teams`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.teams).toBeDefined();
    expect(Array.isArray(body.teams)).toBe(true);
    // Teams are from filesystem, may be empty
    expect(typeof body.total).toBe("number");
  });

  it("should return 404 for non-existent team", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/teams/nonexistent-team`);
    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error.code).toBe("TEAM_NOT_FOUND");
  });
});
