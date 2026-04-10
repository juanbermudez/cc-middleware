import { extractTextContent, extractToolUses } from "../../sessions/messages.js";
import { matchKeywordMentions } from "../keywords/index.js";
import { estimateUsageCostUsd } from "../pricing.js";
import { coerceTimestampMsOrNow } from "../timestamps.js";
import type { AnalyticsDatabase } from "../types.js";

interface RawTranscriptWarehouseRow {
  dedupe_key: string;
  source_path: string;
  source_line: number | null;
  session_id: string | null;
  event_type: string;
  event_subtype: string | null;
  event_timestamp: string | Date | number | null;
  payload_json: string | Record<string, unknown> | null;
}

interface RawPermissionWarehouseRow {
  dedupe_key: string;
  session_id: string | null;
  cwd: string | null;
  tool_name: string | null;
  decision: string | null;
  event_timestamp: string | Date | number | null;
  payload_json: string | Record<string, unknown> | null;
}

interface RawSdkWarehouseRow {
  dedupe_key: string;
  session_id: string | null;
  event_subtype: string | null;
  event_timestamp: string | Date | number | null;
  payload_json: string | Record<string, unknown> | null;
}

interface ParsedTranscriptEvent {
  dedupeKey: string;
  sessionId: string;
  rootSessionId: string;
  transcriptKind: "root" | "subagent";
  traceKind: "root" | "subagent";
  sourcePath: string;
  sourceLine: number | null;
  eventType: string;
  eventSubtype: string | null;
  timestampMs: number;
  payload: Record<string, unknown>;
  interactionId: string;
  speaker: "user" | "assistant" | "system" | "runtime";
  text: string;
  toolUses: Array<{ id: string; name: string; input: unknown }>;
  toolResults: Array<{ toolUseId: string; isError: boolean; message: string }>;
  keywordMentions: ReturnType<typeof matchKeywordMentions>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  model?: string;
  stopReason?: string;
  assistantUuid?: string;
  sourceToolAssistantUUID?: string;
  agentId?: string;
  slug?: string;
  teamName?: string;
  teammateName?: string;
  contextEstimateTokens: number;
  estimatedCostUsd: number;
  errorSignals: Array<{
    kind: "api_error" | "tool_error";
    message: string;
    code?: string;
    toolUseId?: string;
  }>;
}

interface FactInteractionRow {
  interactionId: string;
  rootSessionId: string;
  sessionId: string;
  transcriptKind: "root" | "subagent";
  traceKind: "root" | "subagent";
  sourceKind: "transcript";
  startedAt: number;
  endedAt: number;
  eventCount: number;
  errorCount: number;
  keywordMentions: number;
  toolUseCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUsd: number;
  contextEstimateTokensPeak: number;
  summary: string;
}

interface FactRequestRow {
  requestId: string;
  interactionId: string;
  rootSessionId: string;
  sessionId: string;
  transcriptKind: "root" | "subagent";
  requestTimestamp: number;
  model?: string;
  stopReason?: string;
  assistantUuid?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUsd: number;
  contextEstimateTokens: number;
  sourceDedupeKey: string;
}

interface FactToolCallRow {
  toolCallId: string;
  interactionId: string;
  rootSessionId: string;
  sessionId: string;
  transcriptKind: "root" | "subagent";
  toolUseId: string;
  toolName: string;
  sourceAssistantUuid?: string;
  startedAt: number;
  finishedAt?: number;
  isError: boolean;
  errorMessage?: string;
  sourceDedupeKey: string;
}

interface FactErrorRow {
  errorId: string;
  interactionId?: string;
  rootSessionId?: string;
  sessionId?: string;
  transcriptKind?: "root" | "subagent";
  errorKind: string;
  toolName?: string;
  errorCode?: string;
  message: string;
  errorTimestamp: number;
  sourceDedupeKey: string;
}

interface FactSubagentRunRow {
  subagentRunId: string;
  rootSessionId: string;
  sessionId: string;
  agentId?: string;
  slug?: string;
  teamName?: string;
  teammateName?: string;
  sourceToolAssistantUUID?: string;
  startedAt: number;
  endedAt: number;
  eventCount: number;
  requestCount: number;
  errorCount: number;
  toolUseCount: number;
}

interface FactCompactionRow {
  compactionId: string;
  interactionId: string;
  rootSessionId: string;
  sessionId: string;
  compactedAt: number;
  messageCount?: number;
  sourceDedupeKey: string;
}

interface FactKeywordMentionRow {
  mentionId: string;
  interactionId: string;
  rootSessionId: string;
  sessionId: string;
  transcriptKind: "root" | "subagent";
  speaker: string;
  category: string;
  term: string;
  matchedText: string;
  severity: number;
  mentionTimestamp: number;
  sourceDedupeKey: string;
}

interface FactPermissionDecisionRow {
  decisionId: string;
  sessionId?: string;
  cwd?: string;
  toolName?: string;
  decision: string;
  decisionTimestamp: number;
  sourceDedupeKey: string;
  message?: string;
}

