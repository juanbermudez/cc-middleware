import type { DispatchSchedule } from "./types.js";
import type { DispatchStore } from "./store.js";

interface ParsedCronField {
  values: Set<number>;
  isWildcard: boolean;
}

interface ParsedCronExpression {
  minute: ParsedCronField;
  hour: ParsedCronField;
  dayOfMonth: ParsedCronField;
  month: ParsedCronField;
  dayOfWeek: ParsedCronField;
}

const DAY_ALIASES: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

const MONTH_ALIASES: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timezone: string): Intl.DateTimeFormat {
  const cacheKey = timezone;
  const existing = formatterCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hourCycle: "h23",
  });
  formatterCache.set(cacheKey, formatter);
  return formatter;
}

function parseValue(
  rawValue: string,
  aliases: Record<string, number> | undefined,
  min: number,
  max: number,
  normalize: (value: number) => number = (value) => value
): number {
  const upperValue = rawValue.trim().toUpperCase();
  const aliased = aliases?.[upperValue];
  const value = aliased ?? Number.parseInt(upperValue, 10);

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid cron field value: ${rawValue}`);
  }

  const normalized = normalize(value);
  if (normalized < min || normalized > max) {
    throw new Error(`Cron field value out of range: ${rawValue}`);
  }

  return normalized;
}

function addRange(values: Set<number>, start: number, end: number, step: number): void {
  for (let value = start; value <= end; value += step) {
    values.add(value);
  }
}

function parseCronField(
  source: string,
  min: number,
  max: number,
  aliases?: Record<string, number>,
  normalize?: (value: number) => number
): ParsedCronField {
  const values = new Set<number>();
  let isWildcard = false;

  for (const token of source.split(",")) {
    const trimmed = token.trim();
    if (!trimmed) {
      continue;
    }

    const [rangePart, stepPart] = trimmed.split("/");
    const step = stepPart ? Number.parseInt(stepPart, 10) : 1;
    if (!Number.isFinite(step) || step <= 0) {
      throw new Error(`Invalid cron step: ${trimmed}`);
    }

    if (rangePart === "*") {
      isWildcard = true;
      addRange(values, min, max, step);
      continue;
    }

    if (rangePart.includes("-")) {
      const [startRaw, endRaw] = rangePart.split("-", 2);
      const start = parseValue(startRaw, aliases, min, max, normalize);
      const end = parseValue(endRaw, aliases, min, max, normalize);
      addRange(values, start, end, step);
      continue;
    }

    const single = parseValue(rangePart, aliases, min, max, normalize);
    values.add(single);
  }

  return {
    values,
    isWildcard,
  };
}

function parseCronExpression(cron: string): ParsedCronExpression {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Expected 5 cron fields, received ${fields.length}`);
  }

  return {
    minute: parseCronField(fields[0], 0, 59),
    hour: parseCronField(fields[1], 0, 23),
    dayOfMonth: parseCronField(fields[2], 1, 31),
    month: parseCronField(fields[3], 1, 12, MONTH_ALIASES),
    dayOfWeek: parseCronField(fields[4], 0, 6, DAY_ALIASES, (value) => (value === 7 ? 0 : value)),
  };
}

function getZonedParts(timestampMs: number, timezone: string): {
  minute: number;
  hour: number;
  dayOfMonth: number;
  month: number;
  dayOfWeek: number;
} {
  const parts = getFormatter(timezone).formatToParts(new Date(timestampMs));
  const values = new Map<string, string>();

  for (const part of parts) {
    if (part.type !== "literal") {
      values.set(part.type, part.value);
    }
  }

  const weekday = values.get("weekday")?.toUpperCase() ?? "SUN";
  return {
    minute: Number.parseInt(values.get("minute") ?? "0", 10),
    hour: Number.parseInt(values.get("hour") ?? "0", 10),
    dayOfMonth: Number.parseInt(values.get("day") ?? "1", 10),
    month: Number.parseInt(values.get("month") ?? "1", 10),
    dayOfWeek: DAY_ALIASES[weekday] ?? 0,
  };
}

function matchesCron(parsed: ParsedCronExpression, timestampMs: number, timezone: string): boolean {
  const parts = getZonedParts(timestampMs, timezone);
  const dayOfMonthMatches = parsed.dayOfMonth.values.has(parts.dayOfMonth);
  const dayOfWeekMatches = parsed.dayOfWeek.values.has(parts.dayOfWeek);
  const dayMatches =
    parsed.dayOfMonth.isWildcard && parsed.dayOfWeek.isWildcard
      ? true
      : parsed.dayOfMonth.isWildcard
        ? dayOfWeekMatches
        : parsed.dayOfWeek.isWildcard
          ? dayOfMonthMatches
          : dayOfMonthMatches || dayOfWeekMatches;

  return (
    parsed.minute.values.has(parts.minute) &&
    parsed.hour.values.has(parts.hour) &&
    parsed.month.values.has(parts.month) &&
    dayMatches
  );
}

export function computeNextCronRun(
  cron: string,
  timezone: string,
  afterMs = Date.now()
): number | undefined {
  const parsed = parseCronExpression(cron);
  let candidate = Math.floor(afterMs / 60_000) * 60_000 + 60_000;

  for (let attempt = 0; attempt < 60 * 24 * 366; attempt += 1) {
    if (matchesCron(parsed, candidate, timezone)) {
      return candidate;
    }

    candidate += 60_000;
  }

  return undefined;
}

export function materializeDueSchedules(
  store: DispatchStore,
  now = Date.now(),
  onTriggered?: (schedule: DispatchSchedule, jobId: string) => void
): number {
  let triggered = 0;

  for (const schedule of store.listSchedules()) {
    if (!schedule.enabled || schedule.nextRunAt === undefined || schedule.nextRunAt > now) {
      continue;
    }

    const job = store.enqueueJob({
      sourceType: schedule.sourceType,
      targetType: schedule.targetType,
      runtimeProfile: schedule.runtimeProfile,
      prompt: schedule.prompt,
      cwd: schedule.cwd,
      sessionId: schedule.sessionId,
      agent: schedule.agent,
      priority: schedule.priority,
      maxAttempts: schedule.maxAttempts,
      leaseDurationMs: schedule.leaseDurationMs,
      concurrencyKey: schedule.concurrencyKey,
      dedupeKey: `schedule:${schedule.id}:${schedule.nextRunAt ?? now}`,
      scheduleId: schedule.id,
      payload: schedule.payload,
      variables: schedule.variables,
      runAt: now,
      nextRunAt: now,
    });

    store.upsertSchedule({
      ...schedule,
      updatedAt: now,
      lastRunAt: now,
      nextRunAt: computeNextCronRun(schedule.cron, schedule.timezone, now),
      lastJobId: job.id,
    });

    triggered += 1;
    onTriggered?.(schedule, job.id);
  }

  return triggered;
}
