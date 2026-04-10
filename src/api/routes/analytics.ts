/**
 * Analytics REST endpoints.
 * Exposes local developer-insights over the analytics warehouse.
 */

import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { importTranscriptBackfill, createDuckDbTranscriptEventSink } from "../../analytics/backfill/index.js";
import {
  createDuckDbOtelEventSink,
  getDefaultOtelTelemetryRoot,
  importOtelBackfill,
  refreshDerivedAnalyticsTables,
} from "../../analytics/index.js";
import { matchKeywordMentions } from "../../analytics/keywords/index.js";
import { coerceTimestampMsOrNow, toIsoTimestampOrNull } from "../../analytics/timestamps.js";
import { extractTextContent, extractToolUses } from "../../sessions/messages.js";
import type { MiddlewareContext } from "../server.js";
import type {
  AnalyticsBackfillRequest,
  AnalyticsBackfillResponse,
  AnalyticsBackfillOtelResponse,
  AnalyticsCompactionSummary,
  AnalyticsErrorSummary,
  AnalyticsFacetValue,
  AnalyticsFacetsResponse,
  AnalyticsKeywordMentionSummary,
  AnalyticsOverviewKeywordBreakdown,
  AnalyticsOverviewResponse,
  AnalyticsPermissionDecisionSummary,
  AnalyticsRawTableCounts,
  AnalyticsSessionDetailResponse,
  AnalyticsSessionSubagentSummary,
  AnalyticsStatusResponse,
  AnalyticsTimeBucket,
  AnalyticsToolPerformanceDetailResponse,
  AnalyticsToolPerformanceResponse,
  AnalyticsToolCallSummary,
  AnalyticsTraceDetailResponse,
  AnalyticsTraceRequestSummary,
  AnalyticsTimeseriesResponse,
  AnalyticsTraceSummary,
  AnalyticsTracesResponse,
} from "../../types/analytics.js";

const RangeQuerySchema = z.object({
  start: z.string().min(1).optional(),
  end: z.string().min(1).optional(),
  traceKinds: z.string().min(1).optional(),
  sessionIds: z.string().min(1).optional(),
  toolNames: z.string().min(1).optional(),
  errorKinds: z.string().min(1).optional(),
  keywordCategories: z.string().min(1).optional(),
});

const TimeseriesQuerySchema = RangeQuerySchema.extend({
  bucket: z.enum(["hour", "day"]).default("hour"),
});

const TraceQuerySchema = RangeQuerySchema.extend({
  q: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const IdParamSchema = z.object({
  id: z.string().min(1),
});

const ToolNameParamSchema = z.object({
  name: z.string().min(1),
});

const BackfillBodySchema = z.object({
  projectsRoot: z.string().min(1).optional(),
  projectKey: z.string().min(1).optional(),
  rootSessionId: z.string().min(1).optional(),
  includeOtel: z.boolean().optional(),
  otelRoot: z.string().min(1).optional(),
  includeSensitiveOtelPayload: z.boolean().optional(),
});

interface AnalyticsEventRow {
  source_kind: string;
  source_path: string;
  source_line: number | null;
  session_id: string | null;
  cwd: string | null;
  event_type: string | null;
  event_subtype: string | null;
  event_timestamp: string | Date | number | null;
  payload_json: string | null;
}

interface NormalizedAnalyticsEvent {
  sourceKind: string;
  sourcePath: string;
  sourceLine: number | null;
  sessionId: string;
  cwd: string | null;
  eventType: string;
  eventSubtype: string | null;
  timestampMs: number;
  payload: Record<string, unknown>;
  text: string;
  keywordMentions: ReturnType<typeof matchKeywordMentions>;
  toolUseCount: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  estimatedCostUsd: number;
  errorSignal: boolean;
  traceKind: "root" | "subagent" | "runtime";
}

interface TraceAggregate {
  traceId: string;
  sessionId: string;
  traceKind: "root" | "subagent" | "runtime";
  sourceKinds: Set<string>;
  traceIds: Set<string>;
  startedAtMs: number;
  endedAtMs: number;
  events: number;
  errors: number;
  keywordMentions: number;
  toolUses: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUsd: number;
  contextEstimateTokensPeak: number;
  summary: string;
}

interface BucketAggregate extends TraceAggregate {
  bucket: string;
}

type AnalyticsDatabase = NonNullable<NonNullable<MiddlewareContext["analytics"]>["database"]>;

interface AnalyticsQueryFilters {
  traceKinds: string[];
  sessionIds: string[];
  toolNames: string[];
  errorKinds: string[];
  keywordCategories: string[];
}

export function registerAnalyticsRoutes(app: FastifyInstance, ctx: MiddlewareContext): void {
  app.get("/api/v1/analytics/status", async (_request, reply) => {
    const database = requireAnalyticsDatabase(ctx, reply);
    if (!database) {
      return;
    }

    const rawTables = await readRawTableCounts(database);
    const metadata = await readMetadata(database, [
      "last_backfill_at",
      "last_backfill_files",
      "last_backfill_events",
    ]);

    const response: AnalyticsStatusResponse = {
      available: true,
      dbPath: database.dbPath,
      rawTables,
      lastBackfillAt: metadata.last_backfill_at ?? null,
      lastBackfillFiles: toOptionalNumber(metadata.last_backfill_files),
      lastBackfillEvents: toOptionalNumber(metadata.last_backfill_events),
    };

    return reply.send(response);
  });

  app.get("/api/v1/analytics/overview", async (request, reply) => {
    const database = requireAnalyticsDatabase(ctx, reply);
    if (!database) {
      return;
    }

    const query = RangeQuerySchema.parse(request.query);
    const range = parseRangeOrThrow(query, reply);
    if (!range) {
      return;
    }

    const response = await buildOverviewResponseFromFacts(database, range, parseAnalyticsQueryFilters(query));
    return reply.send(response);
  });

  app.get("/api/v1/analytics/timeseries", async (request, reply) => {
    const database = requireAnalyticsDatabase(ctx, reply);
    if (!database) {
      return;
    }

    const query = TimeseriesQuerySchema.parse(request.query);
    const range = parseRangeOrThrow(query, reply);
    if (!range) {
      return;
    }

    const response = await buildTimeseriesResponseFromFacts(
      database,
      range,
      query.bucket,
      parseAnalyticsQueryFilters(query)
    );
    return reply.send(response);
  });

  app.get("/api/v1/analytics/traces", async (request, reply) => {
    const database = requireAnalyticsDatabase(ctx, reply);
    if (!database) {
      return;
    }

    const query = TraceQuerySchema.parse(request.query);
    const range = parseRangeOrThrow(query, reply);
    if (!range) {
      return;
    }

    const response = await buildTracesResponseFromFacts(
      database,
      range,
      parseAnalyticsQueryFilters(query),
      query.q,
      query.limit,
      query.offset
    );
    return reply.send(response);
  });

  app.get("/api/v1/analytics/facets", async (request, reply) => {
    const database = requireAnalyticsDatabase(ctx, reply);
    if (!database) {
      return;
    }

    const query = RangeQuerySchema.parse(request.query);
    const range = parseRangeOrThrow(query, reply);
    if (!range) {
      return;
    }

    const response = await buildFacetsResponseFromFacts(database, range, parseAnalyticsQueryFilters(query));
    return reply.send(response);
  });

  app.get("/api/v1/analytics/tool-performance", async (request, reply) => {
    const database = requireAnalyticsDatabase(ctx, reply);
    if (!database) {
      return;
    }

    const query = RangeQuerySchema.parse(request.query);
    const range = parseRangeOrThrow(query, reply);
    if (!range) {
      return;
    }

    const response = await buildToolPerformanceResponseFromFacts(
      database,
      range,
      parseAnalyticsQueryFilters(query)
    );
    return reply.send(response);
  });

  app.get<{
    Params: { name: string };
  }>("/api/v1/analytics/tool-performance/:name", async (request, reply) => {
    const database = requireAnalyticsDatabase(ctx, reply);
    if (!database) {
      return;
    }

    const params = ToolNameParamSchema.parse(request.params);
    const query = RangeQuerySchema.parse(request.query);
    const range = parseRangeOrThrow(query, reply);
    if (!range) {
      return;
    }

    const response = await buildToolPerformanceDetailResponseFromFacts(
      database,
      range,
      parseAnalyticsQueryFilters(query),
      params.name
    );
    if (!response) {
      return reply.status(404).send({
        error: {
          code: "ANALYTICS_TOOL_NOT_FOUND",
          message: `Analytics tool ${params.name} not found in the current slice`,
        },
      });
    }

    return reply.send(response);
  });

  app.get<{
    Params: { id: string };
  }>("/api/v1/analytics/traces/:id", async (request, reply) => {
    const database = requireAnalyticsDatabase(ctx, reply);
    if (!database) {
      return;
    }

    const params = IdParamSchema.parse(request.params);
    const response = await buildTraceDetailResponseFromFacts(database, params.id);
    if (!response) {
      return reply.status(404).send({
        error: {
          code: "ANALYTICS_TRACE_NOT_FOUND",
          message: `Analytics trace ${params.id} not found`,
        },
      });
    }

    return reply.send(response);
  });

  app.get<{
    Params: { id: string };
  }>("/api/v1/analytics/sessions/:id", async (request, reply) => {
    const database = requireAnalyticsDatabase(ctx, reply);
    if (!database) {
      return;
    }

    const params = IdParamSchema.parse(request.params);
    const response = await buildSessionDetailResponseFromFacts(database, params.id);
    if (!response) {
      return reply.status(404).send({
        error: {
          code: "ANALYTICS_SESSION_NOT_FOUND",
          message: `Analytics session ${params.id} not found`,
        },
      });
    }

    return reply.send(response);
  });

  app.post<{
    Body: AnalyticsBackfillRequest;
  }>("/api/v1/analytics/backfill", async (request, reply) => {
    const database = requireAnalyticsDatabase(ctx, reply);
    if (!database) {
      return;
    }

    const parsedBody = BackfillBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parsedBody.error.issues,
        },
      });
    }

    const sink = createDuckDbTranscriptEventSink(database);
    const stats = await importTranscriptBackfill({
      sink,
      projectsRoot: parsedBody.data.projectsRoot,
      projectKey: parsedBody.data.projectKey,
      rootSessionId: parsedBody.data.rootSessionId,
    });

    let otelStats: AnalyticsBackfillOtelResponse | undefined;
    if (parsedBody.data.includeOtel === true) {
      const otelSink = createDuckDbOtelEventSink(database);
      const imported = await importOtelBackfill({
        sink: otelSink,
        rootDir: parsedBody.data.otelRoot ?? getDefaultOtelTelemetryRoot(),
        includeSensitivePayload: parsedBody.data.includeSensitiveOtelPayload,
      });
      otelStats = {
        filesDiscovered: imported.filesDiscovered,
        filesImported: imported.filesImported,
        logsImported: imported.logsImported,
        spansImported: imported.spansImported,
        includeSensitivePayload: parsedBody.data.includeSensitiveOtelPayload === true,
      };
    }

    await refreshDerivedAnalyticsTables(database);

    await writeBackfillMetadata(database, stats);

    const response: AnalyticsBackfillResponse = {
      filesDiscovered: stats.filesDiscovered,
      filesImported: stats.filesImported,
      eventsImported: stats.eventsImported,
      otel: otelStats,
    };

    return reply.send(response);
  });
}

