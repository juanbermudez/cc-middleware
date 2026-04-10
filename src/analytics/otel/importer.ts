import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import type {
  OtelImportOptions,
  OtelImportStats,
  RawOtelLogRecord,
  RawOtelSpanRecord,
} from "./types.js";

const REDACTED_VALUE = "[REDACTED]";
const SENSITIVE_KEY_PATTERNS = [
  /^auth$/i,
  /^authorization$/i,
  /^headers?$/i,
  /^device_?id$/i,
  /^email$/i,
  /^prompt$/i,
  /^prompt_.*$/i,
  /^tool_?(input|output|content|parameters)$/i,
  /^(input|output|content|text)$/i,
  /(^|_)host_paths$/i,
];
const SENSITIVE_ATTRIBUTE_PATTERNS = [
  /^prompt$/i,
  /^prompt\./i,
  /^tool_?(input|output|content|parameters)$/i,
  /^workspace\.host_paths$/i,
];

type JsonRecord = Record<string, unknown>;

interface ParsedEntry {
  lineNumber: number;
  payload: JsonRecord;
}

export function getDefaultOtelRoot(): string {
  return resolve(homedir(), ".claude", "telemetry");
}

export async function importOtelBackfill(
  options: OtelImportOptions
): Promise<OtelImportStats> {
  const otelRoot = options.rootDir ?? getDefaultOtelRoot();
  const files = await discoverOtelFiles(otelRoot);

  let filesImported = 0;
  let logsImported = 0;
  let spansImported = 0;

  for (const filePath of files) {
    const entries = await readEntriesFromFile(filePath);
    if (entries.length === 0) {
      continue;
    }

    const logs: RawOtelLogRecord[] = [];
    const spans: RawOtelSpanRecord[] = [];

    for (const entry of entries) {
      const extracted = extractOtelRecords(
        filePath,
        entry.lineNumber,
        entry.payload,
        options.includeSensitivePayload === true
      );
      logs.push(...extracted.logs);
      spans.push(...extracted.spans);
    }

    if (logs.length === 0 && spans.length === 0) {
      continue;
    }

    await options.sink.writeRawOtelLogs(logs);
    await options.sink.writeRawOtelSpans(spans);
    filesImported += 1;
    logsImported += logs.length;
    spansImported += spans.length;
  }

  return {
    filesDiscovered: files.length,
    filesImported,
    logsImported,
    spansImported,
  };
}

export async function discoverOtelFiles(otelRoot: string): Promise<string[]> {
  try {
    await access(otelRoot, constants.R_OK);
  } catch {
    return [];
  }

  const entries = await readdir(otelRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(otelRoot, entry.name))
    .filter((filePath) => /\.(json|jsonl)$/i.test(filePath))
    .sort((left, right) => left.localeCompare(right));
}

async function readEntriesFromFile(filePath: string): Promise<ParsedEntry[]> {
  let content: string;

  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return [];
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return normalizeStructuredEntries(parsed);
  } catch {
    return trimmed
      .split("\n")
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => line.trim().length > 0)
      .flatMap(({ line, lineNumber }) => {
        try {
          const parsed = JSON.parse(line) as unknown;
          return normalizeStructuredEntries(parsed, lineNumber);
        } catch {
          return [];
        }
      });
  }
}

export async function parseOtelFile(
  filePath: string,
  options: {
    includeSensitivePayload?: boolean;
  } = {}
): Promise<{
  logs: RawOtelLogRecord[];
  spans: RawOtelSpanRecord[];
}> {
  const entries = await readEntriesFromFile(filePath);
  const logs: RawOtelLogRecord[] = [];
  const spans: RawOtelSpanRecord[] = [];

  for (const entry of entries) {
    const extracted = extractOtelRecords(
      filePath,
      entry.lineNumber,
      entry.payload,
      options.includeSensitivePayload === true
    );
    logs.push(...extracted.logs);
    spans.push(...extracted.spans);
  }

  return { logs, spans };
}

function expandTelemetryPayload(payload: JsonRecord): JsonRecord {
  if (!isRecord(payload.event_data)) {
    return payload;
  }

  const eventData = payload.event_data as JsonRecord;
  const additionalMetadata = tryParseEmbeddedJson(eventData.additional_metadata);
  if (additionalMetadata === undefined) {
    return payload;
  }

  return {
    ...payload,
    event_data: {
      ...eventData,
      additional_metadata: additionalMetadata,
    },
  };
}

