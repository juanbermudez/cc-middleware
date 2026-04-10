import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAnalyticsDatabase } from "../../src/analytics/db.js";
import {
  createDuckDbOtelEventSink,
  discoverOtelFiles,
  importOtelBackfill,
  parseOtelFile,
} from "../../src/analytics/otel/index.js";
import type { AnalyticsDatabase } from "../../src/analytics/types.js";

let tempDir: string;
let analyticsDb: AnalyticsDatabase | undefined;

function fixturePath(name: string): string {
  return join(process.cwd(), "tests", "fixtures", "analytics", "otel", name);
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "cc-analytics-otel-"));
});

afterEach(() => {
  analyticsDb?.close();
  analyticsDb = undefined;
  rmSync(tempDir, { recursive: true, force: true });
});

function seedOtelFixtures(): string {
  const telemetryRoot = join(tempDir, "telemetry");
  mkdirSync(telemetryRoot, { recursive: true });
  cpSync(fixturePath("claude-telemetry.jsonl"), join(telemetryRoot, "claude-telemetry.jsonl"));
  cpSync(fixturePath("span.jsonl"), join(telemetryRoot, "span.jsonl"));
  return telemetryRoot;
}

describe("analytics OTel importer", () => {
  it("discovers telemetry files and parses logs and spans", async () => {
    const telemetryRoot = seedOtelFixtures();

    const files = await discoverOtelFiles(telemetryRoot);
    expect(files).toHaveLength(2);

    const parsedLogs = await parseOtelFile(join(telemetryRoot, "claude-telemetry.jsonl"));
    expect(parsedLogs.logs).toHaveLength(2);
    expect(parsedLogs.logs[0]).toMatchObject({
      sessionId: "root-session-1",
      traceId: "trace-chain-1",
      spanId: "req-1",
      eventName: "tengu_api_success",
    });

    const parsedSpan = await parseOtelFile(join(telemetryRoot, "span.jsonl"));
    expect(parsedSpan.spans).toHaveLength(1);
    expect(parsedSpan.spans[0]).toMatchObject({
      traceId: "otel-trace-1",
      spanId: "otel-span-1",
      parentSpanId: "otel-parent-1",
      spanName: "Claude Code API request",
    });
  });

  it("redacts sensitive prompt and tool payloads by default", async () => {
    const telemetryRoot = seedOtelFixtures();
    const parsed = await parseOtelFile(join(telemetryRoot, "claude-telemetry.jsonl"));
    const payloadJson = JSON.stringify(parsed.logs[0].payload);

    expect(payloadJson).not.toContain("show me the password");
    expect(payloadJson).not.toContain("cat secrets.txt");
    expect(payloadJson).toContain("[REDACTED]");
  });

  it("imports telemetry idempotently into DuckDB and supports opt-in sensitive parsing", async () => {
    const telemetryRoot = seedOtelFixtures();
    analyticsDb = await createAnalyticsDatabase({
      dbPath: join(tempDir, "analytics.duckdb"),
    });

    const parsedSensitive = await parseOtelFile(join(telemetryRoot, "claude-telemetry.jsonl"), {
      includeSensitivePayload: true,
    });
    expect(JSON.stringify(parsedSensitive.logs[0].payload)).toContain("show me the password");

    const sink = createDuckDbOtelEventSink(analyticsDb);
    const firstStats = await importOtelBackfill({
      sink,
      rootDir: telemetryRoot,
    });
    const secondStats = await importOtelBackfill({
      sink,
      rootDir: telemetryRoot,
      includeSensitivePayload: true,
    });

    expect(firstStats).toMatchObject({
      filesDiscovered: 2,
      filesImported: 2,
      logsImported: 2,
      spansImported: 1,
    });
    expect(secondStats.logsImported).toBe(2);

    const logRows = (await analyticsDb.connection.runAndReadAll(`
      SELECT event_name, session_id, trace_id, span_id, CAST(payload_json AS VARCHAR) AS payload_json
      FROM raw_otel_logs
      ORDER BY source_path, source_line
    `)).getRowObjects();
    expect(logRows).toHaveLength(2);
    expect(logRows[0]).toMatchObject({
      event_name: "tengu_api_success",
      session_id: "root-session-1",
      trace_id: "trace-chain-1",
      span_id: "req-1",
    });
    expect(String(logRows[0].payload_json)).not.toContain("show me the password");

    const spanRows = (await analyticsDb.connection.runAndReadAll(`
      SELECT span_name, trace_id, span_id, CAST(payload_json AS VARCHAR) AS payload_json
      FROM raw_otel_spans
    `)).getRowObjects();
    expect(spanRows).toHaveLength(1);
    expect(spanRows[0]).toMatchObject({
      span_name: "Claude Code API request",
      trace_id: "otel-trace-1",
      span_id: "otel-span-1",
    });
    expect(String(spanRows[0].payload_json)).not.toContain("do not store this raw prompt");
  });
});
