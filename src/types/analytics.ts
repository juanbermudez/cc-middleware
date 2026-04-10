/**
 * Shared analytics API types.
 * Keep these lightweight so the API layer can evolve independently from
 * the warehouse and derived analytics implementation.
 */

import type { AnalyticsDatabase } from "../analytics/types.js";

export type AnalyticsTimeBucket = "hour" | "day";

export interface AnalyticsContext {
  database?: AnalyticsDatabase;
}

export interface AnalyticsFilters {
  traceKinds: Array<"root" | "subagent" | "runtime">;
  sessionIds: string[];
  toolNames: string[];
  errorKinds: string[];
  keywordCategories: string[];
}

export interface AnalyticsRawTableCounts {
  transcriptEvents: number;
  middlewareSdkMessages: number;
  hookEvents: number;
  permissionEvents: number;
  otelLogs: number;
  otelSpans: number;
}

export interface AnalyticsStatusResponse {
  available: true;
  dbPath: string;
  rawTables: AnalyticsRawTableCounts;
  lastBackfillAt: string | null;
  lastBackfillFiles: number | null;
  lastBackfillEvents: number | null;
}

export interface AnalyticsOverviewTotals {
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
}

export interface AnalyticsOverviewKeywordBreakdown {
  category: string;
  term: string;
  count: number;
}

export interface AnalyticsOverviewResponse {
  range: {
    start: string | null;
    end: string | null;
  };
  totals: AnalyticsOverviewTotals;
  sourceCounts: AnalyticsRawTableCounts;
  keywordBreakdown: AnalyticsOverviewKeywordBreakdown[];
}

export interface AnalyticsTimeseriesPoint {
  bucket: string;
  events: number;
  traces: number;
  errors: number;
  keywordMentions: number;
  toolUses: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  contextEstimateTokensPeak: number;
}

export interface AnalyticsTimeseriesResponse {
  bucket: AnalyticsTimeBucket;
  range: {
    start: string | null;
    end: string | null;
  };
  points: AnalyticsTimeseriesPoint[];
}

export interface AnalyticsToolPerformanceRow {
  toolName: string;
  callCount: number;
  errorCount: number;
  errorRate: number;
  sessionCount: number;
  traceCount: number;
  topErrorKind?: string;
  topErrorCount: number;
  lastSeenAt: string | null;
}

export interface AnalyticsToolPerformanceResponse {
  range: {
    start: string | null;
    end: string | null;
  };
  rows: AnalyticsToolPerformanceRow[];
}

export interface AnalyticsToolFailureDetail {
  errorId: string;
  traceId: string;
  sessionId: string;
  errorKind: string;
  errorCode?: string;
  message: string;
  timestamp: string | null;
}

export interface AnalyticsToolPerformanceDetailResponse {
  range: {
    start: string | null;
    end: string | null;
  };
  tool: AnalyticsToolPerformanceRow;
  errorKinds: AnalyticsFacetValue[];
  recentFailures: AnalyticsToolFailureDetail[];
}

export interface AnalyticsTraceSummary {
  traceId: string;
  sessionId: string;
  traceKind: "root" | "subagent" | "runtime";
  sourceKinds: string[];
  startedAt: string | null;
  endedAt: string | null;
  events: number;
  errors: number;
  keywordMentions: number;
  toolUses: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  contextEstimateTokensPeak: number;
  summary: string;
}

export interface AnalyticsTracesResponse {
  total: number;
  limit: number;
  offset: number;
  range: {
    start: string | null;
    end: string | null;
  };
  traces: AnalyticsTraceSummary[];
}

export interface AnalyticsFacetValue {
  value: string;
  count: number;
}

export interface AnalyticsFacetsResponse {
  range: {
    start: string | null;
    end: string | null;
  };
  traceKinds: AnalyticsFacetValue[];
  errorKinds: AnalyticsFacetValue[];
  toolNames: AnalyticsFacetValue[];
  keywordCategories: AnalyticsFacetValue[];
  sessions: AnalyticsFacetValue[];
}

export interface AnalyticsTraceRequestSummary {
  requestId: string;
  timestamp: string | null;
  model?: string;
  stopReason?: string;
  assistantUuid?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUsd: number;
  contextEstimateTokens: number;
}

export interface AnalyticsToolCallSummary {
  toolCallId: string;
  toolUseId?: string;
  toolName: string;
  sourceAssistantUuid?: string;
  startedAt: string | null;
  finishedAt: string | null;
  isError: boolean;
  errorMessage?: string;
}

export interface AnalyticsErrorSummary {
  errorId: string;
  errorKind: string;
  toolName?: string;
  errorCode?: string;
  message: string;
  timestamp: string | null;
}

export interface AnalyticsKeywordMentionSummary {
  mentionId: string;
  speaker: string;
  category: string;
  term: string;
  matchedText: string;
  severity: number;
  timestamp: string | null;
}

export interface AnalyticsCompactionSummary {
  compactionId: string;
  compactedAt: string | null;
  messageCount?: number;
}

export interface AnalyticsTraceDetailResponse {
  trace: AnalyticsTraceSummary;
  requests: AnalyticsTraceRequestSummary[];
  toolCalls: AnalyticsToolCallSummary[];
  errors: AnalyticsErrorSummary[];
  keywordMentions: AnalyticsKeywordMentionSummary[];
  compactions: AnalyticsCompactionSummary[];
}

export interface AnalyticsSessionSubagentSummary {
  sessionId: string;
  agentId?: string;
  slug?: string;
  teamName?: string;
  teammateName?: string;
  eventCount: number;
  requestCount: number;
  errorCount: number;
  toolUseCount: number;
}

export interface AnalyticsPermissionDecisionSummary {
  decisionId: string;
  toolName?: string;
  decision: string;
  cwd?: string;
  message?: string;
  timestamp: string | null;
}

export interface AnalyticsSessionDetailResponse {
  sessionId: string;
  totals: AnalyticsOverviewTotals;
  traceCount: number;
  traces: AnalyticsTraceSummary[];
  subagents: AnalyticsSessionSubagentSummary[];
  tools: AnalyticsFacetValue[];
  errorKinds: AnalyticsFacetValue[];
  keywordCategories: AnalyticsFacetValue[];
  permissions: AnalyticsPermissionDecisionSummary[];
}

export interface AnalyticsBackfillRequest {
  projectsRoot?: string;
  projectKey?: string;
  rootSessionId?: string;
  includeOtel?: boolean;
  otelRoot?: string;
  includeSensitiveOtelPayload?: boolean;
}

export interface AnalyticsBackfillOtelResponse {
  filesDiscovered: number;
  filesImported: number;
  logsImported: number;
  spansImported: number;
  includeSensitivePayload: boolean;
}

export interface AnalyticsBackfillResponse {
  filesDiscovered: number;
  filesImported: number;
  eventsImported: number;
  otel?: AnalyticsBackfillOtelResponse;
}