function normalizeStructuredEntries(
  parsed: unknown,
  lineNumberBase = 1
): ParsedEntry[] {
  if (Array.isArray(parsed)) {
    return parsed.flatMap((entry, index) => {
      if (!isRecord(entry)) {
        return [];
      }

      return [
        {
          lineNumber: lineNumberBase + index,
          payload: entry,
        },
      ];
    });
  }

  if (isRecord(parsed)) {
    return [
      {
        lineNumber: lineNumberBase,
        payload: parsed,
      },
    ];
  }

  return [];
}

function extractOtelRecords(
  sourcePath: string,
  lineNumber: number,
  payload: JsonRecord,
  includeSensitiveFields: boolean
): {
  logs: RawOtelLogRecord[];
  spans: RawOtelSpanRecord[];
} {
  if (Array.isArray(payload.resourceLogs) || Array.isArray(payload.resourceSpans)) {
    return extractOtlpEnvelope(sourcePath, lineNumber, payload, includeSensitiveFields);
  }

  if (looksLikeClaudeTelemetryEvent(payload)) {
    const expandedPayload = expandTelemetryPayload(payload);
    const eventData = expandedPayload.event_data as JsonRecord;
    const additionalMetadata = isRecord(eventData.additional_metadata)
      ? eventData.additional_metadata
      : undefined;
    const timestamp =
      parseTimestampValue(eventData.client_timestamp)
      ?? parseTimestampValue(eventData.timestamp)
      ?? lineNumber;

    return {
      logs: [
        {
          dedupeKey: buildDedupeKey(sourcePath, lineNumber, payload),
          sourcePath,
          lineNumber,
          sessionId: readString(eventData.session_id),
          traceId:
            readString(eventData.trace_id)
            ?? readString(additionalMetadata?.queryChainId)
            ?? readString(additionalMetadata?.traceId)
            ?? readString(additionalMetadata?.trace_id),
          spanId:
            readString(eventData.span_id)
            ?? readString(additionalMetadata?.requestId)
            ?? readString(additionalMetadata?.request_id)
            ?? readString(additionalMetadata?.spanId)
            ?? readString(additionalMetadata?.span_id),
          eventName:
            readString(eventData.event_name)
            ?? readString(payload.event_type)
            ?? "claude_telemetry_event",
          timestamp,
          payload: sanitizePayload(expandedPayload, includeSensitiveFields) as JsonRecord,
        },
      ],
      spans: [],
    };
  }

  if (looksLikeFlatSpanRecord(payload)) {
    const startTimestamp = parseTimestampValue(
      payload.startTimeUnixNano ?? payload.start_timestamp ?? payload.startTime
    );
    const endTimestamp = parseTimestampValue(
      payload.endTimeUnixNano ?? payload.end_timestamp ?? payload.endTime
    );

    return {
      logs: [],
      spans: [
        {
          dedupeKey: buildDedupeKey(sourcePath, lineNumber, payload),
          sourcePath,
          lineNumber,
          sessionId:
            readString(payload.session_id)
            ?? readString(payload.sessionId)
            ?? readAttributeValue(payload.attributes, "session.id"),
          traceId: readString(payload.traceId) ?? readString(payload.trace_id),
          spanId:
            readString(payload.spanId)
            ?? readString(payload.span_id)
            ?? `span-${lineNumber}`,
          parentSpanId: readString(payload.parentSpanId) ?? readString(payload.parent_span_id),
          spanName: readString(payload.name) ?? readString(payload.span_name) ?? "span",
          startTimestamp,
          endTimestamp,
          payload: sanitizePayload(payload, includeSensitiveFields) as JsonRecord,
        },
      ],
    };
  }

  if (looksLikeFlatLogRecord(payload)) {
    const timestamp =
      parseTimestampValue(
        payload.timeUnixNano
        ?? payload.observedTimeUnixNano
        ?? payload.timestamp
        ?? payload.time
      )
      ?? lineNumber;

    return {
      logs: [
        {
          dedupeKey: buildDedupeKey(sourcePath, lineNumber, payload),
          sourcePath,
          lineNumber,
          sessionId:
            readString(payload.session_id)
            ?? readString(payload.sessionId)
            ?? readAttributeValue(payload.attributes, "session.id"),
          traceId: readString(payload.traceId) ?? readString(payload.trace_id),
          spanId: readString(payload.spanId) ?? readString(payload.span_id),
          eventName:
            readAttributeValue(payload.attributes, "event.name")
            ?? readString(payload.event_name)
            ?? readString(payload.name)
            ?? "otlp_log",
          timestamp,
          payload: sanitizePayload(payload, includeSensitiveFields) as JsonRecord,
        },
      ],
      spans: [],
    };
  }

  return {
    logs: [],
    spans: [],
  };
}

