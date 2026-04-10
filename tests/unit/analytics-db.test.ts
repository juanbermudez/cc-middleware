/**
 * Unit tests for the analytics warehouse foundation.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAnalyticsDatabase, migrateAnalyticsDatabase } from "../../src/analytics/db.js";
import type { AnalyticsDatabase } from "../../src/analytics/types.js";

let tempRoot: string;
let schemaDir: string;
let dbPath: string;
let database: AnalyticsDatabase | undefined;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "cc-analytics-test-"));
  schemaDir = join(tempRoot, "schema");
  dbPath = join(tempRoot, "analytics.duckdb");
  mkdirSync(schemaDir, { recursive: true });

  writeFileSync(
    join(schemaDir, "0001_init.sql"),
    [
      "CREATE TABLE IF NOT EXISTS raw_transcript_events (",
      "  dedupe_key VARCHAR PRIMARY KEY,",
      "  source_path VARCHAR NOT NULL,",
      "  source_line BIGINT,",
      "  session_id VARCHAR,",
      "  cwd VARCHAR,",
      "  event_type VARCHAR NOT NULL,",
      "  event_subtype VARCHAR,",
      "  event_timestamp TIMESTAMP,",
      "  payload_json JSON NOT NULL,",
      "  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
      ");",
      "",
      "CREATE TABLE IF NOT EXISTS analytics_metadata (",
      "  key VARCHAR PRIMARY KEY,",
      "  value VARCHAR NOT NULL,",
      "  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
      ");",
      "",
    ].join("\n")
  );
});

afterEach(() => {
  database?.close();
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("analytics warehouse foundation", () => {
  it("creates the analytics database and applies migrations", async () => {
    database = await createAnalyticsDatabase({ dbPath, schemaDir });

    const tables = await database.connection.runAndReadAll(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'main'
        ORDER BY table_name
      `);
    const tableNames = tables.getRowObjects().map((row) => row.table_name as string);

    expect(tableNames).toContain("analytics_metadata");
    expect(tableNames).toContain("analytics_schema_migrations");
    expect(tableNames).toContain("raw_transcript_events");

    const migrations = await database.connection.runAndReadAll(`
        SELECT migration_name
        FROM analytics_schema_migrations
        ORDER BY migration_name
      `);

    expect(migrations.getRowObjects().map((row) => row.migration_name)).toEqual([
      "0001_init.sql",
    ]);
  });

  it("is idempotent when migrations run multiple times", async () => {
    database = await createAnalyticsDatabase({ dbPath, schemaDir });

    await database.migrate();
    await migrateAnalyticsDatabase(database.connection, schemaDir);

    const result = await database.connection.runAndReadAll(`
        SELECT COUNT(*) AS count
        FROM analytics_schema_migrations
      `);

    expect(Number(result.getRowObjects()[0]?.count ?? 0)).toBe(1);
  });
});
