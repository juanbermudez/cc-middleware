/**
 * E2E test: API server setup.
 * Verifies health check and status endpoints work correctly.
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
  const port = 14000 + Math.floor(Math.random() * 1000);

  server = await createMiddlewareServer({
    port,
    host: "127.0.0.1",
    sessionManager: new SessionManager(),
    eventBus: new HookEventBus(),
    blockingRegistry: new BlockingHookRegistry(),
    policyEngine: new PolicyEngine({
      rules: [
        { id: "allow-read", toolName: "Read", behavior: "allow", priority: 1 },
      ],
      defaultBehavior: "ask",
    }),
    agentRegistry: new AgentRegistry(),
    teamManager: new TeamManager(),
    permissionManager: new PermissionManager(),
    askUserManager: new AskUserQuestionManager(),
  });

  const addr = await server.start();
  baseUrl = `http://${addr.host}:${addr.port}`;
});

afterAll(async () => {
  if (server) {
    await server.stop();
  }
});

describe("API Server (E2E)", () => {
  it("should respond to health check", async () => {
    const resp = await fetch(`${baseUrl}/health`);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0");
    expect(typeof body.uptime).toBe("number");
  });

  it("should return status with middleware state", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/status`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(typeof body.activeSessions).toBe("number");
    expect(body.activeSessions).toBe(0);
    expect(typeof body.registeredAgents).toBe("number");
    expect(body.registeredAgents).toBe(0);
    expect(typeof body.hookHandlerCount).toBe("number");
    expect(typeof body.pendingPermissions).toBe("number");
    expect(typeof body.pendingQuestions).toBe("number");
    expect(typeof body.policyRuleCount).toBe("number");
    expect(body.policyRuleCount).toBe(1);
    expect(Array.isArray(body.registeredEvents)).toBe(true);
  });

  it("should return 404 for unknown endpoints", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/nonexistent`);
    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
