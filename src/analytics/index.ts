/**
 * Analytics module public exports.
 */

export {
  createAnalyticsDatabase,
  getDefaultAnalyticsDbPath,
  listAnalyticsSchemaFiles,
  migrateAnalyticsDatabase,
  resolveAnalyticsSchemaDir,
} from "./db.js";
export { createDuckDbLiveAnalyticsSink } from "./live/index.js";
export { refreshDerivedAnalyticsTables } from "./derive/index.js";
export {
  createDuckDbOtelEventSink,
  discoverOtelFiles,
  getDefaultOtelTelemetryRoot,
  importOtelBackfill,
  parseOtelFile,
} from "./otel/index.js";
export {
  createMemoryLiveAnalyticsSink,
  getLiveAnalyticsSink,
  normalizeLiveAnalyticsContext,
  recordLiveHookEvent,
  recordLivePermissionEvent,
  recordLiveSdkMessage,
  setLiveAnalyticsSink,
} from "./live/index.js";
export {
  ANALYTICS_MODEL_PRICING,
  estimateUsageCostUsd,
  findModelPricing,
} from "./pricing.js";
export type {
  AnalyticsDatabase,
  AnalyticsDatabaseOptions,
  AnalyticsMigrationRecord,
  AnalyticsRawEventKind,
  AnalyticsSchemaFile,
} from "./types.js";
export type {
  OtelEventSink,
  OtelImportOptions,
  OtelImportStats,
  RawOtelLogRecord,
  RawOtelSpanRecord,
} from "./otel/index.js";
export type {
  LiveAnalyticsCaptureOptions,
  LiveAnalyticsContext,
  LiveAnalyticsSink,
  LiveAnalyticsSource,
  LiveHookRecord,
  LivePermissionRecord,
  LiveSdkMessageRecord,
} from "./live/index.js";
