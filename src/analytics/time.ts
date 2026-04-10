function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function readMicros(value: unknown): number | null {
  if (typeof value === "bigint") {
    return Number(value / 1000n);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value / 1000);
  }

  return null;
}

function readDays(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value) * 86_400_000
    : null;
}

export function parseAnalyticsTimestampMs(
  value: unknown,
  fallbackTimestamp: number
): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallbackTimestamp;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  if (isRecord(value)) {
    const micros = readMicros(value.micros);
    if (micros !== null) {
      return micros;
    }

    const days = readDays(value.days);
    if (days !== null) {
      return days;
    }
  }

  return fallbackTimestamp;
}
