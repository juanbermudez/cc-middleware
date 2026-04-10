import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMiddlewareServer, type MiddlewareServer } from "../../src/api/server.js";
import { createAnalyticsDatabase } from "../../src/analytics/db.js";
import {
  createDuckDbTranscriptEventSink,
  importTranscriptBackfill,
} from "../../src/analytics/backfill/index.js";
import { refreshDerivedAnalyticsTables } from "../../src/analytics/index.js";
import { encodeProjectPath } from "../../src/sessions/transcripts.js";
import { SessionManager } from "../../src/sessions/manager.js";
import { HookEventBus } from "../../src/hooks/event-bus.js";
import { BlockingHookRegistry } from "../../src/hooks/blocking.js";
import { PolicyEngine } from "../../src/permissions/policy.js";
import { AgentRegistry } from "../../src/agents/registry.js";
import { TeamManager } from "../../src/agents/teams.js";
import { PermissionManager } from "../../src/permissions/handler.js";
import { AskUserQuestionManager } from "../../src/permissions/ask-user.js";
import type { AnalyticsDatabase } from "../../src/analytics/types.js";

function fixturePath(name: string): string {
  return join(process.cwd(), "tests", "fixtures", "analytics", "transcripts", name);
}

function otelFixturePath(name: string): string {
  return join(process.cwd(), "tests", "fixtures", "analytics", "otel", name);
}

function createServer(
  analyticsDatabase?: AnalyticsDatabase,
  teamManager?: TeamManager
): Promise<MiddlewareServer> {
  return createMiddlewareServer({
    host: "127.0.0.1",
    port: 0,
    sessionManager: new SessionManager(),
    eventBus: new HookEventBus(),
    blockingRegistry: new BlockingHookRegistry(),
    policyEngine: new PolicyEngine({ rules: [], defaultBehavior: "allow" }),
    agentRegistry: new AgentRegistry(),
    teamManager: teamManager ?? new TeamManager(),
    permissionManager: new PermissionManager(),
    askUserManager: new AskUserQuestionManager(),
    analytics: analyticsDatabase
      ? {
          database: analyticsDatabase,
        }
      : undefined,
  });
}

