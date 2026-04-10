/**
 * Shared analytics types.
 * Keep this layer lightweight so the warehouse, backfill, and API
 * can evolve without coupling to a concrete storage implementation.
 */

import type { DuckDBConnection } from "@duckdb/node-api";

export const ANALYTICS_DEFAULT_DB_FILENAME = "analytics.duckdb";
export const ANALYTICS_SCHEMA_MIGRATIONS_TABLE = "analytics_schema_migrations";

export type AnalyticsRawEventKind =
  | "transcript"
  | "middleware_sdk_message"
  | "hook_event"
  | "permission_event"
  | "otel_log"
  | "otel_span";

export interface AnalyticsDatabaseOptions {
  dbPath?: string;
  schemaDir?: string;
}

export interface AnalyticsMigrationRecord {
  migrationName: string;
  appliedAt: string;
}

export interface AnalyticsDatabase {
  dbPath: string;
  schemaDir: string;
  connection: DuckDBConnection;
  migrate(): Promise<void>;
  close(): void;
}

export interface AnalyticsSchemaFile {
  name: string;
  path: string;
}
