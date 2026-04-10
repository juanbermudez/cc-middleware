import { describe, expect, it } from "vitest";
import { DuckDBTimestampValue } from "@duckdb/node-api";
import { coerceTimestampMs, toIsoTimestampOrNull } from "../../src/analytics/timestamps.js";

describe("analytics timestamp coercion", () => {
  it("converts DuckDB timestamp values to epoch milliseconds", () => {
    const targetIso = "2026-04-03T04:05:06.000Z";
    const value = new DuckDBTimestampValue(BigInt(Date.parse(targetIso)) * 1000n);

    expect(coerceTimestampMs(value)).toBe(Date.parse(targetIso));
    expect(toIsoTimestampOrNull(value)).toBe(targetIso);
  });

  it("treats timezone-free DuckDB timestamp strings as UTC", () => {
    expect(coerceTimestampMs("2026-04-03 04:05:06")).toBe(Date.parse("2026-04-03T04:05:06.000Z"));
  });
});