interface RollupRow {
  bucketStart: number;
  sourceKind: "transcript";
  traceKind: "root" | "subagent";
  traces: number;
  events: number;
  errors: number;
  keywordMentions: number;
  toolUseCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUsd: number;
  contextEstimateTokensPeak: number;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function toSqlString(value: string | undefined): string {
  return value === undefined ? "NULL" : `'${escapeSqlString(value)}'`;
}

function toSqlBoolean(value: boolean): string {
  return value ? "TRUE" : "FALSE";
}

function toSqlInteger(value: number | undefined): string {
  return value === undefined ? "NULL" : String(Math.trunc(value));
}

function toSqlDouble(value: number | undefined): string {
  return value === undefined ? "NULL" : String(value);
}

function toSqlTimestamp(value: number | undefined): string {
  if (value === undefined) {
    return "NULL";
  }

  return `TIMESTAMP '${new Date(value).toISOString().replace("T", " ").replace("Z", "")}'`;
}

function parseTimestamp(value: string | Date | number | null | undefined): number {
  return coerceTimestampMsOrNow(value);
}

function parseJsonRecord(
  value: string | Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  return value;
}

function coerceString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function coerceNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseUsage(payload: Record<string, unknown>): ParsedTranscriptEvent["usage"] {
  const message = payload.message;
  if (!message || typeof message !== "object") {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
  }

  const usage = (message as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
  }

  const usageRecord = usage as Record<string, unknown>;
  return {
    inputTokens: coerceNumber(usageRecord.input_tokens) ?? 0,
    outputTokens: coerceNumber(usageRecord.output_tokens) ?? 0,
    cacheReadTokens: coerceNumber(usageRecord.cache_read_input_tokens) ?? 0,
    cacheCreationTokens: coerceNumber(usageRecord.cache_creation_input_tokens) ?? 0,
  };
}

function parseToolResults(
  payload: Record<string, unknown>
): Array<{ toolUseId: string; isError: boolean; message: string }> {
  const message = payload.message;
  if (!message || typeof message !== "object") {
    return [];
  }

  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .filter((block): block is Record<string, unknown> =>
      typeof block === "object"
      && block !== null
      && (block as Record<string, unknown>).type === "tool_result"
    )
    .map((block) => ({
      toolUseId: coerceString(block.tool_use_id) ?? "",
      isError: block.is_error === true,
      message:
        coerceString(block.content)
        ?? coerceString(block.toolUseResult)
        ?? extractTextContent(block.content)
        ?? "",
    }));
}

function inferLineage(
  sourcePath: string,
  sessionId: string
): { rootSessionId: string; transcriptKind: "root" | "subagent" } {
  const segments = sourcePath.split(/[\\/]/).filter(Boolean);
  const subagentIndex = segments.lastIndexOf("subagents");
  if (subagentIndex > 0) {
    return {
      rootSessionId: segments[subagentIndex - 1] ?? sessionId,
      transcriptKind: "subagent",
    };
  }

  const filename = segments[segments.length - 1] ?? `${sessionId}.jsonl`;
  const rootSessionId = filename.endsWith(".jsonl")
    ? filename.slice(0, -".jsonl".length)
    : sessionId;
  return {
    rootSessionId: rootSessionId || sessionId,
    transcriptKind: "root",
  };
}

function readTraceKind(
  transcriptKind: "root" | "subagent"
): "root" | "subagent" {
  return transcriptKind;
}

function isPromptLikeUserEvent(payload: Record<string, unknown>, eventType: string): boolean {
  return eventType === "user" && extractTextContent(payload.message).trim().length > 0;
}

function readSummaryText(event: ParsedTranscriptEvent): string {
  if (event.speaker === "user" && event.text.trim()) {
    return event.text.trim();
  }
  return "";
}

function truncateSummary(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 240) {
    return normalized;
  }
  return `${normalized.slice(0, 237)}...`;
}

