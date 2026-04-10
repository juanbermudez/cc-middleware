import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAnalyticsDatabase } from "../../src/analytics/db.js";
import {
  createDuckDbTranscriptEventSink,
  importTranscriptBackfill,
} from "../../src/analytics/backfill/index.js";
import {
  createDuckDbLiveAnalyticsSink,
  recordLivePermissionEvent,
  refreshDerivedAnalyticsTables,
  setLiveAnalyticsSink,
} from "../../src/analytics/index.js";
import { encodeProjectPath } from "../../src/sessions/transcripts.js";
import type { AnalyticsDatabase } from "../../src/analytics/types.js";

function fixturePath(name: string): string {
  return join(process.cwd(), "tests", "fixtures", "analytics", "transcripts", name);
}

let tempDir: string;
let analyticsDb: AnalyticsDatabase | undefined;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "cc-analytics-derive-"));
});

afterEach(() => {
  setLiveAnalyticsSink();
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

describe("analytics derived tables", () => {
  it("refreshes facts and rollups from transcript and permission raw events", async () => {
    const { projectsRoot } = seedTranscriptFixtures();
    analyticsDb = await createAnalyticsDatabase({
      dbPath: join(tempDir, "analytics.duckdb"),
    });

    await importTranscriptBackfill({
      projectsRoot,
      sink: createDuckDbTranscriptEventSink(analyticsDb),
    });

    setLiveAnalyticsSink(createDuckDbLiveAnalyticsSink(analyticsDb));
    await recordLivePermissionEvent({
      kind: "permission_event",
      source: "internal",
      captureRawMessages: true,
      runId: "perm-run-1",
      sessionId: "root-session-1",
      cwd: "/tmp/demo-project",
      recordedAt: Date.parse("2026-04-08T12:01:03.000Z"),
      decision: "deny",
      toolName: "Bash",
      input: { command: "rm -rf tmp" },
      toolUseID: "tool-2",
      message: "Denied by policy",
    });

    await refreshDerivedAnalyticsTables(analyticsDb);

    const interactionRows = (
      await analyticsDb.connection.runAndReadAll(`
        SELECT
          interaction_id,
          session_id,
          trace_kind,
          event_count,
          error_count,
          keyword_mentions,
          tool_use_count,
          input_tokens,
          output_tokens,
          cache_read_tokens,
          estimated_cost_usd,
          context_estimate_tokens_peak
        FROM fact_interactions
        ORDER BY interaction_id
      `)
    ).getRowObjects();
    expect(interactionRows).toHaveLength(2);
    expect(interactionRows[0]).toMatchObject({
      interaction_id: "agent-review-1:interaction:1",
      session_id: "agent-review-1",
      trace_kind: "subagent",
      event_count: 2n,
      error_count: 0n,
      keyword_mentions: 0n,
      tool_use_count: 0n,
      input_tokens: 30n,
      output_tokens: 18n,
      cache_read_tokens: 10n,
      context_estimate_tokens_peak: 40n,
    });
    expect(interactionRows[1]).toMatchObject({
      interaction_id: "root-session-1:interaction:1",
      session_id: "root-session-1",
      trace_kind: "root",
      event_count: 6n,
      error_count: 2n,
      keyword_mentions: 1n,
      tool_use_count: 1n,
      input_tokens: 120n,
      output_tokens: 35n,
      cache_read_tokens: 45n,
      context_estimate_tokens_peak: 165n,
    });
    expect(Number(interactionRows[1].estimated_cost_usd)).toBeGreaterThan(0);

    const requestRows = (
      await analyticsDb.connection.runAndReadAll(`
        SELECT session_id, model, input_tokens, output_tokens, context_estimate_tokens
        FROM fact_requests
        ORDER BY session_id
      `)
    ).getRowObjects();
    expect(requestRows).toHaveLength(2);
    expect(requestRows[0]).toMatchObject({
      session_id: "agent-review-1",
      model: "claude-sonnet-4-6",
      input_tokens: 30n,
      output_tokens: 18n,
      context_estimate_tokens: 40n,
    });

    const toolRows = (
      await analyticsDb.connection.runAndReadAll(`
        SELECT session_id, tool_use_id, tool_name, is_error, error_message
        FROM fact_tool_calls
      `)
    ).getRowObjects();
    expect(toolRows).toEqual([
      {
        session_id: "root-session-1",
        tool_use_id: "toolu_123",
        tool_name: "Read",
        is_error: true,
        error_message: "ENOENT: file not found",
      },
    ]);

    const errorRows = (
      await analyticsDb.connection.runAndReadAll(`
        SELECT error_kind, tool_name, message
        FROM fact_errors
        ORDER BY error_kind, tool_name
      `)
    ).getRowObjects();
    expect(errorRows).toEqual([
      {
        error_kind: "api_error",
        tool_name: null,
        message: "API request failed due to rate limiting.",
      },
      {
        error_kind: "permission_denied",
        tool_name: "Bash",
        message: "Denied by policy",
      },
      {
        error_kind: "tool_error",
        tool_name: "Read",
        message: "ENOENT: file not found",
      },
    ]);

    const keywordRows = (
      await analyticsDb.connection.runAndReadAll(`
        SELECT category, term, speaker
        FROM fact_keyword_mentions
      `)
    ).getRowObjects();
    expect(keywordRows).toEqual([
      {
        category: "frustration",
        term: "frustrated",
        speaker: "user",
      },
    ]);

    const subagentRows = (
      await analyticsDb.connection.runAndReadAll(`
        SELECT root_session_id, session_id, agent_id, slug, team_name, teammate_name, source_tool_assistant_uuid
        FROM fact_subagent_runs
      `)
    ).getRowObjects();
    expect(subagentRows).toEqual([
      {
        root_session_id: "root-session-1",
        session_id: "agent-review-1",
        agent_id: "agent-review-1",
        slug: "reviewer",
        team_name: "delivery",
        teammate_name: "reviewer",
        source_tool_assistant_uuid: "root-assistant-1",
      },
    ]);

    const compactionRows = (
      await analyticsDb.connection.runAndReadAll(`
        SELECT session_id, interaction_id
        FROM fact_compactions
      `)
    ).getRowObjects();
    expect(compactionRows).toEqual([
      {
        session_id: "root-session-1",
        interaction_id: "root-session-1:interaction:1",
      },
    ]);

    const permissionRows = (
      await analyticsDb.connection.runAndReadAll(`
        SELECT session_id, tool_name, decision, cwd
        FROM fact_permission_decisions
      `)
    ).getRowObjects();
    expect(permissionRows).toEqual([
      {
        session_id: "root-session-1",
        tool_name: "Bash",
        decision: "deny",
        cwd: "/tmp/demo-project",
      },
    ]);

    const rollupRows = (
      await analyticsDb.connection.runAndReadAll(`
        SELECT trace_kind, traces, events, errors, keyword_mentions, tool_use_count, input_tokens, output_tokens
        FROM rollup_metrics_hourly
        ORDER BY trace_kind
      `)
    ).getRowObjects();
    expect(rollupRows).toEqual([
      {
        trace_kind: "root",
        traces: 1n,
        events: 6n,
        errors: 2n,
        keyword_mentions: 1n,
        tool_use_count: 1n,
        input_tokens: 120n,
        output_tokens: 35n,
      },
      {
        trace_kind: "subagent",
        traces: 1n,
        events: 2n,
        errors: 0n,
        keyword_mentions: 0n,
        tool_use_count: 0n,
        input_tokens: 30n,
        output_tokens: 18n,
      },
    ]);
  });
});
