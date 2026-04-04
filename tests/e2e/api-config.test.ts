/**
 * E2E test: Configuration API endpoints.
 * Tests settings, plugins, skills, agents, rules, MCP, memory, CLAUDE.md.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
let tempDir: string;

beforeAll(async () => {
  // Create a temp project with config components
  tempDir = mkdtempSync(join(tmpdir(), "cc-api-config-test-"));

  // Create .claude/settings.json
  mkdirSync(join(tempDir, ".claude"), { recursive: true });
  writeFileSync(
    join(tempDir, ".claude", "settings.json"),
    JSON.stringify({
      permissions: {
        allow: ["Read", "Glob"],
      },
      env: { TEST_VAR: "hello" },
    })
  );

  // Create .claude/agents/test-agent.md
  mkdirSync(join(tempDir, ".claude", "agents"), { recursive: true });
  writeFileSync(
    join(tempDir, ".claude", "agents", "api-test-agent.md"),
    `---
name: api-test-agent
description: Agent for API testing
model: sonnet
---

You are a test agent.
`
  );

  // Create CLAUDE.md
  writeFileSync(join(tempDir, "CLAUDE.md"), "# API Config Test\n\nTest project.\n");

  const port = 15600 + Math.floor(Math.random() * 1000);

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
    projectDir: tempDir,
  });

  const addr = await server.start();
  baseUrl = `http://${addr.host}:${addr.port}`;
});

afterAll(async () => {
  if (server) await server.stop();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

describe("Configuration API Endpoints (E2E)", () => {
  // ========== Settings ==========

  describe("Settings", () => {
    it("should get merged effective settings", async () => {
      const resp = await fetch(`${baseUrl}/api/v1/config/settings`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.settings).toBeDefined();
      expect(body.provenance).toBeDefined();
      expect(body.permissions).toBeDefined();
      expect(body.permissions.allow).toBeDefined();
      expect(Array.isArray(body.permissions.allow)).toBe(true);
    });

    it("should get settings for a specific scope", async () => {
      const resp = await fetch(`${baseUrl}/api/v1/config/settings/project`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.scope).toBe("project");
      expect(body.exists).toBe(true);
      expect(body.content.permissions).toBeDefined();
    });

    it("should return 400 for invalid scope", async () => {
      const resp = await fetch(`${baseUrl}/api/v1/config/settings/invalid`);
      expect(resp.status).toBe(400);
    });

    it("should update a setting value", async () => {
      const resp = await fetch(`${baseUrl}/api/v1/config/settings/local`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "effortLevel", value: "high" }),
      });
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.after).toBe("high");
    });

    it("should add a permission rule", async () => {
      const resp = await fetch(
        `${baseUrl}/api/v1/config/settings/local/permissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rule: "Bash(echo *)", behavior: "allow" }),
        }
      );
      expect(resp.status).toBe(201);
      const body = await resp.json();
      expect(body.status).toBe("added");
      expect(body.rule).toBe("Bash(echo *)");
    });

    it("should remove a permission rule", async () => {
      const resp = await fetch(
        `${baseUrl}/api/v1/config/settings/local/permissions`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rule: "Bash(echo *)", behavior: "allow" }),
        }
      );
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe("removed");
    });
  });

  // ========== Plugins ==========

  describe("Plugins", () => {
    it("should list installed plugins", async () => {
      const resp = await fetch(`${baseUrl}/api/v1/config/plugins`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.plugins).toBeDefined();
      expect(Array.isArray(body.plugins)).toBe(true);
      expect(typeof body.total).toBe("number");
    });

    it("should return 404 for non-existent plugin", async () => {
      const resp = await fetch(
        `${baseUrl}/api/v1/config/plugins/nonexistent-plugin-99999`
      );
      expect(resp.status).toBe(404);
    });
  });

  // ========== Agents ==========

  describe("Agents", () => {
    it("should list agent definitions", async () => {
      const resp = await fetch(`${baseUrl}/api/v1/config/agents`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.agents).toBeDefined();
      expect(Array.isArray(body.agents)).toBe(true);

      // Should find our test agent
      const testAgent = body.agents.find(
        (a: { name: string }) => a.name === "api-test-agent"
      );
      expect(testAgent).toBeDefined();
      expect(testAgent.description).toBe("Agent for API testing");
    });

    let createdAgentName: string;

    it("should create a new agent", async () => {
      createdAgentName = `api-crud-agent-${Date.now()}`;
      const resp = await fetch(`${baseUrl}/api/v1/config/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createdAgentName,
          description: "Created via API",
          prompt: "You are a test agent created via API.",
          scope: "project",
          model: "haiku",
        }),
      });
      expect(resp.status).toBe(201);
      const body = await resp.json();
      expect(body.status).toBe("created");
      expect(body.name).toBe(createdAgentName);
    });

    it("should update an agent", async () => {
      const resp = await fetch(
        `${baseUrl}/api/v1/config/agents/${createdAgentName}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: "Updated via API" }),
        }
      );
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe("updated");
    });

    it("should delete an agent", async () => {
      const resp = await fetch(
        `${baseUrl}/api/v1/config/agents/${createdAgentName}`,
        { method: "DELETE" }
      );
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe("deleted");
    });

    it("should return 404 when deleting non-existent agent", async () => {
      const resp = await fetch(
        `${baseUrl}/api/v1/config/agents/nonexistent-agent-99999`,
        { method: "DELETE" }
      );
      expect(resp.status).toBe(404);
    });
  });

  // ========== Skills ==========

  describe("Skills", () => {
    it("should list skills", async () => {
      const resp = await fetch(`${baseUrl}/api/v1/config/skills`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.skills).toBeDefined();
      expect(Array.isArray(body.skills)).toBe(true);
      expect(typeof body.total).toBe("number");
    });
  });

  // ========== Rules ==========

  describe("Rules", () => {
    it("should list rules", async () => {
      const resp = await fetch(`${baseUrl}/api/v1/config/rules`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.rules).toBeDefined();
      expect(Array.isArray(body.rules)).toBe(true);
    });
  });

  // ========== MCP ==========

  describe("MCP", () => {
    it("should list MCP servers", async () => {
      const resp = await fetch(`${baseUrl}/api/v1/config/mcp`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.servers).toBeDefined();
      expect(Array.isArray(body.servers)).toBe(true);
      expect(typeof body.total).toBe("number");
    });
  });

  // ========== Memory ==========

  describe("Memory", () => {
    it("should get project memory index", async () => {
      const resp = await fetch(`${baseUrl}/api/v1/config/memory`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.projectKey).toBeTruthy();
      expect(body.memoryDir).toBeTruthy();
      expect(typeof body.hasIndex).toBe("boolean");
      expect(typeof body.fileCount).toBe("number");
    });

    it("should list memory files", async () => {
      const resp = await fetch(`${baseUrl}/api/v1/config/memory/files`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.files).toBeDefined();
      expect(Array.isArray(body.files)).toBe(true);
    });

    it("should list all project memories", async () => {
      const resp = await fetch(`${baseUrl}/api/v1/config/memory/projects`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.projects).toBeDefined();
      expect(Array.isArray(body.projects)).toBe(true);
    });

    it("should return 404 for non-existent memory file", async () => {
      const resp = await fetch(
        `${baseUrl}/api/v1/config/memory/files/nonexistent-file-99999`
      );
      expect(resp.status).toBe(404);
    });
  });

  // ========== CLAUDE.md ==========

  describe("CLAUDE.md", () => {
    it("should list CLAUDE.md files", async () => {
      const resp = await fetch(`${baseUrl}/api/v1/config/claude-md`);
      expect(resp.status).toBe(200);
      const body = await resp.json();

      expect(body.files).toBeDefined();
      expect(Array.isArray(body.files)).toBe(true);

      // Should find the project CLAUDE.md we created
      const projectMd = body.files.find(
        (f: { scope: string }) => f.scope === "project"
      );
      expect(projectMd).toBeDefined();
      expect(projectMd.content).toContain("API Config Test");
    });
  });
});