async function loadTranscriptRows(
  database: AnalyticsDatabase
): Promise<ParsedTranscriptEvent[]> {
  const result = await database.connection.runAndReadAll(`
    SELECT
      dedupe_key,
      source_path,
      source_line,
      session_id,
      event_type,
      event_subtype,
      event_timestamp,
      payload_json::VARCHAR AS payload_json
    FROM raw_transcript_events
    ORDER BY event_timestamp ASC, source_path ASC, source_line ASC
  `);

  const rawRows = result.getRowObjects() as unknown as RawTranscriptWarehouseRow[];
  const rowsBySession = new Map<string, RawTranscriptWarehouseRow[]>();
  for (const row of rawRows) {
    const sessionId = row.session_id ?? "";
    if (!rowsBySession.has(sessionId)) {
      rowsBySession.set(sessionId, []);
    }
    rowsBySession.get(sessionId)!.push(row);
  }

  const parsedEvents: ParsedTranscriptEvent[] = [];

  for (const [sessionId, rows] of rowsBySession) {
    let interactionIndex = 0;
    let currentInteractionId = "";

    for (const row of rows) {
      const payload = parseJsonRecord(row.payload_json);
      if (!currentInteractionId) {
        interactionIndex = 1;
        currentInteractionId = `${sessionId}:interaction:${interactionIndex}`;
      }

      if (isPromptLikeUserEvent(payload, row.event_type)) {
        currentInteractionId = `${sessionId}:interaction:${interactionIndex}`;
        interactionIndex += 1;
      }

      const { rootSessionId, transcriptKind } = inferLineage(
        row.source_path,
        row.session_id ?? "unknown-session"
      );
      const usage = parseUsage(payload);
      const messageRecord =
        payload.message && typeof payload.message === "object"
          ? (payload.message as Record<string, unknown>)
          : undefined;
      const text = extractTextContent(messageRecord ?? payload);
      const keywordMentions =
        row.event_type === "user"
          ? matchKeywordMentions(text, {
              speaker: "user",
              sessionId: row.session_id ?? undefined,
              interactionId: currentInteractionId,
              timestamp: row.event_timestamp ?? undefined,
            })
          : [];
      const toolUses = messageRecord ? extractToolUses(messageRecord) : [];
      const toolResults = parseToolResults(payload);
      const contextEstimateTokens =
        usage.inputTokens + usage.cacheReadTokens + usage.cacheCreationTokens;
      const model = coerceString(messageRecord?.model);
      const estimatedCostUsd = estimateUsageCostUsd({
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheCreationTokens: usage.cacheCreationTokens,
      });
      const apiError =
        payload.isApiErrorMessage === true || row.event_subtype === "api_error";
      const errorSignals: ParsedTranscriptEvent["errorSignals"] = toolResults
        .filter((toolResult) => toolResult.isError)
        .map((toolResult) => ({
          kind: "tool_error" as const,
          message: toolResult.message || "Tool result reported an error",
          toolUseId: toolResult.toolUseId,
        }));

      if (apiError) {
        errorSignals.push({
          kind: "api_error",
          message:
            text
            || coerceString(payload.error)
            || "API error message emitted by Claude Code",
          code: coerceString(payload.error),
        });
      }

      parsedEvents.push({
        dedupeKey: row.dedupe_key,
        sessionId: row.session_id ?? "unknown-session",
        rootSessionId,
        transcriptKind,
        traceKind: readTraceKind(transcriptKind),
        sourcePath: row.source_path,
        sourceLine: row.source_line,
        eventType: row.event_type,
        eventSubtype: row.event_subtype,
        timestampMs: parseTimestamp(row.event_timestamp),
        payload,
        interactionId: currentInteractionId,
        speaker:
          row.event_type === "user"
            ? "user"
            : row.event_type === "assistant"
              ? "assistant"
              : "system",
        text,
        toolUses,
        toolResults,
        keywordMentions,
        usage,
        model,
        stopReason: coerceString(messageRecord?.stop_reason),
        assistantUuid: coerceString(payload.uuid),
        sourceToolAssistantUUID: coerceString(payload.sourceToolAssistantUUID),
        agentId: coerceString(payload.agentId),
        slug: coerceString(payload.slug),
        teamName: coerceString(payload.team_name) ?? coerceString(payload.teamName),
        teammateName:
          coerceString(payload.teammate_name) ?? coerceString(payload.teammateName),
        contextEstimateTokens,
        estimatedCostUsd,
        errorSignals,
      });
    }
  }

  return parsedEvents.sort((left, right) => {
    if (left.timestampMs !== right.timestampMs) {
      return left.timestampMs - right.timestampMs;
    }
    return left.dedupeKey.localeCompare(right.dedupeKey);
  });
}

async function loadPermissionRows(
  database: AnalyticsDatabase
): Promise<FactPermissionDecisionRow[]> {
  const result = await database.connection.runAndReadAll(`
    SELECT
      dedupe_key,
      session_id,
      cwd,
      tool_name,
      decision,
      event_timestamp,
      payload_json::VARCHAR AS payload_json
    FROM raw_permission_events
    ORDER BY event_timestamp ASC, source_path ASC, source_line ASC
  `);

  const rows = result.getRowObjects() as unknown as RawPermissionWarehouseRow[];
  return rows.map((row) => {
    const payload = parseJsonRecord(row.payload_json);
    return {
      decisionId: row.dedupe_key,
      sessionId: row.session_id ?? undefined,
      cwd: row.cwd ?? undefined,
      toolName: row.tool_name ?? undefined,
      decision: row.decision ?? "unknown",
      decisionTimestamp: parseTimestamp(row.event_timestamp),
      sourceDedupeKey: row.dedupe_key,
      message: coerceString(payload.message),
    };
  });
}