function requireAnalyticsDatabase(
  ctx: MiddlewareContext,
  reply: FastifyReply
): AnalyticsDatabase | undefined {
  const database = ctx.analytics?.database;
  if (!database) {
    reply.status(501).send({
      error: {
        code: "ANALYTICS_UNAVAILABLE",
        message: "Analytics database is not configured",
      },
    });
    return undefined;
  }

  return database;
}

async function readRawTableCounts(database: AnalyticsDatabase): Promise<AnalyticsRawTableCounts> {
  return {
    transcriptEvents: await countRows(database, "raw_transcript_events"),
    middlewareSdkMessages: await countRows(database, "raw_middleware_sdk_messages"),
    hookEvents: await countRows(database, "raw_hook_events"),
    permissionEvents: await countRows(database, "raw_permission_events"),
    otelLogs: await countRows(database, "raw_otel_logs"),
    otelSpans: await countRows(database, "raw_otel_spans"),
  };
}

async function readMetadata(
  database: AnalyticsDatabase,
  keys: string[]
): Promise<Record<string, string>> {
  if (keys.length === 0) {
    return {};
  }

  const escapedKeys = keys.map((key) => `'${escapeSqlLiteral(key)}'`).join(", ");
  const result = await database.connection.runAndReadAll(`
    SELECT key, value
    FROM analytics_metadata
    WHERE key IN (${escapedKeys})
  `);

  const metadata: Record<string, string> = {};
  for (const row of result.getRowObjects()) {
    const key = row.key as string | undefined;
    const value = row.value as string | undefined;
    if (key && value !== undefined) {
      metadata[key] = value;
    }
  }
  return metadata;
}

async function countRows(database: AnalyticsDatabase, tableName: string): Promise<number> {
  const result = await database.connection.runAndReadAll(
    `SELECT COUNT(*) AS count FROM ${tableName}`
  );
  return toNumber(result.getRowObjects()[0]?.count);
}

interface FactInteractionRow {
  interaction_id: string;
  root_session_id: string;
  session_id: string;
  trace_kind: "root" | "subagent" | "runtime";
  source_kind: string;
  started_at: string | Date | number | null;
  ended_at: string | Date | number | null;
  event_count: number | bigint;
  error_count: number | bigint;
  keyword_mentions: number | bigint;
  tool_use_count: number | bigint;
  input_tokens: number | bigint;
  output_tokens: number | bigint;
  cache_read_tokens: number | bigint;
  cache_creation_tokens: number | bigint;
  estimated_cost_usd: number | string | null;
  context_estimate_tokens_peak: number | bigint;
  summary: string | null;
}

async function buildOverviewResponseFromFacts(
  database: AnalyticsDatabase,
  range: { startMs?: number; endMs?: number },
  filters: AnalyticsQueryFilters
): Promise<AnalyticsOverviewResponse> {
  const filteredInteractionsCte = buildFilteredInteractionsCte(range, filters);
  const totalsResult = await database.connection.runAndReadAll(`
    ${filteredInteractionsCte}
    SELECT
      COALESCE(SUM(event_count), 0) AS events,
      COUNT(*) AS traces,
      COALESCE(SUM(error_count), 0) AS errors,
      COALESCE(SUM(keyword_mentions), 0) AS keyword_mentions,
      COALESCE(SUM(tool_use_count), 0) AS tool_uses,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
      COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
      COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd,
      COALESCE(MAX(context_estimate_tokens_peak), 0) AS context_estimate_tokens_peak
    FROM filtered_interactions
  `);
  const totalsRow = totalsResult.getRowObjects()[0] as Record<string, unknown> | undefined;

  const keywordResult = await database.connection.runAndReadAll(`
    ${filteredInteractionsCte}
    SELECT
      km.category AS category,
      km.term AS term,
      COUNT(*) AS count
    FROM fact_keyword_mentions km
    INNER JOIN filtered_interactions fi
      ON fi.interaction_id = km.interaction_id
    GROUP BY km.category, km.term
    HAVING km.category IS NOT NULL
      AND km.category <> ''
      AND km.term IS NOT NULL
      AND km.term <> ''
    ORDER BY count DESC, category ASC, term ASC
  `);

  const sourceCounts = await readRawTableCounts(database);
  return {
    range: {
      start: range.startMs !== undefined ? new Date(range.startMs).toISOString() : null,
      end: range.endMs !== undefined ? new Date(range.endMs).toISOString() : null,
    },
    totals: {
      events: toNumber(totalsRow?.events),
      traces: toNumber(totalsRow?.traces),
      errors: toNumber(totalsRow?.errors),
      keywordMentions: toNumber(totalsRow?.keyword_mentions),
      toolUses: toNumber(totalsRow?.tool_uses),
      inputTokens: toNumber(totalsRow?.input_tokens),
      outputTokens: toNumber(totalsRow?.output_tokens),
      cacheReadTokens: toNumber(totalsRow?.cache_read_tokens),
      cacheCreationTokens: toNumber(totalsRow?.cache_creation_tokens),
      estimatedCostUsd: roundCurrency(toNumber(totalsRow?.estimated_cost_usd)),
      contextEstimateTokensPeak: toNumber(totalsRow?.context_estimate_tokens_peak),
    },
    sourceCounts,
    keywordBreakdown: keywordResult.getRowObjects().map((row) => ({
      category: String(row.category ?? ""),
      term: String(row.term ?? ""),
      count: toNumber(row.count),
    })),
  };
}

