import { createHash } from "node:crypto";
import type { AnalyticsDatabase } from "../types.js";
import type {
  LiveAnalyticsSink,
  LiveHookRecord,
  LivePermissionRecord,
  LiveSdkMessageRecord,
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

function toSqlTimestamp(timestamp: number): string {
  return `TIMESTAMP '${new Date(timestamp).toISOString().replace("T", " ").replace("Z", "")}'`;
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    .join(",")}}`;
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildSourceMarker(source: string, kind: string): string {
  return `middleware://live/${source}/${kind}`;
}

function buildSdkDedupKey(record: LiveSdkMessageRecord): string {
  return hashValue(
    stableSerialize({
      source: record.source,
      runId: record.runId,
      label: record.label,
      sessionId: record.sessionId,
      cwd: record.cwd,
      kind: record.kind,
      phase: record.phase,
      messageType: record.messageType,
      prompt: record.prompt,
      message: record.message,
    })
  );
}

function buildHookDedupKey(record: LiveHookRecord): string {
  return hashValue(
    stableSerialize({
      source: record.source,
      runId: record.runId,
      label: record.label,
      sessionId: record.sessionId,
      cwd: record.cwd,
      kind: record.kind,
      eventType: record.eventType,
      input: record.input,
    })
  );
}

function buildPermissionDedupKey(record: LivePermissionRecord): string {
  return hashValue(
    stableSerialize({
      source: record.source,
      runId: record.runId,
      label: record.label,
      sessionId: record.sessionId,
      cwd: record.cwd,
      kind: record.kind,
      decision: record.decision,
      toolName: record.toolName,
      input: record.input,
      toolUseID: record.toolUseID,
      agentID: record.agentID,
      message: record.message,
    })
  );
}

function insertSql(
  tableName: "raw_middleware_sdk_messages" | "raw_hook_events" | "raw_permission_events",
  columns: string[],
  values: string[]
): string {
  return `
    INSERT OR IGNORE INTO ${tableName} (${columns.join(", ")})
    VALUES (${values.join(", ")})
  `;
}

function buildSdkMessageSql(record: LiveSdkMessageRecord): string {
  const sourceMarker = buildSourceMarker(record.source, `${record.kind}/${record.phase}`);
  const payload = {
    ...record,
    sourceMarker,
  };

  return insertSql(
    "raw_middleware_sdk_messages",
    [
      "dedupe_key",
      "source_path",
      "source_line",
      "session_id",
      "event_type",
      "event_subtype",
      "event_timestamp",
      "payload_json",
    ],
    [
      toSqlString(buildSdkDedupKey(record)),
      toSqlString(sourceMarker),
      "NULL",
      toSqlString(record.sessionId),
      toSqlString(record.kind),
      toSqlString(`${record.phase}:${record.messageType}`),
      toSqlTimestamp(record.recordedAt),
      `CAST(${toSqlString(stableSerialize(payload))} AS JSON)`,
    ]
  );
}

function buildHookEventSql(record: LiveHookRecord): string {
  const sourceMarker = buildSourceMarker(record.source, record.kind);
  const payload = {
    ...record,
    sourceMarker,
  };

  return insertSql(
    "raw_hook_events",
    [
      "dedupe_key",
      "source_path",
      "source_line",
      "session_id",
      "hook_event_name",
      "event_timestamp",
      "payload_json",
    ],
    [
      toSqlString(buildHookDedupKey(record)),
      toSqlString(sourceMarker),
      "NULL",
      toSqlString(record.sessionId),
      toSqlString(record.eventType),
      toSqlTimestamp(record.recordedAt),
      `CAST(${toSqlString(stableSerialize(payload))} AS JSON)`,
    ]
  );
}

function buildPermissionEventSql(record: LivePermissionRecord): string {
  const sourceMarker = buildSourceMarker(record.source, record.kind);
  const payload = {
    ...record,
    sourceMarker,
  };

  return insertSql(
    "raw_permission_events",
    [
      "dedupe_key",
      "source_path",
      "source_line",
      "session_id",
      "cwd",
      "tool_name",
      "decision",
      "event_timestamp",
      "payload_json",
    ],
    [
      toSqlString(buildPermissionDedupKey(record)),
      toSqlString(sourceMarker),
      "NULL",
      toSqlString(record.sessionId),
      toSqlString(record.cwd),
      toSqlString(record.toolName),
      toSqlString(record.decision),
      toSqlTimestamp(record.recordedAt),
      `CAST(${toSqlString(stableSerialize(payload))} AS JSON)`,
    ]
  );
}

function createSerialExecutor() {
  let tail = Promise.resolve();

  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      const next = tail.then(task, task);
      tail = next.then(
        () => undefined,
        () => undefined
      );
      return next;
    },
    flush(): Promise<void> {
      return tail;
    },
  };
}

export function createDuckDbLiveAnalyticsSink(
  database: AnalyticsDatabase
): LiveAnalyticsSink {
  const queue = createSerialExecutor();

  return {
    recordSdkMessage: (record) =>
      queue.enqueue(async () => {
        await database.connection.run(buildSdkMessageSql(record));
      }),
    recordHookEvent: (record) =>
      queue.enqueue(async () => {
        await database.connection.run(buildHookEventSql(record));
      }),
    recordPermissionEvent: (record) =>
      queue.enqueue(async () => {
        await database.connection.run(buildPermissionEventSql(record));
      }),
    flush: async () => {
      try {
        await queue.flush();
      } catch {
        // Live analytics must remain failure-safe.
      }
    },
  };
}
