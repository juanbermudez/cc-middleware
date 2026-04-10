import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMiddlewareServer, type MiddlewareServer } from "../../src/api/server.js";
import { SessionManager } from "../../src/sessions/manager.js";
import { HookEventBus } from "../../src/hooks/event-bus.js";
import { BlockingHookRegistry } from "../../src/hooks/blocking.js";
import { PolicyEngine } from "../../src/permissions/policy.js";
import { AgentRegistry } from "../../src/agents/registry.js";
import { TeamManager } from "../../src/agents/teams.js";
import { PermissionManager } from "../../src/permissions/handler.js";
import { AskUserQuestionManager } from "../../src/permissions/ask-user.js";

describe("task endpoints (E2E)", () => {
  let server: MiddlewareServer;
  let baseUrl: string;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "cc-api-tasks-"));
    const teamsDir = join(tempDir, "teams");
    const tasksDir = join(tempDir, "tasks");

    mkdirSync(join(teamsDir, "delivery"), { recursive: true });
    mkdirSync(join(teamsDir, "platform"), { recursive: true });
    mkdirSync(join(tasksDir, "delivery"), { recursive: true });
    mkdirSync(join(tasksDir, "platform"), { recursive: true });

    writeFileSync(
      join(teamsDir, "delivery", "config.json"),
      JSON.stringify({
        name: "delivery",
        members: [{ name: "reviewer", agentId: "reviewer-agent", status: "active" }],
      })
    );
    writeFileSync(
      join(teamsDir, "platform", "config.json"),
      JSON.stringify({
        name: "platform",
        members: [{ name: "ops", agentId: "ops-agent", status: "active" }],
      })
    );

    writeFileSync(
      join(tasksDir, "delivery", "task-1.json"),
      JSON.stringify({
        id: "task-1",
        description: "Review search indexing",
        status: "pending",
        assignee: "reviewer",
        dependencies: ["task-0"],
      })
    );
    writeFileSync(
      join(tasksDir, "delivery", "task-2.json"),
      JSON.stringify({
        id: "task-2",
        description: "Ship team task UI",
        status: "completed",
        assignee: "reviewer",
        dependencies: [],
      })
    );
    writeFileSync(
      join(tasksDir, "platform", "task-3.json"),
      JSON.stringify({
        id: "task-3",
        description: "Audit runtime metadata",
        status: "in_progress",
        assignee: "ops",
        dependencies: [],
      })
    );

    const port = 15500 + Math.floor(Math.random() * 1000);

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
    });

    const addr = await server.start();
    baseUrl = `http://${addr.host}:${addr.port}`;
  });

  afterAll(async () => {
    await server.stop();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("lists all team tasks across discovered teams", async () => {
    const response = await fetch(`${baseUrl}/api/v1/tasks`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.total).toBe(3);
    expect(body.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceId: "delivery::task-1",
          id: "task-1",
          teamName: "delivery",
          status: "pending",
        }),
        expect.objectContaining({
          resourceId: "platform::task-3",
          id: "task-3",
          teamName: "platform",
          status: "in_progress",
        }),
      ])
    );
  });

  it("filters teams by query", async () => {
    const response = await fetch(`${baseUrl}/api/v1/teams?q=reviewer`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.teams[0]).toMatchObject({
      name: "delivery",
      memberCount: 1,
    });
  });

  it("filters team tasks by team, status, and search query", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/tasks?team=delivery&status=completed&q=ui`
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.tasks[0]).toMatchObject({
      resourceId: "delivery::task-2",
      id: "task-2",
      teamName: "delivery",
      status: "completed",
    });
  });

  it("lists a single team's task inventory with enriched metadata", async () => {
    const response = await fetch(`${baseUrl}/api/v1/teams/delivery/tasks?q=reviewer`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.teamName).toBe("delivery");
    expect(body.total).toBe(2);
    expect(body.tasks[0]).toEqual(
      expect.objectContaining({
        teamName: "delivery",
        teamConfigPath: expect.stringContaining("/teams/delivery/config.json"),
        taskListPath: expect.stringContaining("/tasks/delivery"),
        filePath: expect.stringContaining("/tasks/delivery/"),
      })
    );
  });
});