function extractOtlpEnvelope(
  sourcePath: string,
  lineNumber: number,
  payload: JsonRecord,
  includeSensitiveFields: boolean
): {
  logs: RawOtelLogRecord[];
  spans: RawOtelSpanRecord[];
} {
  const logs: RawOtelLogRecord[] = [];
  const spans: RawOtelSpanRecord[] = [];

  const resourceLogs = Array.isArray(payload.resourceLogs) ? payload.resourceLogs : [];
  for (const resourceLog of resourceLogs) {
    if (!isRecord(resourceLog)) {
      continue;
    }

    const resourceAttributes = attributesToObject(resourceLog.resource);
    const scopeLogs = Array.isArray(resourceLog.scopeLogs)
      ? resourceLog.scopeLogs
      : Array.isArray(resourceLog.instrumentationLibraryLogs)
        ? resourceLog.instrumentationLibraryLogs
        : [];

    for (const scopeLog of scopeLogs) {
      if (!isRecord(scopeLog)) {
        continue;
      }

      const scope = isRecord(scopeLog.scope)
        ? scopeLog.scope
        : isRecord(scopeLog.instrumentationLibrary)
          ? scopeLog.instrumentationLibrary
          : undefined;
      const logRecords = Array.isArray(scopeLog.logRecords) ? scopeLog.logRecords : [];

      for (const logRecord of logRecords) {
        if (!isRecord(logRecord)) {
          continue;
        }

        const logAttributes = attributesToObject(logRecord.attributes);
        const combinedPayload = {
          resourceAttributes,
          scope,
          logRecord,
        };
        const timestamp =
          parseTimestampValue(logRecord.timeUnixNano ?? logRecord.observedTimeUnixNano)
          ?? lineNumber;

        logs.push({
          dedupeKey: buildDedupeKey(sourcePath, lineNumber, combinedPayload),
          sourcePath,
          lineNumber,
          sessionId:
            readString(logAttributes["session.id"])
            ?? readString(resourceAttributes["session.id"]),
          traceId: readString(logRecord.traceId),
          spanId: readString(logRecord.spanId),
          eventName:
            readString(logAttributes["event.name"])
            ?? readString(logRecord.event_name)
            ?? readString(logRecord.name)
            ?? "otlp_log",
          timestamp,
          payload: sanitizePayload(combinedPayload, includeSensitiveFields) as JsonRecord,
        });
      }
    }
  }

  const resourceSpans = Array.isArray(payload.resourceSpans) ? payload.resourceSpans : [];
  for (const resourceSpan of resourceSpans) {
    if (!isRecord(resourceSpan)) {
      continue;
    }

    const resourceAttributes = attributesToObject(resourceSpan.resource);
    const scopeSpans = Array.isArray(resourceSpan.scopeSpans)
      ? resourceSpan.scopeSpans
      : Array.isArray(resourceSpan.instrumentationLibrarySpans)
        ? resourceSpan.instrumentationLibrarySpans
        : [];

    for (const scopeSpan of scopeSpans) {
      if (!isRecord(scopeSpan)) {
        continue;
      }

      const scope = isRecord(scopeSpan.scope)
        ? scopeSpan.scope
        : isRecord(scopeSpan.instrumentationLibrary)
          ? scopeSpan.instrumentationLibrary
          : undefined;
      const spansPayload = Array.isArray(scopeSpan.spans) ? scopeSpan.spans : [];

      for (const spanRecord of spansPayload) {
        if (!isRecord(spanRecord)) {
          continue;
        }

        const spanAttributes = attributesToObject(spanRecord.attributes);
        const combinedPayload = {
          resourceAttributes,
          scope,
          span: spanRecord,
        };

        spans.push({
          dedupeKey: buildDedupeKey(sourcePath, lineNumber, combinedPayload),
          sourcePath,
          lineNumber,
          sessionId:
            readString(spanAttributes["session.id"])
            ?? readString(resourceAttributes["session.id"]),
          traceId: readString(spanRecord.traceId),
          spanId: readString(spanRecord.spanId) ?? `span-${lineNumber}`,
          parentSpanId: readString(spanRecord.parentSpanId),
          spanName: readString(spanRecord.name) ?? "span",
          startTimestamp: parseTimestampValue(spanRecord.startTimeUnixNano),
          endTimestamp: parseTimestampValue(spanRecord.endTimeUnixNano),
          payload: sanitizePayload(combinedPayload, includeSensitiveFields) as JsonRecord,
        });
      }
    }
  }

  return { logs, spans };
}