async function loadMiddlewareErrorRows(
  database: AnalyticsDatabase
): Promise<FactErrorRow[]> {
  const result = await database.connection.runAndReadAll(`
    SELECT
      dedupe_key,
      session_id,
      event_subtype,
      event_timestamp,
      payload_json::VARCHAR AS payload_json
    FROM raw_middleware_sdk_messages
    ORDER BY event_timestamp ASC, source_path ASC, source_line ASC
  `);

  const rows = result.getRowObjects() as unknown as RawSdkWarehouseRow[];
  const errors: FactErrorRow[] = [];

  for (const row of rows) {
    const payload = parseJsonRecord(row.payload_json);
    const rawMessage =
      payload.message && typeof payload.message === "object"
        ? (payload.message as Record<string, unknown>)
        : undefined;
    const subtype = coerceString(rawMessage?.subtype) ?? row.event_subtype ?? "";
    const isError =
      rawMessage?.is_error === true
      || subtype.startsWith("error")
      || subtype.includes("error");

    if (!isError) {
      continue;
    }

    const message =
      coerceString(rawMessage?.result)
      ?? extractTextContent(rawMessage)
      ?? coerceString(payload.message)
      ?? "Middleware SDK result reported an error";

    errors.push({
      errorId: row.dedupe_key,
      sessionId: row.session_id ?? undefined,
      errorKind: "middleware_error",
      message,
      errorTimestamp: parseTimestamp(row.event_timestamp),
      sourceDedupeKey: row.dedupe_key,
    });
  }

  return errors;
}

function hourBucket(timestampMs: number): number {
  return Math.floor(timestampMs / 3_600_000) * 3_600_000;
}

function dayBucket(timestampMs: number): number {
  return Math.floor(timestampMs / 86_400_000) * 86_400_000;
}

