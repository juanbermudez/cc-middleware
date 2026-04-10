import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { createMiddlewareServer, type MiddlewareServer } from "../../src/api/server.js";
import { SessionManager } from "../../src/sessions/manager.js";
import { HookEventBus } from "../../src/hooks/event-bus.js";
import { BlockingHookRegistry } from "../../src/hooks/blocking.js";
import { PolicyEngine } from "../../src/permissions/policy.js";
import { AgentRegistry } from "../../src/agents/registry.js";
import { TeamManager } from "../../src/agents/teams.js";
import { PermissionManager } from "../../src/permissions/handler.js";
import { AskUserQuestionManager } from "../../src/permissions/ask-user.js";
import { createDispatchStore } from "../../src/dispatch/store.js";

let server: MiddlewareServer;
let baseUrl: string;
let db: Database.Database;

beforeAll(async () => {
  db = new Database(":memory:");
  const dispatchStore = createDispatchStore(db);
  dispatchStore.migrate();

  const port = 15000 + Math.floor(Math.random() * 1000);
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
    dispatchStore,
  });

  const addr = await server.start();
  baseUrl = `http://${addr.host}:${addr.port}`;
});

afterAll(async () => {
  await server.stop();
  db.close();
});

describe("Dispatch API (E2E)", () => {
  it("creates and lists manual dispatch jobs", async () => {
    const createResp = await fetch(`${baseUrl}/api/v1/dispatch/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Summarize the last tool run",
        targetType: "new_session",
        runtimeProfile: "claude_runtime",
      }),
    });

    expect(createResp.status).toBe(201);
    const created = await createResp.json();
    expect(created.job.id).toBeDefined();
    expect(created.job.sourceType).toBe("manual");

    const listResp = await fetch(`${baseUrl}/api/v1/dispatch/jobs`);
    expect(listResp.status).toBe(200);
    const listBody = await listResp.json();
    expect(listBody.jobs).toHaveLength(1);

    const statusResp = await fetch(`${baseUrl}/api/v1/dispatch/status`);
    expect(statusResp.status).toBe(200);
    const statusBody = await statusResp.json();
    expect(statusBody.summary.totalJobs).toBe(1);
    expect(statusBody.summary.queuedJobs).toBe(1);
  });

  it("requires sessionId for session-targeted jobs", async () => {
    const resp = await fetch(`${baseUrl}/api/v1/dispatch/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Resume without a session",
        targetType: "resume_session",
      }),
    });

    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("persists cue, schedule, and heartbeat rule definitions", async () => {
    const cueResp = await fetch(`${baseUrl}/api/v1/dispatch/cues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "On Read",
        trigger: { eventType: "PreToolUse", toolName: "Read" },
        action: {
          prompt: "Review the read action",
          targetType: "resume_session",
          runtimeProfile: "claude_runtime",
        },
      }),
    });
    expect(cueResp.status).toBe(201);

    const scheduleResp = await fetch(`${baseUrl}/api/v1/dispatch/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Nightly",
        cron: "0 0 * * *",
        timezone: "UTC",
        prompt: "Nightly review",
        targetType: "resume_session",
        sessionId: "session-schedule-1",
      }),
    });
    expect(scheduleResp.status).toBe(201);
    const createdSchedule = await scheduleResp.json();
    expect(createdSchedule.schedule.sessionId).toBe("session-schedule-1");

    const heartbeatResp = await fetch(`${baseUrl}/api/v1/dispatch/heartbeat-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Queue heartbeat",
        intervalMs: 30000,
        prompt: "Heartbeat review",
        targetType: "resume_session",
        sessionId: "session-heartbeat-1",
      }),
    });
    expect(heartbeatResp.status).toBe(201);
    const createdHeartbeat = await heartbeatResp.json();
    expect(createdHeartbeat.rule.sessionId).toBe("session-heartbeat-1");

    const cues = await (await fetch(`${baseUrl}/api/v1/dispatch/cues`)).json();
    const schedules = await (await fetch(`${baseUrl}/api/v1/dispatch/schedules`)).json();
    const heartbeatRules = await (await fetch(`${baseUrl}/api/v1/dispatch/heartbeat-rules`)).json();

    expect(cues.cues).toHaveLength(1);
    expect(schedules.schedules).toHaveLength(1);
    expect(schedules.schedules[0].sessionId).toBe("session-schedule-1");
    expect(heartbeatRules.rules).toHaveLength(1);
    expect(heartbeatRules.rules[0].sessionId).toBe("session-heartbeat-1");
  });
});
