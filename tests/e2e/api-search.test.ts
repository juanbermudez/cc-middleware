/**
 * E2E test: Search API endpoints.
 * Tests search, reindex, and stats endpoints.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
import { createStore } from "../../src/store/db.js";
import { SessionIndexer } from "../../src/store/indexer.js";
import type { MiddlewareServer } from "../../src/api/server.js";
import type { SessionStore } from "../../src/store/db.js";

let server: MiddlewareServer;
let baseUrl: string;
let store: SessionStore;
let tempDir: string;

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "cc-api-search-test-"));
  const teamsDir = join(tempDir, "teams");
  const tasksDir = join(tempDir, "tasks");
  mkdirSync(join(teamsDir, "delivery"), { recursive: true });
  mkdirSync(join(tasksDir, "delivery"), { recursive: true });
  writeFileSync(
    join(teamsDir, "delivery", "config.json"),
    JSON.stringify({
      name: "delivery",
      members: [
        {
          name: "reviewer",
          agentId: "agent-reviewer",
          status: "active",
        },
      ],
    })
  );
  store = await createStore({ dbPath: join(tempDir, "test.db") });
  store.migrate();

  const indexer = new SessionIndexer({ store, messageLimit: 10 });

  const port = 15200 + Math.floor(Math.random() * 1000);

  server = await createMiddlewareServer({
    port,
    host: "127.0.0.1",
    sessionManager: new SessionManager(),
    eventBus: new HookEventBus(),
    blockingRegistry: new BlockingHookRegistry(),
    policyEngine: new PolicyEngine({ rules: [], defaultBehavior: "allow" }),
    agentRegistry: new AgentRegistry(),
    teamManager: new TeamManager({ teamsDir, tasksDir }),
    permissionManager: new PermissionManager(),
    askUserManager: new AskUserQuestionManager(),
    sessionStore: store,
    sessionIndexer: indexer,
  });

  const addr = await server.start();
  baseUrl = `http://${addr.host}:${addr.port}`;
});

afterAll(async () => {
  if (server) await server.stop();
  if (store) store.close();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

describe("Search API Endpoints (E2E)", () => {
  it("should return search results for empty query", async () => {
    // Seed some data
    store.upsertSession({
      id: "test-s1",
      project: "test-proj",
      cwd: "/tmp/test",
      summary: "Test session for API search",
      firstPrompt: "Hello from search test",
      status: "completed",
      createdAt: Date.now() - 60000,
      lastModified: Date.now(),
    });

    const resp = await fetch(`${baseUrl}/api/v1/search?q=`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.sessions).toBeDefined();
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.queryTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("should return search results for keyword query", async () => {
    store.replaceRelationships("test-s1", [
      {
        id: "rel-test-s1",
        sessionId: "test-s1",
        relationshipType: "subagent",
        path: "/tmp/test/subagents/agent-reviewer.jsonl",
        agentId: "agent-reviewer",
        slug: "reviewer",
        lastModified: Date.now(),
      },
    ]);

    const resp = await fetch(`${baseUrl}/api/v1/search?q=search%20test`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.sessions).toBeDefined();
    expect(body.total).toBeGreaterThanOrEqual(1);
    // Should find our test session
    const found = body.sessions.find(
      (s: { id: string; lineage: { hasSubagents: boolean; teamNames: string[] } }) =>
        s.id === "test-s1"
    );
    expect(found).toBeDefined();
    expect(found.lineage.hasSubagents).toBe(true);
    expect(found.lineage.teamNames).toEqual(["delivery"]);
  });

  it("should support lineage and team filters", async () => {
    const resp = await fetch(
      `${baseUrl}/api/v1/search?q=search%20test&lineage=team&team=delivery`
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.total).toBe(1);
    expect(body.sessions[0].id).toBe("test-s1");
    expect(body.sessions[0].lineage.teamNames).toEqual(["delivery"]);
  });

  it("should search and filter by registered session metadata", async () => {
    const now = Date.now();
    store.upsertSessionMetadataDefinition({
      key: "owner",
      label: "Owner",
      valueType: "string",
      searchable: true,
      filterable: true,
      createdAt: now,
      updatedAt: now,
    });
    store.setSessionMetadataValue({
      sessionId: "test-s1",
      key: "owner",
      value: "platform",
      createdAt: now,
      updatedAt: now,
    });

    const searchResp = await fetch(
      `${baseUrl}/api/v1/search?q=platform`
    );
    expect(searchResp.status).toBe(200);
    const searchBody = await searchResp.json();
    expect(searchBody.total).toBeGreaterThanOrEqual(1);
    expect(searchBody.sessions[0].metadata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "owner",
          value: "platform",
        }),
      ])
    );

    const filteredResp = await fetch(
      `${baseUrl}/api/v1/search?q=&metadataKey=owner&metadataValue=platform`
    );
    expect(filteredResp.status).toBe(200);
    const filteredBody = await filteredResp.json();
    expect(filteredBody.total).toBe(1);
    expect(filteredBody.sessions[0].id).toBe("test-s1");
  });

  it("should return search stats", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/search/stats`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(typeof body.totalSessions).toBe("number");
    expect(typeof body.totalMessages).toBe("number");
  });

  it("should trigger reindex", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/search/reindex`, {
      method: "POST",
    });
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.status).toBe("completed");
    expect(typeof body.sessionsIndexed).toBe("number");
    expect(typeof body.messagesIndexed).toBe("number");
    expect(typeof body.durationMs).toBe("number");
    expect(Array.isArray(body.errors)).toBe(true);
  }, 30000);

  it("should support pagination params", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/search?q=&limit=5&offset=0`);
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.sessions.length).toBeLessThanOrEqual(5);
  });

  it("should support project filter", async () => {
    store.upsertSession({
      id: "test-s2",
      project: "other-proj",
      cwd: "/tmp/other",
      summary: "Another test session",
      firstPrompt: "Different project",
      status: "completed",
      createdAt: Date.now(),
      lastModified: Date.now(),
    });

    const resp = await fetch(
      `${baseUrl}/api/v1/search?q=&project=test-proj`
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.sessions.every((s: { project: string }) => s.project === "test-proj")).toBe(true);
  });

  it("should return empty results for non-matching query", async () => {
    const resp = await fetch(
      `${baseUrl}/api/v1/search?q=nonexistentterm99999`
    );
    expect(resp.status).toBe(200);
    const body = await resp.json();

    expect(body.sessions.length).toBe(0);
    expect(body.total).toBe(0);
  });
});
