import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { encodeProjectPath } from "../../src/sessions/transcripts.js";
import { createAnalyticsDatabase } from "../../src/analytics/db.js";
import { discoverTranscriptFiles } from "../../src/analytics/backfill/transcript-discovery.js";
import { parseTranscriptFile } from "../../src/analytics/backfill/transcript-parser.js";
import { importTranscriptBackfill } from "../../src/analytics/backfill/import-transcripts.js";
import { createDuckDbTranscriptEventSink } from "../../src/analytics/backfill/duckdb-sink.js";
import type { RawTranscriptEventRecord } from "../../src/analytics/backfill/types.js";
import type { AnalyticsDatabase } from "../../src/analytics/types.js";

let tempDir: string;
let analyticsDb: AnalyticsDatabase | undefined;

function fixturePath(name: string): string {
  return join(process.cwd(), "tests", "fixtures", "analytics", "transcripts", name);
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "cc-analytics-backfill-"));
});

afterEach(() => {
  analyticsDb?.close();
  analyticsDb = undefined;
  rmSync(tempDir, { recursive: true, force: true });
});

function seedTranscriptFixtures(): { projectsRoot: string; rootSessionId: string } {
  const cwd = "/tmp/demo-project";
  const rootSessionId = "root-session-1";
  const projectDir = join(tempDir, encodeProjectPath(cwd));
  const subagentDir = join(projectDir, rootSessionId, "subagents");

  mkdirSync(subagentDir, { recursive: true });
  cpSync(fixturePath("root-session.jsonl"), join(projectDir, `${rootSessionId}.jsonl`));
  cpSync(fixturePath("subagent-session.jsonl"), join(subagentDir, "agent-review-1.jsonl"));

  return {
    projectsRoot: tempDir,
    rootSessionId,
  };
}

describe("analytics transcript backfill", () => {
  it("discovers root and sidechain transcript files", async () => {
    const { projectsRoot } = seedTranscriptFixtures();

    const files = await discoverTranscriptFiles({ projectsRoot });

    expect(files).toHaveLength(2);
    expect(files.map((file) => file.transcriptKind)).toEqual(["subagent", "root"]);
    expect(files.map((file) => file.rootSessionId)).toEqual([
      "root-session-1",
      "root-session-1",
    ]);
  });

  it("parses raw transcript lines into normalized event records", async () => {
    const { projectsRoot, rootSessionId } = seedTranscriptFixtures();
    const files = await discoverTranscriptFiles({ projectsRoot, rootSessionId });
    const rootFile = files.find((file) => file.transcriptKind === "root");

    expect(rootFile).toBeDefined();

    const events = await parseTranscriptFile(rootFile!);
    expect(events).toHaveLength(6);
    expect(events[0].eventType).toBe("user");
    expect(events[1].eventType).toBe("assistant");
    expect(events[1].sessionId).toBe("root-session-1");
    expect(events[1].payload.message).toBeDefined();

    const compactBoundary = events.find((event) => event.eventSubtype === "compact_boundary");
    expect(compactBoundary).toBeDefined();

    const apiErrorEvent = events.find(
      (event) =>
        event.eventType === "assistant"
        && event.payload.isApiErrorMessage === true
        && event.payload.error === "rate_limit"
    );
    expect(apiErrorEvent).toBeDefined();
  });

  it("imports discovered transcript events through a sink interface", async () => {
    const { projectsRoot } = seedTranscriptFixtures();
    const importedBatches: RawTranscriptEventRecord[][] = [];

    const stats = await importTranscriptBackfill({
      projectsRoot,
      sink: {
        writeRawTranscriptEvents(events) {
          importedBatches.push(events);
        },
      },
    });

    expect(stats.filesDiscovered).toBe(2);
    expect(stats.filesImported).toBe(2);
    expect(stats.eventsImported).toBe(8);

    const flattened = importedBatches.flat();
    expect(flattened.some((event) => event.transcriptKind === "subagent")).toBe(true);
    expect(flattened.some((event) => event.eventType === "queue-operation")).toBe(true);
    expect(
      flattened.some(
        (event) =>
          event.sourceToolAssistantUUID === "root-assistant-1"
          && event.agentId === "agent-review-1"
          && event.teamName === "delivery"
      )
    ).toBe(true);
  });

  it("imports transcript events into the DuckDB raw transcript table", async () => {
    const { projectsRoot } = seedTranscriptFixtures();
    analyticsDb = await createAnalyticsDatabase({
      dbPath: join(tempDir, "analytics.duckdb"),
    });

    const stats = await importTranscriptBackfill({
      projectsRoot,
      sink: createDuckDbTranscriptEventSink(analyticsDb),
    });

    expect(stats.eventsImported).toBe(8);

    const rows = await analyticsDb.connection.runAndReadAll(`
      SELECT event_type, event_subtype, session_id
      FROM raw_transcript_events
      ORDER BY source_path, source_line
    `);

    const eventRows = rows.getRowObjects();
    expect(eventRows).toHaveLength(8);
    expect(
      eventRows.some(
        (row) =>
          row.event_type === "system"
          && row.event_subtype === "compact_boundary"
          && row.session_id === "root-session-1"
      )
    ).toBe(true);
    expect(
      eventRows.some(
        (row) =>
          row.event_type === "queue-operation"
          && row.session_id === "agent-review-1"
      )
    ).toBe(true);
  });
});
