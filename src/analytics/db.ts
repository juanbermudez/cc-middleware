/**
 * DuckDB-backed analytics warehouse.
 * Transcript history is the source of truth; this layer stores raw rows
 * and derived metrics on top of that history.
 */

import { access } from "node:fs/promises";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { DuckDBInstance } from "@duckdb/node-api";
import type { DuckDBConnection } from "@duckdb/node-api";
import {
  ANALYTICS_DEFAULT_DB_FILENAME,
  ANALYTICS_SCHEMA_MIGRATIONS_TABLE,
  type AnalyticsDatabase,
  type AnalyticsDatabaseOptions,
  type AnalyticsMigrationRecord,
  type AnalyticsSchemaFile,
} from "./types.js";

const SCHEMA_FILE_PATTERN = /\.sql$/i;

export function getDefaultAnalyticsDbPath(): string {
  return resolve(homedir(), ".cc-middleware", ANALYTICS_DEFAULT_DB_FILENAME);
}

export async function resolveAnalyticsSchemaDir(
  explicitSchemaDir?: string
): Promise<string> {
  const candidates = explicitSchemaDir
    ? [explicitSchemaDir]
    : [
        resolve(dirname(fileURLToPath(import.meta.url)), "schema"),
        resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "analytics", "schema"),
        resolve(process.cwd(), "src", "analytics", "schema"),
        resolve(process.cwd(), "dist", "analytics", "schema"),
      ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    explicitSchemaDir
      ? `Analytics schema directory not found: ${explicitSchemaDir}`
      : "Analytics schema directory not found. Looked for src/analytics/schema."
  );
}

export async function createAnalyticsDatabase(
  options: AnalyticsDatabaseOptions = {}
): Promise<AnalyticsDatabase> {
  const dbPath = options.dbPath ?? getDefaultAnalyticsDbPath();
  const schemaDir = await resolveAnalyticsSchemaDir(options.schemaDir);

  await mkdir(dirname(dbPath), { recursive: true });

  const instance = await DuckDBInstance.fromCache(dbPath);
  const connection = await instance.connect();

  const database: AnalyticsDatabase = {
    dbPath,
    schemaDir,
    connection,
    migrate: async () => {
      await migrateAnalyticsDatabase(connection, schemaDir);
    },
    close: () => {
      closeConnection(connection);
    },
  };

  await database.migrate();
  return database;
}

export async function migrateAnalyticsDatabase(
  connection: DuckDBConnection,
  schemaDir: string
): Promise<void> {
  await ensureMigrationTable(connection);

  const applied = new Set(
    await readAppliedMigrationNames(connection)
  );
  const migrations = await listSchemaFiles(schemaDir);

  for (const migration of migrations) {
    if (applied.has(migration.name)) {
      continue;
    }

    const sql = await readFile(migration.path, "utf8");
    const trimmed = sql.trim();
    if (!trimmed) {
      await recordMigration(connection, migration.name);
      continue;
    }

    await connection.run(trimmed);
    await recordMigration(connection, migration.name);
  }
}

export async function listAnalyticsSchemaFiles(
  schemaDir: string
): Promise<AnalyticsSchemaFile[]> {
  return listSchemaFiles(schemaDir);
}

async function ensureMigrationTable(connection: DuckDBConnection): Promise<void> {
  await connection.run(`
    CREATE TABLE IF NOT EXISTS ${ANALYTICS_SCHEMA_MIGRATIONS_TABLE} (
      migration_name VARCHAR PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function readAppliedMigrationNames(
  connection: DuckDBConnection
): Promise<string[]> {
  const result = await connection.runAndReadAll(
    `SELECT migration_name FROM ${ANALYTICS_SCHEMA_MIGRATIONS_TABLE} ORDER BY migration_name`
  );
  return result.getRowObjects().map((row) => row.migration_name as string);
}

async function recordMigration(
  connection: DuckDBConnection,
  migrationName: string
): Promise<void> {
  const escapedName = migrationName.replace(/'/g, "''");
  await connection.run(
    `INSERT INTO ${ANALYTICS_SCHEMA_MIGRATIONS_TABLE} (migration_name) VALUES ('${escapedName}')`
  );
}

async function listSchemaFiles(schemaDir: string): Promise<AnalyticsSchemaFile[]> {
  const entries = await readdir(schemaDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SCHEMA_FILE_PATTERN.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      path: join(schemaDir, entry.name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function closeConnection(connection: DuckDBConnection): void {
  try {
    connection.closeSync();
    return;
  } catch {
    // Fall through to disconnectSync if the binding exposes it or the
    // connection was already closed.
  }

  try {
    connection.disconnectSync();
  } catch {
    // Ignore close errors. Analytics DB shutdown should be best-effort.
  }
}

export type { AnalyticsDatabase, AnalyticsDatabaseOptions, AnalyticsMigrationRecord } from "./types.js";