async function buildTimeseriesResponseFromFacts(
  database: AnalyticsDatabase,
  range: { startMs?: number; endMs?: number },
  bucket: AnalyticsTimeBucket,
  filters: AnalyticsQueryFilters
): Promise<AnalyticsTimeseriesResponse> {
  const filteredInteractionsCte = buildFilteredInteractionsCte(range, filters);
  const bucketExpression = bucket === "day"
    ? "date_trunc('day', started_at)"
    : "date_trunc('hour', started_at)";
  const result = await database.connection.runAndReadAll(`
    ${filteredInteractionsCte}
    SELECT
      ${bucketExpression} AS bucket_start,
      COUNT(*) AS traces,
      COALESCE(SUM(event_count), 0) AS events,
      COALESCE(SUM(error_count), 0) AS errors,
      COALESCE(SUM(keyword_mentions), 0) AS keyword_mentions,
      COALESCE(SUM(tool_use_count), 0) AS tool_uses,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd,
      COALESCE(MAX(context_estimate_tokens_peak), 0) AS context_estimate_tokens_peak
    FROM filtered_interactions
    GROUP BY bucket_start
    ORDER BY bucket_start ASC
  `);

  return {
    bucket,
    range: {
      start: range.startMs !== undefined ? new Date(range.startMs).toISOString() : null,
      end: range.endMs !== undefined ? new Date(range.endMs).toISOString() : null,
    },
    points: result.getRowObjects().map((row) => ({
      bucket: toIsoStringOrNull(row.bucket_start) ?? "",
      events: toNumber(row.events),
      traces: toNumber(row.traces),
      errors: toNumber(row.errors),
      keywordMentions: toNumber(row.keyword_mentions),
      toolUses: toNumber(row.tool_uses),
      inputTokens: toNumber(row.input_tokens),
      outputTokens: toNumber(row.output_tokens),
      estimatedCostUsd: roundCurrency(toNumber(row.estimated_cost_usd)),
      contextEstimateTokensPeak: toNumber(row.context_estimate_tokens_peak),
    })),
  };
}

