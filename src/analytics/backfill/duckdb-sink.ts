import type { AnalyticsDatabase } from "../types.js";
import type { TranscriptEventSink, RawTranscriptEventRecord } from "./types.js";

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function toSqlString(value: string | undefined): string {
  return value === undefined ? "NULL" : `'${escapeSqlString(value)}'`;
}

function toSqlNumber(value: number | undefined): string {
  return value === undefined ? "NULL" : String(value);
}

function toSqlTimestamp(timestamp: number): string {
  return `TIMESTAMP '${new Date(timestamp).toISOString().replace("T", " ").replace("Z", "")}'`;
}

function buildInsertSql(event: RawTranscriptEventRecord): string {
  return `
    INSERT OR IGNORE INTO raw_transcript_events (
      dedupe_key,
      source_path,
      source_line,
      session_id,
      cwd,
      event_type,
      event_subtype,
      event_timestamp,
      payload_json
    ) VALUES (
      ${toSqlString(event.dedupeKey)},
      ${toSqlString(event.transcriptPath)},
      ${toSqlNumber(event.lineNumber)},
      ${toSqlString(event.sessionId)},
      NULL,
      ${toSqlString(event.eventType)},
      ${toSqlString(event.eventSubtype)},
      ${toSqlTimestamp(event.timestamp)},
      CAST(${toSqlString(JSON.stringify(event.payload))} AS JSON)
    )
  `;
}

export function createDuckDbTranscriptEventSink(
  database: AnalyticsDatabase
): TranscriptEventSink {
  return {
    async writeRawTranscriptEvents(events) {
      if (events.length === 0) {
        return;
      }

      await database.connection.run("BEGIN TRANSACTION");
      try {
        for (const event of events) {
          await database.connection.run(buildInsertSql(event));
        }
        await database.connection.run("COMMIT");
      } catch (error) {
        await database.connection.run("ROLLBACK");
        throw error;
      }
    },
  };
}
