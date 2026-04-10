/**
 * E2E test: source-of-truth session detail endpoint.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createMiddlewareServer } from "../../src/api/server.js";
import { SessionManager } from "../../src/sessions/manager.js";
import { HookEventBus } from "../../src/hooks/event-bus.js";
import { BlockingHookRegistry } from "../../src/hooks/blocking.js";
import { PolicyEngine } from "../../src/permissions/policy.js";
import { AgentRegistry } from "../../src/agents/registry.js";
import { TeamManager } from "../../src/agents/teams.js";
import { PermissionManager } from "../../src/permissions/handler.js";
import { AskUserQuestionManager } from "../../src/permissions/ask-user.js";
import { buildSessionDetail } from "../../src/sessions/detail.js";
import type { MiddlewareServer } from "../../src/api/server.js";

vi.mock("../../src/sessions/detail.js", () => ({
  buildSessionDetail: vi.fn(),
}));

let server: MiddlewareServer;
let baseUrl: string;

beforeAll(async () => {
  const port = 14200 + Math.floor(Math.random() * 1000);
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

describe("Session detail endpoint (E2E)", () => {
  it("returns a transcript detail payload", async () => {
    const mockDetail = {
      sessionId: "root-session-1",
      rootSessionId: "root-session-1",
      session: {
        sessionId: "root-session-1",
        summary: "detail summary",
        lastModified: Date.now(),
      },
      transcript: {
        messages: [],
        turns: [],
      },
      inspector: {
        files: [],
        tools: [],
        errors: [],
        skills: [],
        configuration: {
          rootSessionId: "root-session-1",
          transcriptKind: "root",
          transcriptPath: "/tmp/project/root-session-1.jsonl",
          transcriptPaths: ["/tmp/project/root-session-1.jsonl"],
          firstSeenAt: Date.now(),
          lastSeenAt: Date.now(),
        },
        subagents: [],
        metadata: [],
      },
      lineage: {
        kind: "root",
        sessionId: "root-session-1",
        rootSessionId: "root-session-1",
        subagentCount: 0,
        subagents: [],
      },
    };

    vi.mocked(buildSessionDetail).mockResolvedValueOnce(mockDetail as never);

    const resp = await fetch(`${baseUrl}/api/v1/sessions/root-session-1/detail?rootSessionId=root-session-1`);
    expect(resp.status).toBe(200);

    const body = await resp.json();
    expect(body.sessionId).toBe("root-session-1");
    expect(body.lineage.kind).toBe("root");
    expect(vi.mocked(buildSessionDetail)).toHaveBeenCalledWith(
      "root-session-1",
      expect.objectContaining({ rootSessionId: "root-session-1" })
    );
  });

  it("returns 404 when the transcript cannot be resolved", async () => {
    vi.mocked(buildSessionDetail).mockResolvedValueOnce(undefined as never);

    const resp = await fetch(`${baseUrl}/api/v1/sessions/missing/detail`);
    expect(resp.status).toBe(404);

    const body = await resp.json();
    expect(body.error.code).toBe("SESSION_NOT_FOUND");
  });
});