async function loadTraceSummariesFromFacts(
  database: AnalyticsDatabase,
  range: { startMs?: number; endMs?: number },
  filters: AnalyticsQueryFilters,
  searchQuery?: string
): Promise<AnalyticsTraceSummary[]> {
  const filteredInteractionsCte = buildFilteredInteractionsCte(range, filters);
  const result = await database.connection.runAndReadAll(`
    ${filteredInteractionsCte}
    SELECT
      interaction_id,
      session_id,
      trace_kind,
      source_kind,
      started_at,
      ended_at,
      event_count,
      error_count,
      keyword_mentions,
      tool_use_count,
      input_tokens,
      output_tokens,
      cache_read_tokens,
      cache_creation_tokens,
      estimated_cost_usd,
      context_estimate_tokens_peak,
      summary
    FROM filtered_interactions
    ORDER BY started_at DESC, interaction_id ASC
  `);

  let traces = result.getRowObjects().map((row) => ({
    traceId: String(row.interaction_id ?? ""),
    sessionId: String(row.session_id ?? ""),
    traceKind: (row.trace_kind as AnalyticsTraceSummary["traceKind"]) ?? "runtime",
    sourceKinds: [String(row.source_kind ?? "transcript")],
    startedAt: toIsoStringOrNull(row.started_at),
    endedAt: toIsoStringOrNull(row.ended_at),
    events: toNumber(row.event_count),
    errors: toNumber(row.error_count),
    keywordMentions: toNumber(row.keyword_mentions),
    toolUses: toNumber(row.tool_use_count),
    inputTokens: toNumber(row.input_tokens),
    outputTokens: toNumber(row.output_tokens),
    estimatedCostUsd: roundCurrency(toNumber(row.estimated_cost_usd)),
    contextEstimateTokensPeak: toNumber(row.context_estimate_tokens_peak),
    summary: String(row.summary ?? row.session_id ?? row.interaction_id ?? ""),
  }));

  if (searchQuery) {
    const normalized = searchQuery.trim().toLowerCase();
    traces = traces.filter((trace) =>
      [
        trace.traceId,
        trace.sessionId,
        trace.summary,
        ...trace.sourceKinds,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }

  return traces;
}

async function buildTracesResponseFromFacts(
  database: AnalyticsDatabase,
  range: { startMs?: number; endMs?: number },
  filters: AnalyticsQueryFilters,
  searchQuery: string | undefined,
  limit: number,
  offset: number
): Promise<AnalyticsTracesResponse> {
  const traces = await loadTraceSummariesFromFacts(database, range, filters, searchQuery);
  return {
    total: traces.length,
    limit,
    offset,
    range: {
      start: range.startMs !== undefined ? new Date(range.startMs).toISOString() : null,
      end: range.endMs !== undefined ? new Date(range.endMs).toISOString() : null,
    },
    traces: traces.slice(offset, offset + limit),
  };
}

async function buildFacetsResponseFromFacts(
  database: AnalyticsDatabase,
  range: { startMs?: number; endMs?: number },
  filters: AnalyticsQueryFilters
): Promise<AnalyticsFacetsResponse> {
  const filteredInteractionsCte = buildFilteredInteractionsCte(range, filters);
  const [traceKinds, errorKinds, toolNames, keywordCategories, sessions] = await Promise.all([
    database.connection.runAndReadAll(`
      ${filteredInteractionsCte}
      SELECT
        trace_kind AS value,
        COUNT(*) AS count
      FROM filtered_interactions
      GROUP BY trace_kind
      HAVING trace_kind IS NOT NULL AND trace_kind <> ''
      ORDER BY count DESC, value ASC
    `),
    database.connection.runAndReadAll(`
      ${filteredInteractionsCte}
      SELECT
        fe.error_kind AS value,
        COUNT(*) AS count
      FROM fact_errors fe
      INNER JOIN filtered_interactions fi
        ON fi.interaction_id = fe.interaction_id
      GROUP BY fe.error_kind
      HAVING fe.error_kind IS NOT NULL AND fe.error_kind <> ''
      ORDER BY count DESC, value ASC
    `),
    database.connection.runAndReadAll(`
      ${filteredInteractionsCte}
      SELECT
        tc.tool_name AS value,
        COUNT(*) AS count
      FROM fact_tool_calls tc
      INNER JOIN filtered_interactions fi
        ON fi.interaction_id = tc.interaction_id
      GROUP BY tc.tool_name
      HAVING tc.tool_name IS NOT NULL AND tc.tool_name <> ''
      ORDER BY count DESC, value ASC
    `),
    database.connection.runAndReadAll(`
      ${filteredInteractionsCte}
      SELECT
        km.category AS value,
        COUNT(*) AS count
      FROM fact_keyword_mentions km
      INNER JOIN filtered_interactions fi
        ON fi.interaction_id = km.interaction_id
      GROUP BY km.category
      HAVING km.category IS NOT NULL AND km.category <> ''
      ORDER BY count DESC, value ASC
    `),
    database.connection.runAndReadAll(`
      ${filteredInteractionsCte}
      SELECT
        session_id AS value,
        COUNT(*) AS count
      FROM filtered_interactions
      GROUP BY session_id
      HAVING session_id IS NOT NULL AND session_id <> ''
      ORDER BY count DESC, value ASC
    `),
  ]);

  return {
    range: {
      start: range.startMs !== undefined ? new Date(range.startMs).toISOString() : null,
      end: range.endMs !== undefined ? new Date(range.endMs).toISOString() : null,
    },
    traceKinds: toFacetValues(traceKinds.getRowObjects()),
    errorKinds: toFacetValues(errorKinds.getRowObjects()),
    toolNames: toFacetValues(toolNames.getRowObjects()),
    keywordCategories: toFacetValues(keywordCategories.getRowObjects()),
    sessions: toFacetValues(sessions.getRowObjects()),
  };
}

async function buildToolPerformanceResponseFromFacts(
  database: AnalyticsDatabase,
  range: { startMs?: number; endMs?: number },
  filters: AnalyticsQueryFilters
): Promise<AnalyticsToolPerformanceResponse> {
  const filteredInteractionsCte = buildFilteredInteractionsCte(range, filters);
  const toolNameFilter = filters.toolNames.length > 0
    ? `AND tc.tool_name IN (${toSqlInList(filters.toolNames)})`
    : "";
  const errorToolNameFilter = filters.toolNames.length > 0
    ? `AND fe.tool_name IN (${toSqlInList(filters.toolNames)})`
    : "";

  const result = await database.connection.runAndReadAll(`
    ${filteredInteractionsCte},
    filtered_tool_rollup AS (
      SELECT
        tc.tool_name AS tool_name,
        COUNT(*) AS call_count,
        COALESCE(SUM(CASE WHEN tc.is_error THEN 1 ELSE 0 END), 0) AS error_count,
        COUNT(DISTINCT tc.session_id) AS session_count,
        COUNT(DISTINCT tc.interaction_id) AS trace_count,
        MAX(COALESCE(tc.finished_at, tc.started_at)) AS last_seen_at
      FROM fact_tool_calls tc
      INNER JOIN filtered_interactions fi
        ON fi.interaction_id = tc.interaction_id
      WHERE tc.tool_name IS NOT NULL
        AND tc.tool_name <> ''
        ${toolNameFilter}
      GROUP BY tc.tool_name
    ),
    tool_error_counts AS (
      SELECT
        fe.tool_name AS tool_name,
        fe.error_kind AS error_kind,
        COUNT(*) AS error_kind_count
      FROM fact_errors fe
      INNER JOIN filtered_interactions fi
        ON fi.interaction_id = fe.interaction_id
      WHERE fe.tool_name IS NOT NULL
        AND fe.tool_name <> ''
        ${errorToolNameFilter}
      GROUP BY fe.tool_name, fe.error_kind
    ),
    ranked_tool_errors AS (
      SELECT
        tec.tool_name AS tool_name,
        tec.error_kind AS error_kind,
        tec.error_kind_count AS error_kind_count,
        ROW_NUMBER() OVER (
          PARTITION BY tec.tool_name
          ORDER BY tec.error_kind_count DESC, tec.error_kind ASC
        ) AS error_rank
      FROM tool_error_counts tec
    )
    SELECT
      tr.tool_name,
      tr.call_count,
      tr.error_count,
      tr.session_count,
      tr.trace_count,
      tr.last_seen_at,
      rte.error_kind AS top_error_kind,
      COALESCE(rte.error_kind_count, 0) AS top_error_count
    FROM filtered_tool_rollup tr
    LEFT JOIN ranked_tool_errors rte
      ON rte.tool_name = tr.tool_name
      AND rte.error_rank = 1
    ORDER BY
      tr.error_count DESC,
      CASE
        WHEN tr.call_count = 0 THEN 0
        ELSE CAST(tr.error_count AS DOUBLE) / CAST(tr.call_count AS DOUBLE)
      END DESC,
      tr.call_count DESC,
      tr.tool_name ASC
  `);

  return {
    range: {
      start: range.startMs !== undefined ? new Date(range.startMs).toISOString() : null,
      end: range.endMs !== undefined ? new Date(range.endMs).toISOString() : null,
    },
    rows: result.getRowObjects().map((row) => {
      const callCount = toNumber(row.call_count);
      const errorCount = toNumber(row.error_count);
      return {
        toolName: String(row.tool_name ?? ""),
        callCount,
        errorCount,
        errorRate: callCount > 0 ? Number((errorCount / callCount).toFixed(4)) : 0,
        sessionCount: toNumber(row.session_count),
        traceCount: toNumber(row.trace_count),
        topErrorKind: asOptionalString(row.top_error_kind),
        topErrorCount: toNumber(row.top_error_count),
        lastSeenAt: toIsoStringOrNull(row.last_seen_at),
      };
    }),
  };
}

async function buildToolPerformanceDetailResponseFromFacts(
  database: AnalyticsDatabase,
  range: { startMs?: number; endMs?: number },
  filters: AnalyticsQueryFilters,
  toolName: string
): Promise<AnalyticsToolPerformanceDetailResponse | undefined> {
  const filteredInteractionsCte = buildFilteredInteractionsCte(range, filters);
  const escapedToolName = escapeSqlLiteral(toolName);
  const summaryResult = await database.connection.runAndReadAll(`
    ${filteredInteractionsCte},
    filtered_tool_rollup AS (
      SELECT
        tc.tool_name AS tool_name,
        COUNT(*) AS call_count,
        COALESCE(SUM(CASE WHEN tc.is_error THEN 1 ELSE 0 END), 0) AS error_count,
        COUNT(DISTINCT tc.session_id) AS session_count,
        COUNT(DISTINCT tc.interaction_id) AS trace_count,
        MAX(COALESCE(tc.finished_at, tc.started_at)) AS last_seen_at
      FROM fact_tool_calls tc
      INNER JOIN filtered_interactions fi
        ON fi.interaction_id = tc.interaction_id
      WHERE tc.tool_name = '${escapedToolName}'
      GROUP BY tc.tool_name
    ),
    tool_error_counts AS (
      SELECT
        fe.error_kind AS error_kind,
        COUNT(*) AS error_kind_count,
        ROW_NUMBER() OVER (
          ORDER BY COUNT(*) DESC, fe.error_kind ASC
        ) AS error_rank
      FROM fact_errors fe
      INNER JOIN filtered_interactions fi
        ON fi.interaction_id = fe.interaction_id
      WHERE fe.tool_name = '${escapedToolName}'
        AND fe.error_kind IS NOT NULL
        AND fe.error_kind <> ''
      GROUP BY fe.error_kind
    )
    SELECT
      tr.tool_name,
      tr.call_count,
      tr.error_count,
      tr.session_count,
      tr.trace_count,
      tr.last_seen_at,
      tec.error_kind AS top_error_kind,
      COALESCE(tec.error_kind_count, 0) AS top_error_count
    FROM filtered_tool_rollup tr
    LEFT JOIN tool_error_counts tec
      ON tec.error_rank = 1
    LIMIT 1
  `);
  const summaryRow = summaryResult.getRowObjects()[0] as Record<string, unknown> | undefined;
  if (!summaryRow) {
    return undefined;
  }

  const callCount = toNumber(summaryRow.call_count);
  const errorCount = toNumber(summaryRow.error_count);
  const tool = {
    toolName: String(summaryRow.tool_name ?? toolName),
    callCount,
    errorCount,
    errorRate: callCount > 0 ? Number((errorCount / callCount).toFixed(4)) : 0,
    sessionCount: toNumber(summaryRow.session_count),
    traceCount: toNumber(summaryRow.trace_count),
    topErrorKind: asOptionalString(summaryRow.top_error_kind),
    topErrorCount: toNumber(summaryRow.top_error_count),
    lastSeenAt: toIsoStringOrNull(summaryRow.last_seen_at),
  };

  const [errorKindsResult, recentFailuresResult] = await Promise.all([
    database.connection.runAndReadAll(`
      ${filteredInteractionsCte},
      filtered_failed_tool_calls AS (
        SELECT
          tc.tool_call_id,
          tc.interaction_id,
          tc.session_id,
          tc.error_message,
          COALESCE(tc.finished_at, tc.started_at) AS failure_timestamp
        FROM fact_tool_calls tc
        INNER JOIN filtered_interactions fi
          ON fi.interaction_id = tc.interaction_id
        WHERE tc.tool_name = '${escapedToolName}'
          AND tc.is_error = TRUE
      ),
      ranked_failures AS (
        SELECT
          ftc.tool_call_id,
          ftc.interaction_id,
          ftc.session_id,
          ftc.error_message,
          ftc.failure_timestamp,
          fe.error_id,
          fe.error_kind,
          fe.error_code,
          fe.message,
          fe.error_timestamp,
          ROW_NUMBER() OVER (
            PARTITION BY ftc.tool_call_id
            ORDER BY fe.error_timestamp DESC NULLS LAST, fe.error_id ASC
          ) AS failure_rank
        FROM filtered_failed_tool_calls ftc
        LEFT JOIN fact_errors fe
          ON fe.interaction_id = ftc.interaction_id
         AND fe.tool_name = '${escapedToolName}'
      ),
      tool_failure_details AS (
        SELECT
          COALESCE(error_id, tool_call_id || ':error') AS error_id,
          interaction_id AS trace_id,
          session_id,
          COALESCE(NULLIF(error_kind, ''), 'tool_error') AS error_kind,
          NULLIF(error_code, '') AS error_code,
          COALESCE(NULLIF(message, ''), NULLIF(error_message, ''), 'Tool call failed') AS message,
          COALESCE(error_timestamp, failure_timestamp) AS failure_timestamp
        FROM ranked_failures
        WHERE failure_rank = 1
      )
      SELECT
        error_kind AS value,
        COUNT(*) AS count
      FROM tool_failure_details
      GROUP BY error_kind
      ORDER BY count DESC, value ASC
    `),
    database.connection.runAndReadAll(`
      ${filteredInteractionsCte},
      filtered_failed_tool_calls AS (
        SELECT
          tc.tool_call_id,
          tc.interaction_id,
          tc.session_id,
          tc.error_message,
          COALESCE(tc.finished_at, tc.started_at) AS failure_timestamp
        FROM fact_tool_calls tc
        INNER JOIN filtered_interactions fi
          ON fi.interaction_id = tc.interaction_id
        WHERE tc.tool_name = '${escapedToolName}'
          AND tc.is_error = TRUE
      ),
      ranked_failures AS (
        SELECT
          ftc.tool_call_id,
          ftc.interaction_id,
          ftc.session_id,
          ftc.error_message,
          ftc.failure_timestamp,
          fe.error_id,
          fe.error_kind,
          fe.error_code,
          fe.message,
          fe.error_timestamp,
          ROW_NUMBER() OVER (
            PARTITION BY ftc.tool_call_id
            ORDER BY fe.error_timestamp DESC NULLS LAST, fe.error_id ASC
          ) AS failure_rank
        FROM filtered_failed_tool_calls ftc
        LEFT JOIN fact_errors fe
          ON fe.interaction_id = ftc.interaction_id
         AND fe.tool_name = '${escapedToolName}'
      )
      SELECT
        COALESCE(error_id, tool_call_id || ':error') AS error_id,
        interaction_id AS trace_id,
        session_id,
        COALESCE(NULLIF(error_kind, ''), 'tool_error') AS error_kind,
        NULLIF(error_code, '') AS error_code,
        COALESCE(NULLIF(message, ''), NULLIF(error_message, ''), 'Tool call failed') AS message,
        COALESCE(error_timestamp, failure_timestamp) AS failure_timestamp
      FROM ranked_failures
      WHERE failure_rank = 1
      ORDER BY failure_timestamp DESC NULLS LAST, error_id ASC
      LIMIT 25
    `),
  ]);

  return {
    range: {
      start: range.startMs !== undefined ? new Date(range.startMs).toISOString() : null,
      end: range.endMs !== undefined ? new Date(range.endMs).toISOString() : null,
    },
    tool,
    errorKinds: toFacetValues(errorKindsResult.getRowObjects()),
    recentFailures: recentFailuresResult.getRowObjects().map((row) => ({
      errorId: String(row.error_id ?? ""),
      traceId: String(row.trace_id ?? ""),
      sessionId: String(row.session_id ?? ""),
      errorKind: String(row.error_kind ?? "tool_error"),
      errorCode: asOptionalString(row.error_code),
      message: String(row.message ?? ""),
      timestamp: toIsoStringOrNull(row.failure_timestamp),
    })),
  };
}

async function buildTraceDetailResponseFromFacts(
  database: AnalyticsDatabase,
  traceId: string
): Promise<AnalyticsTraceDetailResponse | undefined> {
  const escapedTraceId = escapeSqlLiteral(traceId);
  const traceResult = await database.connection.runAndReadAll(`
    SELECT
      interaction_id,
      session_id,
      trace_kind,
      source_kind,
      started_at,
      ended_at,
      event_count,
      error_count,
      keyword_mentions,
      tool_use_count,
      input_tokens,
      output_tokens,
      cache_read_tokens,
      cache_creation_tokens,
      estimated_cost_usd,
      context_estimate_tokens_peak,
      summary
    FROM fact_interactions
    WHERE interaction_id = '${escapedTraceId}'
    LIMIT 1
  `);
  const traceRow = traceResult.getRowObjects()[0] as Record<string, unknown> | undefined;
  if (!traceRow) {
    return undefined;
  }

  const trace: AnalyticsTraceSummary = {
    traceId: String(traceRow.interaction_id ?? traceId),
    sessionId: String(traceRow.session_id ?? ""),
    traceKind: (traceRow.trace_kind as AnalyticsTraceSummary["traceKind"]) ?? "runtime",
    sourceKinds: [String(traceRow.source_kind ?? "transcript")],
    startedAt: toIsoStringOrNull(traceRow.started_at),
    endedAt: toIsoStringOrNull(traceRow.ended_at),
    events: toNumber(traceRow.event_count),
    errors: toNumber(traceRow.error_count),
    keywordMentions: toNumber(traceRow.keyword_mentions),
    toolUses: toNumber(traceRow.tool_use_count),
    inputTokens: toNumber(traceRow.input_tokens),
    outputTokens: toNumber(traceRow.output_tokens),
    estimatedCostUsd: roundCurrency(toNumber(traceRow.estimated_cost_usd)),
    contextEstimateTokensPeak: toNumber(traceRow.context_estimate_tokens_peak),
    summary: String(traceRow.summary ?? traceId),
  };

  const [requests, toolCalls, errors, keywordMentions, compactions] = await Promise.all([
    database.connection.runAndReadAll(`
      SELECT
        request_id,
        request_timestamp,
        model,
        stop_reason,
        assistant_uuid,
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_creation_tokens,
        estimated_cost_usd,
        context_estimate_tokens
      FROM fact_requests
      WHERE interaction_id = '${escapedTraceId}'
      ORDER BY request_timestamp ASC
    `),
    database.connection.runAndReadAll(`
      SELECT
        tool_call_id,
        tool_use_id,
        tool_name,
        source_assistant_uuid,
        started_at,
        finished_at,
        is_error,
        error_message
      FROM fact_tool_calls
      WHERE interaction_id = '${escapedTraceId}'
      ORDER BY started_at ASC, tool_call_id ASC
    `),
    database.connection.runAndReadAll(`
      SELECT
        error_id,
        error_kind,
        tool_name,
        error_code,
        message,
        error_timestamp
      FROM fact_errors
      WHERE interaction_id = '${escapedTraceId}'
      ORDER BY error_timestamp ASC, error_id ASC
    `),
    database.connection.runAndReadAll(`
      SELECT
        mention_id,
        speaker,
        category,
        term,
        matched_text,
        severity,
        mention_timestamp
      FROM fact_keyword_mentions
      WHERE interaction_id = '${escapedTraceId}'
      ORDER BY mention_timestamp ASC, mention_id ASC
    `),
    database.connection.runAndReadAll(`
      SELECT
        compaction_id,
        compacted_at,
        message_count
      FROM fact_compactions
      WHERE interaction_id = '${escapedTraceId}'
      ORDER BY compacted_at ASC, compaction_id ASC
    `),
  ]);

  return {
    trace,
    requests: requests.getRowObjects().map((row) => ({
      requestId: String(row.request_id ?? ""),
      timestamp: toIsoStringOrNull(row.request_timestamp),
      model: asOptionalString(row.model),
      stopReason: asOptionalString(row.stop_reason),
      assistantUuid: asOptionalString(row.assistant_uuid),
      inputTokens: toNumber(row.input_tokens),
      outputTokens: toNumber(row.output_tokens),
      cacheReadTokens: toNumber(row.cache_read_tokens),
      cacheCreationTokens: toNumber(row.cache_creation_tokens),
      estimatedCostUsd: roundCurrency(toNumber(row.estimated_cost_usd)),
      contextEstimateTokens: toNumber(row.context_estimate_tokens),
    })),
    toolCalls: toolCalls.getRowObjects().map((row) => ({
      toolCallId: String(row.tool_call_id ?? ""),
      toolUseId: asOptionalString(row.tool_use_id),
      toolName: String(row.tool_name ?? "unknown"),
      sourceAssistantUuid: asOptionalString(row.source_assistant_uuid),
      startedAt: toIsoStringOrNull(row.started_at),
      finishedAt: toIsoStringOrNull(row.finished_at),
      isError: row.is_error === true,
      errorMessage: asOptionalString(row.error_message),
    })),
    errors: errors.getRowObjects().map((row) => ({
      errorId: String(row.error_id ?? ""),
      errorKind: String(row.error_kind ?? "unknown"),
      toolName: asOptionalString(row.tool_name),
      errorCode: asOptionalString(row.error_code),
      message: String(row.message ?? ""),
      timestamp: toIsoStringOrNull(row.error_timestamp),
    })),
    keywordMentions: keywordMentions.getRowObjects().map((row) => ({
      mentionId: String(row.mention_id ?? ""),
      speaker: String(row.speaker ?? "unknown"),
      category: String(row.category ?? ""),
      term: String(row.term ?? ""),
      matchedText: String(row.matched_text ?? ""),
      severity: toNumber(row.severity),
      timestamp: toIsoStringOrNull(row.mention_timestamp),
    })),
    compactions: compactions.getRowObjects().map((row) => ({
      compactionId: String(row.compaction_id ?? ""),
      compactedAt: toIsoStringOrNull(row.compacted_at),
      messageCount:
        row.message_count === null || row.message_count === undefined
          ? undefined
          : toNumber(row.message_count),
    })),
  };
}

async function buildSessionDetailResponseFromFacts(
  database: AnalyticsDatabase,
  sessionId: string
): Promise<AnalyticsSessionDetailResponse | undefined> {
  const escapedSessionId = escapeSqlLiteral(sessionId);
  const traceResult = await database.connection.runAndReadAll(`
    SELECT
      interaction_id,
      session_id,
      trace_kind,
      source_kind,
      started_at,
      ended_at,
      event_count,
      error_count,
      keyword_mentions,
      tool_use_count,
      input_tokens,
      output_tokens,
      cache_read_tokens,
      cache_creation_tokens,
      estimated_cost_usd,
      context_estimate_tokens_peak,
      summary
    FROM fact_interactions
    WHERE session_id = '${escapedSessionId}'
       OR root_session_id = '${escapedSessionId}'
    ORDER BY started_at ASC, interaction_id ASC
  `);
  const traceRows = traceResult.getRowObjects();
  if (traceRows.length === 0) {
    return undefined;
  }

  const totals = {
    events: 0,
    traces: traceRows.length,
    errors: 0,
    keywordMentions: 0,
    toolUses: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    estimatedCostUsd: 0,
    contextEstimateTokensPeak: 0,
  };

  const traces: AnalyticsTraceSummary[] = traceRows.map((row) => {
    const events = toNumber(row.event_count);
    const errors = toNumber(row.error_count);
    const keywordMentions = toNumber(row.keyword_mentions);
    const toolUses = toNumber(row.tool_use_count);
    const inputTokens = toNumber(row.input_tokens);
    const outputTokens = toNumber(row.output_tokens);
    const cacheReadTokens = toNumber(row.cache_read_tokens);
    const cacheCreationTokens = toNumber(row.cache_creation_tokens);
    const estimatedCostUsd = roundCurrency(toNumber(row.estimated_cost_usd));
    const contextEstimateTokensPeak = toNumber(row.context_estimate_tokens_peak);

    totals.events += events;
    totals.errors += errors;
    totals.keywordMentions += keywordMentions;
    totals.toolUses += toolUses;
    totals.inputTokens += inputTokens;
    totals.outputTokens += outputTokens;
    totals.cacheReadTokens += cacheReadTokens;
    totals.cacheCreationTokens += cacheCreationTokens;
    totals.estimatedCostUsd = roundCurrency(totals.estimatedCostUsd + estimatedCostUsd);
    totals.contextEstimateTokensPeak = Math.max(
      totals.contextEstimateTokensPeak,
      contextEstimateTokensPeak
    );

    return {
      traceId: String(row.interaction_id ?? ""),
      sessionId: String(row.session_id ?? ""),
      traceKind: (row.trace_kind as AnalyticsTraceSummary["traceKind"]) ?? "runtime",
      sourceKinds: [String(row.source_kind ?? "transcript")],
      startedAt: toIsoStringOrNull(row.started_at),
      endedAt: toIsoStringOrNull(row.ended_at),
      events,
      errors,
      keywordMentions,
      toolUses,
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      contextEstimateTokensPeak,
      summary: String(row.summary ?? row.interaction_id ?? ""),
    };
  });

  const [toolNames, errorKinds, keywordCategories, subagentsResult, permissionsResult] =
    await Promise.all([
      database.connection.runAndReadAll(`
        SELECT tool_name AS value, COUNT(*) AS count
        FROM fact_tool_calls
        WHERE session_id = '${escapedSessionId}'
           OR root_session_id = '${escapedSessionId}'
        GROUP BY tool_name
        HAVING tool_name IS NOT NULL AND tool_name <> ''
        ORDER BY count DESC, value ASC
      `),
      database.connection.runAndReadAll(`
        SELECT error_kind AS value, COUNT(*) AS count
        FROM fact_errors
        WHERE session_id = '${escapedSessionId}'
           OR root_session_id = '${escapedSessionId}'
        GROUP BY error_kind
        HAVING error_kind IS NOT NULL AND error_kind <> ''
        ORDER BY count DESC, value ASC
      `),
      database.connection.runAndReadAll(`
        SELECT category AS value, COUNT(*) AS count
        FROM fact_keyword_mentions
        WHERE session_id = '${escapedSessionId}'
           OR root_session_id = '${escapedSessionId}'
        GROUP BY category
        HAVING category IS NOT NULL AND category <> ''
        ORDER BY count DESC, value ASC
      `),
      database.connection.runAndReadAll(`
        SELECT
          session_id,
          agent_id,
          slug,
          team_name,
          teammate_name,
          event_count,
          request_count,
          error_count,
          tool_use_count
        FROM fact_subagent_runs
        WHERE root_session_id = '${escapedSessionId}'
           OR session_id = '${escapedSessionId}'
        ORDER BY started_at ASC, session_id ASC
      `),
      database.connection.runAndReadAll(`
        SELECT
          decision_id,
          tool_name,
          decision,
          cwd,
          message,
          decision_timestamp
        FROM fact_permission_decisions
        WHERE session_id = '${escapedSessionId}'
        ORDER BY decision_timestamp ASC, decision_id ASC
      `),
    ]);

  return {
    sessionId,
    totals,
    traceCount: traces.length,
    traces,
    subagents: subagentsResult.getRowObjects().map((row) => ({
      sessionId: String(row.session_id ?? ""),
      agentId: asOptionalString(row.agent_id),
      slug: asOptionalString(row.slug),
      teamName: asOptionalString(row.team_name),
      teammateName: asOptionalString(row.teammate_name),
      eventCount: toNumber(row.event_count),
      requestCount: toNumber(row.request_count),
      errorCount: toNumber(row.error_count),
      toolUseCount: toNumber(row.tool_use_count),
    })),
    tools: toolNames.getRowObjects().map((row) => ({
      value: String(row.value ?? ""),
      count: toNumber(row.count),
    })),
    errorKinds: errorKinds.getRowObjects().map((row) => ({
      value: String(row.value ?? ""),
      count: toNumber(row.count),
    })),
    keywordCategories: keywordCategories.getRowObjects().map((row) => ({
      value: String(row.value ?? ""),
      count: toNumber(row.count),
    })),
    permissions: permissionsResult.getRowObjects().map((row) => ({
      decisionId: String(row.decision_id ?? ""),
      toolName: asOptionalString(row.tool_name),
      decision: String(row.decision ?? ""),
      cwd: asOptionalString(row.cwd),
      message: asOptionalString(row.message),
      timestamp: toIsoStringOrNull(row.decision_timestamp),
    })),
  };
}

async function loadAnalyticsEvents(
  database: AnalyticsDatabase,
  range: { startMs?: number; endMs?: number }
): Promise<NormalizedAnalyticsEvent[]> {
  const whereClause = buildTimeRangeWhereClause("event_timestamp", range);
  const result = await database.connection.runAndReadAll(`
    WITH analytics_events AS (
      SELECT
        'transcript' AS source_kind,
        source_path,
        source_line,
        session_id,
        cwd,
        event_type,
        event_subtype,
        event_timestamp,
        payload_json::VARCHAR AS payload_json
      FROM raw_transcript_events
      UNION ALL
      SELECT
        'middleware_sdk_message' AS source_kind,
        source_path,
        source_line,
        session_id,
        NULL AS cwd,
        event_type,
        event_subtype,
        event_timestamp,
        payload_json::VARCHAR AS payload_json
      FROM raw_middleware_sdk_messages
      UNION ALL
      SELECT
        'hook_event' AS source_kind,
        source_path,
        source_line,
        session_id,
        NULL AS cwd,
        hook_event_name AS event_type,
        NULL AS event_subtype,
        event_timestamp,
        payload_json::VARCHAR AS payload_json
      FROM raw_hook_events
      UNION ALL
      SELECT
        'permission_event' AS source_kind,
        source_path,
        source_line,
        session_id,
        cwd,
        tool_name AS event_type,
        decision AS event_subtype,
        event_timestamp,
        payload_json::VARCHAR AS payload_json
      FROM raw_permission_events
      UNION ALL
      SELECT
        'otel_log' AS source_kind,
        source_path,
        source_line,
        session_id,
        NULL AS cwd,
        event_name AS event_type,
        NULL AS event_subtype,
        event_timestamp,
        payload_json::VARCHAR AS payload_json
      FROM raw_otel_logs
      UNION ALL
      SELECT
        'otel_span' AS source_kind,
        source_path,
        source_line,
        session_id,
        NULL AS cwd,
        span_name AS event_type,
        NULL AS event_subtype,
        COALESCE(start_timestamp, end_timestamp) AS event_timestamp,
        payload_json::VARCHAR AS payload_json
      FROM raw_otel_spans
    )
    SELECT *
    FROM analytics_events
    ${whereClause}
    ORDER BY event_timestamp ASC, source_path ASC, source_line ASC
  `);

  return result
    .getRowObjects()
    .map((row: unknown) => normalizeAnalyticsEvent(row as AnalyticsEventRow));
}

function buildOverviewResponse(
  rows: NormalizedAnalyticsEvent[],
  range: { startMs?: number; endMs?: number }
): AnalyticsOverviewResponse {
  const aggregates = createAnalyticsAggregate();
  for (const row of rows) {
    addRowToAggregate(aggregates, row);
  }

  const keywordCounts = new Map<string, AnalyticsOverviewKeywordBreakdown>();
  for (const row of rows) {
    for (const match of row.keywordMentions) {
      const key = `${match.category}:${match.term}`;
      const current = keywordCounts.get(key);
      if (!current) {
        keywordCounts.set(key, {
          category: match.category,
          term: match.term,
          count: 1,
        });
      } else {
        current.count += 1;
      }
    }
  }

  return {
    range: {
      start: range.startMs !== undefined ? new Date(range.startMs).toISOString() : null,
      end: range.endMs !== undefined ? new Date(range.endMs).toISOString() : null,
    },
    totals: finalizeAggregate(aggregates),
    sourceCounts: summarizeSourceCounts(rows),
    keywordBreakdown: Array.from(keywordCounts.values()).sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      const leftKey = `${left.category}:${left.term}`;
      const rightKey = `${right.category}:${right.term}`;
      return leftKey.localeCompare(rightKey);
    }),
  };
}

