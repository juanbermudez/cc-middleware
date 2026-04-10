export interface RawOtelLogRecord {
  dedupeKey: string;
  sourcePath: string;
  lineNumber: number;
  sessionId?: string;
  traceId?: string;
  spanId?: string;
  eventName: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

export interface RawOtelSpanRecord {
  dedupeKey: string;
  sourcePath: string;
  lineNumber: number;
  sessionId?: string;
  traceId?: string;
  spanId: string;
  parentSpanId?: string;
  spanName: string;
  startTimestamp?: number;
  endTimestamp?: number;
  payload: Record<string, unknown>;
}

export interface OtelImportStats {
  filesDiscovered: number;
  filesImported: number;
  logsImported: number;
  spansImported: number;
}

export interface OtelEventSink {
  writeRawOtelLogs(events: RawOtelLogRecord[]): Promise<void> | void;
  writeRawOtelSpans(events: RawOtelSpanRecord[]): Promise<void> | void;
}

export interface OtelImportOptions {
  sink: OtelEventSink;
  rootDir?: string;
  includeSensitivePayload?: boolean;
}