function looksLikeClaudeTelemetryEvent(payload: JsonRecord): boolean {
  return typeof payload.event_type === "string" && isRecord(payload.event_data);
}

function looksLikeFlatLogRecord(payload: JsonRecord): boolean {
  return Boolean(
    payload.timeUnixNano
    || payload.observedTimeUnixNano
    || payload.traceId
    || payload.trace_id
    || payload.event_name
    || (Array.isArray(payload.attributes) && payload.attributes.length > 0)
  );
}

function looksLikeFlatSpanRecord(payload: JsonRecord): boolean {
  return Boolean(
    payload.spanId
    || payload.span_id
    || payload.startTimeUnixNano
    || payload.endTimeUnixNano
    || payload.startTime
    || payload.endTime
  );
}

function sanitizePayload(value: unknown, includeSensitiveFields: boolean): unknown {
  if (includeSensitiveFields || value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizePayload(entry, false));
  }

  if (!isRecord(value)) {
    return value;
  }

  if (
    typeof value.key === "string"
    && isSensitiveAttributeKey(value.key)
    && isRecord(value.value)
  ) {
    return {
      ...value,
      value: {
        stringValue: REDACTED_VALUE,
      },
    };
  }

  const sanitized: JsonRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isSensitiveObjectKey(key)) {
      sanitized[key] = REDACTED_VALUE;
      continue;
    }

    sanitized[key] = sanitizePayload(entry, false);
  }

  return sanitized;
}

function isSensitiveObjectKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function isSensitiveAttributeKey(key: string): boolean {
  return SENSITIVE_ATTRIBUTE_PATTERNS.some((pattern) => pattern.test(key));
}

function attributesToObject(value: unknown): JsonRecord {
  if (Array.isArray(value)) {
    const object: JsonRecord = {};
    for (const entry of value) {
      if (!isRecord(entry)) {
        continue;
      }

      const key = readString(entry.key);
      if (!key) {
        continue;
      }

      object[key] = attributeValueToPrimitive(entry.value);
    }
    return object;
  }

  if (isRecord(value)) {
    if (Array.isArray(value.attributes)) {
      return attributesToObject(value.attributes);
    }
  }

  return {};
}

function attributeValueToPrimitive(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  if ("stringValue" in value) {
    return value.stringValue;
  }
  if ("boolValue" in value) {
    return value.boolValue;
  }
  if ("intValue" in value) {
    return value.intValue;
  }
  if ("doubleValue" in value) {
    return value.doubleValue;
  }
  const arrayValue = isRecord(value.arrayValue) ? value.arrayValue : undefined;
  if (arrayValue && Array.isArray(arrayValue.values)) {
    return arrayValue.values.map((entry: unknown) => attributeValueToPrimitive(entry));
  }
  if (Array.isArray(value.values)) {
    return value.values.map((entry: unknown) => attributeValueToPrimitive(entry));
  }
  return value;
}

function readAttributeValue(attributes: unknown, key: string): string | undefined {
  const object = attributesToObject(attributes);
  const value = object[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseTimestampValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  if (typeof value === "string") {
    if (/^\d+$/.test(value)) {
      try {
        const numeric = BigInt(value);
        if (numeric > 10_000_000_000_000_000n) {
          return Number(numeric / 1_000_000n);
        }
        if (numeric > 10_000_000_000n) {
          return Number(numeric);
        }
        return Number(numeric) * 1000;
      } catch {
        return undefined;
      }
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function buildDedupeKey(sourcePath: string, lineNumber: number, payload: unknown): string {
  return createHash("sha256")
    .update(`${sourcePath}:${lineNumber}:${stableSerialize(payload)}`)
    .digest("hex");
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

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    .join(",")}}`;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function tryParseEmbeddedJson(value: unknown): unknown {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