function buildTimeseriesResponse(
  rows: NormalizedAnalyticsEvent[],
  range: { startMs?: number; endMs?: number },
  bucket: AnalyticsTimeBucket
): AnalyticsTimeseriesResponse {
  const bucketMap = new Map<string, BucketAggregate>();

  for (const row of rows) {
    const bucketKey = toBucketKey(row.timestampMs, bucket);
    const aggregate = bucketMap.get(bucketKey) ?? createBucketAggregate(bucketKey);
    addRowToAggregate(aggregate, row);
    bucketMap.set(bucketKey, aggregate);
  }

  return {
    bucket,
    range: {
      start: range.startMs !== undefined ? new Date(range.startMs).toISOString() : null,
      end: range.endMs !== undefined ? new Date(range.endMs).toISOString() : null,
    },
    points: Array.from(bucketMap.values())
      .sort((left, right) => left.bucket.localeCompare(right.bucket))
      .map((aggregate) => ({
        bucket: aggregate.bucket,
        events: aggregate.events,
        traces: aggregate.traceIds.size,
        errors: aggregate.errors,
        keywordMentions: aggregate.keywordMentions,
        toolUses: aggregate.toolUses,
        inputTokens: aggregate.inputTokens,
        outputTokens: aggregate.outputTokens,
        estimatedCostUsd: roundCurrency(aggregate.estimatedCostUsd),
        contextEstimateTokensPeak: aggregate.contextEstimateTokensPeak,
      })),
  };
}