describe("analytics API", () => {
  let tempDir: string;
  let projectsRoot: string;
  let teamsDir: string;
  let tasksDir: string;
  let server: MiddlewareServer | undefined;
  let analyticsDb: AnalyticsDatabase | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cc-api-analytics-"));
    projectsRoot = join(tempDir, "projects");
    teamsDir = join(tempDir, "teams");
    tasksDir = join(tempDir, "tasks");
    mkdirSync(projectsRoot, { recursive: true });
    mkdirSync(teamsDir, { recursive: true });
    mkdirSync(tasksDir, { recursive: true });
  });

  afterAll(async () => {
    if (server) {
      await server.app.close();
    }
    analyticsDb?.close();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns 501 when analytics is not configured", async () => {
    server = await createServer(undefined, new TeamManager({ teamsDir, tasksDir }));

    const response = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/status",
    });

    expect(response.statusCode).toBe(501);
    expect(response.json()).toEqual({
      error: {
        code: "ANALYTICS_UNAVAILABLE",
        message: "Analytics database is not configured",
      },
    });

    await server.app.close();
    server = undefined;
  });

  it("reports status, overview, timeseries, traces, and backfill results from transcript history", async () => {
    const cwd = "/tmp/demo-project";
    const rootSessionId = "root-session-1";
    const projectDir = join(projectsRoot, encodeProjectPath(cwd));
    const subagentDir = join(projectDir, rootSessionId, "subagents");

    mkdirSync(subagentDir, { recursive: true });
    cpSync(fixturePath("root-session.jsonl"), join(projectDir, `${rootSessionId}.jsonl`));
    cpSync(fixturePath("subagent-session.jsonl"), join(subagentDir, "agent-review-1.jsonl"));

    analyticsDb = await createAnalyticsDatabase({
      dbPath: join(tempDir, "analytics.duckdb"),
    });

    await importTranscriptBackfill({
      projectsRoot,
      sink: createDuckDbTranscriptEventSink(analyticsDb),
    });
    await refreshDerivedAnalyticsTables(analyticsDb);

    server = await createServer(analyticsDb, new TeamManager({ teamsDir, tasksDir }));

    const statusResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/status",
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({
      available: true,
      rawTables: {
        transcriptEvents: 8,
        middlewareSdkMessages: 0,
        hookEvents: 0,
        permissionEvents: 0,
        otelLogs: 0,
        otelSpans: 0,
      },
      lastBackfillAt: null,
      lastBackfillFiles: null,
      lastBackfillEvents: null,
    });

    const overviewResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview",
    });

    expect(overviewResponse.statusCode).toBe(200);
    const overviewBody = overviewResponse.json();
    expect(overviewBody).toMatchObject({
      totals: {
        events: 8,
        traces: 2,
        errors: 2,
        keywordMentions: 1,
        toolUses: 1,
        inputTokens: 150,
        outputTokens: 53,
        cacheReadTokens: 55,
        cacheCreationTokens: 0,
        contextEstimateTokensPeak: 165,
      },
      sourceCounts: {
        transcriptEvents: 8,
      },
      keywordBreakdown: [
        {
          category: "frustration",
          term: "frustrated",
          count: 1,
        },
      ],
    });
    expect(overviewBody.totals.estimatedCostUsd).toBeGreaterThan(0);

    const timeseriesResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/timeseries?bucket=hour",
    });

    expect(timeseriesResponse.statusCode).toBe(200);
    const timeseriesBody = timeseriesResponse.json();
    expect(timeseriesBody.bucket).toBe("hour");
    expect(timeseriesBody.points).toHaveLength(1);
    expect(timeseriesBody.points[0]).toMatchObject({
      events: 8,
      traces: 2,
      errors: 2,
      keywordMentions: 1,
      toolUses: 1,
      inputTokens: 150,
      outputTokens: 53,
      contextEstimateTokensPeak: 165,
    });
    expect(timeseriesBody.points[0].bucket).toContain("2026-04-08T");
    expect(timeseriesBody.points[0].estimatedCostUsd).toBeGreaterThan(0);

    const tracesResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/traces?q=frustrated",
    });

    expect(tracesResponse.statusCode).toBe(200);
    const tracesBody = tracesResponse.json();
    expect(tracesBody).toMatchObject({
      total: 1,
      limit: 25,
      offset: 0,
      traces: [
        {
          traceId: "root-session-1:interaction:1",
          sessionId: "root-session-1",
          traceKind: "root",
          sourceKinds: ["transcript"],
          events: 6,
          errors: 2,
          keywordMentions: 1,
          toolUses: 1,
          inputTokens: 120,
          outputTokens: 35,
          contextEstimateTokensPeak: 165,
        },
      ],
    });
    expect(tracesBody.traces[0].estimatedCostUsd).toBeGreaterThan(0);

    const traceDetailResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/traces/root-session-1:interaction:1",
    });

    expect(traceDetailResponse.statusCode).toBe(200);
    expect(traceDetailResponse.json()).toMatchObject({
      trace: {
        traceId: "root-session-1:interaction:1",
        sessionId: "root-session-1",
        traceKind: "root",
        events: 6,
        errors: 2,
      },
      requests: [
        {
          model: "claude-sonnet-4-6",
          inputTokens: 120,
          outputTokens: 35,
        },
      ],
      toolCalls: [
        {
          toolUseId: "toolu_123",
          toolName: "Read",
          isError: true,
          errorMessage: "ENOENT: file not found",
        },
      ],
      errors: [
        {
          errorKind: "tool_error",
        },
        {
          errorKind: "api_error",
        },
      ],
      keywordMentions: [
        {
          category: "frustration",
          term: "frustrated",
        },
      ],
      compactions: [
        {
          compactionId: expect.any(String),
        },
      ],
    });

    const sessionDetailResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/sessions/root-session-1",
    });

    expect(sessionDetailResponse.statusCode).toBe(200);
    const sessionBody = sessionDetailResponse.json();
    expect(sessionBody).toMatchObject({
      sessionId: "root-session-1",
      traceCount: 2,
      totals: {
        events: 8,
        traces: 2,
        errors: 2,
        keywordMentions: 1,
        toolUses: 1,
        inputTokens: 150,
        outputTokens: 53,
        cacheReadTokens: 55,
        cacheCreationTokens: 0,
        contextEstimateTokensPeak: 165,
      },
      subagents: [
        {
          sessionId: "agent-review-1",
          agentId: "agent-review-1",
          slug: "reviewer",
        },
      ],
      tools: [
        {
          value: "Read",
          count: 1,
        },
      ],
      errorKinds: [
        {
          value: "api_error",
          count: 1,
        },
        {
          value: "tool_error",
          count: 1,
        },
      ],
      keywordCategories: [
        {
          value: "frustration",
          count: 1,
        },
      ],
      permissions: [],
    });
    expect(sessionBody.totals.estimatedCostUsd).toBeGreaterThan(0);

    const facetsResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/facets",
    });

    expect(facetsResponse.statusCode).toBe(200);
    const facetsBody = facetsResponse.json();
    expect(facetsBody).toMatchObject({
      traceKinds: [
        {
          value: "root",
          count: 1,
        },
        {
          value: "subagent",
          count: 1,
        },
      ],
      errorKinds: [
        {
          value: "api_error",
          count: 1,
        },
        {
          value: "tool_error",
          count: 1,
        },
      ],
      toolNames: [
        {
          value: "Read",
          count: 1,
        },
      ],
      keywordCategories: [
        {
          value: "frustration",
          count: 1,
        },
      ],
    });
    expect(facetsBody.sessions).toEqual(
      expect.arrayContaining([
        {
          value: "root-session-1",
          count: 1,
        },
        {
          value: "agent-review-1",
          count: 1,
        },
      ])
    );

    const toolPerformanceResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/tool-performance",
    });

    expect(toolPerformanceResponse.statusCode).toBe(200);
    expect(toolPerformanceResponse.json()).toMatchObject({
      rows: [
        {
          toolName: "Read",
          callCount: 1,
          errorCount: 1,
          errorRate: 1,
          sessionCount: 1,
          traceCount: 1,
          topErrorKind: "tool_error",
          topErrorCount: 1,
        },
      ],
    });

    const toolDetailResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/tool-performance/Read?traceKinds=root&toolNames=Read",
    });

    expect(toolDetailResponse.statusCode).toBe(200);
    expect(toolDetailResponse.json()).toMatchObject({
      tool: {
        toolName: "Read",
        callCount: 1,
        errorCount: 1,
        errorRate: 1,
        sessionCount: 1,
        traceCount: 1,
        topErrorKind: "tool_error",
        topErrorCount: 1,
        lastSeenAt: "2026-04-08T12:00:06.000Z",
      },
      errorKinds: [
        {
          value: "tool_error",
          count: 1,
        },
      ],
      recentFailures: [
        expect.objectContaining({
          traceId: "root-session-1:interaction:1",
          sessionId: "root-session-1",
          errorKind: "tool_error",
          message: expect.stringContaining("ENOENT"),
        }),
      ],
    });

    const backfillResponse = await server.app.inject({
      method: "POST",
      url: "/api/v1/analytics/backfill",
      payload: {
        projectsRoot,
      },
    });

    expect(backfillResponse.statusCode).toBe(200);
    expect(backfillResponse.json()).toEqual({
      filesDiscovered: 2,
      filesImported: 2,
      eventsImported: 8,
    });

    const statusAfterBackfillResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/status",
    });

    expect(statusAfterBackfillResponse.statusCode).toBe(200);
    expect(statusAfterBackfillResponse.json()).toMatchObject({
      lastBackfillFiles: 2,
      lastBackfillEvents: 8,
    });

    await server.app.close();
    server = undefined;
    analyticsDb.close();
    analyticsDb = undefined;
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  });

  it("applies time ranges using stored transcript timestamps across multiple day buckets", async () => {
    const cwd = "/tmp/range-demo-project";
    const rootSessionId = "range-session-1";
    const projectDir = join(projectsRoot, encodeProjectPath(cwd));

    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, `${rootSessionId}.jsonl`),
      [
        JSON.stringify({
          type: "user",
          sessionId: rootSessionId,
          timestamp: "2026-04-06T09:00:00.000Z",
          message: {
            role: "user",
            content: [{ type: "text", text: "First day prompt" }],
          },
        }),
        JSON.stringify({
          type: "assistant",
          sessionId: rootSessionId,
          timestamp: "2026-04-06T09:00:05.000Z",
          message: {
            id: "msg_range_1",
            model: "claude-sonnet-4-6",
            stop_reason: "end_turn",
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
            content: [{ type: "text", text: "First day response" }],
          },
        }),
        JSON.stringify({
          type: "user",
          sessionId: rootSessionId,
          timestamp: "2026-04-08T15:00:00.000Z",
          message: {
            role: "user",
            content: [{ type: "text", text: "Second day prompt" }],
          },
        }),
        JSON.stringify({
          type: "assistant",
          sessionId: rootSessionId,
          timestamp: "2026-04-08T15:00:05.000Z",
          message: {
            id: "msg_range_2",
            model: "claude-sonnet-4-6",
            stop_reason: "end_turn",
            usage: {
              input_tokens: 11,
              output_tokens: 6,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
            content: [{ type: "text", text: "Second day response" }],
          },
        }),
      ].join("\n") + "\n"
    );

    analyticsDb = await createAnalyticsDatabase({
      dbPath: join(tempDir, "analytics.duckdb"),
    });

    await importTranscriptBackfill({
      projectsRoot,
      sink: createDuckDbTranscriptEventSink(analyticsDb),
    });
    await refreshDerivedAnalyticsTables(analyticsDb);

    server = await createServer(analyticsDb, new TeamManager({ teamsDir, tasksDir }));

    const timeseriesResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/timeseries?bucket=day",
    });

    expect(timeseriesResponse.statusCode).toBe(200);
    const timeseriesBody = timeseriesResponse.json();
    expect(timeseriesBody.points).toHaveLength(2);
    expect(timeseriesBody.points.map((point: { bucket: string }) => point.bucket)).toEqual([
      "2026-04-06T00:00:00.000Z",
      "2026-04-08T00:00:00.000Z",
    ]);

    const filteredOverviewResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview?start=2026-04-08T00:00:00.000Z&end=2026-04-08T23:59:59.999Z",
    });

    expect(filteredOverviewResponse.statusCode).toBe(200);
    expect(filteredOverviewResponse.json()).toMatchObject({
      range: {
        start: "2026-04-08T00:00:00.000Z",
        end: "2026-04-08T23:59:59.999Z",
      },
      totals: {
        events: 2,
        traces: 1,
        inputTokens: 11,
        outputTokens: 6,
      },
    });

    const tracesResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/traces",
    });
    expect(tracesResponse.statusCode).toBe(200);
    expect(tracesResponse.json().traces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          startedAt: "2026-04-06T09:00:00.000Z",
          endedAt: "2026-04-06T09:00:05.000Z",
        }),
        expect.objectContaining({
          startedAt: "2026-04-08T15:00:00.000Z",
          endedAt: "2026-04-08T15:00:05.000Z",
        }),
      ])
    );

    await server.app.close();
    server = undefined;
    analyticsDb.close();
    analyticsDb = undefined;
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  });

  it("filters overview, timeseries, facets, and traces by analytics facets", async () => {
    const cwd = "/tmp/demo-project";
    const rootSessionId = "root-session-1";
    const projectDir = join(projectsRoot, encodeProjectPath(cwd));
    const subagentDir = join(projectDir, rootSessionId, "subagents");

    mkdirSync(subagentDir, { recursive: true });
    cpSync(fixturePath("root-session.jsonl"), join(projectDir, `${rootSessionId}.jsonl`));
    cpSync(fixturePath("subagent-session.jsonl"), join(subagentDir, "agent-review-1.jsonl"));

    analyticsDb = await createAnalyticsDatabase({
      dbPath: join(tempDir, "analytics.duckdb"),
    });

    await importTranscriptBackfill({
      projectsRoot,
      sink: createDuckDbTranscriptEventSink(analyticsDb),
    });
    await refreshDerivedAnalyticsTables(analyticsDb);

    server = await createServer(analyticsDb, new TeamManager({ teamsDir, tasksDir }));

    const overviewResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/overview?traceKinds=root&toolNames=Read&errorKinds=tool_error&keywordCategories=frustration",
    });

    expect(overviewResponse.statusCode).toBe(200);
    expect(overviewResponse.json()).toMatchObject({
      totals: {
        events: 6,
        traces: 1,
        errors: 2,
        keywordMentions: 1,
        toolUses: 1,
        inputTokens: 120,
        outputTokens: 35,
      },
      keywordBreakdown: [
        {
          category: "frustration",
          term: "frustrated",
          count: 1,
        },
      ],
    });

    const timeseriesResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/timeseries?bucket=hour&traceKinds=root&toolNames=Read",
    });

    expect(timeseriesResponse.statusCode).toBe(200);
    expect(timeseriesResponse.json()).toMatchObject({
      bucket: "hour",
      points: [
        {
          bucket: "2026-04-08T12:00:00.000Z",
          events: 6,
          traces: 1,
          errors: 2,
          keywordMentions: 1,
          toolUses: 1,
          inputTokens: 120,
          outputTokens: 35,
        },
      ],
    });

    const toolPerformanceResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/tool-performance?traceKinds=root&toolNames=Read",
    });

    expect(toolPerformanceResponse.statusCode).toBe(200);
    expect(toolPerformanceResponse.json()).toMatchObject({
      rows: [
        {
          toolName: "Read",
          callCount: 1,
          errorCount: 1,
          errorRate: 1,
          sessionCount: 1,
          traceCount: 1,
          topErrorKind: "tool_error",
          topErrorCount: 1,
          lastSeenAt: "2026-04-08T12:00:06.000Z",
        },
      ],
    });

    const facetsResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/facets?traceKinds=root",
    });

    expect(facetsResponse.statusCode).toBe(200);
    expect(facetsResponse.json()).toMatchObject({
      traceKinds: [
        {
          value: "root",
          count: 1,
        },
      ],
      errorKinds: [
        {
          value: "api_error",
          count: 1,
        },
        {
          value: "tool_error",
          count: 1,
        },
      ],
      toolNames: [
        {
          value: "Read",
          count: 1,
        },
      ],
      keywordCategories: [
        {
          value: "frustration",
          count: 1,
        },
      ],
      sessions: [
        {
          value: "root-session-1",
          count: 1,
        },
      ],
    });

    const tracesResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/traces?traceKinds=subagent",
    });

    expect(tracesResponse.statusCode).toBe(200);
    expect(tracesResponse.json()).toMatchObject({
      total: 1,
      traces: [
        {
          traceId: "agent-review-1:interaction:1",
          sessionId: "agent-review-1",
          traceKind: "subagent",
          events: 2,
          errors: 0,
          toolUses: 0,
          inputTokens: 30,
          outputTokens: 18,
        },
      ],
    });

    await server.app.close();
    server = undefined;
    analyticsDb.close();
    analyticsDb = undefined;
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  });

  it("optionally backfills telemetry enrichment without changing transcript requirements", async () => {
    const cwd = "/tmp/demo-project";
    const rootSessionId = "root-session-1";
    const projectDir = join(projectsRoot, encodeProjectPath(cwd));
    const telemetryRoot = join(tempDir, "telemetry");

    mkdirSync(projectDir, { recursive: true });
    mkdirSync(telemetryRoot, { recursive: true });
    cpSync(fixturePath("root-session.jsonl"), join(projectDir, `${rootSessionId}.jsonl`));
    cpSync(otelFixturePath("claude-telemetry.jsonl"), join(telemetryRoot, "claude-telemetry.jsonl"));
    cpSync(otelFixturePath("span.jsonl"), join(telemetryRoot, "span.jsonl"));

    analyticsDb = await createAnalyticsDatabase({
      dbPath: join(tempDir, "analytics.duckdb"),
    });
    server = await createServer(analyticsDb, new TeamManager({ teamsDir, tasksDir }));

    const backfillResponse = await server.app.inject({
      method: "POST",
      url: "/api/v1/analytics/backfill",
      payload: {
        projectsRoot,
        includeOtel: true,
        otelRoot: telemetryRoot,
      },
    });

    expect(backfillResponse.statusCode).toBe(200);
    expect(backfillResponse.json()).toEqual({
      filesDiscovered: 1,
      filesImported: 1,
      eventsImported: 6,
      otel: {
        filesDiscovered: 2,
        filesImported: 2,
        logsImported: 2,
        spansImported: 1,
        includeSensitivePayload: false,
      },
    });

    const statusResponse = await server.app.inject({
      method: "GET",
      url: "/api/v1/analytics/status",
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({
      rawTables: {
        transcriptEvents: 6,
        otelLogs: 2,
        otelSpans: 1,
      },
      lastBackfillFiles: 1,
      lastBackfillEvents: 6,
    });

    const rawOtelRow = (await analyticsDb.connection.runAndReadAll(`
      SELECT CAST(payload_json AS VARCHAR) AS payload_json
      FROM raw_otel_logs
      ORDER BY source_path, source_line
      LIMIT 1
    `)).getRowObjects()[0];
    expect(String(rawOtelRow.payload_json)).not.toContain("show me the password");

    await server.app.close();
    server = undefined;
    analyticsDb.close();
    analyticsDb = undefined;
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  });
});