function buildDerivedRows(events: ParsedTranscriptEvent[]): {
  interactions: FactInteractionRow[];
  requests: FactRequestRow[];
  toolCalls: FactToolCallRow[];
  errors: FactErrorRow[];
  subagentRuns: FactSubagentRunRow[];
  compactions: FactCompactionRow[];
  keywordMentions: FactKeywordMentionRow[];
  hourlyRollups: RollupRow[];
  dailyRollups: RollupRow[];
} {
  const toolCalls = new Map<string, FactToolCallRow>();
  const errors: FactErrorRow[] = [];
  const compactions: FactCompactionRow[] = [];
  const keywordMentions: FactKeywordMentionRow[] = [];
  const requests: FactRequestRow[] = [];
  const interactions = new Map<string, FactInteractionRow>();
  const interactionSummary = new Map<string, string>();
  const subagentRuns = new Map<string, FactSubagentRunRow>();
  const hourlyRollups = new Map<string, RollupRow & { traceIds: Set<string> }>();
  const dailyRollups = new Map<string, RollupRow & { traceIds: Set<string> }>();

  for (const event of events) {
    const interaction = interactions.get(event.interactionId) ?? {
      interactionId: event.interactionId,
      rootSessionId: event.rootSessionId,
      sessionId: event.sessionId,
      transcriptKind: event.transcriptKind,
      traceKind: event.traceKind,
      sourceKind: "transcript",
      startedAt: event.timestampMs,
      endedAt: event.timestampMs,
      eventCount: 0,
      errorCount: 0,
      keywordMentions: 0,
      toolUseCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      estimatedCostUsd: 0,
      contextEstimateTokensPeak: 0,
      summary: "",
    };

    interaction.startedAt = Math.min(interaction.startedAt, event.timestampMs);
    interaction.endedAt = Math.max(interaction.endedAt, event.timestampMs);
    interaction.eventCount += 1;
    interaction.keywordMentions += event.keywordMentions.length;
    interaction.toolUseCount += event.toolUses.length;
    interaction.contextEstimateTokensPeak = Math.max(
      interaction.contextEstimateTokensPeak,
      event.contextEstimateTokens
    );
    interactions.set(event.interactionId, interaction);

    const summaryText = readSummaryText(event);
    if (summaryText && !interactionSummary.has(event.interactionId)) {
      interactionSummary.set(event.interactionId, summaryText);
    }

    if (event.usage.inputTokens > 0 || event.usage.outputTokens > 0) {
      const requestId = `${event.dedupeKey}:request`;
      requests.push({
        requestId,
        interactionId: event.interactionId,
        rootSessionId: event.rootSessionId,
        sessionId: event.sessionId,
        transcriptKind: event.transcriptKind,
        requestTimestamp: event.timestampMs,
        model: event.model,
        stopReason: event.stopReason,
        assistantUuid: event.assistantUuid,
        inputTokens: event.usage.inputTokens,
        outputTokens: event.usage.outputTokens,
        cacheReadTokens: event.usage.cacheReadTokens,
        cacheCreationTokens: event.usage.cacheCreationTokens,
        estimatedCostUsd: event.estimatedCostUsd,
        contextEstimateTokens: event.contextEstimateTokens,
        sourceDedupeKey: event.dedupeKey,
      });

      interaction.inputTokens += event.usage.inputTokens;
      interaction.outputTokens += event.usage.outputTokens;
      interaction.cacheReadTokens += event.usage.cacheReadTokens;
      interaction.cacheCreationTokens += event.usage.cacheCreationTokens;
      interaction.estimatedCostUsd = Number(
        (interaction.estimatedCostUsd + event.estimatedCostUsd).toFixed(9)
      );
    }

    for (const toolUse of event.toolUses) {
      const toolCallId = toolUse.id || `${event.dedupeKey}:tool:${toolUse.name}`;
      toolCalls.set(toolCallId, {
        toolCallId,
        interactionId: event.interactionId,
        rootSessionId: event.rootSessionId,
        sessionId: event.sessionId,
        transcriptKind: event.transcriptKind,
        toolUseId: toolUse.id,
        toolName: toolUse.name,
        sourceAssistantUuid: event.assistantUuid,
        startedAt: event.timestampMs,
        finishedAt: undefined,
        isError: false,
        errorMessage: undefined,
        sourceDedupeKey: event.dedupeKey,
      });
    }

    for (const toolResult of event.toolResults) {
      const toolCallId = toolResult.toolUseId || `${event.dedupeKey}:tool_result`;
      const existing = toolCalls.get(toolCallId);
      if (existing) {
        existing.finishedAt = event.timestampMs;
        if (toolResult.isError) {
          existing.isError = true;
          existing.errorMessage = toolResult.message;
        }
      } else {
        toolCalls.set(toolCallId, {
          toolCallId,
          interactionId: event.interactionId,
          rootSessionId: event.rootSessionId,
          sessionId: event.sessionId,
          transcriptKind: event.transcriptKind,
          toolUseId: toolResult.toolUseId,
          toolName: "unknown",
          startedAt: event.timestampMs,
          finishedAt: event.timestampMs,
          isError: toolResult.isError,
          errorMessage: toolResult.message,
          sourceDedupeKey: event.dedupeKey,
        });
      }
    }

    for (let index = 0; index < event.keywordMentions.length; index++) {
      const mention = event.keywordMentions[index];
      keywordMentions.push({
        mentionId: `${event.dedupeKey}:keyword:${index}`,
        interactionId: event.interactionId,
        rootSessionId: event.rootSessionId,
        sessionId: event.sessionId,
        transcriptKind: event.transcriptKind,
        speaker: mention.speaker ?? event.speaker,
        category: mention.category,
        term: mention.term,
        matchedText: mention.matchedText,
        severity: mention.severity,
        mentionTimestamp: mention.timestamp ?? event.timestampMs,
        sourceDedupeKey: event.dedupeKey,
      });
    }

    for (const errorSignal of event.errorSignals) {
      interaction.errorCount += 1;
      const toolCall = errorSignal.toolUseId ? toolCalls.get(errorSignal.toolUseId) : undefined;
      errors.push({
        errorId: `${event.dedupeKey}:error:${errors.length}`,
        interactionId: event.interactionId,
        rootSessionId: event.rootSessionId,
        sessionId: event.sessionId,
        transcriptKind: event.transcriptKind,
        errorKind: errorSignal.kind,
        toolName: toolCall?.toolName,
        errorCode: errorSignal.code,
        message: errorSignal.message,
        errorTimestamp: event.timestampMs,
        sourceDedupeKey: event.dedupeKey,
      });
    }

    if (event.eventType === "system" && event.eventSubtype === "compact_boundary") {
      compactions.push({
        compactionId: event.dedupeKey,
        interactionId: event.interactionId,
        rootSessionId: event.rootSessionId,
        sessionId: event.sessionId,
        compactedAt: event.timestampMs,
        messageCount: coerceNumber(event.payload.messageCount),
        sourceDedupeKey: event.dedupeKey,
      });
    }

    if (event.transcriptKind === "subagent") {
      const subagentRunId = `${event.rootSessionId}:${event.sessionId}`;
      const run = subagentRuns.get(subagentRunId) ?? {
        subagentRunId,
        rootSessionId: event.rootSessionId,
        sessionId: event.sessionId,
        agentId: event.agentId,
        slug: event.slug,
        teamName: event.teamName,
        teammateName: event.teammateName,
        sourceToolAssistantUUID: event.sourceToolAssistantUUID,
        startedAt: event.timestampMs,
        endedAt: event.timestampMs,
        eventCount: 0,
        requestCount: 0,
        errorCount: 0,
        toolUseCount: 0,
      };
      run.startedAt = Math.min(run.startedAt, event.timestampMs);
      run.endedAt = Math.max(run.endedAt, event.timestampMs);
      run.eventCount += 1;
      run.requestCount += event.usage.inputTokens > 0 || event.usage.outputTokens > 0 ? 1 : 0;
      run.errorCount += event.errorSignals.length;
      run.toolUseCount += event.toolUses.length;
      subagentRuns.set(subagentRunId, run);
    }

    const rollupInputs = [
      {
        bucketStart: hourBucket(event.timestampMs),
        target: hourlyRollups,
      },
      {
        bucketStart: dayBucket(event.timestampMs),
        target: dailyRollups,
      },
    ] as const;

    for (const rollupInput of rollupInputs) {
      const key = `${rollupInput.bucketStart}:${event.traceKind}`;
      const current = rollupInput.target.get(key) ?? {
        bucketStart: rollupInput.bucketStart,
        sourceKind: "transcript" as const,
        traceKind: event.traceKind,
        traces: 0,
        events: 0,
        errors: 0,
        keywordMentions: 0,
        toolUseCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        estimatedCostUsd: 0,
        contextEstimateTokensPeak: 0,
        traceIds: new Set<string>(),
      };

      current.events += 1;
      current.errors += event.errorSignals.length;
      current.keywordMentions += event.keywordMentions.length;
      current.toolUseCount += event.toolUses.length;
      current.inputTokens += event.usage.inputTokens;
      current.outputTokens += event.usage.outputTokens;
      current.cacheReadTokens += event.usage.cacheReadTokens;
      current.cacheCreationTokens += event.usage.cacheCreationTokens;
      current.estimatedCostUsd = Number(
        (current.estimatedCostUsd + event.estimatedCostUsd).toFixed(9)
      );
      current.contextEstimateTokensPeak = Math.max(
        current.contextEstimateTokensPeak,
        event.contextEstimateTokens
      );
      current.traceIds.add(event.interactionId);
      current.traces = current.traceIds.size;
      rollupInput.target.set(key, current);
    }
  }

  for (const interaction of interactions.values()) {
    interaction.summary = truncateSummary(
      interactionSummary.get(interaction.interactionId) ?? ""
    );
  }

  return {
    interactions: Array.from(interactions.values()),
    requests,
    toolCalls: Array.from(toolCalls.values()),
    errors,
    subagentRuns: Array.from(subagentRuns.values()),
    compactions,
    keywordMentions,
    hourlyRollups: Array.from(hourlyRollups.values()).map(({ traceIds: _traceIds, ...row }) => row),
    dailyRollups: Array.from(dailyRollups.values()).map(({ traceIds: _traceIds, ...row }) => row),
  };
}