function buildTracesResponse(
  rows: NormalizedAnalyticsEvent[],
  range: { startMs?: number; endMs?: number },
  searchQuery: string | undefined,
  limit: number,
  offset: number
): AnalyticsTracesResponse {
  const traces = new Map<string, TraceAggregate>();

  for (const row of rows) {
    const traceId = row.sessionId || row.sourcePath;
    const trace = traces.get(traceId) ?? createTraceAggregate(traceId, row);
    addRowToTrace(trace, row);
    traces.set(traceId, trace);
  }

  let traceSummaries = Array.from(traces.values()).map(finalizeTraceAggregate);

  if (searchQuery) {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    traceSummaries = traceSummaries.filter((trace) =>
      [
        trace.traceId,
        trace.sessionId,
        trace.summary,
        ...trace.sourceKinds,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }

  const total = traceSummaries.length;
  const paged = traceSummaries
    .sort((left, right) => {
      if (left.startedAt === right.startedAt) {
        return left.traceId.localeCompare(right.traceId);
      }
      if (left.startedAt === null) return 1;
      if (right.startedAt === null) return -1;
      return left.startedAt.localeCompare(right.startedAt);
    })
    .slice(offset, offset + limit);

  return {
    total,
    limit,
    offset,
    range: {
      start: range.startMs !== undefined ? new Date(range.startMs).toISOString() : null,
      end: range.endMs !== undefined ? new Date(range.endMs).toISOString() : null,
    },
    traces: paged,
  };
}

function normalizeAnalyticsEvent(row: AnalyticsEventRow): NormalizedAnalyticsEvent {
  const payload = parseJsonPayload(row.payload_json);
  const timestampMs = coerceTimestampMsOrNow(row.event_timestamp);
  const payloadRecord = isRecord(payload) ? payload : {};
  const eventPayload = isRecord(payloadRecord.message) ? payloadRecord.message : payloadRecord;
  const text = extractTextContent(eventPayload);
  const keywordMentions =
    row.event_type === "user" || row.source_kind === "permission_event"
      ? matchKeywordMentions(text, {
          speaker: row.source_kind === "permission_event" ? "tool" : "user",
          sessionId: row.session_id ?? undefined,
          timestamp: timestampMs,
        })
      : [];
  const toolUseCount = extractToolUses(eventPayload).length;
  const usage = extractUsage(payloadRecord);
  const traceKind = inferTraceKind(row.source_kind, row.source_path);

  return {
    sourceKind: row.source_kind,
    sourcePath: row.source_path,
    sourceLine: row.source_line,
    sessionId: row.session_id ?? row.source_path,
    cwd: row.cwd,
    eventType: row.event_type ?? "unknown",
    eventSubtype: row.event_subtype,
    timestampMs,
    payload: payloadRecord,
    text,
    keywordMentions,
    toolUseCount,
    usage,
    estimatedCostUsd: extractEstimatedCostUsd(payloadRecord),
    errorSignal: hasErrorSignal(row, payloadRecord),
    traceKind,
  };
}

function createAnalyticsAggregate(): TraceAggregate {
  return {
    traceId: "",
    sessionId: "",
    traceKind: "runtime",
    sourceKinds: new Set<string>(),
    traceIds: new Set<string>(),
    startedAtMs: Number.POSITIVE_INFINITY,
    endedAtMs: Number.NEGATIVE_INFINITY,
    events: 0,
    errors: 0,
    keywordMentions: 0,
    toolUses: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    estimatedCostUsd: 0,
    contextEstimateTokensPeak: 0,
    summary: "",
  };
}

function createBucketAggregate(bucket: string): BucketAggregate {
  return {
    ...createAnalyticsAggregate(),
    bucket,
  };
}

function createTraceAggregate(traceId: string, row: NormalizedAnalyticsEvent): TraceAggregate {
  return {
    ...createAnalyticsAggregate(),
    traceId,
    sessionId: row.sessionId,
    traceKind: row.traceKind,
    summary: row.text || row.eventType,
  };
}

function addRowToAggregate(
  aggregate: TraceAggregate | BucketAggregate,
  row: NormalizedAnalyticsEvent
): void {
  aggregate.events += 1;
  aggregate.errors += row.errorSignal ? 1 : 0;
  aggregate.keywordMentions += row.keywordMentions.length;
  aggregate.toolUses += row.toolUseCount;
  aggregate.inputTokens += row.usage.inputTokens;
  aggregate.outputTokens += row.usage.outputTokens;
  aggregate.cacheReadTokens += row.usage.cacheReadTokens;
  aggregate.cacheCreationTokens += row.usage.cacheCreationTokens;
  aggregate.estimatedCostUsd += row.estimatedCostUsd;
  aggregate.contextEstimateTokensPeak = Math.max(
    aggregate.contextEstimateTokensPeak,
    row.usage.inputTokens + row.usage.cacheReadTokens + row.usage.cacheCreationTokens
  );
  aggregate.sourceKinds.add(row.sourceKind);
  aggregate.traceIds.add(row.sessionId || row.sourcePath);
  aggregate.startedAtMs = Math.min(aggregate.startedAtMs, row.timestampMs);
  aggregate.endedAtMs = Math.max(aggregate.endedAtMs, row.timestampMs);

  if (!aggregate.summary && row.text) {
    aggregate.summary = row.text;
  }
}

function addRowToTrace(trace: TraceAggregate, row: NormalizedAnalyticsEvent): void {
  addRowToAggregate(trace, row);
  if (trace.traceKind === "runtime" && row.traceKind !== "runtime") {
    trace.traceKind = row.traceKind;
  }
  if (!trace.sessionId && row.sessionId) {
    trace.sessionId = row.sessionId;
  }
  if (!trace.summary && row.text) {
    trace.summary = row.text;
  }
}

function finalizeAggregate(aggregate: TraceAggregate): {
  events: number;
  traces: number;
  errors: number;
  keywordMentions: number;
  toolUses: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUsd: number;
  contextEstimateTokensPeak: number;
} {
  return {
    events: aggregate.events,
    traces: aggregate.traceIds.size,
    errors: aggregate.errors,
    keywordMentions: aggregate.keywordMentions,
    toolUses: aggregate.toolUses,
    inputTokens: aggregate.inputTokens,
    outputTokens: aggregate.outputTokens,
    cacheReadTokens: aggregate.cacheReadTokens,
    cacheCreationTokens: aggregate.cacheCreationTokens,
    estimatedCostUsd: roundCurrency(aggregate.estimatedCostUsd),
    contextEstimateTokensPeak: aggregate.contextEstimateTokensPeak,
  };
}

function finalizeTraceAggregate(aggregate: TraceAggregate): AnalyticsTraceSummary {
  return {
    traceId: aggregate.traceId || aggregate.sessionId,
    sessionId: aggregate.sessionId || aggregate.traceId,
    traceKind: aggregate.traceKind,
    sourceKinds: Array.from(aggregate.sourceKinds).sort(),
    startedAt: isFinite(aggregate.startedAtMs) ? new Date(aggregate.startedAtMs).toISOString() : null,
    endedAt: isFinite(aggregate.endedAtMs) ? new Date(aggregate.endedAtMs).toISOString() : null,
    events: aggregate.events,
    errors: aggregate.errors,
    keywordMentions: aggregate.keywordMentions,
    toolUses: aggregate.toolUses,
    inputTokens: aggregate.inputTokens,
    outputTokens: aggregate.outputTokens,
    estimatedCostUsd: roundCurrency(aggregate.estimatedCostUsd),
    contextEstimateTokensPeak: aggregate.contextEstimateTokensPeak,
    summary: aggregate.summary || aggregate.sessionId || aggregate.traceId,
  };
}

function summarizeSourceCounts(rows: NormalizedAnalyticsEvent[]): AnalyticsRawTableCounts {
  const counts: AnalyticsRawTableCounts = {
    transcriptEvents: 0,
    middlewareSdkMessages: 0,
    hookEvents: 0,
    permissionEvents: 0,
    otelLogs: 0,
    otelSpans: 0,
  };

  for (const row of rows) {
    switch (row.sourceKind) {
      case "transcript":
        counts.transcriptEvents += 1;
        break;
      case "middleware_sdk_message":
        counts.middlewareSdkMessages += 1;
        break;
      case "hook_event":
        counts.hookEvents += 1;
        break;
      case "permission_event":
        counts.permissionEvents += 1;
        break;
      case "otel_log":
        counts.otelLogs += 1;
        break;
      case "otel_span":
        counts.otelSpans += 1;
        break;
    }
  }

  return counts;
}

async function writeBackfillMetadata(
  database: AnalyticsDatabase,
  stats: AnalyticsBackfillResponse
): Promise<void> {
  const now = new Date().toISOString();
  const entries: Array<[string, string]> = [
    ["last_backfill_at", now],
    ["last_backfill_files", String(stats.filesImported)],
    ["last_backfill_events", String(stats.eventsImported)],
  ];

  await database.connection.run("BEGIN TRANSACTION");
  try {
    for (const [key, value] of entries) {
      await database.connection.run(`
        INSERT OR REPLACE INTO analytics_metadata (key, value, updated_at)
        VALUES ('${escapeSqlLiteral(key)}', '${escapeSqlLiteral(value)}', CURRENT_TIMESTAMP)
      `);
    }
    await database.connection.run("COMMIT");
  } catch (error) {
    await database.connection.run("ROLLBACK");
    throw error;
  }
}

function parseRangeOrThrow(
  query: { start?: string; end?: string },
  reply: FastifyReply
): { startMs?: number; endMs?: number } | undefined {
  try {
    return {
      startMs: parseOptionalIsoTimestamp(query.start, "start"),
      endMs: parseOptionalIsoTimestamp(query.end, "end"),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid time range";
    reply.status(400).send({
      error: {
        code: "VALIDATION_ERROR",
        message,
      },
    });
    return undefined;
  }
}

function buildTimeRangeWhereClause(
  column: string,
  range: { startMs?: number; endMs?: number }
): string {
  const clauses = buildTimeRangeConditionList(column, range);
  return clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
}

function buildTimeRangeConditionList(
  column: string,
  range: { startMs?: number; endMs?: number }
): string[] {
  const clauses: string[] = [];
  if (range.startMs !== undefined) {
    clauses.push(`${column} >= ${formatTimestampLiteral(range.startMs)}`);
  }
  if (range.endMs !== undefined) {
    clauses.push(`${column} <= ${formatTimestampLiteral(range.endMs)}`);
  }
  return clauses;
}

function parseAnalyticsQueryFilters(query: {
  traceKinds?: string;
  sessionIds?: string;
  toolNames?: string;
  errorKinds?: string;
  keywordCategories?: string;
}): AnalyticsQueryFilters {
  return {
    traceKinds: parseCsvFilterValues(query.traceKinds),
    sessionIds: parseCsvFilterValues(query.sessionIds),
    toolNames: parseCsvFilterValues(query.toolNames),
    errorKinds: parseCsvFilterValues(query.errorKinds),
    keywordCategories: parseCsvFilterValues(query.keywordCategories),
  };
}

function parseCsvFilterValues(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function buildFilteredInteractionsCte(
  range: { startMs?: number; endMs?: number },
  filters: AnalyticsQueryFilters
): string {
  const clauses = buildInteractionFilterClauses(range, filters, "fi");
  return `
    WITH filtered_interactions AS (
      SELECT fi.*
      FROM fact_interactions fi
      ${clauses.length > 0 ? `WHERE ${clauses.join("\n        AND ")}` : ""}
    )
  `;
}

function buildInteractionFilterClauses(
  range: { startMs?: number; endMs?: number },
  filters: AnalyticsQueryFilters,
  interactionAlias: string
): string[] {
  const clauses = buildTimeRangeConditionList(`${interactionAlias}.started_at`, range);

  if (filters.traceKinds.length > 0) {
    clauses.push(`${interactionAlias}.trace_kind IN (${toSqlInList(filters.traceKinds)})`);
  }

  if (filters.sessionIds.length > 0) {
    const sessionList = toSqlInList(filters.sessionIds);
    clauses.push(`(${interactionAlias}.session_id IN (${sessionList}) OR ${interactionAlias}.root_session_id IN (${sessionList}))`);
  }

  if (filters.toolNames.length > 0) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM fact_tool_calls tc
        WHERE tc.interaction_id = ${interactionAlias}.interaction_id
          AND tc.tool_name IN (${toSqlInList(filters.toolNames)})
      )
    `.trim());
  }

  if (filters.errorKinds.length > 0) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM fact_errors fe
        WHERE fe.interaction_id = ${interactionAlias}.interaction_id
          AND fe.error_kind IN (${toSqlInList(filters.errorKinds)})
      )
    `.trim());
  }

  if (filters.keywordCategories.length > 0) {
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM fact_keyword_mentions km
        WHERE km.interaction_id = ${interactionAlias}.interaction_id
          AND km.category IN (${toSqlInList(filters.keywordCategories)})
      )
    `.trim());
  }

  return clauses;
}

function toSqlInList(values: string[]): string {
  return values.map((value) => `'${escapeSqlLiteral(value)}'`).join(", ");
}

function toFacetValues(rows: Array<Record<string, unknown>>): AnalyticsFacetValue[] {
  return rows.map((row) => ({
    value: String(row.value ?? ""),
    count: toNumber(row.count),
  }));
}

function parseOptionalIsoTimestamp(raw: string | undefined, fieldName: string): number | undefined {
  if (!raw) {
    return undefined;
  }

  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`${fieldName} must be a valid ISO-8601 timestamp`);
  }

  return parsed;
}

function formatTimestampLiteral(timestampMs: number): string {
  return `TIMESTAMP '${new Date(timestampMs).toISOString().replace("T", " ").replace("Z", "")}'`;
}

function extractUsage(payload: Record<string, unknown>): {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
} {
  const message = isRecord(payload.message) ? payload.message : undefined;
  const usage = isRecord(message?.usage)
    ? message.usage
    : isRecord(payload.usage)
      ? payload.usage
      : {};
  return {
    inputTokens: toNumber(usage.input_tokens ?? usage.inputTokens),
    outputTokens: toNumber(usage.output_tokens ?? usage.outputTokens),
    cacheReadTokens: toNumber(
      usage.cache_read_input_tokens ?? usage.cacheReadInputTokens
    ),
    cacheCreationTokens: toNumber(
      usage.cache_creation_input_tokens ?? usage.cacheCreationInputTokens
    ),
  };
}

function extractEstimatedCostUsd(payload: Record<string, unknown>): number {
  const message = isRecord(payload.message) ? payload.message : undefined;
  const result = isRecord(payload.result) ? payload.result : undefined;
  const structuredOutput = isRecord(payload.structured_output)
    ? payload.structured_output
    : undefined;

  const value =
    message?.total_cost_usd ??
    message?.totalCostUsd ??
    message?.costUSD ??
    payload.total_cost_usd ??
    payload.totalCostUsd ??
    payload.costUSD ??
    result?.total_cost_usd ??
    result?.totalCostUsd ??
    result?.costUSD ??
    structuredOutput?.total_cost_usd ??
    structuredOutput?.totalCostUsd ??
    structuredOutput?.costUSD;

  return roundCurrency(toNumber(value));
}

function hasErrorSignal(row: AnalyticsEventRow, payload: Record<string, unknown>): boolean {
  if ((row.event_subtype ?? "").toLowerCase().includes("error")) {
    return true;
  }

  if (payload.isApiErrorMessage === true) {
    return true;
  }

  return containsErrorMarker(payload);
}

function containsErrorMarker(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((entry) => containsErrorMarker(entry));
  }

  const record = value as Record<string, unknown>;
  if (record.is_error === true || record.isError === true) {
    return true;
  }

  if (typeof record.error === "string" && record.error.length > 0) {
    return true;
  }

  if (typeof record.error_message === "string" && record.error_message.length > 0) {
    return true;
  }

  return Object.values(record).some((entry) => containsErrorMarker(entry));
}

function inferTraceKind(sourceKind: string, sourcePath: string): "root" | "subagent" | "runtime" {
  if (sourcePath.includes("/subagents/")) {
    return "subagent";
  }

  if (sourceKind === "transcript") {
    return "root";
  }

  return "runtime";
}

function toBucketKey(timestampMs: number, bucket: AnalyticsTimeBucket): string {
  const date = new Date(timestampMs);
  if (bucket === "day") {
    return date.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 13) + ":00:00.000Z";
}

function parseJsonPayload(raw: string | null): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toOptionalNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoStringOrNull(value: unknown): string | null {
  return toIsoTimestampOrNull(value);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function roundCurrency(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
