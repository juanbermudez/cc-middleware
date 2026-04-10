import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAnalyticsDatabase } from "../../src/analytics/db.js";
import {
  createDuckDbLiveAnalyticsSink,
  recordLiveHookEvent,
  recordLivePermissionEvent,
  recordLiveSdkMessage,
  setLiveAnalyticsSink,
} from "../../src/analytics/live/index.js";
import type { AnalyticsDatabase } from "../../src/analytics/types.js";

let tempDir: string;
let analyticsDb: AnalyticsDatabase | undefined;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "cc-live-analytics-"));
});

afterEach(() => {
  setLiveAnalyticsSink();
  analyticsDb?.close();
  analyticsDb = undefined;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("live analytics DuckDB sink", () => {
  it("persists raw live records with stable dedupe keys and synthetic source markers", async () => {
    analyticsDb = await createAnalyticsDatabase({
      dbPath: join(tempDir, "analytics.duckdb"),
    });

    setLiveAnalyticsSink(createDuckDbLiveAnalyticsSink(analyticsDb));

    const sdkMessage = {
      kind: "sdk_message" as const,
      source: "api" as const,
      captureRawMessages: true,
      runId: "run-live-1",
      label: "launch-test",
      sessionId: "session-live-1",
      cwd: "/tmp/project",
      recordedAt: 1_730_000_000_000,
      phase: "launch" as const,
      messageType: "result",
      message: {
        type: "result",
        session_id: "session-live-1",
        subtype: "success",
      },
      prompt: "hello world",
    };

    await recordLiveSdkMessage(sdkMessage);
    await recordLiveSdkMessage({
      ...sdkMessage,
      recordedAt: sdkMessage.recordedAt + 1,
    });

    await recordLiveHookEvent({
      kind: "hook_event",
      source: "websocket",
      captureRawMessages: true,
      runId: "hook-run-1",
      label: "hook-test",
      sessionId: "session-live-1",
      cwd: "/tmp/project",
      recordedAt: 1_730_000_000_100,
      eventType: "PermissionRequest",
      input: {
        session_id: "session-live-1",
        cwd: "/tmp/project",
        hook_event_name: "PermissionRequest",
        tool_name: "Bash",
      },
    });

    await recordLivePermissionEvent({
      kind: "permission_event",
      source: "internal",
      captureRawMessages: true,
      runId: "perm-run-1",
      label: "permission-test",
      sessionId: "session-live-1",
      cwd: "/tmp/project",
      recordedAt: 1_730_000_000_200,
      decision: "request",
      toolName: "Bash",
      input: { command: "ls" },
      toolUseID: "tool-1",
      agentID: "agent-1",
      message: "Permission request pending external resolution",
    });

    const sdkRows = (await analyticsDb.connection.runAndReadAll(`
      SELECT source_path, event_type, event_subtype, session_id
      FROM raw_middleware_sdk_messages
    `)).getRowObjects();
    expect(sdkRows).toHaveLength(1);
    expect(sdkRows[0]).toMatchObject({
      source_path: "middleware://live/api/sdk_message/launch",
      event_type: "sdk_message",
      event_subtype: "launch:result",
      session_id: "session-live-1",
    });

    const hookRows = (await analyticsDb.connection.runAndReadAll(`
      SELECT source_path, hook_event_name, session_id
      FROM raw_hook_events
    `)).getRowObjects();
    expect(hookRows).toHaveLength(1);
    expect(hookRows[0]).toMatchObject({
      source_path: "middleware://live/websocket/hook_event",
      hook_event_name: "PermissionRequest",
      session_id: "session-live-1",
    });

    const permissionRows = (await analyticsDb.connection.runAndReadAll(`
      SELECT source_path, tool_name, decision, session_id, cwd
      FROM raw_permission_events
    `)).getRowObjects();
    expect(permissionRows).toHaveLength(1);
    expect(permissionRows[0]).toMatchObject({
      source_path: "middleware://live/internal/permission_event",
      tool_name: "Bash",
      decision: "request",
      session_id: "session-live-1",
      cwd: "/tmp/project",
    });
  });
});
