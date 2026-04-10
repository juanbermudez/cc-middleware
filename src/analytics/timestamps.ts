function parseTimestampString(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = /^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?$/.test(trimmed)
    ? `${trimmed.replace(" ", "T")}Z`
    : trimmed;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function readBigIntLike(value: unknown): bigint | undefined {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === "string" && /^-?[0-9]+$/.test(value.trim())) {
    return BigInt(value.trim());
  }

  return undefined;
}

function readTimestampFromRecord(value: Record<string, unknown>): number | undefined {
  const micros = readBigIntLike(value.micros);
  if (micros !== undefined) {
    return Number(micros / 1000n);
  }

  const millis = readBigIntLike(value.millis);
  if (millis !== undefined) {
    return Number(millis);
  }

  const seconds = readBigIntLike(value.seconds);
  if (seconds !== undefined) {
    return Number(seconds * 1000n);
  }

  const nanos = readBigIntLike(value.nanos ?? value.nanoseconds);
  if (nanos !== undefined) {
    return Number(nanos / 1_000_000n);
  }

  const asString = parseTimestampString(String(value));
  return asString;
}

export function coerceTimestampMs(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string") {
    return parseTimestampString(value);
  }

  if (typeof value === "object") {
    const recordValue = readTimestampFromRecord(value as Record<string, unknown>);
    if (recordValue !== undefined) {
      return recordValue;
    }

    const valueOf = (value as { valueOf?: () => unknown }).valueOf;
    if (typeof valueOf === "function") {
      const normalized = valueOf.call(value);
      if (normalized !== value) {
        return coerceTimestampMs(normalized);
      }
    }
  }

  return undefined;
}

export function coerceTimestampMsOrNow(value: unknown): number {
  return coerceTimestampMs(value) ?? Date.now();
}

export function toIsoTimestampOrNull(value: unknown): string | null {
  const timestampMs = coerceTimestampMs(value);
  return timestampMs === undefined ? null : new Date(timestampMs).toISOString();
}
