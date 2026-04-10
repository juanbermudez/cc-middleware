export { createDuckDbOtelEventSink } from "./duckdb-sink.js";
export {
  discoverOtelFiles,
  getDefaultOtelRoot,
  getDefaultOtelRoot as getDefaultOtelTelemetryRoot,
  importOtelBackfill,
  parseOtelFile,
} from "./importer.js";
export type {
  OtelEventSink,
  OtelImportOptions,
  OtelImportStats,
  RawOtelLogRecord,
  RawOtelSpanRecord,
} from "./types.js";
