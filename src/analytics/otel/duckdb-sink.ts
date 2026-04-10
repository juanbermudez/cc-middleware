import type { AnalyticsDatabase } from "../types.js";
import type {
  OtelEventSink,
  RawOtelLogRecord,
  RawOtelSpanRecord,
} from "./types.js";

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function toSqlString(value: string | undefined): string {
  return value === undefined ? "NULL" : `'${escapeSqlString(value)}'`;
}

function toSqlNumber(value: number | undefined): string {
  return value === undefined ? "NULL" : String(value);
}

function toSqlTimestamp(value: number | undefined): string {
  if (value === undefined) {
    return "NULL";
  }

  return `TIMESTAMP '${new Date(value).toISOString().replace("T", " ").replace("Z", "")}'`;
}

function buildInsertLogSql(event: RawOtelLogRecord): string {
  return `
    INSERT OR IGNORE INTO raw_otel_logs (
      dedupe_key,
      source_path,
      source_line,
      session_id,
      trace_id,
      span_id,
      event_name,
      event_timestamp,
      payload_json
    ) VALUES (
      ${toSqlString(event.dedupeKey)},
      ${toSqlString(event.sourcePath)},
      ${toSqlNumber(event.lineNumber)},
      ${toSqlString(event.sessionId)},
      ${toSqlString(event.traceId)},
      ${toSqlString(event.spanId)},
      ${toSqlString(event.eventName)},
      ${toSqlTimestamp(event.timestamp)},
      CAST(${toSqlString(JSON.stringify(event.payload))} AS JSON)
    )
  `;
}

function buildInsertSpanSql(event: RawOtelSpanRecord): string {
  return `
    INSERT OR IGNORE INTO raw_otel_spans (
      dedupe_key,
      source_path,
      source_line,
      session_id,
      trace_id,
      span_id,
      parent_span_id,
      span_name,
      start_timestamp,
      end_timestamp,
      payload_json
    ) VALUES (
      ${toSqlString(event.dedupeKey)},
      ${toSqlString(event.sourcePath)},
      ${toSqlNumber(event.lineNumber)},
      ${toSqlString(event.sessionId)},
      ${toSqlString(event.traceId)},
      ${toSqlString(event.spanId)},
      ${toSqlString(event.parentSpanId)},
      ${toSqlString(event.spanName)},
      ${toSqlTimestamp(event.startTimestamp)},
      ${toSqlTimestamp(event.endTimestamp)},
      CAST(${toSqlString(JSON.stringify(event.payload))} AS JSON)
    )
  `;
}

export function createDuckDbOtelEventSink(database: AnalyticsDatabase): OtelEventSink {
  return {
    async writeRawOtelLogs(events) {
      if (events.length === 0) {
        return;
      }

      await database.connection.run("BEGIN TRANSACTION");
      try {
        for (const event of events) {
          await database.connection.run(buildInsertLogSql(event));
        }
        await database.connection.run("COMMIT");
      } catch (error) {
        await database.connection.run("ROLLBACK");
        throw error;
      }
    },
    async writeRawOtelSpans(events) {
      if (events.length === 0) {
        return;
      }

      await database.connection.run("BEGIN TRANSACTION");
      try {
        for (const event of events) {
          await database.connection.run(buildInsertSpanSql(event));
        }
        await database.connection.run("COMMIT");
      } catch (error) {
        await database.connection.run("ROLLBACK");
        throw error;
      }
    },
  };
}
