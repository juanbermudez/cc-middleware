import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../../src/sessions/discovery.js", () => ({
  discoverSessions: vi.fn(),
}));

import { createMiddlewareServer, type MiddlewareServer } from "../../src/api/server.js";
import { SessionManager } from "../../src/sessions/manager.js";
import { HookEventBus } from "../../src/hooks/event-bus.js";
import { BlockingHookRegistry } from "../../src/hooks/blocking.js";
import { PolicyEngine } from "../../src/permissions/policy.js";
import { AgentRegistry } from "../../src/agents/registry.js";
import { TeamManager } from "../../src/agents/teams.js";
import { PermissionManager } from "../../src/permissions/handler.js";
import { AskUserQuestionManager } from "../../src/permissions/ask-user.js";
import { createStore, type SessionStore } from "../../src/store/db.js";
import { SessionIndexer } from "../../src/store/indexer.js";
import { discoverSessions } from "../../src/sessions/discovery.js";

describe("session catalog API", () => {
  let server: MiddlewareServer;
  let store: SessionStore;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "cc-api-session-catalog-"));
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

    store = await createStore({ dbPath: join(tempDir, "catalog.db") });
    store.migrate();

    server = await createMiddlewareServer({
      host: "127.0.0.1",
      port: 0,
      sessionManager: new SessionManager(),
      eventBus: new HookEventBus(),
      blockingRegistry: new BlockingHookRegistry(),
      policyEngine: new PolicyEngine({ rules: [], defaultBehavior: "allow" }),
      agentRegistry: new AgentRegistry(),
      teamManager: new TeamManager({ teamsDir, tasksDir }),
      permissionManager: new PermissionManager(),
      askUserManager: new AskUserQuestionManager(),
      sessionStore: store,
      sessionIndexer: new SessionIndexer({ store, messageLimit: 10 }),
    });
  });

  beforeEach(() => {
    vi.mocked(discoverSessions).mockResolvedValue([
      {
        sessionId: "session-1",
        summary: "Main delivery session",
        customTitle: "Delivery review",
        firstPrompt: "Review the middleware session mapping",
        cwd: "/Users/zef/Desktop/cc-middleware",
        gitBranch: "main",
        createdAt: 10,
        lastModified: 50,
      },
      {
        sessionId: "session-2",
        summary: "Standalone session",
        firstPrompt: "Inspect runtime plugins",
        cwd: "/Users/zef/Desktop/cc-middleware",
        gitBranch: "feature/catalog",
        createdAt: 12,
        lastModified: 40,
      },
      {
        sessionId: "session-3",
        summary: "Different directory session",
        firstPrompt: "Explore another project",
        cwd: "/Users/zef/Desktop/another-project",
        createdAt: 15,
        lastModified: 30,
      },
    ]);

    store.db.exec(`
      DELETE FROM session_metadata_values;
      DELETE FROM session_metadata_definitions;
      DELETE FROM session_relationships;
      DELETE FROM messages;
      DELETE FROM sessions;
      DELETE FROM metadata;
    `);
    store.upsertSession({
      id: "session-1",
      project: "cc-middleware",
      cwd: "/Users/zef/Desktop/cc-middleware",
      summary: "Indexed main delivery session",
      customTitle: "Delivery review",
      firstPrompt: "Review the middleware session mapping",
      gitBranch: "main",
      status: "completed",
      createdAt: 10,
      lastModified: 50,
      messageCount: 11,
    });
    store.upsertSession({
      id: "session-2",
      project: "cc-middleware",
      cwd: "/Users/zef/Desktop/cc-middleware",
      summary: "Indexed standalone session",
      firstPrompt: "Inspect runtime plugins",
      gitBranch: "feature/catalog",
      status: "completed",
      createdAt: 12,
      lastModified: 40,
      messageCount: 5,
    });
    const now = Date.now();
    store.upsertSessionMetadataDefinition({
      key: "workflow",
      label: "Workflow",
      valueType: "string",
      searchable: true,
      filterable: true,
      createdAt: now,
      updatedAt: now,
    });
    store.setSessionMetadataValue({
      sessionId: "session-1",
      key: "workflow",
      value: "delivery-review",
      createdAt: now,
      updatedAt: now,
    });
    store.replaceRelationships("session-1", [
      {
        id: "rel-session-1",
        sessionId: "session-1",
        relationshipType: "subagent",
        path: "/tmp/reviewer.jsonl",
        agentId: "agent-reviewer",
        slug: "reviewer",
        lastModified: 50,
      },
    ]);
  });

  afterAll(async () => {
    await server.app.close();
    store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("lists enriched catalog sessions from the sessions endpoint", async () => {
    const response = await server.app.inject({
      method: "GET",
      url: "/api/v1/sessions?lineage=team",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.total).toBe(1);
    expect(body.sessions[0]).toMatchObject({
      id: "session-1",
      sessionId: "session-1",
      directoryPath: "/Users/zef/Desktop/cc-middleware",
      directoryName: "cc-middleware",
      indexed: true,
      project: "cc-middleware",
      messageCount: 11,
    });
    expect(body.sessions[0].metadata).toEqual([
      expect.objectContaining({
        key: "workflow",
        value: "delivery-review",
        label: "Workflow",
      }),
    ]);
    expect(body.sessions[0].lineage.teamNames).toEqual(["delivery"]);
    expect(body.sessions[0].lineage.teammateNames).toEqual(["reviewer"]);
  });

  it("groups catalog sessions by directory", async () => {
    const response = await server.app.inject({
      method: "GET",
      url: "/api/v1/sessions/directories?sessionLimit=1",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.totalDirectories).toBe(2);
    expect(body.totalSessions).toBe(3);
    expect(body.groups[0]).toMatchObject({
      path: "/Users/zef/Desktop/cc-middleware",
      sessionCount: 2,
      indexedSessionCount: 2,
      unindexedSessionCount: 0,
      teamSessionCount: 1,
      subagentSessionCount: 1,
      hasMoreSessions: true,
    });
    expect(body.groups[0].sessions).toHaveLength(1);
    expect(body.groups[1]).toMatchObject({
      path: "/Users/zef/Desktop/another-project",
      sessionCount: 1,
      indexedSessionCount: 0,
      unindexedSessionCount: 1,
      hasMoreSessions: false,
    });
  });

  it("lists and updates metadata definitions and values through the sessions API", async () => {
    const definitionsResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/sessions/metadata/definitions",
    });

    expect(definitionsResponse.statusCode).toBe(200);
    expect(definitionsResponse.json().definitions).toEqual([
      expect.objectContaining({
        key: "workflow",
        label: "Workflow",
      }),
    ]);

    const createDefinitionResponse = await server.app.inject({
      method: "POST",
      url: "/api/v1/sessions/metadata/definitions",
      payload: {
        key: "owner",
        label: "Owner",
        searchable: true,
        filterable: true,
      },
    });

    expect(createDefinitionResponse.statusCode).toBe(201);
    expect(createDefinitionResponse.json().definition).toMatchObject({
      key: "owner",
      label: "Owner",
    });

    const setValueResponse = await server.app.inject({
      method: "PUT",
      url: "/api/v1/sessions/session-2/metadata",
      payload: {
        key: "owner",
        value: "platform",
      },
    });

    expect(setValueResponse.statusCode).toBe(200);
    expect(setValueResponse.json().metadata).toEqual([
      expect.objectContaining({
        key: "owner",
        value: "platform",
      }),
    ]);
  });
});