async function clearDerivedTables(database: AnalyticsDatabase): Promise<void> {
  const tables = [
    "fact_interactions",
    "fact_requests",
    "fact_tool_calls",
    "fact_errors",
    "fact_subagent_runs",
    "fact_compactions",
    "fact_keyword_mentions",
    "fact_permission_decisions",
    "rollup_metrics_hourly",
    "rollup_metrics_daily",
  ];

  for (const table of tables) {
    await database.connection.run(`DELETE FROM ${table}`);
  }
}

async function insertRows(
  database: AnalyticsDatabase,
  tableName: string,
  columns: string[],
  rows: string[][]
): Promise<void> {
  for (const row of rows) {
    await database.connection.run(`
      INSERT INTO ${tableName} (${columns.join(", ")})
      VALUES (${row.join(", ")})
    `);
  }
}

async function writeDerivedRows(
  database: AnalyticsDatabase,
  rows: ReturnType<typeof buildDerivedRows>,
  permissions: FactPermissionDecisionRow[],
  middlewareErrors: FactErrorRow[]
): Promise<void> {
  await database.connection.run("BEGIN TRANSACTION");
  try {
    await clearDerivedTables(database);

    await insertRows(
      database,
      "fact_interactions",
      [
        "interaction_id",
        "root_session_id",
        "session_id",
        "transcript_kind",
        "trace_kind",
        "source_kind",
        "started_at",
        "ended_at",
        "event_count",
        "error_count",
        "keyword_mentions",
        "tool_use_count",
        "input_tokens",
        "output_tokens",
        "cache_read_tokens",
        "cache_creation_tokens",
        "estimated_cost_usd",
        "context_estimate_tokens_peak",
        "summary",
      ],
      rows.interactions.map((row) => [
        toSqlString(row.interactionId),
        toSqlString(row.rootSessionId),
        toSqlString(row.sessionId),
        toSqlString(row.transcriptKind),
        toSqlString(row.traceKind),
        toSqlString(row.sourceKind),
        toSqlTimestamp(row.startedAt),
        toSqlTimestamp(row.endedAt),
        toSqlInteger(row.eventCount),
        toSqlInteger(row.errorCount),
        toSqlInteger(row.keywordMentions),
        toSqlInteger(row.toolUseCount),
        toSqlInteger(row.inputTokens),
        toSqlInteger(row.outputTokens),
        toSqlInteger(row.cacheReadTokens),
        toSqlInteger(row.cacheCreationTokens),
        toSqlDouble(row.estimatedCostUsd),
        toSqlInteger(row.contextEstimateTokensPeak),
        toSqlString(row.summary),
      ])
    );

    await insertRows(
      database,
      "fact_requests",
      [
        "request_id",
        "interaction_id",
        "root_session_id",
        "session_id",
        "transcript_kind",
        "request_timestamp",
        "model",
        "stop_reason",
        "assistant_uuid",
        "input_tokens",
        "output_tokens",
        "cache_read_tokens",
        "cache_creation_tokens",
        "estimated_cost_usd",
        "context_estimate_tokens",
        "source_dedupe_key",
      ],
      rows.requests.map((row) => [
        toSqlString(row.requestId),
        toSqlString(row.interactionId),
        toSqlString(row.rootSessionId),
        toSqlString(row.sessionId),
        toSqlString(row.transcriptKind),
        toSqlTimestamp(row.requestTimestamp),
        toSqlString(row.model),
        toSqlString(row.stopReason),
        toSqlString(row.assistantUuid),
        toSqlInteger(row.inputTokens),
        toSqlInteger(row.outputTokens),
        toSqlInteger(row.cacheReadTokens),
        toSqlInteger(row.cacheCreationTokens),
        toSqlDouble(row.estimatedCostUsd),
        toSqlInteger(row.contextEstimateTokens),
        toSqlString(row.sourceDedupeKey),
      ])
    );

    await insertRows(
      database,
      "fact_tool_calls",
      [
        "tool_call_id",
        "interaction_id",
        "root_session_id",
        "session_id",
        "transcript_kind",
        "tool_use_id",
        "tool_name",
        "source_assistant_uuid",
        "started_at",
        "finished_at",
        "is_error",
        "error_message",
        "source_dedupe_key",
      ],
      rows.toolCalls.map((row) => [
        toSqlString(row.toolCallId),
        toSqlString(row.interactionId),
        toSqlString(row.rootSessionId),
        toSqlString(row.sessionId),
        toSqlString(row.transcriptKind),
        toSqlString(row.toolUseId),
        toSqlString(row.toolName),
        toSqlString(row.sourceAssistantUuid),
        toSqlTimestamp(row.startedAt),
        toSqlTimestamp(row.finishedAt),
        toSqlBoolean(row.isError),
        toSqlString(row.errorMessage),
        toSqlString(row.sourceDedupeKey),
      ])
    );

    await insertRows(
      database,
      "fact_errors",
      [
        "error_id",
        "interaction_id",
        "root_session_id",
        "session_id",
        "transcript_kind",
        "error_kind",
        "tool_name",
        "error_code",
        "message",
        "error_timestamp",
        "source_dedupe_key",
      ],
      [...rows.errors, ...middlewareErrors, ...permissions
        .filter((row) => row.decision === "deny")
        .map((row) => ({
          errorId: `${row.decisionId}:error`,
          interactionId: undefined,
          rootSessionId: undefined,
          sessionId: row.sessionId,
          transcriptKind: undefined,
          errorKind: "permission_denied",
          toolName: row.toolName,
          errorCode: undefined,
          message: row.message ?? "Permission denied",
          errorTimestamp: row.decisionTimestamp,
          sourceDedupeKey: row.sourceDedupeKey,
        }))].map((row) => [
        toSqlString(row.errorId),
        toSqlString(row.interactionId),
        toSqlString(row.rootSessionId),
        toSqlString(row.sessionId),
        toSqlString(row.transcriptKind),
        toSqlString(row.errorKind),
        toSqlString(row.toolName),
        toSqlString(row.errorCode),
        toSqlString(row.message),
        toSqlTimestamp(row.errorTimestamp),
        toSqlString(row.sourceDedupeKey),
      ])
    );

    await insertRows(
      database,
      "fact_subagent_runs",
      [
        "subagent_run_id",
        "root_session_id",
        "session_id",
        "agent_id",
        "slug",
        "team_name",
        "teammate_name",
        "source_tool_assistant_uuid",
        "started_at",
        "ended_at",
        "event_count",
        "request_count",
        "error_count",
        "tool_use_count",
      ],
      rows.subagentRuns.map((row) => [
        toSqlString(row.subagentRunId),
        toSqlString(row.rootSessionId),
        toSqlString(row.sessionId),
        toSqlString(row.agentId),
        toSqlString(row.slug),
        toSqlString(row.teamName),
        toSqlString(row.teammateName),
        toSqlString(row.sourceToolAssistantUUID),
        toSqlTimestamp(row.startedAt),
        toSqlTimestamp(row.endedAt),
        toSqlInteger(row.eventCount),
        toSqlInteger(row.requestCount),
        toSqlInteger(row.errorCount),
        toSqlInteger(row.toolUseCount),
      ])
    );

    await insertRows(
      database,
      "fact_compactions",
      [
        "compaction_id",
        "interaction_id",
        "root_session_id",
        "session_id",
        "compacted_at",
        "message_count",
        "source_dedupe_key",
      ],
      rows.compactions.map((row) => [
        toSqlString(row.compactionId),
        toSqlString(row.interactionId),
        toSqlString(row.rootSessionId),
        toSqlString(row.sessionId),
        toSqlTimestamp(row.compactedAt),
        toSqlInteger(row.messageCount),
        toSqlString(row.sourceDedupeKey),
      ])
    );

    await insertRows(
      database,
      "fact_keyword_mentions",
      [
        "mention_id",
        "interaction_id",
        "root_session_id",
        "session_id",
        "transcript_kind",
        "speaker",
        "category",
        "term",
        "matched_text",
        "severity",
        "mention_timestamp",
        "source_dedupe_key",
      ],
      rows.keywordMentions.map((row) => [
        toSqlString(row.mentionId),
        toSqlString(row.interactionId),
        toSqlString(row.rootSessionId),
        toSqlString(row.sessionId),
        toSqlString(row.transcriptKind),
        toSqlString(row.speaker),
        toSqlString(row.category),
        toSqlString(row.term),
        toSqlString(row.matchedText),
        toSqlInteger(row.severity),
        toSqlTimestamp(row.mentionTimestamp),
        toSqlString(row.sourceDedupeKey),
      ])
    );

    await insertRows(
      database,
      "fact_permission_decisions",
      [
        "decision_id",
        "session_id",
        "cwd",
        "tool_name",
        "decision",
        "decision_timestamp",
        "source_dedupe_key",
        "message",
      ],
      permissions.map((row) => [
        toSqlString(row.decisionId),
        toSqlString(row.sessionId),
        toSqlString(row.cwd),
        toSqlString(row.toolName),
        toSqlString(row.decision),
        toSqlTimestamp(row.decisionTimestamp),
        toSqlString(row.sourceDedupeKey),
        toSqlString(row.message),
      ])
    );

    await insertRows(
      database,
      "rollup_metrics_hourly",
      [
        "bucket_start",
        "source_kind",
        "trace_kind",
        "traces",
        "events",
        "errors",
        "keyword_mentions",
        "tool_use_count",
        "input_tokens",
        "output_tokens",
        "cache_read_tokens",
        "cache_creation_tokens",
        "estimated_cost_usd",
        "context_estimate_tokens_peak",
      ],
      rows.hourlyRollups.map((row) => [
        toSqlTimestamp(row.bucketStart),
        toSqlString(row.sourceKind),
        toSqlString(row.traceKind),
        toSqlInteger(row.traces),
        toSqlInteger(row.events),
        toSqlInteger(row.errors),
        toSqlInteger(row.keywordMentions),
        toSqlInteger(row.toolUseCount),
        toSqlInteger(row.inputTokens),
        toSqlInteger(row.outputTokens),
        toSqlInteger(row.cacheReadTokens),
        toSqlInteger(row.cacheCreationTokens),
        toSqlDouble(row.estimatedCostUsd),
        toSqlInteger(row.contextEstimateTokensPeak),
      ])
    );

    await insertRows(
      database,
      "rollup_metrics_daily",
      [
        "bucket_start",
        "source_kind",
        "trace_kind",
        "traces",
        "events",
        "errors",
        "keyword_mentions",
        "tool_use_count",
        "input_tokens",
        "output_tokens",
        "cache_read_tokens",
        "cache_creation_tokens",
        "estimated_cost_usd",
        "context_estimate_tokens_peak",
      ],
      rows.dailyRollups.map((row) => [
        toSqlTimestamp(row.bucketStart),
        toSqlString(row.sourceKind),
        toSqlString(row.traceKind),
        toSqlInteger(row.traces),
        toSqlInteger(row.events),
        toSqlInteger(row.errors),
        toSqlInteger(row.keywordMentions),
        toSqlInteger(row.toolUseCount),
        toSqlInteger(row.inputTokens),
        toSqlInteger(row.outputTokens),
        toSqlInteger(row.cacheReadTokens),
        toSqlInteger(row.cacheCreationTokens),
        toSqlDouble(row.estimatedCostUsd),
        toSqlInteger(row.contextEstimateTokensPeak),
      ])
    );

    await database.connection.run(`
      INSERT OR REPLACE INTO analytics_metadata (key, value, updated_at)
      VALUES ('derived_refreshed_at', '${escapeSqlString(new Date().toISOString())}', CURRENT_TIMESTAMP)
    `);

    await database.connection.run("COMMIT");
  } catch (error) {
    await database.connection.run("ROLLBACK");
    throw error;
  }
}

export async function refreshDerivedAnalyticsTables(
  database: AnalyticsDatabase
): Promise<void> {
  const transcriptEvents = await loadTranscriptRows(database);
  const permissionRows = await loadPermissionRows(database);
  const middlewareErrors = await loadMiddlewareErrorRows(database);
  const derivedRows = buildDerivedRows(transcriptEvents);
  await writeDerivedRows(database, derivedRows, permissionRows, middlewareErrors);
}
